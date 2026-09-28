// P04 verification: per-tab sessionStorage sessions + startup /auth/me validation.
// Context A = doctor login in tab 1; context B = patient login in tab 2 (same browser).
// Proves: (1) login lands on role home, (2) tab A session stays doctor while tab B
// is patient (no shared-state bleed), (3) token physically lives in sessionStorage.
const { chromium, login } = require('./lib');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  cond ? passed++ : failed++;
};

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const pageA = await ctx.newPage(); // tab 1 — doctor
  const pageB = await ctx.newPage(); // tab 2 — patient

  // Tab A: doctor login
  await login(pageA, 'doctor@medbridge.com');
  check('tab A doctor login lands on /doctor', pageA.url().includes('/doctor'), pageA.url());

  // Tab B: same context, patient login — must NOT change who tab A is
  await login(pageB, 'patient1@medbridge.com');
  check('tab B patient login lands on /patient', pageB.url().includes('/patient'), pageB.url());

  // Tab A must still be doctor (per-tab session)
  await pageA.waitForTimeout(500);
  const aRole = await pageA.evaluate(() => {
    const u = sessionStorage.getItem('medbridge_user');
    return u ? JSON.parse(u).role : null;
  });
  const bRole = await pageB.evaluate(() => {
    const u = sessionStorage.getItem('medbridge_user');
    return u ? JSON.parse(u).role : null;
  });
  check('tab A session role is still doctor', aRole === 'doctor', `role=${aRole}`);
  check('tab B session role is patient', bRole === 'patient', `role=${bRole}`);

  // Token lives in sessionStorage, NOT localStorage
  const storage = await pageA.evaluate(() => ({
    s: !!sessionStorage.getItem('medbridge_token'),
    l: !!localStorage.getItem('medbridge_token')
  }));
  check('token in sessionStorage', storage.s === true);
  check('token NOT in localStorage', storage.l === false);

  // Reload tab A: /auth/me validation restores the session without logout
  await pageA.reload({ waitUntil: 'domcontentloaded' });
  await pageA.waitForTimeout(1500);
  check('tab A survives reload (session validated via /auth/me)', pageA.url().includes('/doctor'), pageA.url());

  // Log out tab A; tab B must be unaffected
  await pageA.locator('button[aria-label="Sign Out"]').click().catch(() => {});
  await pageA.waitForTimeout(800);
  const aAfterLogout = await pageA.evaluate(() => sessionStorage.getItem('medbridge_token'));
  check('tab A logged out (token cleared)', !aAfterLogout);
  await pageB.waitForTimeout(400);
  const bStillIn = await pageB.evaluate(() => sessionStorage.getItem('medbridge_token'));
  check('tab B session unaffected by tab A logout', !!bStillIn);

  await browser.close();
  console.log(`\n=== P04 verify: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('P04 verify crashed:', e.message); process.exit(1); });
