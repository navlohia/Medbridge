/**
 * Round 2 routing + admin smoke test (Phases 99–108, 109 partial).
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

  // Start logged out
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { localStorage.clear(); });
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);

  // 4 persona tiles on login
  const personaButtons = await page.locator('button', { hasText: 'Admin' }).count();
  check('login shows admin persona tile', personaButtons >= 1);

  // Login as admin via the persona + submit
  await page.locator('button', { hasText: 'Admin' }).first().click();
  await page.locator('button[type=submit]').click();
  await page.waitForURL('**/admin', { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(1200);
  check('admin login redirects to /admin', page.url().includes('/admin'), page.url());
  const adminHeading = await page.locator('h1', { hasText: 'Admin Console' }).count();
  check('admin console renders', adminHeading === 1);
  await page.waitForTimeout(800);
  const statCard = await page.locator('text=Lab reports to review').count();
  check('overview stat cards render', statCard >= 1);

  // Deep-linkable admin tab
  await page.goto(BASE + '/admin/doctors', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1000);
  const doctorsTable = await page.locator('h3', { hasText: 'Doctors' }).count();
  check('/admin/doctors deep link works', doctorsTable >= 1);
  const doctorRow = await page.locator('text=Dr. Evelyn Reed').first().count();
  check('seeded doctors listed', doctorRow === 1);

  // Admin cannot open doctor area → redirected back to /admin
  await page.goto(BASE + '/doctor', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  check('role mismatch redirects admin away from /doctor', page.url().includes('/admin'), page.url());

  // 404
  await page.goto(BASE + '/admin/nowhere', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  const notFound = await page.locator('text=Page not found').count();
  check('unknown route shows branded 404', notFound === 1);

  // Switch to doctor via quick switcher
  await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);
  await page.locator('button[title*="Dr. Evelyn Reed"]').click();
  await page.waitForTimeout(1200);
  check('demo switcher: doctor lands on /doctor', page.url().includes('/doctor'), page.url());
  const workspace = await page.locator('h1', { hasText: 'Clinician Workspace' }).count();
  check('doctor dashboard renders', workspace === 1);

  // Patient route
  await page.locator('button[title*="Marcus Vance"]').click();
  await page.waitForTimeout(1200);
  check('demo switcher: patient lands on /patient', page.url().includes('/patient'), page.url());

  // Unauthenticated → login redirect
  await page.evaluate(() => { localStorage.clear(); });
  await page.goto(BASE + '/patient', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const loginForm = await page.locator('button[type=submit]').count();
  check('unauthenticated /patient shows login', loginForm >= 1);

  await browser.close();
  console.log(`\n=== Round 2 routing smoke: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('Smoke crashed:', e.message); process.exit(1); });
