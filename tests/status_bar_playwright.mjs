// Real-WAD pixel checks for status-bar source parity.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const options = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser;
try {
  browser = await chromium.launch(options);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = new URL(process.env.DOOM_URL ?? 'http://127.0.0.1:8134/');
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer !== undefined &&
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const loop = await import('/src/d_loop.js');
    const status = await import('/src/st_stuff.js');
    const video = await import('/src/v_video.js');
    loop.D_DoomRafLoop.stop();

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    const player = doomstat.players[doomstat.consoleplayer];
    player.health = 100;
    player.armorpoints = 0;
    status.ST_Drawer(ctx, 0, 0, 320, 200);

    const actual = ctx.getImageData(0, 0, 320, 200).data;
    const percent = video.V_DecodePatchToCanvas('STTPRCNT');
    const patchBytes = percent.canvas.getContext('2d')
      .getImageData(0, 0, percent.w, percent.h).data;
    function comparePatch(anchorX, anchorY) {
      let opaque = 0;
      let mismatch = 0;
      for (let y = 0; y < percent.h; y++) {
        for (let x = 0; x < percent.w; x++) {
          const pi = (y * percent.w + x) * 4;
          if (patchBytes[pi + 3] === 0) continue;
          opaque++;
          const ax = anchorX - percent.leftoffset + x;
          const ay = anchorY - percent.topoffset + y;
          const ai = (ay * 320 + ax) * 4;
          for (let c = 0; c < 4; c++) {
            if (actual[ai + c] !== patchBytes[pi + c]) mismatch++;
          }
        }
      }
      return { opaque, mismatch };
    }
    return {
      healthPercent: comparePatch(90, 171),
      armorPercent: comparePatch(221, 171),
    };
  });

  const failures = [];
  for (const [name, value] of Object.entries(result)) {
    if (value.opaque === 0 || value.mismatch !== 0) {
      failures.push(`${name}: ${JSON.stringify(value)}`);
    }
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
