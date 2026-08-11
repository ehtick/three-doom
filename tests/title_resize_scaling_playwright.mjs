// Headless pixel regression for the title-page Canvas immediately after a
// resize. Assigning canvas.width/height resets imageSmoothingEnabled, so the
// first demoscreen presentation must restore nearest-neighbour scaling.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const pageErrors = [];
const watchdog = setTimeout(() => {
  console.error('title resize Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8096/';
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.renderer !== undefined, { timeout: 30000 });
  await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const palette = await import('/src/v_palette.js');
    const { screens } = await import('/src/v_video.js');
    while (!palette.V_IsPlaypalReady() || screens[0] === null || doomstat.gamestate !== 3) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });

  // A deliberately fractional 320x200 scale makes nearest and bilinear
  // output observably different around TITLEPIC's palette-index edges.
  await page.setViewportSize({ width: 641, height: 401 });
  const result = await page.evaluate(async () => {
    const { SCREENWIDTH, SCREENHEIGHT } = await import('/src/doomdef.js');
    const doomstat = await import('/src/doomstat.js');
    const video = await import('/src/i_video.js');
    const { screens, patch_t, V_DrawPatch } = await import('/src/v_video.js');
    const { V_GetActivePalette } = await import('/src/v_palette.js');
    const { W_CacheLumpName } = await import('/src/w_wad.js');
    const overlay = document.getElementById('overlay');
    const actualCtx = overlay.getContext('2d');

    // D_PageDrawer is intentionally private, so reproduce its complete body
    // with the real WAD page. Keeping this synchronous avoids racing the
    // startup wipe's temporary zeroed screens[0] between animation frames.
    screens[0].fill(0);
    V_DrawPatch(0, 0, 0, patch_t(W_CacheLumpName('TITLEPIC', 0)));
    const titleIndices = screens[0].slice();

    // Exercise the production listener and present synchronously, before the
    // normal D_Display tail can set the state for a later frame.
    window.dispatchEvent(new Event('resize'));
    const smoothingAfterResize = actualCtx.imageSmoothingEnabled;
    video.I_FinishUpdate();

    const source = document.createElement('canvas');
    source.width = SCREENWIDTH;
    source.height = SCREENHEIGHT;
    const sourceCtx = source.getContext('2d');
    const image = sourceCtx.createImageData(SCREENWIDTH, SCREENHEIGHT);
    const palette = V_GetActivePalette();
    for (let i = 0, j = 0; i < titleIndices.length; i++, j += 4) {
      const p = titleIndices[i] * 4;
      image.data[j + 0] = palette[p + 0];
      image.data[j + 1] = palette[p + 1];
      image.data[j + 2] = palette[p + 2];
      image.data[j + 3] = palette[p + 3];
    }
    sourceCtx.putImageData(image, 0, 0);

    const makeExpected = (smoothing) => {
      const canvas = document.createElement('canvas');
      canvas.width = overlay.width;
      canvas.height = overlay.height;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = smoothing;
      const scale = Math.min(canvas.width / SCREENWIDTH, canvas.height / SCREENHEIGHT);
      const width = SCREENWIDTH * scale;
      const height = SCREENHEIGHT * scale;
      const x = (canvas.width - width) * 0.5;
      const y = (canvas.height - height) * 0.5;
      ctx.drawImage(source, 0, 0, SCREENWIDTH, SCREENHEIGHT, x, y, width, height);
      return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    };

    const actual = actualCtx.getImageData(0, 0, overlay.width, overlay.height).data;
    const nearest = makeExpected(false);
    const smooth = makeExpected(true);
    let actualVsNearest = 0;
    let actualVsSmooth = 0;
    let nearestVsSmooth = 0;
    for (let i = 0; i < actual.length; i++) {
      if (actual[i] !== nearest[i]) actualVsNearest++;
      if (actual[i] !== smooth[i]) actualVsSmooth++;
      if (nearest[i] !== smooth[i]) nearestVsSmooth++;
    }
    return {
      gamestate: doomstat.gamestate,
      sourceColors: new Set(titleIndices).size,
      canvas: [overlay.width, overlay.height],
      smoothingAfterResize,
      actualVsNearest,
      actualVsSmooth,
      nearestVsSmooth,
    };
  });

  const failures = [];
  if (result.gamestate !== 3) failures.push(`fixture left GS_DEMOSCREEN: ${JSON.stringify(result)}`);
  if (result.canvas[0] !== 641 || result.canvas[1] !== 401) {
    failures.push(`resize did not reach the overlay: ${JSON.stringify(result)}`);
  }
  if (result.smoothingAfterResize !== false) {
    failures.push(`resize restored smoothing=${result.smoothingAfterResize}`);
  }
  if (result.nearestVsSmooth === 0) {
    failures.push(`TITLEPIC fixture did not distinguish scaling modes: ${JSON.stringify(result)}`);
  }
  if (result.actualVsNearest !== 0) {
    failures.push(`resized title was not nearest-scaled: ${JSON.stringify(result)}`);
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(watchdog);
  if (browser !== null) await browser.close();
}
