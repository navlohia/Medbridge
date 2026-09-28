// Shared helpers for Playwright scripts (P14+: "/" is a role picker; sign-in
// lives at /auth/<role>. Sessions are per-tab sessionStorage since P04).
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://localhost:5173';

function roleForEmail(email) {
  if (email.startsWith('admin')) return 'admin';
  if (email.startsWith('patient')) return 'patient';
  return 'doctor';
}

/** Clear this tab's session, open the role's auth page, sign in via the form. */
async function login(page, email, password = 'demo1234') {
  const role = roleForEmail(email);
  await page.goto(BASE + '/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => { sessionStorage.clear(); localStorage.clear(); }).catch(() => {});
  await page.goto(`${BASE}/auth/${role}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);
  await page.locator('input[type=email]').fill(email);
  await page.locator('input[type=password]').fill(password);
  await page.locator('button[type=submit]').click();
  await page.waitForTimeout(1400);
}

/** Click the navbar Sign Out button and wait for the signed-out state. */
async function logout(page) {
  await page.locator('button[aria-label="Sign Out"], button[title="Sign Out"]').first().click();
  await page.waitForTimeout(800);
}

module.exports = { chromium, BASE, login, logout, roleForEmail };
