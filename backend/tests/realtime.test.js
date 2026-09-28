/**
 * P42: realtime + rate-limit integration tests (brief Phase 1 verification).
 * Boots the real app against a temp DB copy; opens real SSE streams.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');

const BACKEND_ROOT = path.join(__dirname, '..');
const PORT = 4598;
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
  try { data = await res.json(); } catch { /* stream or empty */ }
  return { status: res.status, data, headers: res.headers };
}

async function login(email, password = 'demo1234') {
  const r = await req('POST', '/api/auth/login', { body: { email, password } });
  assert.strictEqual(r.status, 200, `seed login failed for ${email}`);
  return r.data.token;
}

/** Open an SSE stream and collect parsed events until `ms` elapses. */
function openStream(token, ms) {
  const events = [];
  let doneResolve;
  const done = new Promise(r => { doneResolve = r; });
  (async () => {
    const ctrl = new AbortController();
    const res = await fetch(`${BASE}/api/events`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: ctrl.signal
    });
    assert.strictEqual(res.status, 200, 'SSE stream must open');
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const timer = setTimeout(() => { ctrl.abort(); }, ms);
    try {
      while (true) {
        const { value, done: streamDone } = await reader.read();
        if (streamDone) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf('\n\n')) !== -1) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const dataLines = frame.split('\n').filter(l => l.startsWith('data:')).map(l => l.slice(5).trim());
          if (dataLines.length) {
            try { events.push(JSON.parse(dataLines.join('\n'))); } catch { /* skip */ }
          }
        }
      }
    } catch { /* aborted */ }
    clearTimeout(timer);
    doneResolve();
  })();
  return { events, done };
}

test.before(async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'medbridge-rt-'));
  const tmpDb = path.join(tmpDir, 'test.db');
  fs.copyFileSync(path.join(BACKEND_ROOT, 'src/db/medbridge.db'), tmpDb);

  server = spawn(process.execPath, ['src/server.js'], {
    cwd: BACKEND_ROOT,
    // Pin the login limit for tests. The dev .env raises it (or lowers it) for
    // demo convenience; this suite must assert the MECHANISM, so it sets its
    // own known value instead of inheriting whatever the developer configured.
    env: { ...process.env, MEDBRIDGE_DB_PATH: tmpDb, PORT: String(PORT), JWT_SECRET: 'rt-test-secret', LOGIN_RATE_LIMIT_MAX: '10' },
    stdio: ['ignore', 'ignore', 'pipe']
  });
  server.stderr.on('data', (d) => process.stderr.write(`[test server] ${d}`));

  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${BASE}/api/health`);
      if (r.ok) break;
    } catch { /* booting */ }
    await new Promise(r => setTimeout(r, 250));
  }

  tokens.admin = await login('admin@medbridge.com');
  tokens.doctor = await login('doctor@medbridge.com');
  tokens.patient1 = await login('patient1@medbridge.com');
  tokens.patient2 = await login('patient2@medbridge.com');
});

test.after(() => { if (server) server.kill(); });

test('SSE: action by one client arrives at another within 1s', async () => {
  const stream = openStream(tokens.doctor, 6000);
  await new Promise(r => setTimeout(r, 300)); // let the subscription land

  // patient2 (another client) logs a symptom → selflog.created → doctors
  const t0 = Date.now();
  const log = await req('POST', '/api/self-logs', {
    token: tokens.patient2,
    body: { log_type: 'symptom', label: 'SSE latency probe', value: '1', unit: '/5' }
  });
  assert.strictEqual(log.status, 201);

  const deadline = Date.now() + 1000;
  while (Date.now() < deadline) {
    if (stream.events.some(e => e.type === 'selflog.created')) break;
    await new Promise(r => setTimeout(r, 25));
  }
  const received = stream.events.some(e => e.type === 'selflog.created');
  assert.ok(received, `event must arrive within 1s (arrived after ${Date.now() - t0}ms)`);
  await stream.done;
});

test('SSE: a patient never receives another patient’s targeted events', async () => {
  const pat1Stream = openStream(tokens.patient1, 2500);
  await new Promise(r => setTimeout(r, 300));

  // patient2 books → appointment.requested targets doc + admins + PATIENT2.
  // patient1 must NOT receive it.
  let ds; for (let o = 3; o < 15; o++) {
    const x = new Date(); x.setDate(x.getDate() + o);
    if ([1, 2, 3, 4, 5, 6].includes(x.getDay())) { ds = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; break; }
  }
  const av = await req('GET', `/api/appointments/availability?doctor_id=doc_1&date=${ds}`, { token: tokens.patient2 });
  const slot = (av.data.slots || []).find(s => s.available);
  assert.ok(slot, 'need an open slot');
  const book = await req('POST', '/api/appointments', {
    token: tokens.patient2,
    body: { doctor_id: 'doc_1', appointment_date: ds, appointment_time: slot.time, reason: 'P42 isolation' }
  });
  assert.strictEqual(book.status, 201);

  // visit.created targets ONLY patient2 — patient1 must not see it either
  const diags = await req('GET', '/api/diagnoses', { token: tokens.doctor });
  await req('POST', '/api/visits', {
    token: tokens.doctor,
    body: { patient_id: 'pat_2', diagnosis_id: diags.data[0].id, notes: 'P42 isolation visit' }
  });

  await pat1Stream.done;
  const leaked = pat1Stream.events.filter(e =>
    (e.type === 'appointment.requested' && e.patient_id === 'pat_2') ||
    (e.type === 'visit.created' && e.patient_id === 'pat_2')
  );
  assert.strictEqual(leaked.length, 0, `patient1 must not receive patient2's events (got ${JSON.stringify(leaked)})`);

  // …while patient2's OWN stream does receive them (positive control).
  // NOTE: the triggering action (cancel) must happen WHILE the stream is open.
  const pat2Stream = openStream(tokens.patient2, 2000);
  await new Promise(r => setTimeout(r, 300));
  const cancel = await req('PATCH', `/api/appointments/${book.data.appointment.id}/cancel`, { token: tokens.patient2 });
  assert.strictEqual(cancel.status, 200);
  await pat2Stream.done;
  assert.ok(pat2Stream.events.some(e => e.type === 'appointment.updated' && e.patient_id === 'pat_2'),
    'patient2 receives events targeted at them');
});

