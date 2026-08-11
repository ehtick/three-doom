// Real-module checks for the listener used by S_StartSoundAtVolume.  This
// models a demo/level boundary where consoleplayer changes before the first
// S_UpdateSounds call for the new local player.

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
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer?.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const loop = await import('/src/d_loop.js');
    const sound = await import('/src/s_sound.js');
    loop.D_DoomRafLoop.stop();

    const FRACUNIT = 65536;
    const savedPlayers = doomstat.players.slice();
    const savedConsoleplayer = doomstat.consoleplayer;
    try {
      const oldConsole = { mo: { x: 2000 * FRACUNIT, y: 0, angle: 0 } };
      const newConsole = { mo: { x: 0, y: 0, angle: 0 } };
      doomstat.players[0] = oldConsole;
      doomstat.players[1] = newConsole;

      // Seed the previous tic's listener, then change consoleplayer without a
      // matching S_UpdateSounds call, exactly as a demo header can do.
      doomstat.set_consoleplayer(0);
      sound.S_UpdateSounds(oldConsole);
      doomstat.set_consoleplayer(1);
      const newLocal = sound.S_StartSoundParams(newConsole.mo, 8);

      doomstat.set_consoleplayer(0);
      const oldLocal = sound.S_StartSoundParams(newConsole.mo, 8);

      doomstat.set_consoleplayer(1);
      const positioned = sound.S_StartSoundParams({
        x: 0,
        y: 680 * FRACUNIT,
      }, 8);
      const clipped = sound.S_StartSoundParams({
        x: 1201 * FRACUNIT,
        y: 0,
      }, 8);
      return { newLocal, oldLocal, positioned, clipped };
    } finally {
      for (let i = 0; i < doomstat.players.length; i++) {
        doomstat.players[i] = savedPlayers[i];
      }
      doomstat.set_consoleplayer(savedConsoleplayer);
    }
  });

  const failures = [];
  if (result.newLocal?.vol !== 64 || result.newLocal?.sep !== 128) {
    failures.push(`new local listener: ${JSON.stringify(result.newLocal)}`);
  }
  if (result.oldLocal !== null) {
    failures.push(`old listener should clip new origin: ${JSON.stringify(result.oldLocal)}`);
  }
  // At 680 units both vanilla's integer-first attenuation and the port's
  // existing scale-first calculation yield 32, so this listener regression
  // does not encode their separate rounding discrepancy.
  if (result.positioned?.vol !== 32 || result.positioned?.sep !== 33) {
    failures.push(`positioned listener: ${JSON.stringify(result.positioned)}`);
  }
  if (result.clipped !== null) {
    failures.push(`clipped listener: ${JSON.stringify(result.clipped)}`);
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
