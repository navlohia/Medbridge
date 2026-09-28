// P06 verification: per-tab session isolation under active use.
// 1) Two tabs, BOTH doctor: independent tokens; logout in one leaves the other working.
// 2) Doctor tab + patient tab: patient deep-linking to /doctor is bounced by the role guard;
//    both tabs survive simultaneous reloads with their own roles intact.
const { chromium, login } = require('./lib');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  cond ? passed++ : failed++;
};

(async () => {
  const browser = await chromium.launch();

  // ---- 1) Two same-role (doctor) tabs are independent sessions ----
  {
    const ctx = await browser.newContext();
    const t1 = await ctx.newPage();
    const t2 = await ctx.newPage();
    await login(t1, 'doctor@medbridge.com');
    await login(t2, 'dr.okafor@medbridge.com');

    const tok1 = await t1.evaluate(() => sessionStorage.getItem('medbridge_token'));
    const tok2 = await t2.evaluate(() => sessionStorage.getItem('medbridge_token'));
    check('1: two doctor tabs hold DIFFERENT tokens', !!tok1 && !!tok2 && tok1 !== tok2);

    // Simultaneous active API use from both tabs
    const [r1, r2] = await Promise.all([
      t1.evaluate(async (t) => (await fetch('/api/patients', { headers: { Authorization: `Bearer ${t}` } })).status, tok1),
      t2.evaluate(async (t) => (await fetch('/api/patients', { headers: { Authorization: `Bearer ${t}` } })).status, tok2)
    ]);
    check('1: both tabs call doctor APIs simultaneously (200/200)', r1 === 200 && r2 === 200, `r1=${r1} r2=${r2}`);

    // Logout in tab 1 → tab 2 keeps working
    await t1.locator('button[aria-label="Sign Out"]').click();
    await t1.waitForTimeout(800);
    const tok1After = await t1.evaluate(() => sessionStorage.getItem('medbridge_token'));
    const r2After = await t2.evaluate(async (t) => (await fetch('/api/patients', { headers: { Authorization: `Bearer ${t}` } })).status, tok2);
    check('1: tab 1 logged out', !tok1After);
    check('1: tab 2 still authorized after tab 1 logout', r2After === 200, `status=${r2After}`);
    await ctx.close();
  }

  // ---- 2) Doctor + patient tabs: role guard + simultaneous reloads ----
  {
    const ctx = await browser.newContext();
    const d = await ctx.newPage();
    const p = await ctx.newPage();
    await login(d, 'doctor@medbridge.com');
    await login(p, 'patient1@medbridge.com');
    check('2: doctor on /doctor, patient on /patient', d.url().includes('/doctor') && p.url().includes('/patient'));

    // Patient tries to deep-link into the doctor area → bounced to own home
    await p.goto(BASE + '/doctor', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1200);
    check('2: patient deep-link to /doctor bounced to /patient', p.url().includes('/patient'), p.url());

    // Simultaneous reloads — both keep their own session via /auth/me
    await Promise.all([d.reload({ waitUntil: 'domcontentloaded' }), p.reload({ waitUntil: 'domcontentloaded' })]);
    await Promise.all([d.waitForTimeout(1600), p.waitForTimeout(1600)]);
    const roles = await Promise.all([
      d.evaluate(() => { const u = sessionStorage.getItem('medbridge_user'); return u ? JSON.parse(u).role : null; }),
      p.evaluate(() => { const u = sessionStorage.getItem('medbridge_user'); return u ? JSON.parse(u).role : null; })
    ]);
    check('2: after simultaneous reloads roles intact', roles[0] === 'doctor' && roles[1] === 'patient', roles.join('/'));
    check('2: still on their own homes', d.url().includes('/doctor') && p.url().includes('/patient'));
    await ctx.close();
  }

  await browser.close();
  console.log(`\n=== P06 verify: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('P06 verify crashed:', e.message); process.exit(1); });
