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

  const loginAs = async (email) => {
    // P14: sign-in lives at /auth/<role>; "/" is the role picker
    const role = email.startsWith('admin') ? 'admin' : email.startsWith('patient') ? 'patient' : 'doctor';
    await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); }).catch(() => {});
    await page.goto(`${BASE}/auth/${role}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill('demo1234');
    await page.locator('button[type=submit]').click();
    await page.waitForTimeout(1400);
  };

  // Start logged out (P08: sessions live in sessionStorage now)
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });

  // No persona tiles on login anymore (removed in P08)
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const personaButtons = await page.locator('text=Quick Demo Personas').count();
  check('login shows no persona tiles (removed P08)', personaButtons === 0);

  // Login as admin through the form
  await loginAs('admin@medbridge.com');
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

  // Sign out → login as doctor through the form
  await loginAs('doctor@medbridge.com');
  check('doctor login lands on /doctor', page.url().includes('/doctor'), page.url());
  const workspace = await page.locator('h1', { hasText: 'Clinician Workspace' }).count();
  check('doctor dashboard renders', workspace === 1);

  // Patient route
  await loginAs('patient1@medbridge.com');
  check('patient login lands on /patient', page.url().includes('/patient'), page.url());

  // Unauthenticated → role picker (new entry flow since P14)
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.goto(BASE + '/patient', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const roleCards = await page.locator('text=Choose your portal').count();
  check('unauthenticated /patient shows role picker', roleCards >= 1);

  await browser.close();
  console.log(`\n=== Round 2 routing smoke: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('Smoke crashed:', e.message); process.exit(1); });
