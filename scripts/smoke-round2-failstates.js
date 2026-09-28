/**
 * Round 2 Phase 229: force-fail sweep — stop the backend, walk every new
 * surface, confirm each degrades to a visible error/empty state (no blanks).
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

  // Log in as admin BEFORE killing the server (token cached in sessionStorage — P04)
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.goto(BASE + '/auth/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.locator('input[type=email]').fill('admin@medbridge.com');
  await page.locator('input[type=password]').fill('demo1234');
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/admin', { timeout: 8000 });
  await page.waitForTimeout(600);

  // *** KILL THE BACKEND from inside the test (cmd.exe natively: findstr + taskkill) ***
  const { execSync } = require('child_process');
  try {
    const out = execSync('netstat -ano | findstr ":5000" | findstr LISTENING').toString();
    const pid = out.trim().split(/\r?\n/)[0].trim().split(/\s+/).pop();
    execSync(`taskkill /F /PID ${pid}`);
    console.log(`backend (pid ${pid}) killed for fail-state sweep`);
  } catch (e) {
    console.log('backend already down (ok)');
  }
  await page.waitForTimeout(600);

  // Admin overview → ErrorState with retry. Full reload so the stats fetch
  // itself fails (fresh mount against the dead server).
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  const adminErr = await page.locator('text=Could not load overview').count();
  const adminRetry = await page.locator('text=Retry').count();
  check('admin overview degrades to error state', adminErr >= 1, `err=${adminErr}`);
  check('admin overview offers retry', adminRetry >= 1);

  // Admin doctors tab → error state
  await page.goto(BASE + '/admin/doctors', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const docErr = await page.locator('text=Could not load doctors').count();
  check('admin doctors degrades to error state', docErr >= 1);

  // Admin appointments tab → error state
  await page.goto(BASE + '/admin/appointments', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const apptErr = await page.locator('text=Could not load appointments').count();
  check('admin appointments degrades to error state', apptErr >= 1);

  // Doctor dashboard (cached token) → error states visible
  await page.locator('button[title*="Dr. Evelyn Reed"]').click().catch(() => {});
  await page.goto(BASE + '/doctor', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const docPageErr = await page.locator('text=Could not load').count() +
    await page.locator('text=Could not load patients').count();
  const blankCheck = await page.evaluate(() => document.body.innerText.trim().length);
  check('doctor dashboard shows error text (not blank)', docPageErr >= 1 && blankCheck > 100, `err=${docPageErr} chars=${blankCheck}`);

  // Patient dashboard → error state. Fresh login as a patient in a new tab
  // (server is dead, so every dashboard fetch fails identically regardless of
  // token validity); the original admin tab stays untouched.
  {
    const patPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await patPage.goto(BASE + '/auth/patient', { waitUntil: 'domcontentloaded' });
    await patPage.waitForTimeout(500);
    await patPage.locator('input[type=email]').fill('patient1@medbridge.com');
    await patPage.locator('input[type=password]').fill('demo1234').catch(() => {});
    await patPage.locator('button[type=submit]').click().catch(() => {});
    await patPage.waitForTimeout(1500);
  await patPage.goto(BASE + '/patient', { waitUntil: 'domcontentloaded' });
  await patPage.waitForTimeout(2500);
  const patErr = await patPage.locator('text=Could not load your health portal').count();
  const patChars = await patPage.evaluate(() => document.body.innerText.trim().length);
  check('patient dashboard shows error state (not blank)', patErr >= 1 && patChars > 100, `err=${patErr} chars=${patChars}`);

  // Screenshot evidence
  await patPage.screenshot({ path: 'screenshots/R2_failstate_patient.png' });
  await patPage.close();

  await browser.close();
  console.log(`\n=== Phase 229 force-fail sweep: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('Fail-state sweep crashed:', e.message); process.exit(1); });
