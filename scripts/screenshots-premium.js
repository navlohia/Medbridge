const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  page.setDefaultTimeout(15000);

  const shot = (name) => page.screenshot({ path: path.join(SCREENSHOTS_DIR, name) });

  // ===== Doctor workspace =====
  await page.goto('http://localhost:5173', { waitUntil: 'networkidle' });
  await page.click('button:has-text("Dr. Reed")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Clinician Workspace', { timeout: 15000 });
  await page.waitForTimeout(1200);
  await shot('P51_doctor_workspace_hero.png');
  console.log('doctor hero done');

  // Visit logger modal
  await page.click('button:has-text("Document New Visit")');
  await page.waitForSelector('text=Log New Clinical Visit', { timeout: 5000 });
  await page.waitForTimeout(700);
  await shot('P51_visit_logger_comboboxes.png');
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(400);

  // ===== Patient dashboard =====
  await page.click('button[title="Sign Out"]');
  await page.waitForSelector('text=Sign In to EMR');
  await page.click('button:has-text("Marcus Vance")');
  await page.click('button:has-text("Sign In to EMR")');
  await page.waitForSelector('text=Hello, Marcus', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await shot('P51_patient_overview.png');
  console.log('patient overview done');

  // Symptom logger modal
  await page.click('button:has-text("Log how you feel")');
  await page.waitForSelector('text=How are you feeling today?', { timeout: 5000 });
  await page.waitForTimeout(500);
  await shot('P51_symptom_logger.png');
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(400);

  // Vital logger modal
  await page.click('div:has(> button > span:text("Vitals")) > button:has-text("Vitals")');
  await page.waitForSelector('text=Record Vital Reading', { timeout: 5000 });
  await page.waitForTimeout(500);
  await shot('P51_vital_logger_weight.png');
  await page.click('button:has-text("Cancel")');
  await page.waitForTimeout(400);
  console.log('modals done');

  // Trends tab (Weight default)
  await page.click('button:has-text("Trends")');
  await page.waitForTimeout(900);
  await shot('P51_patient_trends_weight.png');
  console.log('trends done');

  await browser.close();
  console.log('ALL P51 SCREENSHOTS CAPTURED');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
