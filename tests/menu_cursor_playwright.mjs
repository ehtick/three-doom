// Real-WAD coverage for MainDef.lastOn across the browser's conditional rows.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const watchdog = setTimeout(() => {
  console.error('main-menu cursor Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);
const errors = [];

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (error) => errors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8095/';
  const url = new URL(baseUrl);
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer !== undefined && window.scene?.getObjectByName('level') !== undefined,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const {
      GameMode_t, KEY_DOWNARROW, KEY_ENTER, KEY_ESCAPE,
    } = await import('/src/doomdef.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');
    const video = await import('/src/v_video.js');
    loop.D_DoomRafLoop.stop();

    const key = (data1) => menu.M_Responder({ type: 0, data1, data2: 0, data3: 0 });
    function cursor(row, y = 64) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      menu.M_Drawer(ctx, 0, 0, 320, 200);
      const actual = ctx.getImageData(0, 0, 320, 200).data;

      const expectedCanvas = document.createElement('canvas');
      expectedCanvas.width = 320;
      expectedCanvas.height = 200;
      const expectedCtx = expectedCanvas.getContext('2d');
      video.V_DrawPatchAtCanvas(
        expectedCtx,
        video.V_DecodePatchToCanvas('M_SKULL1'),
        97 - 32,
        y - 5 + row * 16,
        1,
        1,
      );
      const expected = expectedCtx.getImageData(0, 0, 320, 200).data;
      let opaque = 0;
      let mismatch = 0;
      for (let py = y - 5 + row * 16; py < y - 5 + row * 16 + 19; py++) {
        for (let px = 97 - 32; px < 97; px++) {
          const i = (py * 320 + px) * 4;
          if (expected[i + 3] !== 0) opaque++;
          for (let c = 0; c < 4; c++) {
            if (actual[i + c] !== expected[i + c]) mismatch++;
          }
        }
      }
      return { opaque, mismatch };
    }

    function reset(mode, state) {
      menu.M_ClearMenus();
      menu.M_Init();
      doomstat.set_gamemode(mode);
      doomstat.set_gamestate(state);
      doomstat.set_demoplayback(false);
      menu.M_StartControlPanel();
    }

    // In a live Doom 1 level: Continue, New Game, Options, Load, Save,
    // Read This, Quit.
    reset(GameMode_t.registered, 0 /*GS_LEVEL*/);
    key(KEY_DOWNARROW);
    key(KEY_DOWNARROW);
    key(KEY_ESCAPE);
    menu.M_StartControlPanel();
    const optionsWithContinue = cursor(2);

    // Removing Continue changes Options from row 2 to row 1, but not the
    // remembered logical selection. Re-adding it moves the same item back.
    key(KEY_ESCAPE);
    doomstat.set_gamestate(3 /*GS_DEMOSCREEN*/);
    menu.M_StartControlPanel();
    const optionsWithoutContinue = cursor(1);
    key(KEY_ESCAPE);
    doomstat.set_gamestate(0 /*GS_LEVEL*/);
    menu.M_StartControlPanel();
    const optionsRestoredWithContinue = cursor(2);

    // Vanilla saves MainDef.lastOn before invoking a row. Cancelling Quit's
    // modal must therefore reopen on Quit rather than the first row.
    menu.M_Init();
    menu.M_ClearMenus();
    doomstat.set_gamemode(GameMode_t.registered);
    doomstat.set_gamestate(0 /*GS_LEVEL*/);
    menu.M_StartControlPanel();
    key(0x71 /*q*/);
    key(KEY_ENTER);
    const quitDismissed = key(0x6e /*n*/);
    menu.M_StartControlPanel();
    const quitAfterCancel = cursor(6);

    // A remembered browser-only Continue cannot mis-point after it disappears;
    // the stable source row New Game becomes the fallback.
    menu.M_Init();
    menu.M_ClearMenus();
    doomstat.set_gamemode(GameMode_t.registered);
    doomstat.set_gamestate(0 /*GS_LEVEL*/);
    menu.M_StartControlPanel();
    key(KEY_ESCAPE); // save Continue at row 0
    doomstat.set_gamestate(3 /*GS_DEMOSCREEN*/);
    menu.M_StartControlPanel();
    const removedContinueFallback = cursor(0);

    menu.M_ClearMenus();
    return {
      optionsWithContinue,
      optionsWithoutContinue,
      optionsRestoredWithContinue,
      quitDismissed,
      quitAfterCancel,
      removedContinueFallback,
    };
  });

  const failures = [];
  for (const [name, value] of Object.entries(result)) {
    if (name === 'quitDismissed') continue;
    if (value.opaque === 0 || value.mismatch !== 0) {
      failures.push(`${name}: ${JSON.stringify(value)}`);
    }
  }
  if (result.quitDismissed !== true) failures.push('Quit cancellation was not consumed');
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== null) await browser.close();
  clearTimeout(watchdog);
}
