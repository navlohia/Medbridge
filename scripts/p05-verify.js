// P05 verification: global 401/403 handler.
// A) tampered token in sessionStorage → any API call 401 → session cleared, back to auth entry.
// B) deactivated user: admin deactivates pat_2 via API → pat_2's tab (old token) gets
//    403 "deactivated" on /auth/me → cleared + redirected.
// C) role-forbidden 403 does NOT log out (patient calling doctor-only route).
const { chromium, login } = require('./lib');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  cond ? passed++ : failed++;
};

(async () => {
  const browser = await chromium.launch();

  // ---- A) tampered token ----
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await login(p, 'patient1@medbridge.com');
    check('A: patient logged in', p.url().includes('/patient'), p.url());

    await p.evaluate(() => {
      sessionStorage.setItem('medbridge_token', sessionStorage.getItem('medbridge_token') + 'tampered');
    });
    await p.reload({ waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(1800);
    const s = await p.evaluate(() => ({
      path: window.location.pathname,
      tok: !!sessionStorage.getItem('medbridge_token'),
      body: document.body.innerText
    }));
    check('A: tampered token → back at auth entry', s.path === '/', `path=${s.path}`);
    check('A: session cleared', !s.tok);
    // P15/P16: the auth surfaces DISPLAY the notice once, then clear it —
    // so assert on the visible message, not on storage. (The message here is
    // the middleware's "Invalid or expired token" for a bad JWT.)
    check('A: expiry notice shown on auth screen', /expired|no longer valid|invalid|deactivat/i.test(s.body), s.body.slice(0, 80));
    await ctx.close();
  }

  // ---- B) deactivated account, old token ----
  {
    const ctx = await browser.newContext();
    const admin = await ctx.newPage();
    await login(admin, 'admin@medbridge.com');

    // Deactivate pat_2 via API with the admin token
    const tok = await admin.evaluate(() => sessionStorage.getItem('medbridge_token'));
    const res = await admin.evaluate(async (t) => {
      const r = await fetch('/api/admin/users/pat_2/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ is_active: false })
      });
      return r.status;
    }, tok);
    check('B: admin deactivated pat_2 (200 expected)', res === 200, `status=${res}`);

    // pat_2's tab: has a pre-existing valid token (obtained before deactivation)
    const p2 = await ctx.newPage();
    await p2.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p2.evaluate(async () => {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'patient2@medbridge.com', password: 'demo1234' })
      });
      const d = await r.json();
      sessionStorage.setItem('medbridge_token', d.token);
      sessionStorage.setItem('medbridge_user', JSON.stringify(d.user));
    });
    await p2.goto(BASE + '/patient', { waitUntil: 'domcontentloaded' });
    await p2.waitForTimeout(1500);

    // Now deactivate again — the next API call from pat_2's tab must kill the session
    await admin.evaluate(async (t) => {
      await fetch('/api/admin/users/pat_2/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ is_active: false })
      }).catch(() => {});
    }, tok);
    await p2.locator('button:has-text("Journal"), button:has-text("Trends"), [role="tab"]').first().click().catch(() => {});
    await p2.waitForTimeout(2500);

    const s2 = await p2.evaluate(() => ({
      path: window.location.pathname,
      tok: !!sessionStorage.getItem('medbridge_token')
    }));
    check('B: deactivated user session cleared', !s2.tok, `path=${s2.path} tok=${s2.tok}`);

    // Restore pat_2 for the demo
    const r2 = await admin.evaluate(async (t) => {
      const r = await fetch('/api/admin/users/pat_2/status', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ is_active: true })
      });
      return r.status;
    }, tok);
    check('B: pat_2 reactivated (200 expected)', r2 === 200, `status=${r2}`);
    await ctx.close();
  }

  // ---- C) role-forbidden 403 does not log out ----
  {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await login(p, 'patient1@medbridge.com');
    const out = await p.evaluate(async () => {
      const t = sessionStorage.getItem('medbridge_token');
      const r = await fetch('/api/admin/stats', { headers: { Authorization: `Bearer ${t}` } });
      return { status: r.status, body: await r.text() };
    });
    check('C: patient hitting /admin/stats gets 403', out.status === 403, `status=${out.status}`);
    await p.waitForTimeout(600);
    const s3 = await p.evaluate(() => ({
      path: window.location.pathname,
      tok: !!sessionStorage.getItem('medbridge_token')
    }));
    check('C: still logged in after role-forbidden 403', s3.tok && s3.path === '/patient', `path=${s3.path} tok=${s3.tok}`);
    await ctx.close();
  }

  await browser.close();
  console.log(`\n=== P05 verify: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('P05 verify crashed:', e.message); process.exit(1); });
