// Headless integration checks for the command-build position in D_DoomLoop.
// Start a static server at the repository root, then run with:
//   NODE_PATH=/path/to/node_modules node tests/ticcmd_loop_playwright.mjs

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const watchdog = setTimeout(() => {
  console.error('ticcmd loop Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);
const pageErrors = [];

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8127/';
  const url = new URL(baseUrl);
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer !== undefined &&
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const events = await import('/src/d_event.js');
    const game = await import('/src/g_game.js');
    const keyboard = await import('/src/d_keyboard.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');

    menu.M_ClearMenus();
    doomstat.set_demoplayback(false);
    doomstat.set_paused(false);
    doomstat.set_gamestate(0 /*GS_LEVEL*/);

    const canvas = window.renderer.domElement;
    let lockedCanvas = canvas;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => lockedCanvas,
    });
    const key = (type, code, value) => document.dispatchEvent(new KeyboardEvent(type, {
      code,
      key: value,
      bubbles: true,
      cancelable: true,
    }));
    const mouseMove = (x, y) => {
      const event = new MouseEvent('mousemove', {
        buttons: 0,
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperties(event, {
        movementX: { value: x },
        movementY: { value: y },
      });
      document.dispatchEvent(event);
    };
    const waitForNextTic = async (start) => {
      for (let i = 0; i < 120 && doomstat.gametic === start; i++) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
      if (doomstat.gametic === start) throw new Error('game loop did not advance');
    };

    // The level-load action resets all held browser input. Vanilla nevertheless
    // applies the command built before G_Ticker to this first new-level tic.
    key('keydown', 'KeyW', 'w');
    const loadStart = doomstat.gametic;
    doomstat.set_gameaction(events.gameaction_t.ga_loadlevel);
    await waitForNextTic(loadStart);
    const player = doomstat.players[doomstat.consoleplayer];
    const firstLevelCmd = {
      forwardmove: player.cmd.forwardmove,
      sidemove: player.cmd.sidemove,
      angleturn: player.cmd.angleturn,
      buttons: player.cmd.buttons,
    };
    key('keyup', 'KeyW', 'w');

    // Even while a demo supplies the effective player command, the local
    // builder still runs first and consumes transient mouse axes.
    doomstat.set_demoplayback(true);
    lockedCanvas = canvas;
    mouseMove(7, -5);
    const demoStart = doomstat.gametic;
    await waitForNextTic(demoStart);
    doomstat.set_demoplayback(false);
    const probe = { cmd: {} };
    keyboard.D_KeyboardInput.buildCmd(probe);
    const afterDemoDrain = {
      forwardmove: probe.cmd.forwardmove,
      sidemove: probe.cmd.sidemove,
      angleturn: probe.cmd.angleturn,
      buttons: probe.cmd.buttons,
    };

    // Recording uses the post-action active topology and serializes one
    // command per active slot. Keep the state ticker inert enough for a sparse
    // synthetic player while the real D_DoomLoop performs the write.
    doomstat.set_gamestate(3 /*GS_DEMOSCREEN*/);
    doomstat.playeringame[0] = true;
    doomstat.playeringame[1] = false;
    doomstat.playeringame[2] = true;
    doomstat.playeringame[3] = false;
    doomstat.players[2] = {
      cmd: {
        forwardmove: -7,
        sidemove: 9,
        angleturn: 32760,
        consistancy: 0,
        chatchar: 0,
        buttons: 2,
      },
    };
    game.G_RecordDemo('slot-order');
    // GS_DEMOSCREEN normally intercepts live input. singledemo is exactly the
    // reference guard that lets an explicit demo session retain controls.
    doomstat.set_singledemo(true);
    key('keydown', 'KeyW', 'w');
    doomstat.set_singledemo(false);
    const recordStart = doomstat.gametic;
    await waitForNextTic(recordStart);
    loop.D_DoomRafLoop.stop();
    key('keyup', 'KeyW', 'w');
    const recording = game.G_StopDemo();
    const recordedPayload = Array.from(recording.bytes.slice(13, -1));
    const recordedRemoteAngle = doomstat.players[2].cmd.angleturn;
    keyboard.D_KeyboardInput.shutdown();

    return { firstLevelCmd, afterDemoDrain, recordedPayload, recordedRemoteAngle };
  });

  const failures = [];
  if (result.firstLevelCmd.forwardmove !== 25 ||
      result.firstLevelCmd.sidemove !== 0 ||
      result.firstLevelCmd.angleturn !== 0 ||
      result.firstLevelCmd.buttons !== 0) {
    failures.push(`load tic lost its pre-action command: ${JSON.stringify(result.firstLevelCmd)}`);
  }
  if (result.afterDemoDrain.forwardmove !== 0 ||
      result.afterDemoDrain.sidemove !== 0 ||
      result.afterDemoDrain.angleturn !== 0 ||
      result.afterDemoDrain.buttons !== 0) {
    failures.push(`demo tic did not drain live input: ${JSON.stringify(result.afterDemoDrain)}`);
  }
  const expectedPayload = [25, 0, 0, 0, 249, 9, 128, 2];
  if (result.recordedPayload.join(',') !== expectedPayload.join(',')) {
    failures.push(`active-player recording order mismatch: ${JSON.stringify(result.recordedPayload)}`);
  }
  if (result.recordedRemoteAngle !== -32768) {
    failures.push(`recorded command was not read back as a signed short: ${result.recordedRemoteAngle}`);
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== null) await browser.close();
  clearTimeout(watchdog);
}
