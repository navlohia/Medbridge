const jwt = require('jsonwebtoken');
const { db } = require('../db/database');

// P36: no hard-coded fallback. If backend/.env has no JWT_SECRET — or still
// carries the old public value — generate a random 48-byte secret into .env
// at startup and log that we did. Never print the secret itself.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OLD_PUBLIC_SECRET = 'medbridge-super-secret-jwt-key-2026-secure';
const ENV_PATH = path.join(__dirname, '..', '..', '.env');

function ensureJwtSecret() {
  const current = process.env.JWT_SECRET;
  if (current && current !== OLD_PUBLIC_SECRET) return current;

  const reason = current === OLD_PUBLIC_SECRET
    ? 'JWT_SECRET in .env still equals the old public default'
    : 'JWT_SECRET missing from environment';

  const fresh = crypto.randomBytes(48).toString('hex');
  let lines = [];
  try {
    lines = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8').split(/\r?\n/) : [];
  } catch { /* unreadable .env — still write below */ }

  const idx = lines.findIndex(l => l.trim().startsWith('JWT_SECRET='));
  if (idx >= 0) lines[idx] = `JWT_SECRET=${fresh}`;
  else lines.push(`JWT_SECRET=${fresh}`);

  try {
    fs.mkdirSync(path.dirname(ENV_PATH), { recursive: true });
    fs.writeFileSync(ENV_PATH, lines.join('\n'));
    console.warn(`[security] ${reason} — generated a new random 48-byte secret into backend/.env`);
    console.warn('[security] All existing sessions are now invalid; users must sign in again.');
  } catch (err) {
    // Read-only FS / permissions: fall back to an in-memory secret for this run.
    console.warn(`[security] ${reason} — could not write .env (${err.message}); using an in-memory random secret for this run only.`);
    return crypto.randomBytes(48).toString('hex');
  }
  return fresh;
}

const JWT_SECRET = ensureJwtSecret();

function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }

    // P17: re-load the user from the DB on EVERY request. A token issued before
    // a deactivation (or role change / account deletion) stops working at the
    // next call instead of staying valid for the rest of its lifetime.
    const user = db
      .prepare('SELECT id, name, email, role, specialization, is_active FROM users WHERE id = ?')
      .get(decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'This account no longer exists' });
    }
    if (user.is_active === 0) {
      return res.status(401).json({
        error: 'This account has been deactivated by an administrator.'
      });
    }
    if (decoded.role && user.role !== decoded.role) {
      return res.status(401).json({ error: 'Account role has changed; sign in again' });
    }

    // req.user always reflects current DB state (never the stale token claims).
    req.user = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      specialization: user.specialization
    };
    next();
  });
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ error: `Access denied. Role ${role} required.` });
    }
    next();
  };
}

module.exports = {
  authenticateToken,
  requireRole,
  JWT_SECRET
};
