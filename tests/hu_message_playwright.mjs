// Real-WAD HUD message lifetime and forced-overwrite integration coverage.

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
    const hu = await import('/src/hu_stuff.js');
    const loop = await import('/src/d_loop.js');
    loop.D_DoomRafLoop.stop();

    const player = doomstat.players[doomstat.consoleplayer];
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const ctx = canvas.getContext('2d');
    function render() {
      ctx.clearRect(0, 0, 320, 200);
      hu.HU_Drawer(ctx, 0, 0, 320, 200);
      const bytes = ctx.getImageData(0, 0, 320, 200).data;
      let hash = 2166136261 >>> 0;
      let opaque = 0;
      for (let i = 0; i < bytes.length; i++) {
        hash = Math.imul(hash ^ bytes[i], 16777619) >>> 0;
        if ((i & 3) === 3 && bytes[i] !== 0) opaque++;
      }
      return { hash, opaque };
    }

    // Synchronize hu_stuff's player-mobj observation, then reset the widget.
    player.message = '';
    hu.HU_SetShowMessages(1);
    hu.HU_Start();
    hu.HU_Ticker();
    hu.HU_Start();

    player.message = 'PICKUP';
    hu.HU_Ticker();
    const firstVisible = render();
    for (let i = 0; i < hu.HU_MSGTIMEOUT - 1; i++) hu.HU_Ticker();
    const lastVisible = render();
    hu.HU_Ticker();
    const expired = render();

    hu.HU_Start();
    hu.HU_SetShowMessages(1);
    hu.HU_ToggleMessages(); // OFF is forced even though messages are now hidden.
    hu.HU_Ticker();
    const forcedOff = render();
    hu.HU_ToggleMessages(); // A new forced message may replace the old lock.
    hu.HU_Ticker();
    const forcedOn = render();

    player.message = 'PICKUP';
    hu.HU_Ticker();
    const blocked = render();
    const retainedAfterBlock = player.message;
    for (let i = 0; i < hu.HU_MSGTIMEOUT - 2; i++) hu.HU_Ticker();
    const finalLocked = render();
    const retainedUntilExpiry = player.message;
    hu.HU_Ticker();
    const replacement = render();
    const clearedOnInstall = player.message;

    return {
      firstVisible, lastVisible, expired, forcedOff, forcedOn, blocked,
      finalLocked, replacement, retainedAfterBlock, retainedUntilExpiry,
      clearedOnInstall,
    };
  });

  const failures = [];
  if (result.firstVisible.opaque === 0 ||
      result.lastVisible.hash !== result.firstVisible.hash ||
      result.expired.opaque !== 0) {
    failures.push(`140-tic lifetime: ${JSON.stringify(result)}`);
  }
  if (result.forcedOff.opaque === 0 || result.forcedOn.opaque === 0 ||
      result.forcedOff.hash === result.forcedOn.hash) {
    failures.push(`forced toggle rendering: ${JSON.stringify(result)}`);
  }
  if (result.blocked.hash !== result.forcedOn.hash ||
      result.finalLocked.hash !== result.forcedOn.hash ||
      result.retainedAfterBlock !== 'PICKUP' ||
      result.retainedUntilExpiry !== 'PICKUP') {
    failures.push(`forced overwrite lock: ${JSON.stringify(result)}`);
  }
  if (result.replacement.hash !== result.firstVisible.hash ||
      result.clearedOnInstall !== '') {
    failures.push(`expiry replacement: ${JSON.stringify(result)}`);
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
