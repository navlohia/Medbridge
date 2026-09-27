const { DatabaseSync } = require('node:sqlite');
const path = require('path');
const fs = require('fs');

const dbDir = path.join(__dirname);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const dbPath = path.join(dbDir, 'medbridge.db');
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
      role TEXT NOT NULL CHECK(role IN ('doctor', 'patient')),
      specialization TEXT,
      password_hash TEXT NOT NULL,
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
      reason TEXT,
      status TEXT NOT NULL DEFAULT 'confirmed' CHECK(status IN ('requested', 'confirmed', 'cancelled')),
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
  `);
}

// Incremental migrations for existing databases (idempotent, guarded by column checks)
function runMigrations() {
  const tableColumns = (table) =>
    db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);

  // Feature Spec 1: appointment workflow state (existing doctor-set rows backfill as 'confirmed')
  if (!tableColumns('appointments').includes('status')) {
    db.exec(`
      ALTER TABLE appointments ADD COLUMN status TEXT NOT NULL DEFAULT 'confirmed'
      CHECK(status IN ('requested', 'confirmed', 'cancelled'));
    `);
    console.log('[DB Migration] Added appointments.status (backfilled as confirmed)');
  }

  // Feature Spec 2: grouped symptom entries (entry_id links rows; duration/notes per entry)
  const selfLogCols = tableColumns('self_logs');
  if (!selfLogCols.includes('entry_id')) {
    db.exec('ALTER TABLE self_logs ADD COLUMN entry_id TEXT;');
    console.log('[DB Migration] Added self_logs.entry_id');
  }
  if (!selfLogCols.includes('duration')) {
    db.exec('ALTER TABLE self_logs ADD COLUMN duration TEXT;');
    console.log('[DB Migration] Added self_logs.duration');
  }
  if (!selfLogCols.includes('notes')) {
    db.exec('ALTER TABLE self_logs ADD COLUMN notes TEXT;');
    console.log('[DB Migration] Added self_logs.notes');
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
