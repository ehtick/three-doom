// Real-WAD pixel comparison for M_DrawEpisode and M_DrawNewGame.

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
    const { GameMode_t, KEY_ENTER } = await import('/src/doomdef.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');
    const { V_DecodePatchToCanvas } = await import('/src/v_video.js');
    loop.D_DoomRafLoop.stop();

    function makeCanvas() {
      const value = document.createElement('canvas');
      value.width = 320;
      value.height = 200;
      return value;
    }
    function patch(ctx, name, x, y) {
      const value = V_DecodePatchToCanvas(name);
      ctx.drawImage(
        value.canvas,
        x - value.leftoffset,
        y - value.topoffset,
        value.w,
        value.h,
      );
    }
    function mismatchCount(actual, expected) {
      const a = actual.getContext('2d').getImageData(0, 0, 320, 200).data;
      const e = expected.getContext('2d').getImageData(0, 0, 320, 200).data;
      let count = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== e[i]) count++;
      return count;
    }
    function drawReference(names, selected, headings) {
      const value = makeCanvas();
      const ctx = value.getContext('2d');
      for (const heading of headings) patch(ctx, heading.name, heading.x, heading.y);
      for (let i = 0; i < names.length; i++) patch(ctx, names[i], 48, 63 + i * 16);
      patch(ctx, 'M_SKULL1', 16, 58 + selected * 16);
      return value;
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
    const episode = makeCanvas();
    menu.M_Drawer(episode.getContext('2d'), 0, 0, 320, 200);
    const expectedEpisode = drawReference(
      ['M_EPI1', 'M_EPI2', 'M_EPI3'],
      0,
      [{ name: 'M_EPISOD', x: 54, y: 38 }],
    );

    key(KEY_ENTER); // Episode 1 -> Skill, whose default row is Hurt Me Plenty.
    const skill = makeCanvas();
    menu.M_Drawer(skill.getContext('2d'), 0, 0, 320, 200);
    const expectedSkill = drawReference(
      ['M_JKILL', 'M_ROUGH', 'M_HURT', 'M_ULTRA', 'M_NMARE'],
      2,
      [
        { name: 'M_NEWG', x: 96, y: 14 },
        { name: 'M_SKILL', x: 54, y: 38 },
      ],
    );
    menu.M_ClearMenus();
    return {
      episodeMismatch: mismatchCount(episode, expectedEpisode),
      skillMismatch: mismatchCount(skill, expectedSkill),
    };
  });

  if (result.episodeMismatch !== 0 || result.skillMismatch !== 0 || errors.length !== 0) {
    throw new Error(JSON.stringify({ result, errors }));
  }
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
