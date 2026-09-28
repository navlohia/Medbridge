/**
 * Round 2 Block XI UI test (Phases 155–158).
 * Requires: backend :5000 freshly seeded, vite dev :5173.
 */
const { chromium } = require('playwright');

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
}

function localDate(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const BASE = 'http://localhost:5173';

  // find a weekday ≥3 days out (seed availability: Mon–Sat)
  let target;
  for (let off = 3; off < 10; off++) {
    const d = new Date(); d.setDate(d.getDate() + off);
    const dow = d.getDay();
    if (dow >= 1 && dow <= 6) { target = localDate(off); break; }
  }
  console.log(`booking target date: ${target}`);

  // ---- Patient books a slot ----
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.locator('button', { hasText: 'Patient 1' }).first().click();
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/patient', { timeout: 8000 });
  await page.waitForTimeout(1000);

  // Appointments tab → Book
  await page.locator('button', { hasText: 'Appointments' }).first().click();
  await page.waitForTimeout(600);
  await page.locator('button', { hasText: 'Book Appointment' }).first().click();
  await page.waitForTimeout(700);

  // Step 1: pick Dr. Reed (first card)
  await page.locator('button:has-text("Dr. Evelyn Reed")').first().click();
  await page.waitForTimeout(400);
  // Step 2: date
  await page.locator('input[type=date]').fill(target);
  await page.waitForTimeout(1200); // slot grid loads

  // Phase 140: grid rendered with open slots
  const slotButtons = page.locator('button:has-text("AM"), button:has-text("PM")');
  const gridCount = await slotButtons.count();
  check('slot grid renders open times', gridCount >= 8, `count=${gridCount}`);

  // Pick an open slot (10:00 AM)
  await page.locator('button:has-text("10:00 AM")').first().click();
  await page.waitForTimeout(300);
  // Submit
  await page.locator('button', { hasText: 'Request Appointment' }).click();
  await page.waitForTimeout(1200);
  const requested = await page.locator('text=Appointment requested').first().count();
  check('booking with real time succeeds', requested >= 1);

  // Phase 155: doctor sees it pending with correct time
  await page.evaluate(() => { localStorage.setItem('medbridge_user', localStorage.getItem('medbridge_user')); });
  await page.locator('button[title*="Dr. Evelyn Reed"]').click();
  await page.waitForTimeout(1400);
  const reqCard = await page.locator('text=Marcus Vance').first().count();
  const reqTime = await page.locator('text=10:00 AM').first().count();
  check('doctor sees pending request with correct time', reqCard >= 1 && reqTime >= 1);

  // Phase 156 setup: doctor proposes reschedule via new action
  await page.locator('button', { hasText: 'Propose Reschedule' }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('dialog').locator('input[type=date]').fill(target);
  await page.waitForTimeout(1200);
  // pick a different open slot (11:00 AM)
  await page.locator('button:has-text("11:00 AM")').first().click();
  await page.waitForTimeout(300);
  await page.locator('textarea').fill('Clinic schedule shifted — would this work?');
  await page.locator('button', { hasText: 'Propose New Time' }).click();
  await page.waitForTimeout(1400);
  const proposeToast = await page.locator('text=Reschedule proposed').first().count();
  check('doctor proposes reschedule successfully', proposeToast >= 1);

  // Patient accepts (Phase 156) — re-open the Appointments tab after remount
  await page.locator('button[title*="Marcus Vance"]').click();
  await page.waitForTimeout(1400);
  await page.locator('button', { hasText: 'Appointments' }).first().click();
  await page.waitForTimeout(800);
  const proposalCard = await page.locator('text=proposed a new time').first().count();
  check('patient sees reschedule proposal card', proposalCard >= 1);
  const seesBoth = await page.locator('text=Clinic schedule shifted').first().count();
  check('patient sees doctor note', seesBoth >= 1);

  await page.locator('button', { hasText: 'Accept' }).first().click();
  await page.waitForTimeout(1400);
  const accepted = await page.locator('text=Reschedule accepted').first().count();
  check('accept flow completes with toast', accepted >= 1);
  // The card should now show confirmed at the new time
  const newTimeShown = await page.locator('text=11:00 AM').first().count();
  check('appointment now shows new time', newTimeShown >= 1);

  await browser.close();
  console.log(`\n=== Block XI booking/reschedule UI: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('Booking UI test crashed:', e.message); process.exit(1); });
