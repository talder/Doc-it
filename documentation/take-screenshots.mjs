import puppeteer from 'puppeteer';
import { setTimeout } from 'timers/promises';

const BASE = 'http://localhost:3000';
const OUT = new URL('./screenshots/', import.meta.url).pathname;

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1400,900'],
  defaultViewport: { width: 1400, height: 900 },
});

async function shot(page, name, url, waitMs = 2500) {
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 20000 });
    await setTimeout(waitMs);
    await page.screenshot({ path: `${OUT}${name}.png`, fullPage: false });
    console.log(`✓ ${name}`);
  } catch (e) {
    console.error(`✗ ${name}: ${e.message}`);
  }
}

const page = await browser.newPage();

// Login first
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle2' });
await setTimeout(1000);

// Screenshot login
await page.screenshot({ path: `${OUT}01-login.png` });
console.log('✓ 01-login');

// Fill login form - try finding the form fields
try {
  await page.type('input[type="text"], input[name="username"], input[placeholder*="sername" i]', 'tim', { delay: 50 });
  await page.type('input[type="password"]', 'timtim', { delay: 50 });
  await page.keyboard.press('Enter');
  await setTimeout(3000);
  console.log('✓ logged in');
} catch(e) {
  console.error('login failed:', e.message);
}

// Main app
await shot(page, '02-main-app', BASE, 3000);

// Try to click first doc in sidebar
try {
  await page.click('.sidebar-doc-item, [data-doc], .doc-link');
  await setTimeout(2000);
  await page.screenshot({ path: `${OUT}03-document-view.png` });
  console.log('✓ 03-document-view');
} catch {
  await page.screenshot({ path: `${OUT}03-document-view.png` });
  console.log('✓ 03-document-view (fallback)');
}

// Admin panel
await shot(page, '04-admin-users', `${BASE}/admin?tab=users`, 2000);
await shot(page, '05-admin-spaces', `${BASE}/admin?tab=spaces`, 1500);
await shot(page, '06-admin-service-keys', `${BASE}/admin?tab=service-keys`, 1500);
await shot(page, '07-admin-settings', `${BASE}/admin?tab=settings`, 1500);
await shot(page, '08-admin-audit', `${BASE}/admin?tab=audit`, 2500);

// Profile
await shot(page, '09-profile', `${BASE}/profile`, 2000);

await browser.close();
console.log('\nAll screenshots done → documentation/screenshots/');
