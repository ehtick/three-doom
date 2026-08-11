// Real-WAD navigation check for m_menu.c:M_Responder Escape and Backspace.

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
  await page.goto(process.env.DOOM_URL ?? 'http://127.0.0.1:8134/', {
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => window.renderer !== undefined, { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const { GameMode_t, KEY_BACKSPACE, KEY_ENTER, KEY_ESCAPE } = await import('/src/doomdef.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');
    loop.D_DoomRafLoop.stop();

    function drawHash() {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 200;
      menu.M_Drawer(canvas.getContext('2d'), 0, 0, 320, 200);
      const data = canvas.getContext('2d').getImageData(0, 0, 320, 200).data;
      let hash = 2166136261;
      let opaque = 0;
      for (let i = 0; i < data.length; i++) {
        hash = Math.imul(hash ^ data[i], 16777619) >>> 0;
        if ((i & 3) === 3 && data[i] !== 0) opaque++;
      }
      return { hash, opaque };
    }
    const key = (data1) => menu.M_Responder({ type: 0, data1, data2: 0, data3: 0 });

    menu.M_ClearMenus();
    menu.M_Init();
    doomstat.set_gamemode(GameMode_t.registered);
    doomstat.set_gamestate(3 /*GS_DEMOSCREEN*/);
    doomstat.set_demoplayback(false);
    doomstat.set_netgame(false);
    menu.M_StartControlPanel();
    key(KEY_ENTER); // Main -> Episode.
    const episode = drawHash();
    key(KEY_ENTER); // Episode -> Skill.
    const skill = drawHash();
    const backFromSkill = key(KEY_BACKSPACE);
    const episodeAfterBack = drawHash();
    const stillActiveAfterBack = doomstat.menuactive;
    const backFromEpisode = key(KEY_BACKSPACE);
    const main = drawHash();
    const stillActiveAtMain = doomstat.menuactive;
    const backAtRoot = key(KEY_BACKSPACE);
    const mainAfterRootBack = drawHash();

    key(KEY_ENTER); // Main -> Episode.
    key(KEY_ENTER); // Episode -> Skill.
    const escapeFromSkill = key(KEY_ESCAPE);
    const closedFromSkill = doomstat.menuactive === false;
    const closedCanvas = drawHash();
    const escapeOpens = key(KEY_ESCAPE);
    const reopened = doomstat.menuactive;
    menu.M_ClearMenus();

    return {
      episode, skill, backFromSkill, episodeAfterBack, stillActiveAfterBack,
      backFromEpisode, main, stillActiveAtMain, backAtRoot, mainAfterRootBack,
      escapeFromSkill, closedFromSkill, closedCanvas, escapeOpens, reopened,
    };
  });

  const failures = [];
  if (!result.backFromSkill || !result.stillActiveAfterBack ||
      result.episode.hash !== result.episodeAfterBack.hash ||
      result.episode.opaque === 0 || result.episode.hash === result.skill.hash) {
    failures.push(`Backspace did not return Skill -> Episode: ${JSON.stringify(result)}`);
  }
  if (!result.backFromEpisode || !result.stillActiveAtMain ||
      !result.backAtRoot || result.main.hash !== result.mainAfterRootBack.hash ||
      result.main.opaque === 0) {
    failures.push(`Backspace did not preserve/open Main: ${JSON.stringify(result)}`);
  }
  if (!result.escapeFromSkill || !result.closedFromSkill ||
      result.closedCanvas.opaque !== 0 || !result.escapeOpens || !result.reopened) {
    failures.push(`Escape did not close nested/open closed menu: ${JSON.stringify(result)}`);
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
