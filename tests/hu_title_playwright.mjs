// Real-IWAD Canvas verification for HU automap titles. Start a static server at
// the repository root, then run with:
//   NODE_PATH=/path/to/node_modules node tests/hu_title_playwright.mjs

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const watchdog = setTimeout(() => {
  console.error('HU title Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8093/';
  const url = new URL('tests/hu_title_headless.html', baseUrl);
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__headlessResult !== undefined, { timeout: 30000 });
  const result = await page.evaluate(() => window.__headlessResult);
  if (pageErrors.length > 0) throw new Error(`page errors: ${pageErrors.join('; ')}`);
  if (result?.ok !== true) throw new Error(result?.error ?? `unexpected result: ${JSON.stringify(result)}`);
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(watchdog);
  if (browser !== null) await browser.close();
}
