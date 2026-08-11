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
    doomstat.set_deathmatch(0);
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
    const percentResult = {
      healthPercent: comparePatch(90, 171),
      armorPercent: comparePatch(221, 171),
    };

    function patch(target, name, x, y) {
      video.V_DrawPatchAtCanvas(
        target, video.V_DecodePatchToCanvas(name), x, y, 1, 1,
      );
    }
    function middleMismatch(actualCanvas, expectedCanvas) {
      const a = actualCanvas.getContext('2d').getImageData(104, 168, 39, 32).data;
      const e = expectedCanvas.getContext('2d').getImageData(104, 168, 39, 32).data;
      let mismatch = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== e[i]) mismatch++;
      return mismatch;
    }
    function renderStatus() {
      const value = document.createElement('canvas');
      value.width = 320;
      value.height = 200;
      status.ST_Drawer(value.getContext('2d'), 0, 0, 320, 200);
      return value;
    }
    function expectedMiddle(showArms) {
      const value = document.createElement('canvas');
      value.width = 320;
      value.height = 200;
      const target = value.getContext('2d');
      patch(target, 'STBAR', 0, 168);
      if (showArms) {
        patch(target, 'STARMS', 104, 168);
        const cells = [
          [111, 172, 2], [123, 172, 3], [135, 172, 4],
          [111, 182, 5], [123, 182, 6], [135, 182, 7],
        ];
        for (const [x, y, digit] of cells) patch(target, `STYSNUM${digit}`, x, y);
      } else {
        patch(target, 'STTNUM1', 110, 171);
        patch(target, 'STTNUM2', 124, 171);
      }
      return value;
    }

    player.weaponowned.fill(true);
    doomstat.set_deathmatch(0);
    const normal = renderStatus();
    const normalMiddleMismatch = middleMismatch(normal, expectedMiddle(true));

    player.frags.fill(0);
    player.frags[0] = 3;
    player.frags[1] = 10;
    player.frags[2] = 5; // 10 + 5 - 3 = 12.
    doomstat.set_deathmatch(1);
    const deathmatch = renderStatus();
    const deathmatchMiddleMismatch = middleMismatch(deathmatch, expectedMiddle(false));
    doomstat.set_deathmatch(0);

    function imageMismatch(aCanvas, bCanvas, x, y, width, height) {
      const a = aCanvas.getContext('2d').getImageData(x, y, width, height).data;
      const b = bCanvas.getContext('2d').getImageData(x, y, width, height).data;
      let mismatch = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) mismatch++;
      return mismatch;
    }
    player.cards.fill(false);
    player.cards[3] = true;
    const skullOnly = renderStatus();
    player.cards[0] = true;
    const cardAndSkull = renderStatus();
    player.cards[3] = false;
    const cardOnly = renderStatus();
    const keyRegion = [238, 168, 12, 13];
    const combinedVsSkullMismatch = imageMismatch(cardAndSkull, skullOnly, ...keyRegion);
    const cardVsSkullMismatch = imageMismatch(cardOnly, skullOnly, ...keyRegion);
    player.cards.fill(false);

    return {
      ...percentResult,
      normalMiddleMismatch,
      deathmatchMiddleMismatch,
      combinedVsSkullMismatch,
      cardVsSkullMismatch,
    };
  });

  const failures = [];
  for (const [name, value] of Object.entries({
    healthPercent: result.healthPercent,
    armorPercent: result.armorPercent,
  })) {
    if (value.opaque === 0 || value.mismatch !== 0) {
      failures.push(`${name}: ${JSON.stringify(value)}`);
    }
  }
  if (result.normalMiddleMismatch !== 0 || result.deathmatchMiddleMismatch !== 0) {
    failures.push(`middle widgets: ${JSON.stringify(result)}`);
  }
  if (result.combinedVsSkullMismatch !== 0 || result.cardVsSkullMismatch === 0) {
    failures.push(`key override: ${JSON.stringify(result)}`);
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
