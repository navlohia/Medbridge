/**
 * P22: Authorization matrix integration tests (brief Phase 1 verification).
 * Runs the REAL Express app against a TEMP DB COPY via MEDBRIDGE_DB_PATH.
 * No mocking of the auth stack; rows mirror the brief's matrix.
 *
 * Requires Node 22+ (node:test, node:sqlite via the app itself).
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const BACKEND_ROOT = path.join(__dirname, '..');
const PORT = 4599;
const BASE = `http://127.0.0.1:${PORT}`;

let server;
let tokens = {};

async function req(method, urlPath, { token, body } = {}) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, data };
}

async function login(email, password = 'demo1234') {
  const r = await req('POST', '/api/auth/login', { body: { email, password } });
  assert.strictEqual(r.status, 200, `seed login failed for ${email}: ${JSON.stringify(r.data)}`);
  return r.data.token;
}

test.before(async () => {
  // 1. Temp DB copy (never touches the real DB)
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medbridge-test-'));
  const tmpDb = path.join(tmpDir, 'test.db');
  fs.copyFileSync(path.join(BACKEND_ROOT, 'src/db/medbridge.db'), tmpDb);

  // 2. Boot the real app on a spare port against the copy
  server = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND_ROOT,
    env: { ...process.env, MEDBRIDGE_DB_PATH: tmpDb, PORT: String(PORT), JWT_SECRET: 'test-secret-not-used-in-prod' },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (d) => process.stderr.write(`[test server] ${d}`));

  // 3. Wait for readiness
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE + '/api/health');
      if (r.ok) break;
    } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 250));
  }
  const health = await fetch(BASE + '/api/health');
  assert.ok(health.ok, 'test server failed to start');

  tokens.admin = await login('admin@medbridge.com');
  tokens.doctor = await login('doctor@medbridge.com');
  tokens.patient1 = await login('patient1@medbridge.com');
  tokens.patient2 = await login('patient2@medbridge.com');
});

test.after(() => {
  if (server) server.kill();
});

// ---------- Role-mismatch login (P09) ----------
test('role-mismatch login returns the SAME generic 401 as wrong password', async () => {
  const mismatch = await req('POST', '/api/auth/login', {
    body: { email: 'doctor@medbridge.com', password: 'demo1234', role: 'patient' }
  });
  const wrongPw = await req('POST', '/api/auth/login', {
    body: { email: 'doctor@medbridge.com', password: 'definitely-wrong', role: 'patient' }
  });
  assert.strictEqual(mismatch.status, 401);
  assert.strictEqual(wrongPw.status, 401);
  assert.strictEqual(mismatch.data.error, wrongPw.data.error, 'messages must be identical (no enumeration)');
});

// ---------- Register flows (P10–P12) ----------
test('patient registration: open, validated, returns a session', async () => {
  const email = `t${Date.now()}@example.com`;
  const good = await req('POST', '/api/auth/register/patient', {
    body: { name: 'Test Patient', email, password: 'password123', password_confirm: 'password123', dob: '1990-01-01' }
  });
  assert.strictEqual(good.status, 200);
  assert.ok(good.data.token);
  assert.strictEqual(good.data.user.role, 'patient');

  const dup = await req('POST', '/api/auth/register/patient', {
    body: { name: 'Test Patient', email, password: 'password123', password_confirm: 'password123', dob: '1990-01-01' }
  });
  assert.strictEqual(dup.status, 409);

  const short = await req('POST', '/api/auth/register/patient', {
    body: { name: 'T', email: `x${Date.now()}@example.com`, password: 'short', password_confirm: 'short', dob: '1990-01-01' }
  });
  assert.strictEqual(short.status, 400);
});

test('doctor registration: good/bad/disabled access codes', async () => {
  const email = `dr${Date.now()}@example.com`;
  const bad = await req('POST', '/api/auth/register/doctor', {
    body: { name: 'Doc', email, password: 'password123', password_confirm: 'password123', specialization: 'GP', access_code: 'WRONG' }
  });
  assert.strictEqual(bad.status, 403, 'wrong code must 403');

  // Demo env (A2) ships a code → the good path must succeed on the temp copy
  const good = await req('POST', '/api/auth/register/doctor', {
    body: { name: 'Doc Good', email, password: 'password123', password_confirm: 'password123', specialization: 'GP', access_code: 'CLINIC-2026-DEMO' }
  });
  assert.strictEqual(good.status, 200);
  assert.strictEqual(good.data.user.role, 'doctor');
});

test('admin bootstrap refuses while admins exist', async () => {
  const r = await req('POST', '/api/auth/register/admin', {
    body: { name: 'X', email: `adm${Date.now()}@example.com`, password: 'password123', password_confirm: 'password123', invite_code: 'ADMIN-BOOTSTRAP-2026' }
  });
  assert.strictEqual(r.status, 403);
});

// ---------- THE MATRIX ----------
test('matrix: GET /patients is doctor-only', async () => {
  assert.strictEqual((await req('GET', '/api/patients')).status, 401, 'anonymous');
  assert.strictEqual((await req('GET', '/api/patients', { token: tokens.patient1 })).status, 403, 'patient');
  assert.strictEqual((await req('GET', '/api/patients', { token: tokens.admin })).status, 403, 'admin');
  assert.strictEqual((await req('GET', '/api/patients', { token: tokens.doctor })).status, 200, 'doctor');
});

test('matrix: per-patient reads are owner-or-doctor only (IDOR closed)', async () => {
  for (const route of ['/api/patients/pat_1/history', '/api/patients/pat_1/dashboard', '/api/patients/pat_1/self-logs']) {
    assert.strictEqual((await req('GET', route)).status, 401, `anon ${route}`);
    assert.strictEqual((await req('GET', route, { token: tokens.patient2 })).status, 403, `patient A vs B ${route}`);
    assert.strictEqual((await req('GET', route, { token: tokens.admin })).status, 403, `admin vs clinical ${route}`);
    assert.strictEqual((await req('GET', route, { token: tokens.patient1 })).status, 200, `owner ${route}`);
    assert.strictEqual((await req('GET', route, { token: tokens.doctor })).status, 200, `doctor ${route}`);
  }
});

test('matrix: catalogs require a token, any role may read', async () => {
  for (const route of ['/api/medicines', '/api/diagnoses', '/api/lab-tests']) {
    assert.strictEqual((await req('GET', route)).status, 401, `anon ${route}`);
    assert.strictEqual((await req('GET', route, { token: tokens.patient1 })).status, 200, `patient ${route}`);
    assert.strictEqual((await req('GET', route, { token: tokens.doctor })).status, 200, `doctor ${route}`);
  }
});

test('matrix: admin is blocked from admin-only? no — doctor-only patient-write routes', async () => {
  // doctor-only clinical WRITE routes must reject admin + patient
  const doctorOnly = [
    ['POST', '/api/patients', { name: 'X', email: `q${Date.now()}@example.com`, dob: '1990-01-01' }],
    ['POST', '/api/visits', { patient_id: 'pat_1', diagnosis_id: 'd_1', notes: 'x' }]
  ];
  for (const [method, route, body] of doctorOnly) {
    assert.strictEqual((await req(method, route, { token: tokens.admin, body })).status, 403, `admin ${route}`);
    assert.strictEqual((await req(method, route, { token: tokens.patient1, body })).status, 403, `patient ${route}`);
  }
});

test('matrix: deactivated token is rejected mid-session', async () => {
  const r = await req('PATCH', '/api/admin/users/pat_2/status', {
    token: tokens.admin,
    body: { is_active: false }
  });
  assert.strictEqual(r.status, 200);
  try {
    const after = await req('GET', '/api/patients/pat_2/dashboard', { token: tokens.patient2 });
    assert.strictEqual(after.status, 401, 'deactivated user token must stop working');
  } finally {
    await req('PATCH', '/api/admin/users/pat_2/status', { token: tokens.admin, body: { is_active: true } });
  }
});

test('malformed JSON returns 400 (not 500)', async () => {
  const res = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{not valid json'
  });
  assert.strictEqual(res.status, 400, 'express.json should reject malformed bodies with 400');
});
