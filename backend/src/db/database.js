const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// P22/P42: tests boot an isolated server against a temp DB copy via
// MEDBRIDGE_DB_PATH. Default (production/dev) behavior is unchanged.
const dbPath = process.env.MEDBRIDGE_DB_PATH
  ? path.resolve(process.env.MEDBRIDGE_DB_PATH)
  : path.join(dbDir, 'medbridge.db');
const db = new DatabaseSync(dbPath);

// Enable foreign keys and WAL mode for reliability
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('doctor', 'patient', 'admin')),
      specialization TEXT,
      password_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      dob TEXT,
      gender TEXT,
      phone TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS medicines (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      composition TEXT,
      side_effects TEXT,
      therapeutic_class TEXT NOT NULL,
      uses_static TEXT,
      uses_ai_generated TEXT
    );

    CREATE TABLE IF NOT EXISTS diagnoses (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      symptoms TEXT,
      precautions TEXT
    );

    CREATE TABLE IF NOT EXISTS visits (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      visit_date TEXT NOT NULL,
      diagnosis_id TEXT NOT NULL,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patient_id) REFERENCES users(id),
      FOREIGN KEY(doctor_id) REFERENCES users(id),
      FOREIGN KEY(diagnosis_id) REFERENCES diagnoses(id)
    );

    CREATE TABLE IF NOT EXISTS prescriptions (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL,
      medicine_id TEXT NOT NULL,
      dosage TEXT NOT NULL,
      duration TEXT NOT NULL,
      FOREIGN KEY(visit_id) REFERENCES visits(id),
      FOREIGN KEY(medicine_id) REFERENCES medicines(id)
    );

    CREATE TABLE IF NOT EXISTS lab_orders (
      id TEXT PRIMARY KEY,
      visit_id TEXT NOT NULL,
      test_name TEXT NOT NULL,
      scheduled_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'completed')),
      FOREIGN KEY(visit_id) REFERENCES visits(id)
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      appointment_date TEXT NOT NULL,
      appointment_time TEXT,
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('requested', 'confirmed', 'cancelled', 'reschedule_proposed')),
      proposed_date TEXT,
      proposed_time TEXT,
      proposed_reason TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patient_id) REFERENCES users(id),
      FOREIGN KEY(doctor_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS self_logs (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      log_type TEXT NOT NULL CHECK(log_type IN ('symptom', 'vital')),
      label TEXT NOT NULL,
      value TEXT NOT NULL,
      unit TEXT,
      log_date TEXT NOT NULL,
      entry_id TEXT,
      duration TEXT,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patient_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS lab_tests (
      id TEXT PRIMARY KEY,
      test_name TEXT UNIQUE NOT NULL,
      unit TEXT NOT NULL,
      normal_low REAL NOT NULL,
      normal_high REAL NOT NULL
    );

    -- Doctor guidance on a patient's symptom journal entry (Post-Pass 3)
    CREATE TABLE IF NOT EXISTS symptom_comments (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patient_id) REFERENCES users(id),
      FOREIGN KEY(doctor_id) REFERENCES users(id)
    );

    -- Working hours per doctor per weekday (Round 2: time-slot booking).
    -- day_of_week: 0 = Sunday … 6 = Saturday (JS Date.getDay() convention).
    -- A doctor's day may have multiple rows (e.g. morning + afternoon sessions).
    CREATE TABLE IF NOT EXISTS doctor_availability (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY(doctor_id) REFERENCES users(id),
      UNIQUE(doctor_id, day_of_week, start_time)
    );

    -- Patient-uploaded lab report photos + AI extraction (Round 2).
    -- Lifecycle: pending_review (discardable) → confirmed (permanent, rows
    -- written to self_logs) — or discarded while still pending_review.
    CREATE TABLE IF NOT EXISTS lab_report_uploads (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      image_path TEXT NOT NULL,
      image_mime TEXT NOT NULL,
      image_size INTEGER,
      report_date TEXT,
      extracted_json TEXT,
      needs_manual_entry INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review', 'confirmed', 'discarded')),
      confirmed_log_ids TEXT,
      confirmed_at TEXT,
      FOREIGN KEY(patient_id) REFERENCES users(id)
    );
  `);
}

// Incremental migrations for existing databases (idempotent, guarded by column checks)
function runMigrations() {
  const tableColumns = (table) =>
    db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  const tableSql = (table) =>
    (db.prepare(`SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table) || {}).sql || '';

  // Round 2 Phase 12: users.is_active (default 1) — login gating only, never clinical
  if (!tableColumns('users').includes('is_active')) {
    db.exec('ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;');
    console.log('[DB Migration] Added users.is_active (default 1)');
  }

  // P39: users.must_change_password — admin/doctor-created accounts (temp
  // passwords) and self-registrations land here; the client forces a change
  // before the portal opens. Additive + idempotent; backup taken first.
  if (!tableColumns('users').includes('must_change_password')) {
    db.exec('ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;');
    console.log('[DB Migration] Added users.must_change_password (default 0)');
  }

  // Round 2 Phase 31: account attributes for admin-created patients (nullable;
  // account data managed by admins, not clinical history)
  for (const col of ['dob', 'gender', 'phone']) {
    if (!tableColumns('users').includes(col)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${col} TEXT;`);
      console.log(`[DB Migration] Added users.${col}`);
    }
  }

  // Round 2 Phase 11: role CHECK gains 'admin'. SQLite cannot ALTER a CHECK
  // constraint, so use the documented table-rebuild recipe (foreign_keys OFF).
  if (!tableSql('users').includes("'admin'")) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      CREATE TABLE users_migrated (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('doctor', 'patient', 'admin')),
        specialization TEXT,
        password_hash TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO users_migrated (id, name, email, role, specialization, password_hash, is_active, created_at)
        SELECT id, name, email, role, specialization, password_hash, COALESCE(is_active, 1), created_at
        FROM users;
      DROP TABLE users;
      ALTER TABLE users_migrated RENAME TO users;
    `);
    db.exec('PRAGMA foreign_keys = ON;');
    console.log('[DB Migration] Rebuilt users with role CHECK including admin');
  }

  // Round 2 Phase 13: appointments.appointment_time (TEXT, HH:MM).
  // Existing rows backfilled to a sensible mid-morning default.
  if (!tableColumns('appointments').includes('appointment_time')) {
    db.exec('ALTER TABLE appointments ADD COLUMN appointment_time TEXT;');
    db.prepare(`UPDATE appointments SET appointment_time = '09:00' WHERE appointment_time IS NULL`).run();
    console.log("[DB Migration] Added appointments.appointment_time (backfilled '09:00')");
  }

  // Round 2 Phase 15: reschedule proposal columns (all nullable)
  const proposedCols = [
    ['proposed_date', 'TEXT'],
    ['proposed_time', 'TEXT'],
    ['proposed_reason', 'TEXT']
  ];
  for (const [col, ddl] of proposedCols) {
    if (!tableColumns('appointments').includes(col)) {
      db.exec(`ALTER TABLE appointments ADD COLUMN ${col} ${ddl};`);
      console.log(`[DB Migration] Added appointments.${col}`);
    }
  }

  // Round 2 Phase 14: status CHECK gains 'reschedule_proposed' (table rebuild)
  if (!tableSql('appointments').includes("'reschedule_proposed'")) {
    db.exec('PRAGMA foreign_keys = OFF;');
    db.exec(`
      CREATE TABLE appointments_migrated (
        id TEXT PRIMARY KEY,
        patient_id TEXT NOT NULL,
        doctor_id TEXT NOT NULL,
        appointment_date TEXT NOT NULL,
        appointment_time TEXT,
        reason TEXT,
        status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('requested', 'confirmed', 'cancelled', 'reschedule_proposed')),
        proposed_date TEXT,
        proposed_time TEXT,
        proposed_reason TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(patient_id) REFERENCES users(id),
        FOREIGN KEY(doctor_id) REFERENCES users(id)
      );
      INSERT INTO appointments_migrated (id, patient_id, doctor_id, appointment_date, appointment_time, reason, status, proposed_date, proposed_time, proposed_reason, created_at)
        SELECT id, patient_id, doctor_id, appointment_date, appointment_time, reason, status, proposed_date, proposed_time, proposed_reason, created_at
        FROM appointments;
      DROP TABLE appointments;
      ALTER TABLE appointments_migrated RENAME TO appointments;
    `);
    db.exec('PRAGMA foreign_keys = ON;');
    console.log("[DB Migration] Rebuilt appointments with status CHECK including 'reschedule_proposed'");
  }

  // Round 2 Phase 16: doctor_availability table (guarded CREATE for pre-existing DBs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS doctor_availability (
      id TEXT PRIMARY KEY,
      doctor_id TEXT NOT NULL,
      day_of_week INTEGER NOT NULL CHECK(day_of_week BETWEEN 0 AND 6),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      FOREIGN KEY(doctor_id) REFERENCES users(id),
      UNIQUE(doctor_id, day_of_week, start_time)
    );
  `);

  // Round 2 Phase 19: lab_report_uploads table (guarded CREATE for pre-existing DBs)
  db.exec(`
    CREATE TABLE IF NOT EXISTS lab_report_uploads (
      id TEXT PRIMARY KEY,
      patient_id TEXT NOT NULL,
      uploaded_at TEXT DEFAULT CURRENT_TIMESTAMP,
      image_path TEXT NOT NULL,
      image_mime TEXT NOT NULL,
      image_size INTEGER,
      report_date TEXT,
      extracted_json TEXT,
      needs_manual_entry INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending_review' CHECK(status IN ('pending_review', 'confirmed', 'discarded')),
      confirmed_log_ids TEXT,
      confirmed_at TEXT,
      FOREIGN KEY(patient_id) REFERENCES users(id)
    );
  `);

  // Doctor guidance on symptom entries (Post-Pass 3) — create for pre-existing DBs
  db.exec(`
    CREATE TABLE IF NOT EXISTS symptom_comments (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL,
      patient_id TEXT NOT NULL,
      doctor_id TEXT NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(patient_id) REFERENCES users(id),
      FOREIGN KEY(doctor_id) REFERENCES users(id)
    );
  `);

  // Home-logging support: Weight must exist in the lab_tests reference catalog
  // so patients can log it and vitals surfaces treat it as a standard metric.
  // Upsert keeps this idempotent when the seed also inserts Weight explicitly.
  db.prepare(`
    INSERT INTO lab_tests (id, test_name, unit, normal_low, normal_high)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(test_name) DO UPDATE SET
      unit = excluded.unit,
      normal_low = excluded.normal_low,
      normal_high = excluded.normal_high
  `).run('lt_mig_weight', 'Weight', 'kg', 45.0, 90.0);
  const hasWeight = db.prepare(`SELECT 1 FROM lab_tests WHERE test_name = 'Weight'`).get();
  if (hasWeight) {
    const seededBefore = db.prepare(`SELECT id FROM lab_tests WHERE test_name = 'Weight' AND id != 'lt_mig_weight'`).get();
    if (!seededBefore) console.log('[DB Migration] Ensured Weight exists in lab_tests reference catalog');
  }
}

// Transaction wrapper helper
function transaction(fn) {
  db.exec('BEGIN TRANSACTION;');
  try {
    const result = fn(db);
    db.exec('COMMIT;');
    return result;
  } catch (err) {
    db.exec('ROLLBACK;');
    throw err;
  }
}

module.exports = {
  db,
  initSchema,
  runMigrations,
  transaction
};
