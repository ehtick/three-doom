// Headless localStorage round-trip for the registered Doom settings. Start a
// static server at the repository root, then run with:
//   NODE_PATH=/path/to/node_modules node tests/config_persistence_playwright.mjs

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const watchdog = setTimeout(() => {
  console.error('config persistence Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);
const pageErrors = [];

try {
  browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 640, height: 400 } });
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8095/';
  const url = new URL(baseUrl);
  url.searchParams.set('-map', 'E1M1');

  const openGame = async () => {
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(error.message));
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() =>
      window.renderer !== undefined &&
      window.scene?.getObjectByName('level') !== undefined &&
      window.renderer.info.render.frame > 2,
    { timeout: 30000 });
    return page;
  };

  const first = await openGame();
  const initial = await first.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const video = await import('/src/v_video.js');
    return {
      mouseSensitivity: doomstat.mouseSensitivity,
      sfxVolume: doomstat.snd_SfxVolume,
      musicVolume: doomstat.snd_MusicVolume,
      usegamma: video.usegamma,
    };
  });
  const saved = await first.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const system = await import('/src/i_system.js');
    const video = await import('/src/v_video.js');
    doomstat.set_mouseSensitivity(8);
    doomstat.set_snd_SfxVolume(12);
    doomstat.set_snd_MusicVolume(3);
    video.set_usegamma(3);
    system.I_Quit();
    return localStorage.getItem('doom:defaults');
  });
  await first.close();

  const second = await openGame();
  const reloaded = await second.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const video = await import('/src/v_video.js');
    const value = {
      mouseSensitivity: doomstat.mouseSensitivity,
      sfxVolume: doomstat.snd_SfxVolume,
      musicVolume: doomstat.snd_MusicVolume,
      usegamma: video.usegamma,
      defaults: localStorage.getItem('doom:defaults'),
    };
    localStorage.removeItem('doom:defaults');
    return value;
  });
  await second.close();

  const failures = [];
  if (initial.mouseSensitivity !== 5 || initial.sfxVolume !== 8 ||
      initial.musicVolume !== 8 || initial.usegamma !== 0) {
    failures.push(`reference defaults mismatch: ${JSON.stringify(initial)}`);
  }
  if (saved !== 'mouse_sensitivity\t\t8\nsfx_volume\t\t12\nmusic_volume\t\t3\nusegamma\t\t3') {
    failures.push(`quit save mismatch: ${JSON.stringify(saved)}`);
  }
  if (reloaded.mouseSensitivity !== 8 || reloaded.sfxVolume !== 12 ||
      reloaded.musicVolume !== 3 || reloaded.usegamma !== 3 ||
      reloaded.defaults !== saved) {
    failures.push(`reload mismatch: ${JSON.stringify(reloaded)}`);
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ initial, saved, reloaded }));
} finally {
  if (browser !== null) await browser.close();
  clearTimeout(watchdog);
}
