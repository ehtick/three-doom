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
    const automapRects = [];
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
      if (stack.includes('/src/am_map')) {
        calls.push('automap');
        automapRects.push(args.slice(0, 4));
      }
      return originalFillRect.apply(this, args);
    };

    try {
      calls.length = 0;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const normalCalls = [...calls];

      automap.AM_Start();
      calls.length = 0;
      automapRects.length = 0;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const automapCalls = [...calls];
      const automapResult = {
        active: doomstat.automapactive,
        normalCalls,
        automapCalls,
        automapRect: automapRects.at(-1),
      };
      automap.AM_Stop();

      const menu = await import('/src/m_menu.js');
      const video = await import('/src/v_video.js');
      const pauseInfo = video.V_DecodePatchToCanvas('M_PAUSE');
      if (pauseInfo === null) throw new Error('M_PAUSE is missing from the IWAD');
      const pauseCanvas = pauseInfo.canvas;
      const uiCalls = [];
      proto.drawImage = function (...args) {
        const stack = new Error().stack ?? '';
        if (args[0] === pauseCanvas) {
          uiCalls.push({ kind: 'pause', x: args[1], y: args[2], w: args[3], h: args[4] });
        } else if (stack.includes('/src/m_menu')) {
          uiCalls.push({ kind: 'menu' });
        }
        return originalDrawImage.apply(this, args);
      };
      proto.fillRect = function (...args) {
        const stack = new Error().stack ?? '';
        if (stack.includes('/src/m_menu')) uiCalls.push({ kind: 'menu' });
        return originalFillRect.apply(this, args);
      };

      doomstat.set_viewwindowx(16);
      doomstat.set_viewwindowy(12);
      doomstat.set_scaledviewwidth(288);
      doomstat.set_paused(true);
      menu.M_StartControlPanel();
      uiCalls.length = 0;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const viewPauseCalls = structuredClone(uiCalls);

      automap.AM_Start();
      uiCalls.length = 0;
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const mapPauseCalls = structuredClone(uiCalls);

      return {
        ...automapResult,
        pausePatch: {
          width: pauseInfo.w,
          height: pauseInfo.h,
          leftoffset: pauseInfo.leftoffset,
          topoffset: pauseInfo.topoffset,
        },
        viewPauseCalls,
        mapPauseCalls,
      };
    } finally {
      automap.AM_Stop();
      doomstat.set_paused(false);
      doomstat.set_viewwindowx(0);
      doomstat.set_viewwindowy(0);
      doomstat.set_scaledviewwidth(0);
      const menu = await import('/src/m_menu.js');
      menu.M_ClearMenus();
      proto.drawImage = originalDrawImage;
      proto.fillRect = originalFillRect;
    }
  });

  const normalPsprite = result.normalCalls.indexOf('psprite');
  const map = result.automapCalls.indexOf('automap');
  const mapPsprite = result.automapCalls.indexOf('psprite');
  const hud = result.automapCalls.indexOf('hud');
  const status = result.automapCalls.indexOf('status');
  const firstPause = (calls) => calls.find((call) => call.kind === 'pause');
  const pauseBeforeMenu = (calls) => {
    const pause = calls.findIndex((call) => call.kind === 'pause');
    const menu = calls.findIndex((call, index) => index > pause && call.kind === 'menu');
    return pause >= 0 && menu > pause;
  };
  const viewPause = firstPause(result.viewPauseCalls);
  const mapPause = firstPause(result.mapPauseCalls);
  const closeEnough = (actual, expected) => Math.abs(actual - expected) < 0.001;
  const failures = [];
  if (!result.active) failures.push('automap was not active during the sampled frame');
  if (normalPsprite < 0) failures.push('control frame did not draw a weapon psprite');
  if (map < 0) failures.push('automap frame did not draw the automap');
  if (JSON.stringify(result.automapRect) !== JSON.stringify([0, 0, 960, 504])) {
    failures.push(`automap did not use the logical 320x168 window: ${JSON.stringify(result.automapRect)}`);
  }
  if (mapPsprite >= 0) failures.push('automap frame drew a weapon psprite');
  if (hud <= map) failures.push('HUD did not remain after the automap');
  if (status <= hud) failures.push('status bar did not remain after the HUD');
  if (JSON.stringify(result.pausePatch) !== JSON.stringify({ width: 69, height: 15, leftoffset: 0, topoffset: 0 })) {
    failures.push(`unexpected real M_PAUSE patch: ${JSON.stringify(result.pausePatch)}`);
  }
  if (viewPause === undefined || !closeEnough(viewPause.x, 378) ||
      !closeEnough(viewPause.y, 48) || !closeEnough(viewPause.w, 207) ||
      !closeEnough(viewPause.h, 45)) {
    failures.push(`view pause draw mismatch: ${JSON.stringify(viewPause)}`);
  }
  if (mapPause === undefined || !closeEnough(mapPause.x, 378) ||
      !closeEnough(mapPause.y, 12) || !closeEnough(mapPause.w, 207) ||
      !closeEnough(mapPause.h, 45)) {
    failures.push(`automap pause draw mismatch: ${JSON.stringify(mapPause)}`);
  }
  if (!pauseBeforeMenu(result.viewPauseCalls) || !pauseBeforeMenu(result.mapPauseCalls)) {
    failures.push('M_PAUSE was not drawn before the menu');
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== null) await browser.close();
  clearTimeout(watchdog);
}
