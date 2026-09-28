// P13–P16 verification: new entry flow end to end.
// 1) "/" shows the role picker with three cards; /auth/<role> shows sign-in (+register for patient/doctor).
// 2) Patient sign-up through the UI lands in the patient portal (registration returns a session).
// 3) Doctor sign-up with wrong code shows the 403 error; with the demo code lands in /doctor.
// 4) Wrong-portal login shows the generic error (no enumeration), correct login lands on the role home.
// 5) Expired-session notice from P05 is displayed by the picker.
const { chromium } = require('./lib');
const { login, BASE } = require('./lib');

let passed = 0, failed = 0;
const check = (name, cond, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ` — ${extra}` : ''}`);
  cond ? passed++ : failed++;
};

(async () => {
  const browser = await chromium.launch();

  // ---- 1) Role picker + auth pages ----
  {
    const p = await (await browser.newContext()).newPage();
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(700);
    check('1: role picker renders with three cards', await p.locator('text=Choose your portal').count() === 1);
    check('1: Patient card present', await p.locator('button:has-text("Patient")').count() >= 1);

    await p.locator('button:has-text("Administrator")').click();
    await p.waitForTimeout(600);
    check('1: admin card → /auth/admin', p.url().includes('/auth/admin'), p.url());
    check('1: admin shows no public sign-up link (bootstrap only)',
      await p.locator('text=Create account').count() === 0 &&
      await p.locator('text=first administrator').count() === 0);
    check('1: back-to-picker link present', await p.locator('text=Choose a different role').count() === 1);

    await p.locator('text=Choose a different role').click();
    await p.waitForTimeout(500);
    await p.locator('button:has-text("Patient")').first().click();
    await p.waitForTimeout(500);
    check('1: patient auth page offers Create account', await p.locator('button:has-text("Create account")').count() >= 1);
    await p.locator('button:has-text("Create account")').first().click();
    await p.waitForTimeout(400);
    check('1: patient register form has DOB field', await p.locator('#reg-dob').count() === 1);
    await ctxClose(p);
  }

  // ---- 2) Patient sign-up through the UI → lands in portal ----
  {
    const p = await (await browser.newContext()).newPage();
    const uq = Date.now();
    await p.goto(BASE + '/auth/patient', { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
    await p.goto(BASE + '/auth/patient', { waitUntil: 'domcontentloaded' });
    await p.locator('button:has-text("Create account")').first().click();
    await p.locator('#reg-name').fill(`UI Patient ${uq}`);
    await p.locator('#reg-email').fill(`ui.patient.${uq}@example.com`);
    await p.locator('#reg-dob').fill('1993-03-03');
    await p.locator('#reg-password').fill('password123');
    await p.locator('#reg-confirm').fill('password123');
    await p.locator('button[type=submit]:has-text("Create account")').click();
    await p.waitForTimeout(1600);
    check('2: patient registration lands in /patient', p.url().includes('/patient'), p.url());
    check('2: session stored', await p.evaluate(() => !!sessionStorage.getItem('medbridge_token')));
    await ctxClose(p);
  }

  // ---- 3) Doctor sign-up: wrong code error, good code lands in /doctor ----
  {
    const p = await (await browser.newContext()).newPage();
    const uq = Date.now();
    await p.goto(BASE + '/auth/doctor', { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
    await p.goto(BASE + '/auth/doctor', { waitUntil: 'domcontentloaded' });
    await p.locator('button:has-text("Create account")').first().click();
    await p.locator('#reg-name').fill(`UI Doctor ${uq}`);
    await p.locator('#reg-email').fill(`ui.doctor.${uq}@example.com`);
    await p.locator('#reg-spec').fill('Dermatology');
    await p.locator('#reg-code').fill('WRONG-CODE');
    await p.locator('#reg-password').fill('password123');
    await p.locator('#reg-confirm').fill('password123');
    await p.locator('button[type=submit]:has-text("Create account")').click();
    await p.waitForTimeout(1200);
    check('3: wrong access code shows 403 error', await p.locator('text=Invalid clinic access code').count() >= 1);

    await p.locator('#reg-code').fill('CLINIC-2026-DEMO');
    await p.locator('button[type=submit]:has-text("Create account")').click();
    await p.waitForTimeout(1600);
    check('3: valid code lands in /doctor', p.url().includes('/doctor'), p.url());
    await ctxClose(p);
  }

  // ---- 4) Role-aware login ----
  {
    const p = await (await browser.newContext()).newPage();
    // wrong portal: patient creds on the doctor auth page
    await p.goto(BASE + '/auth/doctor', { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
    await p.goto(BASE + '/auth/doctor', { waitUntil: 'domcontentloaded' });
    await p.locator('input[type=email]').fill('patient1@medbridge.com');
    await p.locator('input[type=password]').fill('demo1234');
    await p.locator('button[type=submit]').click();
    await p.waitForTimeout(1200);
    check('4: wrong-portal login shows generic error', await p.locator('text=Invalid email or password').count() >= 1);

    await login(p, 'doctor@medbridge.com');
    check('4: correct login lands on /doctor', p.url().includes('/doctor'), p.url());
    await ctxClose(p);
  }

  // ---- 5) Picker shows the P05 notice ----
  {
    const p = await (await browser.newContext()).newPage();
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.evaluate(() => sessionStorage.setItem('medbridge_auth_notice', 'Your session has expired. Please sign in again.'));
    await p.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(700);
    check('5: picker displays session-expiry notice', await p.locator('text=Your session has expired').count() >= 1);
    await ctxClose(p);
  }

  await browser.close();
  console.log(`\n=== P13–P16 verify: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) process.exit(1);
})().catch(e => { console.error('P13–P16 verify crashed:', e.message); process.exit(1); });

async function ctxClose(p) {
  await p.context().close();
}
