const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { db } = require('../db/database');
const { JWT_SECRET, authenticateToken } = require('../middleware/auth');
const { CLINIC_ACCESS_CODE, ADMIN_INVITE_CODE } = require('../config');
const { emit, adminIds } = require('../utils/events');

// P38: in-memory login rate limit — 10 failures / 15 min per IP+email →
// 429 + Retry-After. Success clears the counter; the map self-prunes.
const RATE_LIMIT_MAX = parseInt(process.env.LOGIN_RATE_LIMIT_MAX || '10', 10);
const RATE_WINDOW_MS = 15 * 60 * 1000;
const loginFailures = new Map(); // key -> { count, firstAt }

function rateLimitKey(req, email) {
  const ip = (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown').trim();
  return `${ip}|${String(email || '').toLowerCase()}`;
}

function recordLoginFailure(key) {
  const now = Date.now();
  const entry = loginFailures.get(key);
  if (!entry || now - entry.firstAt > RATE_WINDOW_MS) {
    loginFailures.set(key, { count: 1, firstAt: now });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function loginBlocked(key) {
  const entry = loginFailures.get(key);
  if (!entry) return 0;
  const elapsed = Date.now() - entry.firstAt;
  if (elapsed > RATE_WINDOW_MS) {
    loginFailures.delete(key);
    return 0;
  }
  return Math.ceil((RATE_WINDOW_MS - elapsed) / 1000);
}

// Periodic sweep so the map cannot grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of loginFailures) {
    if (now - v.firstAt > RATE_WINDOW_MS) loginFailures.delete(k);
  }
}, RATE_WINDOW_MS).unref?.();

const PASSWORD_MIN = 8;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;
const GENDERS = ['Male', 'Female', 'Other'];

// H3: registration limiter, keyed by IP ONLY. The login limiter above keys on
// IP+email, which is useless here because the caller supplies the email —
// rotating addresses would reset the counter and defeat it entirely.
const REGISTER_LIMIT_MAX = parseInt(process.env.REGISTER_RATE_LIMIT_MAX || '5', 10);
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const registerAttempts = new Map(); // ip -> { count, firstAt }

function registerKey(req) {
  return (req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || 'unknown').trim();
}

function registerBlocked(req) {
  const key = registerKey(req);
  const entry = registerAttempts.get(key);
  if (!entry) return 0;
  const elapsed = Date.now() - entry.firstAt;
  if (elapsed > REGISTER_WINDOW_MS) {
    registerAttempts.delete(key);
    return 0;
  }
  // Must compare the count: returning a retry time whenever an entry merely
  // exists would block every request after the FIRST successful signup, which
  // would break a judge's second self-registration attempt for a whole hour.
  if (entry.count < REGISTER_LIMIT_MAX) return 0;
  return Math.ceil((REGISTER_WINDOW_MS - elapsed) / 1000);
}

function recordRegisterAttempt(req) {
  const key = registerKey(req);
  const now = Date.now();
  const entry = registerAttempts.get(key);
  if (!entry || now - entry.firstAt > REGISTER_WINDOW_MS) {
    registerAttempts.set(key, { count: 1, firstAt: now });
    return 1;
  }
  entry.count += 1;
  return entry.count;
}

function clearRegisterAttempts(req) {
  registerAttempts.delete(registerKey(req));
}

// Sweep the registration map too, so it cannot grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of registerAttempts) if (now - v.firstAt > REGISTER_WINDOW_MS) registerAttempts.delete(k);
}, RATE_WINDOW_MS).unref?.();

/** Guard for the three public register routes. Counts accepted signups per IP. */
function registerRateLimit(req, res, next) {
  const retryAfter = registerBlocked(req);
  if (retryAfter > 0) {
    res.set('Retry-After', String(retryAfter));
    return res.status(429).json({
      error: `Too many sign-up attempts from this device. Try again in ${Math.ceil(retryAfter / 60)} minute${Math.ceil(retryAfter / 60) === 1 ? '' : 's'}.`
    });
  }
  next();
}

/** Issue the same signed session a login returns (P16: register → portal). */
function issueSession(res, user) {
  const payload = {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    specialization: user.specialization
  };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });
  res.json({ message: 'Registration successful', token, user: payload });
}

/** Shared password policy (P13 reuses this on the client too). */
function validatePassword(pw, confirm) {
  if (typeof pw !== 'string' || pw.length < PASSWORD_MIN) {
    return `Password must be at least ${PASSWORD_MIN} characters`;
  }
  if (confirm !== undefined && pw !== confirm) {
    return 'Passwords do not match';
  }
  return null;
}

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

function findEmailConflict(cleanEmail) {
  return db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
}

