const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..', 'screenshots');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
const BASE = 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const shot = (n) => page.screenshot({ path: path.join(DIR, n) });

  await page.goto(BASE + '/auth/patient', { waitUntil: 'networkidle' });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); });
  await page.goto(BASE + '/auth/patient', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(700);
  await shot('R2_01_login.png');

  const loginAs = async (email) => {
    const role = email.startsWith('admin') ? 'admin' : email.startsWith('patient') ? 'patient' : 'doctor';
    await page.goto(`${BASE}/auth/${role}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(400);
    await page.locator('input[type=email]').fill(email);
    await page.locator('input[type=password]').fill('demo1234');
    await page.locator('button[type=submit]').click();
    await page.waitForTimeout(1400);
  };

  // ---- Admin ----
  await loginAs('admin@medbridge.com');
  await page.waitForURL('**/admin', { timeout: 10000 });
  await page.waitForTimeout(1200);
  await shot('R2_02_admin_overview.png');
  await page.locator('button', { hasText: 'Doctors' }).first().click();
  await page.waitForTimeout(700);
  await shot('R2_03_admin_doctors.png');
  await page.locator('button', { hasText: 'Patients' }).first().click();
  await page.waitForTimeout(700);
  await shot('R2_04_admin_patients.png');
  await page.locator('button', { hasText: 'Appointments' }).first().click();
  await page.waitForTimeout(700);
  await shot('R2_05_admin_appointments.png');

  // ---- Doctor ----
  await page.locator('button[aria-label="Sign Out"]').click();
  await page.waitForTimeout(800);
  await loginAs('doctor@medbridge.com');
  await page.waitForTimeout(1800);
  await shot('R2_06_doctor_dashboard.png');
  await page.locator('button:has-text("Symptom Journal")').click();
  await page.waitForTimeout(800);
  await shot('R2_07_doctor_journal.png');
  await page.locator('button:has-text("Appointments")').nth(1).click().catch(() => {});
  await page.waitForTimeout(700);
  await shot('R2_08_doctor_appointments_tab.png');

  // ---- Patient ----
  await page.locator('button[aria-label="Sign Out"]').click();
  await page.waitForTimeout(800);
  await loginAs('patient1@medbridge.com');
  await page.waitForTimeout(1800);
  await shot('R2_09_patient_overview.png');
  await page.locator('button', { hasText: 'Appointments' }).first().click();
  await page.waitForTimeout(700);
  await shot('R2_10_patient_appointments.png');
  await page.locator('button', { hasText: 'Book Appointment' }).first().click();
  await page.waitForTimeout(700);
  await shot('R2_11_booking_step1.png');
  await page.locator('button:has-text("Dr. Evelyn Reed")').first().click();
  await page.waitForTimeout(300);
  const d = new Date(); d.setDate(d.getDate() + 7); if (d.getDay() === 0) d.setDate(d.getDate() + 1);
  const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await page.getByRole('dialog').locator('input[type=date]').fill(ds);
  await page.waitForTimeout(1200);
  await shot('R2_12_booking_slot_grid.png');
  await page.locator('button', { hasText: 'Cancel' }).click();
  await page.waitForTimeout(400);
  await page.locator('button', { hasText: 'Symptoms' }).first().click();
  await page.waitForTimeout(700);
  await shot('R2_13_patient_journal.png');
  await page.locator('button', { hasText: 'Trends' }).first().click();
  await page.waitForTimeout(1200);
  await shot('R2_14_patient_trends.png');

  await browser.close();
  console.log('Round 2 screenshot set saved to screenshots/R2_*.png');
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