test('rate limit: 11th consecutive failure returns 429 with Retry-After', async () => {
  const email = `rl-test-${Date.now()}@example.com`;
  let last;
  for (let i = 0; i < 11; i++) {
    last = await req('POST', '/api/auth/login', { body: { email, password: `wrong-${i}` } });
    if (last.status === 429) break;
  }
  assert.strictEqual(last.status, 429, '11th failure must be rate limited');
  assert.ok(last.headers.get('retry-after'), '429 must carry Retry-After');

  // correct password while blocked is also 429
  const blocked = await req('POST', '/api/auth/login', { body: { email, password: 'demo1234' } });
  assert.strictEqual(blocked.status, 429, 'block applies regardless of password correctness');

  // a different account is unaffected
  const other = await req('POST', '/api/auth/login', { body: { email: 'patient1@medbridge.com', password: 'demo1234' } });
  assert.strictEqual(other.status, 200, 'other accounts keep working');
});

test('lab_order.completed event fires when a pending order auto-completes', async () => {
  // Seed a fresh pending order for pat_2 via a doctor visit (drift-proof),
  // then complete it with a confirmed lab-report upload.
  const diag = await req('GET', '/api/diagnoses', { token: tokens.doctor });
  const visit = await req('POST', '/api/visits', {
    token: tokens.doctor,
    body: {
      patient_id: 'pat_2',
      diagnosis_id: diag.data[0].id,
      notes: 'P42 lab order',
      lab_orders: [{ test_name: 'Fasting Blood Sugar', scheduled_date: new Date().toISOString().split('T')[0] }]
    }
  });
  assert.strictEqual(visit.status, 201, `visit with lab order must create: ${JSON.stringify(visit.data)}`);

  const docStream = openStream(tokens.doctor, 4000);
  await new Promise(r => setTimeout(r, 300));

  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const up = await req('POST', '/api/lab-reports/upload', {
    token: tokens.patient2,
    body: { image_base64: png, mime_type: 'image/png' }
  });
  assert.strictEqual(up.status, 201);
  const conf = await req('POST', `/api/lab-reports/${up.data.upload.id}/confirm`, {
    token: tokens.patient2,
    body: { rows: [{ test_name: 'Fasting Blood Sugar', value: '95', unit: 'mg/dL' }] }
  });
  assert.strictEqual(conf.status, 201);

  await docStream.done;
  assert.ok(docStream.events.some(e => e.type === 'lab_order.completed'),
    'lab_order.completed must reach doctors when an order auto-completes');
  assert.ok(docStream.events.some(e => e.type === 'labreport.confirmed'), 'labreport.confirmed reaches doctors');
});
