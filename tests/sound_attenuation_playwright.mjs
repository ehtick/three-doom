// Headless real-module verification of Linux Doom's integer-first positional
// attenuation, including the special map-8 formula.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const options = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser;
const watchdog = setTimeout(() => {
  console.error('sound attenuation Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);

try {
  browser = await chromium.launch(options);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = new URL(process.env.DOOM_URL ?? 'http://127.0.0.1:8135/');
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
    const savedPlayer = doomstat.players[0];
    const savedConsoleplayer = doomstat.consoleplayer;
    const savedMap = doomstat.gamemap;
    const savedVolume = doomstat.snd_SfxVolume;
    try {
      doomstat.players[0] = { mo: { x: 0, y: 0, angle: 0 } };
      doomstat.set_consoleplayer(0);
      doomstat.set_snd_SfxVolume(8);

      const volumeAt = (distance) =>
        sound.S_StartSoundParams({ x: distance, y: 0 }, 8)?.vol ?? null;

      doomstat.set_gamemap(1);
      const normal = {
        fourHundred: volumeAt(400 * FRACUNIT),
        fourHundredHalf: volumeAt(400 * FRACUNIT + FRACUNIT / 2),
        close: volumeAt(160 * FRACUNIT),
        closeFraction: volumeAt(160 * FRACUNIT + 1),
        lastAudible: volumeAt(1070 * FRACUNIT),
        firstInaudible: volumeAt(1070 * FRACUNIT + 1),
        clipped: volumeAt(1200 * FRACUNIT + 1),
      };

      doomstat.set_gamemap(8);
      const boss = {
        fourHundred: volumeAt(400 * FRACUNIT),
        close: volumeAt(160 * FRACUNIT),
        closeFraction: volumeAt(160 * FRACUNIT + 1),
        clipped: volumeAt(1200 * FRACUNIT),
        beyondClip: volumeAt(1300 * FRACUNIT),
      };
      return { normal, boss };
    } finally {
      doomstat.players[0] = savedPlayer;
      doomstat.set_consoleplayer(savedConsoleplayer);
      doomstat.set_gamemap(savedMap);
      doomstat.set_snd_SfxVolume(savedVolume);
    }
  });

  const expected = {
    normal: {
      fourHundred: 48,
      fourHundredHalf: 48,
      close: 64,
      closeFraction: 56,
      lastAudible: 8,
      firstInaudible: null,
      clipped: null,
    },
    boss: {
      fourHundred: 80,
      close: 64,
      closeFraction: 72,
      clipped: 120,
      beyondClip: 120,
    },
  };
  if (JSON.stringify(result) !== JSON.stringify(expected)) {
    throw new Error(`sound attenuation mismatch:\nexpected ${JSON.stringify(expected)}\nactual   ${JSON.stringify(result)}`);
  }
  if (errors.length !== 0) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
  clearTimeout(watchdog);
}
