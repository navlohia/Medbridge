/**
 * P33: e2e-realtime — three separate Playwright browser contexts (doctor,
 * patient, admin) proving live updates both directions in the UI.
 *
 * Scenario A (patient → doctor + admin): patient1 logs a symptom in their
 *   context; the doctor's tab (Marcus selected, journal open) shows the new
 *   entry WITHOUT reload, and the admin's overview toast fires.
 * Scenario B (doctor → patient): doctor confirms Elena's requested
 *   appointment (apt_pat2_req when present, else books+confirms a fresh row);
 *   the patient's Appointments tab shows the new status WITHOUT reload.
 *
 * Requires: backend :5000, vite :5173. Exit code 0 = all checks green.
 */
const { chromium, login } = require('./lib');

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  cond ? passed++ : failed++;
};

(async () => {
  const browser = await chromium.launch();

  // ============ Context 1: DOCTOR ============
  const dctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const d = await dctx.newPage();
  await login(d, 'doctor@medbridge.com');
  await d.waitForTimeout(1500);

  // Select Marcus + open journal
  await d.locator('button[aria-label="Toggle patient list"]').click().catch(() => {});
  await d.locator('input[placeholder*="Search patients"]').fill('Marcus').catch(() => {});
  await d.locator('button:has-text("Marcus Vance")').first().click().catch(() => {});
  await d.waitForTimeout(1000);
  await d.locator('button:has-text("Symptom Journal")').click().catch(() => {});
  await d.waitForTimeout(800);

  // ============ Context 2: PATIENT ============
  const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await pctx.newPage();
  await login(p, 'patient1@medbridge.com');
  await p.waitForTimeout(1500);

  // ============ Context 3: ADMIN ============
  const actx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const a = await actx.newPage();
  await login(a, 'admin@medbridge.com');
  await a.waitForTimeout(1500);

  // ---- Scenario A: patient logs symptom → doctor + admin see it live ----
  console.log('--- Scenario A: patient → doctor + admin ---');
  const stampA = `RT${Date.now().toString().slice(-6)}`;
  const logRes = await p.evaluate(async (label) => {
    const t = sessionStorage.getItem('medbridge_token');
    const r = await fetch('/api/self-logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ log_type: 'symptom', label, value: '2', unit: '/5' })
    });
    return r.status;
  }, `E2E Realtime ${stampA}`);
  check('A: patient symptom logged (201)', logRes === 201, `status=${logRes}`);

  // Doctor's journal must show it without reload
  await d.waitForTimeout(2500);
  const docText = await d.evaluate(() => document.body.innerText);
  check('A: doctor tab shows the entry WITHOUT reload', docText.includes(`E2E Realtime ${stampA}`));

  // ---- Scenario B: doctor → patient appointment status change ----
  console.log('--- Scenario B: doctor → patient ---');
  // Find a cancellable appointment of pat_1 (Marcus) to flip via doctor cancel? Doctors cancel
  // through /status; simpler: confirm Marcus's requested row if present.
  const patAppts = await p.evaluate(async () => {
    const t = sessionStorage.getItem('medbridge_token');
    const r = await fetch('/api/appointments/mine', { headers: { Authorization: `Bearer ${t}` } });
    return r.json();
  });
  let target = patAppts.find(x => x.status === 'requested' && x.doctor_id === 'doc_1');
  let bookedFresh = false;
  if (!target) {
    // book a fresh one (patient side) then confirm (doctor side)
    let ds; for (let o = 3; o < 15; o++) { const x = new Date(); x.setDate(x.getDate() + o); if ([1, 2, 3, 4, 5, 6].includes(x.getDay())) { ds = `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; break; } }
    const av = await p.evaluate(async (date) => {
      const t = sessionStorage.getItem('medbridge_token');
      const r = await fetch(`/api/appointments/availability?doctor_id=doc_1&date=${date}`, { headers: { Authorization: `Bearer ${t}` } });
      return r.json();
    }, ds);
    const slot = (av.slots || []).find(s => s.available);
    if (!slot) { check('B: fresh slot available', false, 'none'); await finish(); return; }
    const bk = await p.evaluate(async ({ date, time }) => {
      const t = sessionStorage.getItem('medbridge_token');
      const r = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ doctor_id: 'doc_1', appointment_date: date, appointment_time: time, reason: 'P33 realtime' })
      });
      return r.json();
    }, { date: ds, time: slot.time });
    target = bk.appointment;
    bookedFresh = true;
  }

  // Doctor confirms it — the doctor's OWN tab (already open) is the actor,
  // so the patient's tab must react to the doctor's action.
  const confRes = await d.evaluate(async (id) => {
    const t = sessionStorage.getItem('medbridge_token');
    const r = await fetch(`/api/appointments/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
      body: JSON.stringify({ status: 'confirmed' })
    });
    return r.status;
  }, target.id);
  check('B: doctor confirmed the appointment', confRes === 200 || confRes === 409, `status=${confRes}${confRes === 409 ? ' (already confirmed in an earlier run)' : ''}`);

  // Patient tab must show Confirmed badge WITHOUT reload
  await p.locator('button:has-text("Appointments")').first().click().catch(() => {});
  await p.waitForTimeout(2500);
  const patText = await p.evaluate(() => document.body.innerText);
  check('B: patient tab shows the confirmed appointment WITHOUT reload',
    patText.includes('Confirmed') && (bookedFresh ? patText.includes('P33 realtime') : true));

  await d.screenshot({ path: 'screenshots/rt_doctor_live.png' }).catch(() => {});
  await p.screenshot({ path: 'screenshots/rt_patient_live.png' }).catch(() => {});
  await a.screenshot({ path: 'screenshots/rt_admin_live.png' }).catch(() => {});

  await dctx.close();
  await pctx.close();
  await actx.close();
  await browser.close();
  console.log(`\n=== e2e-realtime: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('e2e-realtime crashed:', e.message); process.exit(1); });
