/**
 * Round 2 Block IX admin-UI test (Phases 127–130).
 * Requires: backend :5000 seeded, vite dev :5173.
 */
const { chromium } = require('playwright');

let passed = 0, failed = 0;
function check(name, cond, detail = '') {
  if (cond) { passed++; console.log(`PASS  ${name}`); }
  else { failed++; console.log(`FAIL  ${name} ${detail}`); }
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const BASE = 'http://localhost:5173';
  const stamp = Date.now().toString().slice(-6);

  // Login as admin
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear());
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.locator('button', { hasText: 'Admin' }).first().click();
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/admin', { timeout: 8000 });
  await page.waitForTimeout(800);

  // ---- Phase 127: create a doctor through the UI ----
  await page.goto(BASE + '/admin/doctors', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.locator('button', { hasText: 'Add Doctor' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder*="Jordan Blake"]').fill(`Dr. UI Test ${stamp}`);
  await page.locator('input[placeholder*="blake@medbridge"]').fill(`dr.uitest${stamp}@medbridge.com`);
  await page.locator('input[placeholder*="Cardiology"]').fill('Test Specialty');
  await page.locator('button', { hasText: 'Create Doctor' }).click();
  await page.waitForTimeout(800);
  const pwVisible = await page.locator('text=shown').first().count();
  const pwText = await page.locator('span.font-mono').nth(1).textContent().catch(() => '');
  check('add-doctor success shows temp password once + copy', pwVisible >= 1 && /-/.test(pwText || ''), pwText);

  await page.locator('button', { hasText: 'Done' }).click();
  await page.waitForTimeout(600);
  const newRow = await page.locator(`text=Dr. UI Test ${stamp}`).count();
  check('created doctor appears in table immediately', newRow >= 1);

  // Created doctor is immediately bookable: check via public doctors API from patient side
  const docListed = await page.evaluate(async (email) => {
    const token = localStorage.getItem('medbridge_token');
    const res = await fetch('/api/doctors', { headers: { Authorization: `Bearer ${token}` } });
    const list = await res.json();
    return list.some(d => d.email === email);
  }, `dr.uitest${stamp}@medbridge.com`);
  check('created doctor immediately bookable (public /doctors)', docListed);

  // ---- Phase 128: create a patient through the UI ----
  await page.goto(BASE + '/admin/patients', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  await page.locator('button', { hasText: 'Add Patient' }).first().click();
  await page.waitForTimeout(300);
  await page.locator('input[placeholder*="Jamie Rivera"]').fill(`UI Patient ${stamp}`);
  await page.locator('input[placeholder*="jamie@example"]').fill(`ui.patient${stamp}@medbridge.com`);
  await page.locator('input[type=date]').fill('1992-06-15');
  await page.locator('button', { hasText: 'Create Patient' }).click();
  await page.waitForTimeout(800);
  await page.locator('button', { hasText: 'Done' }).click();
  await page.waitForTimeout(600);
  const newPatRow = await page.locator(`text=UI Patient ${stamp}`).count();
  check('created patient appears in table immediately', newPatRow >= 1);

  // Patient is immediately visible in doctor's PatientSelector data
  const patListed = await page.evaluate(async (email) => {
    const token = localStorage.getItem('medbridge_token');
    const res = await fetch('/api/patients', { headers: { Authorization: `Bearer ${token}` } });
    const list = await res.json();
    return list.some(p => p.email === email);
  }, `ui.patient${stamp}@medbridge.com`);
  check('created patient immediately in doctor selector data', patListed);

  // ---- Phase 130: search/filter both tables ----
  await page.locator('input[placeholder*="Search name or email"]').fill(`ui.patient${stamp}`);
  await page.waitForTimeout(400);
  const filteredRows = await page.locator('tbody tr').count();
  check('patient search filters to 1 row', filteredRows === 1, `rows=${filteredRows}`);
  const noResults = await page.locator('input[placeholder*="Search name or email"]').fill('zzznotfoundzzz').then(() => page.waitForTimeout(400)).then(() => page.locator('text=No results for').count());
  check('no-results empty state shows', noResults >= 1);
  await page.locator('input[placeholder*="Search name or email"]').fill('');
  await page.waitForTimeout(300);

  // ---- Phase 129 partial + 123: deactivate confirmation copy is explicit ----
  await page.goto(BASE + '/admin/doctors', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const deactivateButtons = page.locator('button', { hasText: 'Deactivate' });
  await deactivateButtons.first().click();
  await page.waitForTimeout(400);
  const copyOk = await page.locator('text=No visits, prescriptions, or journal entries are deleted').count();
  check('deactivate dialog states history untouched', copyOk === 1);
  await page.locator('button', { hasText: 'Cancel' }).click();

  await browser.close();
  console.log(`\n=== Block IX admin UI: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('Admin UI test crashed:', e.message); process.exit(1); });
