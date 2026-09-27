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
  const medSearch = 'input[placeholder*="Search medicine"]';
  await page.fill(medSearch, 'metformin');
  await page.waitForTimeout(500);
  await page.click('div.max-h-52 button:has-text("Metformin")');
  await page.waitForTimeout(600);
  check('conflict banner appears', await page.isVisible('text=Potential Pharmacological Conflict Detected'));
  await shot('03_conflict_warning_modal.png');

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
  // FBS is default; value 96 (in range)
  await page.fill('input[type="number"]', '96');
  await page.click('button:has-text("Save Reading")');
  await page.waitForTimeout(1800);
  check('vital logged toast (with lab auto-complete)', await page.isVisible('text=Matching lab order marked complete'));
  await page.waitForTimeout(1000);
  await shot('08_trend_chart_updated.png');
  check('trend chart rendered with band', await page.isVisible('text=Target Normal Band'));

  console.log('--- Stage E: Patient books appointment ---');
  await page.click('button:has-text("Appointments")');
  await page.waitForTimeout(800);
  await page.click('button:has-text("Book Appointment")');
  await page.waitForSelector('text=Request a time with your clinician');
  await page.waitForTimeout(600);
  // Doctor preselected; set date = +7 days
  const future = new Date();
  future.setDate(future.getDate() + 7);
  const dateStr = future.toISOString().split('T')[0];
  await page.fill('input[type="date"]', dateStr);
  await page.fill('textarea', 'Requesting a glycemic review.');
  await shot('09_booking_modal.png');
  await page.click('button:has-text("Request Appointment")');
  await page.waitForTimeout(1800);
  check('booking requested toast', await page.isVisible('text=Appointment requested'));
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
