const { chromium } = require('playwright');

/**
 * Round 2 Block XV (Phases 230–235): viewport sweep extended to every new
 * surface — Admin (all tabs), booking modal + slot grid, Day View, lab-upload
 * modal. Same detection method as the existing overflow-check.js.
 */
const WIDTHS = [1440, 1280, 1024];
const HEIGHT = 800;
const BASE = 'http://localhost:5173';

async function checkOverflow(page, label) {
  const r = await page.evaluate(() => {
    const doc = document.documentElement;
    let widest = null, maxW = 0;
    if (doc.scrollWidth > doc.clientWidth + 1) {
      document.querySelectorAll('body *').forEach(el => {
        const w = el.getBoundingClientRect().width;
        if (w > maxW) { maxW = w; widest = el; }
      });
    }
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, widest: widest ? `${widest.tagName}.${String(widest.className).slice(0, 70)}` : null };
  });
  const bad = r.scrollWidth > r.clientWidth + 1;
  console.log(`  ${bad ? 'OVERFLOW' : 'ok     '} ${label.padEnd(40)} ${r.clientWidth}px / scroll ${r.scrollWidth}` + (bad ? `  widest: ${r.widest}` : ''));
  return !bad;
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let allOk = true;

  for (const width of WIDTHS) {
    console.log(`\n=== ${width}px ===`);
    const context = await browser.newContext({ viewport: { width, height: HEIGHT } });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);

    // ---- Admin (all tabs) ----
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => localStorage.clear());
    await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);
    await page.locator('button', { hasText: 'Admin' }).first().click();
    await page.locator('button[type=submit]').click();
    await page.waitForURL('**/admin', { timeout: 15000 });
    await page.waitForTimeout(1000);
    allOk = (await checkOverflow(page, 'admin overview')) && allOk;
    for (const tab of ['Doctors', 'Patients', 'Appointments']) {
      await page.locator('button', { hasText: tab }).first().click();
      await page.waitForTimeout(700);
      allOk = (await checkOverflow(page, `admin ${tab.toLowerCase()}`)) && allOk;
    }

    // Add-Patient modal (form density at small widths)
    await page.locator('button', { hasText: 'Patients' }).first().click();
    await page.waitForTimeout(500);
    await page.locator('button', { hasText: 'Add Patient' }).first().click();
    await page.waitForTimeout(500);
    allOk = (await checkOverflow(page, 'admin add-patient modal')) && allOk;
    await page.locator('button', { hasText: 'Cancel' }).click();
    await page.waitForTimeout(300);

    // ---- Doctor: Day View + propose-reschedule slot grid ----
    await page.locator('button[title*="Dr. Evelyn Reed"]').click();
    await page.waitForTimeout(1500);
    allOk = (await checkOverflow(page, 'doctor dashboard (with Day View)')) && allOk;

    // Lab upload modal on patient side
    await page.locator('button[title*="Marcus Vance"]').click();
    await page.waitForTimeout(1500);
    allOk = (await checkOverflow(page, 'patient overview')) && allOk;
    const uploadBtn = page.locator('button', { hasText: 'Upload report photo' }).first();
    if (await uploadBtn.count() > 0) {
      await uploadBtn.click();
      await page.waitForTimeout(600);
      allOk = (await checkOverflow(page, 'lab upload modal (dropzone)')) && allOk;
      await page.locator('button', { hasText: 'Cancel' }).click();
      await page.waitForTimeout(300);
    }

    // Booking modal + slot grid
    await page.locator('button', { hasText: 'Appointments' }).first().click();
    await page.waitForTimeout(500);
    await page.locator('button', { hasText: 'Book Appointment' }).first().click();
    await page.waitForTimeout(700);
    // pick doctor + today's date to force the grid to render
    const docCard = page.locator('button:has-text("Dr. Evelyn Reed")').first();
    if (await docCard.count() > 0) {
      await docCard.click();
      await page.waitForTimeout(300);
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      await page.getByRole('dialog').locator('input[type=date]').fill(today);
      await page.waitForTimeout(1000);
      allOk = (await checkOverflow(page, 'booking modal + slot grid')) && allOk;
    }
    await page.locator('button', { hasText: 'Cancel' }).click().catch(() => {});
    await page.context().close();
  }

  console.log(allOk ? '\nALL NEW SURFACES CLEAN at 1440/1280/1024' : '\nOVERFLOW DETECTED');
  await browser.close();
  process.exit(allOk ? 0 : 1);
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
