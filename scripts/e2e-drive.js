const { chromium } = require('playwright');
const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

let passed = 0;
let failed = 0;
const failures = [];
function check(name, cond, detail = '') {
  if (cond) {
    passed++;
    console.log('  PASS ' + name);
  } else {
    failed++;
    failures.push(name + (detail ? ' :: ' + detail : ''));
    console.log('  FAIL ' + name + (detail ? ' :: ' + detail : ''));
  }
}

async function runE2E() {
  console.log('--- 1. Reseeding database for a clean baseline ---');
  execSync('node src/db/seed.js', { cwd: path.join(__dirname, '..', 'backend'), stdio: 'ignore' });

  console.log('--- 2. Launching browser (1366x800 laptop viewport) ---');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 800 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);

  const shot = (name) => page.screenshot({ path: path.join(SCREENSHOTS_DIR, name) });

  // ============ STAGE A: LOGIN ============
  console.log('--- Stage A: Login page ---');
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await shot('01_login_page.png');
  check('login page renders', await page.isVisible('text=Sign In to EMR'));

  console.log('--- Stage B: Doctor visit logging with conflict ---');
  await page.click('button:has-text("Dr. Reed")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Clinician Workspace', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot('02_doctor_dashboard.png');
  check('doctor dashboard renders', true);

  // Appointment Requests panel visible
  check('requests panel visible', await page.isVisible('text=Appointment Requests'));

  // Select Marcus via searchable combobox (click toggle to open, then search)
  await page.click('button[aria-label="Toggle patient list"]');
  await page.fill('input[placeholder="Search patients by name or email..."]', 'Marcus');
  await page.waitForTimeout(400);
  await page.click('button:has-text("Marcus Vance")');
  await page.waitForTimeout(1000);

  // Open visit logger
  await page.click('button:has-text("Document New Visit")');
  await page.waitForSelector('text=Log New Clinical Visit', { timeout: 5000 });
  await page.waitForTimeout(800);

  // Choose diagnosis: Diabetes
  const diagSelect = await page.$('select[required]');
  await page.evaluate((sel) => {
    const opt = Array.from(sel.options).find(o => o.text.includes('Diabetes'));
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  }, diagSelect);
  await page.waitForTimeout(400);

  // Search + pick conflicting medicine (Antidiabetic)
  const medSearch = 'input[placeholder*="Search all"]';
  await page.fill(medSearch, 'metformin');
  await page.waitForTimeout(500);
  await page.click('div.max-h-80 button:has-text("Metformin")');
  await page.waitForTimeout(600);
  check('conflict banner appears', await page.isVisible('text=Potential Pharmacological Conflict Detected'));
  await shot('03_conflict_warning_modal.png');

  // Verify the browse catalog spans the alphabet (regression: only A medicines)
  await page.click('text=Medications'); // blur the search field first
  await page.waitForTimeout(250);
  await page.click(medSearch); // fresh focus re-opens the browse dropdown
  await page.waitForTimeout(600);
  const zebraVisible = await page.isVisible('text=Zencast-SP Tablet');
  check('non-A medicines browsable (Z… visible)', zebraVisible);
  await page.click('text=Medications');
  await page.waitForTimeout(300);

  // Notes + save
  await page.fill('textarea', 'E2E regression visit: conflicting antidiabetic co-prescription documented intentionally.');
  await page.click('button:has-text("Save Full Clinical Visit")');
  await page.waitForTimeout(2000);
  await shot('04_visit_saved_timeline.png');
  // Modal closed + timeline visible again = visit saved
  const modalGone = !(await page.isVisible('text=Log New Clinical Visit'));
  check('visit saved (modal closed, timeline visible)', modalGone);

  console.log('--- Stage C: Patient multi-symptom logging ---');
  await page.click('button[title="Sign Out"]');
  await page.waitForSelector('text=Sign In to EMR');
  await page.click('button:has-text("Marcus Vance")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Hello, Marcus');
  await page.waitForTimeout(1500);
  await shot('05_patient_dashboard_overview.png');

  // Reminders bar should render
  const reminderVisible = await page.isVisible('text=pending lab test');
  check('pending-lab reminder visible', reminderVisible);

  // Open symptom logger (hero CTA)
  await page.click('button:has-text("Log how you feel")');
  await page.waitForSelector('text=How are you feeling today?');
  await page.waitForTimeout(500);

  // Pick two symptoms
  await page.click('div.max-h-44 button:has-text("Fever")');
  await page.click('div.max-h-44 button:has-text("Fatigue / Low Energy")');
  await page.waitForTimeout(300);

  // Fever temperature field must be visible now (new label)
  const tempVisible = await page.isVisible('text=Fever detected');
  check('inline fever temp field appears', tempVisible);
  if (tempVisible) {
    await page.fill('input[type="number"][min="90"]', '100.2');
  }

  // Set severity for Fever = 4: scope to the chip card (p-3 rounded-card)
  const feverCard = page
    .locator('div.p-3.rounded-card', { hasText: 'Fever' })
    .first();
  await feverCard.locator('button[title="Severe"]').click();
  await page.waitForTimeout(200);

  // Duration = 2-3 days
  await page.click('button:has-text("2-3 days"):not(:has-text("A week"))');
  // Notes
  await page.fill('textarea', 'Fever worse at night; tired during the day.');
  await shot('06_symptom_logger_multi.png');

  await page.click('button:has-text("Save Entry")');
  await page.waitForTimeout(1800);
  check('symptom entry saved toast', await page.isVisible('text=Logged 2 symptoms'));

  // Check grouped card in journal (new tab label: "Symptoms")
  await page.click('button:has-text("Symptoms")');
  await page.waitForTimeout(1200);
  const groupedCard = await page.isVisible('text=2 symptoms');
  check('grouped entry card shows in journal', groupedCard);
  await shot('07_symptom_journal_grouped.png');

  console.log('--- Stage D: Vital logging + trend graph ---');
  await page.click('button:has-text("Trends")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Add Reading")');
  await page.waitForSelector('text=Record Vital Reading');
  await page.waitForTimeout(600);
  // New icon-chip picker: Weight is default; select Blood Sugar chip (value 96, in range → auto-completes pending FBS lab order)
  await page.click('button:has-text("Blood Sugar")');
  await page.waitForTimeout(300);
  await page.fill('input[type="number"]', '96');
  await page.click('button:has-text("Save Reading")');
  await page.waitForTimeout(1800);
  check('vital logged toast (with lab auto-complete)', await page.isVisible('text=Matching lab order marked complete'));
  // Switch trend chart to Blood Sugar to see the reference band
  const metricSelect = await page.$('select');
  await page.evaluate((sel) => {
    const opt = Array.from(sel.options).find(o => o.text.includes('Blood Sugar'));
    if (opt) { sel.value = opt.value; sel.dispatchEvent(new Event('change', { bubbles: true })); }
  }, metricSelect);
  await page.waitForTimeout(1000);
  await shot('08_trend_chart_updated.png');
  check('trend chart rendered with band', await page.isVisible('text=Target Normal Band'));

  console.log('--- Stage E: Patient books appointment (Round 2: 3-step slot flow) ---');
  await page.click('button:has-text("Appointments")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Book Appointment")');
  await page.waitForSelector('text=Choose your doctor');
  await page.waitForTimeout(600);
  // Step 1: pick Dr. Reed
  await page.click('button:has-text("Dr. Evelyn Reed")');
  await page.waitForTimeout(400);
  // Step 2: date = +7 days (shifted to the next non-Sunday, since slots are Mon-Sat)
  const future = new Date();
  future.setDate(future.getDate() + 7);
  if (future.getDay() === 0) future.setDate(future.getDate() + 1);
  const y = future.getFullYear();
  const m = String(future.getMonth() + 1).padStart(2, '0');
  const dd = String(future.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${dd}`;
  await page.getByRole('dialog').locator('input[type="date"]').fill(dateStr);
  await page.waitForTimeout(1200); // slot grid loads
  // Step 3: open slots carry title="Book 9:00 AM"; taken ones are disabled with
  // title="Already booked" — so title^="Book" targets exactly the open slots
  // (and can never match a doctor card, unlike a text search for 'AM').
  const openSlot = page.getByRole('dialog').locator('button[title^="Book"]').first();
  if (await openSlot.count() === 0) throw new Error('no open slot found for booking');
  await openSlot.click();
  await page.waitForTimeout(300);
  await page.fill('textarea', 'Requesting a glycemic review.');
  await shot('09_booking_modal.png');
  await page.click('button:has-text("Request Appointment")');
  check('booking requested toast', await page.waitForSelector('text=Appointment requested', { timeout: 8000 }).then(() => true).catch(() => false));
  await page.waitForTimeout(1200);
  // Status badge Requested appears in list
  await page.waitForTimeout(800);
  check('Requested badge in list', await page.isVisible('span:text("Requested")'));
  await shot('10_appointment_requested.png');

  console.log('--- Stage F: Doctor confirms request ---');
  await page.click('button[title="Sign Out"]');
  await page.waitForSelector('text=Sign In to EMR');
  await page.click('button:has-text("Dr. Reed")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Clinician Workspace');
  await page.waitForTimeout(1500);
  const reqVisible = await page.isVisible('text=Prefers');
  check('doctor sees pending request', reqVisible);
  await shot('11_doctor_requests_panel.png');
  await page.click('button:has-text("Confirm")');
  await page.waitForTimeout(1500);
  check('confirm toast', await page.isVisible('text=Appointment request confirmed'));

  console.log('--- Stage G: Patient sees Confirmed + lab order completed ---');
  await page.click('button[title="Sign Out"]');
  await page.waitForSelector('text=Sign In to EMR');
  await page.click('button:has-text("Marcus Vance")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Hello, Marcus');
  await page.waitForTimeout(1500);
  check('appointment banner (within 7 days)',
    await page.isVisible('text=Appointment in 7 days') || await page.isVisible('text=Your appointment is'));
  // pending labs card should no longer include FBS (auto-completed in Stage D)
  const pendingLabsText = await page.textContent('body');
  check('FBS no longer pending', !pendingLabsText.includes('Fasting Blood SugarScheduled') && !pendingLabsText.includes('Fasting Blood Sugar Due'), '');
  await shot('12_patient_final_overview.png');

  console.log('--- Stage H: Doctor adds guidance on a symptom journal entry ---');
  await page.click('button[title="Sign Out"]');
  await page.waitForSelector('text=Sign In to EMR');
  await page.click('button:has-text("Dr. Reed")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Clinician Workspace', { timeout: 15000 });
  await page.waitForTimeout(1500);
  // Marcus is the default selected patient; open the Symptom Journal tab
  await page.click('button:has-text("Symptom Journal")');
  await page.waitForTimeout(700);
  check('unreviewed entry flagged (Awaiting reply)', await page.isVisible('text=Awaiting reply'));
  // Open composer on the newest entry (first composer link) and post guidance
  await page.click('text=Reply to this entry');
  await page.waitForTimeout(300);
  await page.fill('textarea', 'E2E guidance: hydrate, rest, and keep monitoring the fever. Call the clinic if it crosses 102F.');
  await shot('13_doctor_guidance_composer.png');
  await page.click('button:has-text("Add Guidance")');
  await page.waitForTimeout(1200);
  check('guidance note saved (1 note chip)', await page.isVisible('text=1 note'));

  console.log('--- Stage I: Patient sees the doctor guidance in their journal ---');
  await page.click('button[title="Sign Out"]');
  await page.waitForSelector('text=Sign In to EMR');
  await page.click('button:has-text("Marcus Vance")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Hello, Marcus', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.click('button:has-text("Symptoms")');
  await page.waitForTimeout(700);
  check('seeded guidance visible to patient', await page.isVisible("text=Your doctor's guidance"));
  check('fresh guidance from Stage H visible', await page.isVisible('text=E2E guidance: hydrate, rest'));
  await shot('14_patient_doctor_guidance.png');

  // ============ STAGE J: ADMIN PORTAL (Phase 236) ============
  console.log('--- Stage J: Admin portal — create doctor, patient, toggle status ---');
  await page.click('button[title="Sign Out"]');
  await page.waitForSelector('text=Sign In to EMR');
  await page.click('button:has-text("Admin")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Admin Console', { timeout: 15000 });
  await page.waitForTimeout(1000);
  check('admin console renders', await page.isVisible('text=Admin Console'));
  const stampJ = Date.now().toString().slice(-6);

  // Create a doctor via UI
  await page.click('button:has-text("Doctors")');
  await page.waitForTimeout(600);
  await page.click('button:has-text("Add Doctor")');
  await page.waitForTimeout(400);
  await page.fill('input[placeholder*="Jordan Blake"]', `Dr. E2E Round2 ${stampJ}`);
  await page.fill('input[placeholder*="blake@medbridge"]', `dr.e2e.r2.${stampJ}@medbridge.com`);
  await page.fill('input[placeholder*="Cardiology"]', 'Round 2 Verification');
  await page.click('button:has-text("Create Doctor")');
  await page.waitForTimeout(900);
  const pwTextJ = await page.locator('span.font-mono').nth(1).textContent().catch(() => '');
  check('admin creates doctor + temp password shown', /-/.test(pwTextJ || ''));
  await page.click('button:has-text("Done")');
  await page.waitForTimeout(600);

  // Create a patient via UI
  await page.click('button:has-text("Patients")');
  await page.waitForTimeout(600);
  await page.click('button:has-text("Add Patient")');
  await page.waitForTimeout(400);
  await page.fill('input[placeholder*="Jamie Rivera"]', `E2E Patient ${stampJ}`);
  await page.fill('input[placeholder*="jamie@example"]', `e2e.patient.${stampJ}@medbridge.com`);
  await page.fill('input[type=date]', '1991-03-03');
  await page.click('button:has-text("Create Patient")');
  await page.waitForTimeout(900);
  await page.click('button:has-text("Done")');
  await page.waitForTimeout(600);
  check('admin creates patient (appears in table)', await page.isVisible(`text=E2E Patient ${stampJ}`));

  // Deactivate + reactivate the test patient
  await page.click('button:has-text("Deactivate")');
  await page.waitForTimeout(400);
  check('deactivate dialog states history untouched', await page.isVisible('text=No visits, prescriptions, or journal entries are deleted'));
  await page.click('button:has-text("Deactivate").nth(1) >> nth=1').catch(() => {});
  // confirm inside dialog (the danger button)
  await page.locator('.bg-surface-card button:has-text("Deactivate")').last().click();
  await page.waitForTimeout(900);
  check('account deactivated (Inactive badge present)', await page.isVisible('text=Inactive'));
  // reactivate
  await page.locator('button:has-text("Reactivate")').first().click();
  await page.waitForTimeout(400);
  await page.locator('.bg-surface-card button:has-text("Reactivate")').last().click();
  await page.waitForTimeout(900);
  check('account reactivated', await page.isVisible('text=Active'));
  await shot('14_admin_console.png');

  // ============ STAGE K: SLOT BOOKING UNAVAILABILITY (Phase 237) ============
  console.log('--- Stage K: new patient books a slot; slot shows unavailable ---');
  await page.click('button[title="Sign Out"]');
  await page.waitForSelector('text=Sign In to EMR');
  // log in as the newly created patient using their temp password is not
  // possible (password shown once in admin session) — use Marcus to book, then
  // verify the slot becomes unavailable to a second booking attempt in the UI.
  await page.click('button:has-text("Marcus Vance")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Hello, Marcus', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await page.click('button:has-text("Appointments")');
  await page.waitForTimeout(600);
  await page.click('button:has-text("Book Appointment")');
  await page.waitForSelector('text=Choose your doctor');
  await page.click('button:has-text("Dr. Samuel Okafor")');
  await page.waitForTimeout(400);
  const dK = new Date(); dK.setDate(dK.getDate() + 9); if (dK.getDay() === 0) dK.setDate(dK.getDate() + 1);
  const dsK = `${dK.getFullYear()}-${String(dK.getMonth() + 1).padStart(2, '0')}-${String(dK.getDate()).padStart(2, '0')}`;
  await page.getByRole('dialog').locator('input[type=date]').fill(dsK);
  await page.waitForTimeout(1200);
  const firstOpenK = page.getByRole('dialog').locator('button[title^="Book"]').first();
  const slotLabelK = await firstOpenK.textContent();
  await firstOpenK.click();
  await page.waitForTimeout(300);
  await page.getByRole('dialog').locator('button', { hasText: 'Request Appointment' }).click();
  check('slot booking submitted', await page.waitForSelector('text=Appointment requested', { timeout: 8000 }).then(() => true).catch(() => false));
  // Second attempt at the same slot: reopen modal, same doctor/date — the slot
  // Marcus just took must now render disabled with a "Booked" label.
  await page.waitForTimeout(1000);
  await page.click('button:has-text("Book Appointment")');
  await page.waitForSelector('text=Choose your doctor');
  await page.click('button:has-text("Dr. Samuel Okafor")');
  await page.waitForTimeout(400);
  await page.getByRole('dialog').locator('input[type=date]').fill(dsK);
  await page.waitForTimeout(1200);
  const takenBtn = page.getByRole('dialog').locator(`button[title="Already booked"]`, { hasText: slotLabelK.trim().split('\n')[0].slice(0, 4) });
  const takenVisible = await page.getByRole('dialog').locator('button[title="Already booked"]').count();
  check('booked slot now shows unavailable in grid', takenVisible >= 1, `taken=${takenVisible} label=${slotLabelK}`);
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(400);
  await shot('15_slot_unavailable.png');

  // ============ STAGE L: RESCHEDULE PROPOSE + ACCEPT (Phase 238) ============
  console.log('--- Stage L: doctor proposes reschedule, patient accepts ---');
  await page.click('button[title="Sign Out"]');
  await page.waitForSelector('text=Sign In to EMR');
  await page.click('button:has-text("Dr. Reed")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Clinician Workspace', { timeout: 15000 });
  await page.waitForTimeout(1500);
  // The appointment Marcus booked with Dr. Okafor is on doc_2's panel — propose
  // on the seeded requested row for doc_1 (apt_pat2_req, Elena) instead: it is
  // always present after a reseed and always 'requested'.
  const proposeBtn = page.locator('button:has-text("Propose Reschedule")').first();
  if (await proposeBtn.isVisible().catch(() => false)) {
    await proposeBtn.click();
    await page.waitForTimeout(500);
    const dL = new Date(); dL.setDate(dL.getDate() + 5); if (dL.getDay() === 0) dL.setDate(dL.getDate() + 1);
    const dsL = `${dL.getFullYear()}-${String(dL.getMonth() + 1).padStart(2, '0')}-${String(dL.getDate()).padStart(2, '0')}`;
    await page.getByRole('dialog').locator('input[type=date]').fill(dsL);
    await page.waitForTimeout(1200);
    await page.getByRole('dialog').locator('button[title^="Book"]').first().click();
    await page.waitForTimeout(300);
    await page.fill('textarea', 'E2E reschedule: moving you to a quieter slot.');
    await page.click('button:has-text("Propose New Time")');
    check('doctor proposes reschedule (toast)', await page.waitForSelector('text=Reschedule proposed', { timeout: 8000 }).then(() => true).catch(() => false));
    // Patient accepts (1366px hides the navbar switcher — use the login persona)
    await page.click('button[title="Sign Out"]');
    await page.waitForSelector('text=Sign In to EMR');
    await page.click('button:has-text("Patient 2")');
    await page.click('button:has-text("Sign In to EMR")');
    await page.waitForSelector('text=Hello, Elena', { timeout: 15000 });
    await page.waitForTimeout(1200);
    await page.click('button:has-text("Appointments")');
    await page.waitForTimeout(600);
    check('patient sees proposal with both times', await page.isVisible('text=proposed a new time'));
    await shot('16_reschedule_proposed.png');
    await page.click('button:has-text("Accept")');
    await page.waitForTimeout(1500);
    check('patient accepts reschedule (toast)', await page.isVisible('text=Reschedule accepted'));
    await shot('17_reschedule_accepted.png');
  } else {
    check('reschedule propose button available', false, 'no requested appointment found');
  }

  // ============ STAGE M: LAB REPORT UPLOAD (Phase 240) ============
  console.log('--- Stage M: lab report upload -> confirm -> trends + order complete ---');
  await page.click('button[title="Sign Out"]');
  await page.waitForSelector('text=Sign In to EMR');
  await page.click('button:has-text("Marcus Vance")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Hello, Marcus', { timeout: 15000 });
  await page.waitForTimeout(1200);
  const uploadM = page.locator('button', { hasText: 'Upload report photo' }).first();
  if (await uploadM.isVisible().catch(() => false)) {
    await uploadM.click();
    await page.waitForTimeout(500);
    // generate a report-like PNG in-page
    const dataUrlM = await page.evaluate(() => new Promise((resolve) => {
      const c = document.createElement('canvas');
      c.width = 500; c.height = 300;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 500, 300);
      ctx.fillStyle = '#111'; ctx.font = '16px Arial';
      ctx.fillText('LAB REPORT - Total Cholesterol: 182 mg/dL', 20, 60);
      ctx.fillText('WBC Count: 6.4 x10^9/L', 20, 90);
      c.toBlob(b => { const r = new FileReader(); r.onload = () => resolve(r.result); r.readAsDataURL(b); }, 'image/png');
    }));
    const fsM = require('fs');
    const tmpM = path.join(SCREENSHOTS_DIR, '_e2e_report.png');
    fsM.writeFileSync(tmpM, Buffer.from(dataUrlM.split(',')[1], 'base64'));
    await page.setInputFiles('input[type=file]', tmpM);
    await page.waitForTimeout(400);
    await page.click('button:has-text("Read my report")');
    await page.waitForTimeout(2500);
    // manual-entry path (no Gemini key): add the row by hand
    await page.click('button:has-text("Add a row the scan missed")');
    await page.waitForTimeout(300);
    await page.locator('input[placeholder="Test name"]').last().fill('Total Cholesterol');
    await page.locator('input[placeholder="Value"]').last().fill('182');
    await page.locator('input[placeholder="Unit"]').last().fill('mg/dL');
    await page.click('button:has-text("Save to my record")');
    await page.waitForTimeout(1800);
    check('lab report confirmed (rows saved)', await page.isVisible('text=Saved 1 reading'));
    await page.click('button:has-text("Done")');
    await page.waitForTimeout(1200);
    // Trends shows the value
    await page.click('button:has-text("Trends")');
    await page.waitForTimeout(1200);
    const cholVisible = await page.locator('tr:has-text("Total Cholesterol")').count() >= 1 || await page.locator('text=182').count() >= 1;
    check('confirmed value visible on Trends', cholVisible);
    await shot('18_lab_trends.png');
  } else {
    check('lab upload entry visible', false, 'no pending labs card (seed state changed)');
  }

  await browser.close();

  console.log('\n====================================================');
  console.log(`E2E RESULT: ${passed} passed, ${failed} failed`);
  if (failures.length) {
    console.log('FAILURES:');
    failures.forEach(f => console.log('  - ' + f));
  }
  console.log('====================================================');
  process.exit(failed > 0 ? 1 : 0);
}

runE2E().catch(err => {
  console.error('E2E driving error:', err);
  process.exit(1);
});
