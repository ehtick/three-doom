// Real-WAD cursor checks for m_menu.c alpha-key navigation.

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
    const { GameMode_t, KEY_BACKSPACE, KEY_ENTER } = await import('/src/doomdef.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');
    const video = await import('/src/v_video.js');
    loop.D_DoomRafLoop.stop();

    const key = (data1) => menu.M_Responder({ type: 0, data1, data2: 0, data3: 0 });
    const letter = (value) => value.charCodeAt(0);
    function cursorMismatch(anchorX, anchorY) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      menu.M_Drawer(ctx, 0, 0, 320, 200);
      const actual = ctx.getImageData(0, 0, 320, 200).data;
      const skull = video.V_DecodePatchToCanvas('M_SKULL1');
      const expected = skull.canvas.getContext('2d')
        .getImageData(0, 0, skull.w, skull.h).data;
      let opaque = 0;
      let mismatch = 0;
      for (let y = 0; y < skull.h; y++) {
        for (let x = 0; x < skull.w; x++) {
          const pi = (y * skull.w + x) * 4;
          if (expected[pi + 3] === 0) continue;
          opaque++;
          const ax = anchorX - skull.leftoffset + x;
          const ay = anchorY - skull.topoffset + y;
          const ai = (ay * 320 + ax) * 4;
          for (let c = 0; c < 4; c++) {
            if (actual[ai + c] !== expected[pi + c]) mismatch++;
          }
        }
      }
      return { opaque, mismatch };
    }
    const cursor = (menuX, menuY, row) => cursorMismatch(
      menuX - 32,
      menuY - 5 + row * 16,
    );

    menu.M_ClearMenus();
    menu.M_Init();
    doomstat.set_gamemode(GameMode_t.retail);
    doomstat.set_gamestate(3 /*GS_DEMOSCREEN*/);
    doomstat.set_demoplayback(false);
    doomstat.set_netgame(false);
    menu.M_StartControlPanel();

    const mainOConsumed = key(letter('o'));
    const mainO = cursor(97, 64, 1);
    const mainUnsupported = key(letter('x'));
    const mainAfterUnsupported = cursor(97, 64, 1);
    key(letter('n'));
    key(KEY_ENTER); // Episode.

    const episodeFirstTConsumed = key(letter('t'));
    const episodeT1 = cursor(48, 63, 1);
    key(letter('t'));
    const episodeT3 = cursor(48, 63, 3);
    key(letter('t'));
    const episodeTWrap = cursor(48, 63, 1);
    key(letter('k'));
    key(KEY_ENTER); // Skill, lastOn=Hurt Me Plenty.

    key(letter('h'));
    const skillHWrap = cursor(48, 63, 1);
    key(letter('h'));
    const skillHNext = cursor(48, 63, 2);
    key(KEY_BACKSPACE); // Episode.
    key(KEY_BACKSPACE); // Main.
    key(letter('o'));
    key(KEY_ENTER); // Options.

    key(letter('m'));
    const optionsM4 = cursor(60, 37, 4);
    key(letter('m'));
    const optionsM0 = cursor(60, 37, 0);
    key(letter('m'));
    const optionsMWrap = cursor(60, 37, 4);
    key(letter('s'));
    const optionsS6 = cursor(60, 37, 6);
    key(letter('s'));
    const optionsS2 = cursor(60, 37, 2);
    key(letter('s'));
    key(KEY_ENTER); // Sound.
    key(letter('m'));
    const soundM = cursor(80, 64, 2);
    key(letter('s'));
    const soundS = cursor(80, 64, 0);

    menu.M_ClearMenus();
    menu.M_Init();
    doomstat.set_gamestate(0 /*GS_LEVEL*/);
    menu.M_StartControlPanel();
    key(letter('n'));
    const continueNewGame = cursor(97, 64, 1);
    const continueConsumed = key(letter('c'));
    const continueRow = cursor(97, 64, 0);
    menu.M_ClearMenus();

    return {
      mainOConsumed,
      mainO,
      mainUnsupported,
      mainAfterUnsupported,
      episodeFirstTConsumed,
      episodeT1,
      episodeT3,
      episodeTWrap,
      skillHWrap,
      skillHNext,
      optionsM4,
      optionsM0,
      optionsMWrap,
      optionsS6,
      optionsS2,
      soundM,
      soundS,
      continueNewGame,
      continueConsumed,
      continueRow,
    };
  });

  const failures = [];
  for (const [name, value] of Object.entries(result)) {
    if (name.endsWith('Consumed')) {
      if (value !== true) failures.push(`${name}: ${value}`);
    } else if (name === 'mainUnsupported') {
      if (value !== false) failures.push(`${name}: ${value}`);
    } else if (value.opaque === 0 || value.mismatch !== 0) {
      failures.push(`${name}: ${JSON.stringify(value)}`);
    }
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
