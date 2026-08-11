// Headless integration checks for the D_Display overlay order. Start a static
// server at the repository root, then run with:
//   NODE_PATH=/path/to/node_modules node tests/display_ui_playwright.mjs

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const watchdog = setTimeout(() => {
  console.error('display UI Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);
const pageErrors = [];

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8095/';
  const url = new URL(baseUrl);
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer !== undefined &&
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const automap = await import('/src/am_map.js');
    const calls = [];
    const proto = CanvasRenderingContext2D.prototype;
    const originalDrawImage = proto.drawImage;
    const originalFillRect = proto.fillRect;
    proto.drawImage = function (...args) {
      const stack = new Error().stack ?? '';
      if (stack.includes('/src/r_psprite')) calls.push('psprite');
      else if (stack.includes('/src/hu_stuff')) calls.push('hud');
      else if (stack.includes('/src/st_stuff')) calls.push('status');
      return originalDrawImage.apply(this, args);
    };
    proto.fillRect = function (...args) {
      const stack = new Error().stack ?? '';
      if (stack.includes('/src/am_map')) calls.push('automap');
      return originalFillRect.apply(this, args);
    };

    try {
      calls.length = 0;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const normalCalls = [...calls];

      automap.AM_Start();
      calls.length = 0;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const automapCalls = [...calls];
      return {
        active: doomstat.automapactive,
        normalCalls,
        automapCalls,
      };
    } finally {
      automap.AM_Stop();
      proto.drawImage = originalDrawImage;
      proto.fillRect = originalFillRect;
    }
  });

  const normalPsprite = result.normalCalls.indexOf('psprite');
  const map = result.automapCalls.indexOf('automap');
  const mapPsprite = result.automapCalls.indexOf('psprite');
  const hud = result.automapCalls.indexOf('hud');
  const status = result.automapCalls.indexOf('status');
  const failures = [];
  if (!result.active) failures.push('automap was not active during the sampled frame');
  if (normalPsprite < 0) failures.push('control frame did not draw a weapon psprite');
  if (map < 0) failures.push('automap frame did not draw the automap');
  if (mapPsprite >= 0) failures.push('automap frame drew a weapon psprite');
  if (hud <= map) failures.push('HUD did not remain after the automap');
  if (status <= hud) failures.push('status bar did not remain after the HUD');
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== null) await browser.close();
  clearTimeout(watchdog);
}
