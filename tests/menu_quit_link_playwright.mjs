// Trusted keyboard/click quit confirmations must synchronously open the
// requested opener-isolated tab before the original page shuts down.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const QUIT_LINK = 'https://x.com/mrdoob/status/2054075364432031991';
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser;
try {
  browser = await chromium.launch(launchOptions);

  async function runConfirmation(mode) {
    const context = await browser.newContext({ viewport: { width: 640, height: 400 } });
    await context.route(QUIT_LINK, (route) => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>quit destination</title>',
    }));
    const errors = [];
    const page = await context.newPage();
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL(process.env.DOOM_URL ?? 'http://127.0.0.1:8092/');
    url.searchParams.set('-map', 'E1M1');
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      window.renderer !== undefined &&
      window.scene?.getObjectByName('level') !== undefined,
    { timeout: 30000 });

    // A generic confirmation remains click-protected; only Quit opts into a
    // click response.
    await page.evaluate(async () => {
      const menu = await import('/src/m_menu.js');
      window.__ordinaryPromptCalls = 0;
      menu.M_StartMessage('ordinary prompt', () => { window.__ordinaryPromptCalls++; }, true);
    });
    await page.mouse.click(320, 200);
    const ordinaryPrompt = await page.evaluate(async () => ({
      calls: window.__ordinaryPromptCalls,
      active: (await import('/src/doomstat.js')).menuactive,
    }));
    await page.keyboard.press('Escape');

    // Declining Quit must neither open a tab nor shut down the original page.
    await page.keyboard.press('F10');
    await page.keyboard.press('n');
    await page.waitForTimeout(20);
    const declined = {
      pages: context.pages().length,
      canvasPresent: await page.evaluate(() => document.querySelector('#container canvas') !== null),
    };

    await page.keyboard.press('F10');
    const popupPromise = context.waitForEvent('page', { timeout: 5000 });
    if (mode === 'keyboard') await page.keyboard.press('y');
    else await page.mouse.click(320, 200);
    const popup = await popupPromise;
    await popup.waitForLoadState('domcontentloaded');
    await page.waitForFunction(
      () => document.querySelector('#container canvas') === null,
      null,
      { timeout: 10000 },
    );

    // A repeated physical confirmation after teardown cannot create another
    // tab. The in-module guard also covers callback reentry before teardown.
    if (mode === 'keyboard') await page.keyboard.press('y');
    else await page.mouse.click(320, 200);
    await page.waitForTimeout(20);

    const result = {
      mode,
      ordinaryPrompt,
      declined,
      popupUrl: popup.url(),
      openerIsNull: await popup.evaluate(() => window.opener === null),
      pages: context.pages().length,
      errors,
    };
    await context.close();
    return result;
  }

  const results = [
    await runConfirmation('keyboard'),
    await runConfirmation('click'),
  ];
  const failures = [];
  for (const result of results) {
    if (result.ordinaryPrompt.calls !== 0 || result.ordinaryPrompt.active !== true) {
      failures.push(`${result.mode} ordinary prompt: ${JSON.stringify(result.ordinaryPrompt)}`);
    }
    if (result.declined.pages !== 1 || result.declined.canvasPresent !== true) {
      failures.push(`${result.mode} decline: ${JSON.stringify(result.declined)}`);
    }
    if (result.popupUrl !== QUIT_LINK || result.openerIsNull !== true || result.pages !== 2) {
      failures.push(`${result.mode} popup: ${JSON.stringify(result)}`);
    }
    if (result.errors.length !== 0) failures.push(`${result.mode} errors: ${result.errors.join('; ')}`);
  }
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(results));
} finally {
  if (browser !== undefined) await browser.close();
}
