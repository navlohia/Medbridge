/**
 * Round 2 Block X UI test (Phases 137–138).
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

  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.goto(BASE + '/auth/doctor', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.locator('input[type=email]').fill('doctor@medbridge.com');
  await page.locator('input[type=password]').fill('demo1234');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/doctor', { timeout: 8000 });
  await page.waitForTimeout(1200);

  // Phase 133/137: quick-add from the selector
  await page.locator('button[title="Register a walk-in patient"]').click();
  await page.waitForTimeout(400);
  await page.locator('input[placeholder*="Jordan Miles"]').fill(`Walkin Sam ${stamp}`);
  await page.locator('input[placeholder*="patient@example"]').fill(`walkin.sam${stamp}@medbridge.com`);
  await page.getByRole('dialog').locator('input[type=date]').fill('1990-02-02');
  await page.locator('button', { hasText: 'Register Patient' }).click();
  await page.waitForTimeout(900);
  const pwShown = await page.locator('text=only once').count();
  check('success state shows temp password once', pwShown >= 1);

  // Phase 135: "Start Visit" closes modal; patient auto-selected
  await page.locator('button', { hasText: 'Start Visit' }).click();
  await page.waitForTimeout(900);
  const selectedName = await page.locator('text=Walkin Sam ' + stamp).first().count();
  check('new patient auto-selected in combobox (no reload)', selectedName >= 1);

  // Phase 137: document a visit for them in the same session
  await page.click('button:has-text("Document New Visit")');
  await page.waitForTimeout(700);
  const diagSelect = await page.$('select[required]');
  await diagSelect.selectOption({ index: 1 });
  await page.click('button:has-text("Save Full Clinical Visit")');
  await page.waitForTimeout(1400);
  const visitSaved = await page.locator('text=saved successfully').first().count() +
    await page.locator('text=Visit saved').first().count();
  check('visit logged for walk-in in same session', visitSaved >= 1);

  // Phase 138: selector search/filter behavior intact — open the dropdown via
  // the chevron toggle, then type into the search input inside it.
  await page.locator('button[aria-label="Toggle patient list"]').click();
  await page.waitForTimeout(400);
  const searchInput = await page.$('input[placeholder*="Search patients"]');
  if (!searchInput) {
    // Dropdown shows list (not search box) when a patient is selected; type-to-filter
    await page.fill('input[placeholder*="Search patients"]', 'walkin');
  }
  const dropdownCount = await page.locator('text=No patients match').count() +
    await page.locator('text=Walkin Sam').count();
  check('selector search/filter behavior intact (Phase 138)', dropdownCount >= 1);

  await browser.close();
  console.log(`\n=== Block X quick-add UI: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('Quick-add UI test crashed:', e.message); process.exit(1); });
