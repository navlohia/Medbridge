const bcrypt = require('bcryptjs');
const { db } = require('../db/database');

/**
 * Shared account-creation logic (Round 2 Phases 32/37/40).
 * Both Admin → Add Doctor/Patient and Doctor → Quick-Add Patient call
 * createUserAccount() so validation, password generation, and sanitization
 * behave identically everywhere an account is born.
 */

const NAME_MIN = 2;
const NAME_MAX = 80;
const EMAIL_MAX = 120;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DOB_RE = /^\d{4}-\d{2}-\d{2}$/;
const GENDERS = ['Male', 'Female', 'Other'];
const PHONE_MAX = 24;

// Readable temporary passwords: word-word-2digits (Phases 37) — easy to read
// aloud in a demo, still ~10 chars with mixed characters.
const PASSWORD_WORDS = [
  'harbor', 'meadow', 'ember', 'cedar', 'delta', 'summit', 'orbit', 'cobalt',
  'jasper', 'lumen', 'quartz', 'nimbus', 'saffron', 'willow', 'onyx', 'pylon',
  'zenith', 'cactus', 'fjord', 'marble'
];

function generateTempPassword() {
  const pick = () => PASSWORD_WORDS[Math.floor(Math.random() * PASSWORD_WORDS.length)];
  const digits = String(Math.floor(Math.random() * 90) + 10);
  return `${pick()}-${pick()}-${digits}`;
}

/** Typed validation error → mapped to a clean 400/409 by callers. */
class AccountValidationError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function cleanString(v) {
  return typeof v === 'string' ? v.trim() : '';
}

/**
 * Validate + create a user account.
 * Returns { user, tempPassword } — tempPassword is shown exactly once.
 * Throws AccountValidationError with a user-facing message.
 */
function createUserAccount({ role, name, email, specialization, dob, gender, phone }) {
  if (!['doctor', 'patient'].includes(role)) {
    throw new AccountValidationError('Role must be doctor or patient');
  }

  const cleanName = cleanString(name);
  if (cleanName.length < NAME_MIN || cleanName.length > NAME_MAX) {
    throw new AccountValidationError(`Name must be between ${NAME_MIN} and ${NAME_MAX} characters`);
  }

  const cleanEmail = cleanString(email).toLowerCase();
  if (!cleanEmail || cleanEmail.length > EMAIL_MAX || !EMAIL_RE.test(cleanEmail)) {
    throw new AccountValidationError('A valid email address is required');
  }

  const dup = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(cleanEmail);
  if (dup) {
    throw new AccountValidationError(
      `An account with email ${cleanEmail} already exists — try another address or search the list first`,
      409
    );
  }

  let cleanSpec = null;
  if (role === 'doctor') {
    cleanSpec = cleanString(specialization);
    if (!cleanSpec || cleanSpec.length > 120) {
      throw new AccountValidationError('Specialization is required for doctors (max 120 characters)');
    }
  }

  let cleanDob = null;
  if (role === 'patient') {
    cleanDob = cleanString(dob);
    if (!DOB_RE.test(cleanDob)) {
      throw new AccountValidationError('Date of birth is required in YYYY-MM-DD format');
    }
    const dobDate = new Date(cleanDob + 'T00:00:00');
    const now = new Date();
    if (isNaN(dobDate.getTime()) || dobDate > now) {
      throw new AccountValidationError('Date of birth cannot be in the future');
    }
    const ageYears = (now - dobDate) / (365.25 * 24 * 3600 * 1000);
    if (ageYears > 130) {
      throw new AccountValidationError('Date of birth looks invalid (more than 130 years ago)');
    }
  }

  let cleanGender = null;
  if (gender !== undefined && gender !== null && cleanString(gender) !== '') {
    cleanGender = cleanString(gender);
    if (!GENDERS.includes(cleanGender)) {
      throw new AccountValidationError('Gender must be Male, Female, or Other');
    }
  }

  let cleanPhone = null;
  if (phone !== undefined && phone !== null && cleanString(phone) !== '') {
    cleanPhone = cleanString(phone);
    if (cleanPhone.length > PHONE_MAX) {
      throw new AccountValidationError(`Phone must be ${PHONE_MAX} characters or fewer`);
    }
  }

  const tempPassword = generateTempPassword();
  const passwordHash = bcrypt.hashSync(tempPassword, 10);
  const id = `${role === 'doctor' ? 'doc' : 'pat'}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  db.prepare(`
    INSERT INTO users (id, name, email, role, specialization, password_hash, is_active, dob, gender, phone)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)
  `).run(id, cleanName, cleanEmail, role, cleanSpec, passwordHash, cleanDob, cleanGender, cleanPhone);

  const user = db.prepare(`
    SELECT id, name, email, role, specialization, is_active, dob, gender, phone, created_at
    FROM users WHERE id = ?
  `).get(id);

  return { user, tempPassword };
}

/** Public projection of a user row — never leaks password_hash. */
function publicUser(row) {
  if (!row) return null;
  const { password_hash, ...rest } = row;
  return rest;
}

module.exports = {
  createUserAccount,
  generateTempPassword,
  AccountValidationError,
  publicUser
};
