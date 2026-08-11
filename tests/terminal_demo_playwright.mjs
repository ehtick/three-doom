// Headless loop coverage for the terminal multiplayer-demo command topology.

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
  console.error('terminal-demo Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8098/';
  const url = new URL(baseUrl);
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer?.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const game = await import('/src/g_game.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');
    const wipe = await import('/src/f_wipe.js');
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    const waitForNextTic = async (start) => {
      for (let i = 0; i < 120 && doomstat.gametic === start; i++) await nextFrame();
      if (doomstat.gametic === start) throw new Error('game loop did not advance');
    };
    for (let i = 0; i < 180 && wipe.wipe_isActive(); i++) await nextFrame();
    menu.M_ClearMenus();
    doomstat.set_paused(false);

    // Two active slots, with the browser's only local node assigned to slot 2.
    // The first complete demo tic pauses through player 0. On the next tic the
    // marker is encountered at player 0 before slot 2 can consume demo data.
    const demo = new Uint8Array([
      109, 2, 1, 1, 0, 0, 0, 0, 2,
      1, 0, 1, 0,
      0, 0, 0, 0x81,
      0, 0, 0, 0,
      0x80,
    ]);
    game.G_PlayDemo(demo);
    // One simulation tic per RAF makes the command and marker phases directly
    // observable without depending on wall-clock catch-up behavior.
    doomstat.set_singletics(true);
    const commandStart = doomstat.gametic;
    await waitForNextTic(commandStart);
    const afterCommand = {
      demoplayback: doomstat.demoplayback,
      paused: doomstat.paused,
      consoleplayer: doomstat.consoleplayer,
    };

    // This live Pause becomes the base command for captured console slot 2.
    // The marker resets consoleplayer and deactivates slot 2 before specials,
    // so it must remain in player 2's cmd without toggling Pause a second time.
    document.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'Pause', key: 'Pause', bubbles: true, cancelable: true,
    }));
    const markerStart = doomstat.gametic;
    await waitForNextTic(markerStart);
    loop.D_DoomRafLoop.stop();
    document.dispatchEvent(new KeyboardEvent('keyup', {
      code: 'Pause', key: 'Pause', bubbles: true, cancelable: true,
    }));

    return {
      afterCommand,
      demoplayback: doomstat.demoplayback,
      consoleplayer: doomstat.consoleplayer,
      playeringame: Array.from(doomstat.playeringame),
      paused: doomstat.paused,
      player0cmd: { ...doomstat.players[0].cmd },
      player2cmd: { ...doomstat.players[2].cmd },
    };
  });

  const failures = [];
  if (!result.afterCommand.demoplayback || !result.afterCommand.paused ||
      result.afterCommand.consoleplayer !== 2) {
    failures.push(`first multiplayer command phase mismatch: ${JSON.stringify(result.afterCommand)}`);
  }
  if (result.demoplayback || result.consoleplayer !== 0 ||
      result.playeringame.join(',') !== 'true,false,false,false') {
    failures.push(`terminal cleanup topology mismatch: ${JSON.stringify(result)}`);
  }
  if (!result.paused || result.player0cmd.buttons !== 0) {
    failures.push(`terminal remote base replayed stale Pause: ${JSON.stringify(result.player0cmd)}`);
  }
  if (result.player2cmd.buttons !== 0x81) {
    failures.push(`nonzero console lost its terminal base cmd: ${JSON.stringify(result.player2cmd)}`);
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(watchdog);
  if (browser !== null) await browser.close();
}
