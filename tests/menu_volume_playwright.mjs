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
  await page.goto(process.env.DOOM_URL ?? 'http://127.0.0.1:8092/', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => window.renderer !== undefined, { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const menu = await import('/src/m_menu.js');
    const values = [];
    values.push([
      menu.M_SetSfxVolume(12), menu.sfxVolume, doomstat.snd_SfxVolume,
      menu.M_SetMusicVolume(3), menu.musicVolume, doomstat.snd_MusicVolume,
    ]);
    values.push([
      menu.M_SetSfxVolume(-4), menu.sfxVolume, doomstat.snd_SfxVolume,
      menu.M_SetMusicVolume(99), menu.musicVolume, doomstat.snd_MusicVolume,
    ]);
    menu.M_SetSfxVolume(8);
    menu.M_SetMusicVolume(8);
    return values;
  });
  const expected = [[12, 12, 12, 3, 3, 3], [0, 0, 0, 15, 15, 15]];
  if (JSON.stringify(result) !== JSON.stringify(expected) || errors.length !== 0) {
    throw new Error(JSON.stringify({ result, expected, errors }));
  }
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
