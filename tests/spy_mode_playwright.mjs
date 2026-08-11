// Headless integration coverage for F12 spy cycling and D_Display's selected
// camera/weapon player. Run against a static server rooted at the repository.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const pageErrors = [];
const watchdog = setTimeout(() => {
  console.error('spy-mode Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8097/';
  const url = new URL(baseUrl);
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer?.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const events = await import('/src/d_event.js');
    const game = await import('/src/g_game.js');
    const menu = await import('/src/m_menu.js');
    const wipe = await import('/src/f_wipe.js');
    const psprites = await import('/src/r_psprite.js');
    const viewModule = await import('/src/r_view.js');
    const info = await import('/src/info.js');
    const { KEY_F12 } = await import('/src/doomdef.js');
    const consoleIndex = doomstat.consoleplayer;
    const originalPlayer2 = doomstat.players[2];
    const originalActive2 = doomstat.playeringame[2];
    const event = {
      type: events.evtype_t.ev_keydown,
      data1: KEY_F12,
      data2: 0,
      data3: 0,
    };
    const f12 = () => document.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'F12',
      key: 'F12',
      bubbles: true,
      cancelable: true,
    }));
    const nextFrame = () => new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const drawPspritePixels = (player) => {
      const canvas = document.createElement('canvas');
      canvas.width = 640;
      canvas.height = 400;
      const scratch = canvas.getContext('2d');
      psprites.R_DrawPlayerSprites(
        scratch,
        player,
        0,
        0,
        canvas.width,
        canvas.height,
        viewModule.R_GetViewSize(),
      );
      const pixels = scratch.getImageData(0, 0, canvas.width, canvas.height).data;
      let count = 0;
      for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] !== 0) count++;
      }
      return count;
    };

    for (let i = 0; i < 100 && wipe.wipe_isActive(); i++) await nextFrame();

    menu.M_ClearMenus();
    doomstat.set_gamestate(0 /*GS_LEVEL*/);
    doomstat.set_deathmatch(0);
    doomstat.set_singledemo(false);
    doomstat.set_displayplayer(consoleIndex);

    // Pure production G_Responder path: single-player self-cycle, active-slot
    // skipping/wrap, deathmatch denial, and singledemo override.
    for (let i = 0; i < doomstat.playeringame.length; i++) {
      doomstat.playeringame[i] = i === consoleIndex;
    }
    const singleConsumed = game.G_Responder(event);
    const singleSelected = doomstat.displayplayer;

    doomstat.playeringame[2] = true;
    const coopForwardConsumed = game.G_Responder(event);
    const coopForward = doomstat.displayplayer;
    const coopWrapConsumed = game.G_Responder(event);
    const coopWrap = doomstat.displayplayer;

    doomstat.set_deathmatch(1);
    const deathmatchConsumed = game.G_Responder(event);
    const deathmatchSelected = doomstat.displayplayer;
    doomstat.set_singledemo(true);
    const singledemoConsumed = game.G_Responder(event);
    const singledemoSelected = doomstat.displayplayer;

    // Return to an ordinary co-op gate and install a harmless second display
    // player. It is active only while the synchronous DOM F12 handler cycles;
    // removing it immediately keeps P_Ticker from simulating the synthetic mo.
    doomstat.set_deathmatch(0);
    doomstat.set_singledemo(false);
    doomstat.set_displayplayer(consoleIndex);
    const local = doomstat.players[consoleIndex];
    const fake = {
      ...local,
      health: 17,
      viewz: local.viewz + 65536,
      mo: {
        ...local.mo,
        x: local.mo.x + 8 * 65536,
        y: local.mo.y,
        angle: (local.mo.angle + 0x20000000) >>> 0,
      },
      psprites: local.psprites.map((psprite) => ({ ...psprite, state: 0 })),
    };
    const weaponFixture = {
      ...local,
      psprites: [
        { state: info.S_PISTOL, sx: 65536, sy: 32 * 65536 },
        { state: 0, sx: 65536, sy: 32 * 65536 },
      ],
    };
    doomstat.players[2] = fake;
    doomstat.playeringame[2] = false;
    const consoleWeaponPixels = drawPspritePixels(weaponFixture);
    const fakeWeaponPixels = drawPspritePixels(fake);

    doomstat.playeringame[2] = true;
    const domConsumed = !f12();
    const domSelected = doomstat.displayplayer;
    doomstat.playeringame[2] = false;
    await nextFrame();
    const camera = {
      x: window.camera.position.x,
      y: window.camera.position.y,
      z: window.camera.position.z,
    };

    doomstat.set_displayplayer(consoleIndex);
    doomstat.players[2] = originalPlayer2;
    doomstat.playeringame[2] = originalActive2;
    doomstat.set_deathmatch(0);
    doomstat.set_singledemo(false);
    return {
      consoleIndex,
      singleConsumed,
      singleSelected,
      coopForwardConsumed,
      coopForward,
      coopWrapConsumed,
      coopWrap,
      deathmatchConsumed,
      deathmatchSelected,
      singledemoConsumed,
      singledemoSelected,
      domConsumed,
      domSelected,
      camera,
      expectedCamera: {
        x: fake.mo.x / 65536,
        y: fake.viewz / 65536,
        z: -fake.mo.y / 65536,
      },
      consoleWeaponPixels,
      fakeWeaponPixels,
    };
  });

  const failures = [];
  if (!result.singleConsumed || result.singleSelected !== result.consoleIndex) {
    failures.push(`single-player self-cycle failed: ${JSON.stringify(result)}`);
  }
  if (!result.coopForwardConsumed || result.coopForward !== 2 ||
      !result.coopWrapConsumed || result.coopWrap !== result.consoleIndex) {
    failures.push(`co-op active-player wrap failed: ${JSON.stringify(result)}`);
  }
  if (result.deathmatchConsumed || result.deathmatchSelected !== result.consoleIndex) {
    failures.push(`deathmatch spy gate failed: ${JSON.stringify(result)}`);
  }
  if (!result.singledemoConsumed || result.singledemoSelected !== 2) {
    failures.push(`singledemo spy override failed: ${JSON.stringify(result)}`);
  }
  if (!result.domConsumed || result.domSelected !== 2) {
    failures.push(`DOM F12 did not cycle displayplayer: ${JSON.stringify(result)}`);
  }
  for (const axis of ['x', 'y', 'z']) {
    if (Math.abs(result.camera[axis] - result.expectedCamera[axis]) > 1e-6) {
      failures.push(`D_Display camera ${axis} ignored displayplayer: ${JSON.stringify(result)}`);
    }
  }
  if (result.consoleWeaponPixels <= result.fakeWeaponPixels) {
    failures.push(`display psprites did not follow spy view: ${JSON.stringify(result)}`);
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(watchdog);
  if (browser !== null) await browser.close();
}
