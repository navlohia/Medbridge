const { chromium } = require('playwright');

const WIDTHS = [1440, 1366, 1280, 1024, 768];
const HEIGHT = 800;

async function checkOverflow(page, label) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    const overflow = doc.scrollWidth - doc.clientWidth;
    let widest = null;
    if (overflow > 1) {
      let maxW = 0;
      document.querySelectorAll('body *').forEach(el => {
        const w = el.getBoundingClientRect().width;
        if (w > maxW) { maxW = w; widest = el; }
      });
    }
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: doc.clientWidth,
      widest: widest ? `${widest.tagName}.${String(widest.className).slice(0, 80)}` : null,
      widestW: widest ? Math.round(widest.getBoundingClientRect().width) : null,
    };
  });
  const bad = r.scrollWidth > r.clientWidth + 1;
  console.log(
    `  ${bad ? 'OVERFLOW' : 'ok     '} ${label.padEnd(34)} ${String(r.clientWidth).padStart(4)}px viewport, scrollWidth ${r.scrollWidth}` +
    (bad ? `  widest: ${r.widest} (${r.widestW}px)` : '')
  );
  return !bad;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let allOk = true;

  for (const width of WIDTHS) {
    const page = await (await browser.newContext({ viewport: { width, height: HEIGHT } })).newPage();
    page.setDefaultTimeout(15000);
    await page.goto('http://localhost:5173/auth/doctor', { waitUntil: 'networkidle' });
    await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
    await page.goto('http://localhost:5173/auth/doctor', { waitUntil: 'networkidle' });
    await page.locator('input[type=email]').fill('doctor@medbridge.com');
    await page.locator('input[type=password]').fill('demo1234');
    await page.locator('button[type=submit]').click();
    await page.waitForSelector('text=Clinician Workspace', { timeout: 15000 });
    await page.waitForTimeout(1000);

    console.log(`Doctor dashboard @ ${width}px:`);
    allOk = (await checkOverflow(page, 'doctor workspace')) && allOk;

    // Sign out -> patient (sign-in lives at /auth/patient since P14)
    await page.click('button[aria-label="Sign Out"]');
    await page.waitForTimeout(800);
    await page.goto('http://localhost:5173/auth/patient', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.locator('input[type=email]').fill('patient1@medbridge.com');
    await page.locator('input[type=password]').fill('demo1234');
    await page.locator('button[type=submit]').click();
    await page.waitForTimeout(1400);
    await page.waitForSelector('text=Hello, Marcus', { timeout: 15000 });
    await page.waitForTimeout(1000);

    for (const tab of ['Overview', 'Trends', 'Symptoms', 'Appointments', 'History']) {
      await page.click(`button:has-text("${tab}")`);
      await page.waitForTimeout(500);
      allOk = (await checkOverflow(page, `patient / ${tab.toLowerCase()}`)) && allOk;
    }
    await page.context().close();
  }

  console.log(allOk ? '\nALL WIDTHS CLEAN — no horizontal overflow' : '\nOVERFLOW DETECTED — see rows above');
  await browser.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