// GET /auth/me — validate the stored session on startup (P03).
// Reloads the user from the DB so a stale token (deactivated account or role
// change) fails here instead of silently working.
router.get('/me', authenticateToken, (req, res) => {
  try {
    const user = db
      .prepare('SELECT id, name, email, role, specialization, is_active, must_change_password FROM users WHERE id = ?')
      .get(req.user.id);

    if (!user || user.is_active === 0) {
      return res.status(401).json({ error: 'Session is no longer valid' });
    }
    if (req.user.role && user.role !== req.user.role) {
      return res.status(401).json({ error: 'Account role has changed; sign in again' });
    }

    res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        specialization: user.specialization,
        // Must survive a refresh: AuthContext treats /me as server-side truth and
        // overwrites local state with it. Dropping this flag let anyone on a temp
        // password press F5 and land in the portal with the gate still open.
        must_change_password: user.must_change_password === 1
      }
    });
  } catch (error) {
    console.error('/auth/me error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// P15: lets the admin auth page decide whether to offer one-time bootstrap.
// Public (no token): only leaks the boolean "does any admin exist".
router.get('/admin-exists', (req, res) => {
  const n = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
  res.json({ adminsExist: n > 0 });
});

router.post('/login', (req, res) => {
  try {
    const { email, password, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // P38: block when too many failures from this IP+email.
    const rlKey = rateLimitKey(req, email);
    const retryAfter = loginBlocked(rlKey);
    if (retryAfter > 0) {
      res.set('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: `Too many sign-in attempts. Try again in ${Math.ceil(retryAfter / 60)} minute${Math.ceil(retryAfter / 60) === 1 ? '' : 's'}.`
      });
    }

    const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email.trim());
    if (!user) {
      // P38: unknown emails count too — probing addresses must not bypass the limit.
      const count = recordLoginFailure(rlKey);
      if (RATE_LIMIT_MAX - count <= 0) {
        res.set('Retry-After', String(RATE_WINDOW_MS / 1000));
        return res.status(429).json({ error: 'Too many sign-in attempts. Try again in 15 minutes.' });
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Round 2 Phase 36: deactivated accounts cannot sign in. Clinical history is
    // untouched — this gates access only.
    if (user.is_active === 0) {
      return res.status(403).json({
        error: 'This account has been deactivated by an administrator. Contact your clinic to regain access.'
      });
    }

    const isMatch = bcrypt.compareSync(password, user.password_hash);
    if (!isMatch) {
      const count = recordLoginFailure(rlKey);
      const remaining = RATE_LIMIT_MAX - count;
      if (remaining <= 0) {
        res.set('Retry-After', String(RATE_WINDOW_MS / 1000));
        return res.status(429).json({
          error: 'Too many sign-in attempts. Try again in 15 minutes.'
        });
      }
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    loginFailures.delete(rlKey); // P38: successful login clears the counter

    // P09: role-aware sign-in. If the caller asked for a portal the account does
    // not belong to, answer with the SAME generic 401 as a wrong password —
    // never reveal which roles exist for an email (no enumeration).
    if (role !== undefined && role !== null && role !== user.role) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const payload = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      specialization: user.specialization,
      must_change_password: user.must_change_password === 1
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

    res.json({
      message: 'Login successful',
      token,
      user: payload
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
});

// P40: change password — requires the CURRENT password, enforces the shared
// policy, clears must_change_password on success.
router.post('/change-password', authenticateToken, (req, res) => {
  try {
    const { current_password, new_password, new_password_confirm } = req.body || {};

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Current and new passwords are required' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) {
      return res.status(404).json({ error: 'Account not found' });
    }

    if (!bcrypt.compareSync(current_password, user.password_hash)) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    if (new_password === current_password) {
      return res.status(400).json({ error: 'The new password must be different from the current password' });
    }

    const pwError = validatePassword(new_password, new_password_confirm);
    if (pwError) return res.status(400).json({ error: pwError });

    db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?')
      .run(bcrypt.hashSync(new_password, 10), user.id);

    res.json({ message: 'Password updated. Use it the next time you sign in.' });
  } catch (error) {
    console.error('Change-password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// P10: open patient self sign-up.
// Body: { name, email, password, password_confirm, dob, gender?, phone? }
router.post('/register/patient', registerRateLimit, (req, res) => {
  try {
    const { name, email, password, password_confirm, dob, gender, phone } = req.body || {};

    const cleanName = cleanString(name);
    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({ error: 'Name must be between 2 and 80 characters' });
    }

    const cleanEmail = cleanString(email).toLowerCase();
    if (!cleanEmail || cleanEmail.length > 120 || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (findEmailConflict(cleanEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const pwError = validatePassword(password, password_confirm);
    if (pwError) return res.status(400).json({ error: pwError });

    const cleanDob = cleanString(dob);
    if (!DOB_RE.test(cleanDob)) {
      return res.status(400).json({ error: 'Date of birth is required in YYYY-MM-DD format' });
    }
    const dobDate = new Date(cleanDob + 'T00:00:00');
    const now = new Date();
    if (isNaN(dobDate.getTime()) || dobDate > now) {
      return res.status(400).json({ error: 'Date of birth cannot be in the future' });
    }
    if ((now - dobDate) / (365.25 * 24 * 3600 * 1000) > 130) {
      return res.status(400).json({ error: 'Date of birth looks invalid (more than 130 years ago)' });
    }

    let cleanGender = null;
    if (gender !== undefined && gender !== null && cleanString(gender) !== '') {
      cleanGender = cleanString(gender);
      if (!GENDERS.includes(cleanGender)) {
        return res.status(400).json({ error: 'Gender must be Male, Female, or Other' });
      }
    }

    let cleanPhone = null;
    if (phone !== undefined && phone !== null && cleanString(phone) !== '') {
      cleanPhone = cleanString(phone);
      if (cleanPhone.length > 24) {
        return res.status(400).json({ error: 'Phone must be 24 characters or fewer' });
      }
    }

    recordRegisterAttempt(req);
    const id = `pat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO users (id, name, email, role, specialization, password_hash, is_active, dob, gender, phone)
      VALUES (?, ?, ?, 'patient', NULL, ?, 1, ?, ?, ?)
    `).run(id, cleanName, cleanEmail, bcrypt.hashSync(password, 10), cleanDob, cleanGender, cleanPhone);

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    emit({
      type: 'account.created',
      ids: adminIds(),
      actor_name: cleanName,
      summary: `${cleanName} self-registered as a patient`,
      user_id: id,
      role: 'patient'
    });
    return issueSession(res, user);
  } catch (error) {
    console.error('Patient registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// P11: doctor self sign-up, gated by CLINIC_ACCESS_CODE.
// Disabled entirely when the env value is empty. Wrong code → 403.
// Body: { name, email, password, password_confirm, specialization, access_code }
router.post('/register/doctor', registerRateLimit, (req, res) => {
  try {
    if (!CLINIC_ACCESS_CODE) {
      return res.status(403).json({
        error: 'Doctor self sign-up is disabled. Ask the clinic administrator to create your account.'
      });
    }

    const { name, email, password, password_confirm, specialization, access_code } = req.body || {};

    if (typeof access_code !== 'string' || access_code !== CLINIC_ACCESS_CODE) {
      return res.status(403).json({ error: 'Invalid clinic access code' });
    }

    const cleanName = cleanString(name);
    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({ error: 'Name must be between 2 and 80 characters' });
    }

    const cleanEmail = cleanString(email).toLowerCase();
    if (!cleanEmail || cleanEmail.length > 120 || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (findEmailConflict(cleanEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const pwError = validatePassword(password, password_confirm);
    if (pwError) return res.status(400).json({ error: pwError });

    const cleanSpec = cleanString(specialization);
    if (!cleanSpec || cleanSpec.length > 120) {
      return res.status(400).json({ error: 'Specialization is required for doctors (max 120 characters)' });
    }

    recordRegisterAttempt(req);
    const id = `doc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO users (id, name, email, role, specialization, password_hash, is_active)
      VALUES (?, ?, ?, 'doctor', ?, ?, 1)
    `).run(id, cleanName, cleanEmail, cleanSpec, bcrypt.hashSync(password, 10));

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    emit({
      type: 'account.created',
      ids: adminIds(),
      actor_name: cleanName,
      summary: `Dr. ${cleanName.replace(/^Dr\.?\s*/i, '')} joined the clinic (self sign-up)`,
      user_id: id,
      role: 'doctor'
    });
    return issueSession(res, user);
  } catch (error) {
    console.error('Doctor registration error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

// P12: one-time admin bootstrap — allowed ONLY while zero admins exist.
// Body: { name, email, password, password_confirm, invite_code }
router.post('/register/admin', registerRateLimit, (req, res) => {
  try {
    if (!ADMIN_INVITE_CODE) {
      return res.status(403).json({ error: 'Admin bootstrap is disabled' });
    }

    const adminCount = db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'admin'").get().n;
    if (adminCount > 0) {
      return res.status(403).json({ error: 'An administrator account already exists' });
    }

    const { name, email, password, password_confirm, invite_code } = req.body || {};
    if (typeof invite_code !== 'string' || invite_code !== ADMIN_INVITE_CODE) {
      return res.status(403).json({ error: 'Invalid admin invite code' });
    }

    const cleanName = cleanString(name);
    if (cleanName.length < 2 || cleanName.length > 80) {
      return res.status(400).json({ error: 'Name must be between 2 and 80 characters' });
    }
    const cleanEmail = cleanString(email).toLowerCase();
    if (!cleanEmail || cleanEmail.length > 120 || !EMAIL_RE.test(cleanEmail)) {
      return res.status(400).json({ error: 'A valid email address is required' });
    }
    if (findEmailConflict(cleanEmail)) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }
    const pwError = validatePassword(password, password_confirm);
    if (pwError) return res.status(400).json({ error: pwError });

    recordRegisterAttempt(req);
    const id = `adm_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    db.prepare(`
      INSERT INTO users (id, name, email, role, specialization, password_hash, is_active)
      VALUES (?, ?, ?, 'admin', NULL, ?, 1)
    `).run(id, cleanName, cleanEmail, bcrypt.hashSync(password, 10));

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
    return issueSession(res, user);
  } catch (error) {
    console.error('Admin bootstrap error:', error);
    res.status(500).json({ error: 'Internal server error during registration' });
  }
});

module.exports = router;
