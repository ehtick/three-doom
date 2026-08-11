// Real-WAD Options layout and M_EndGame -> D_StartTitle lifecycle checks.

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
    window.renderer !== undefined &&
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const { KEY_DOWNARROW, KEY_ENTER } = await import('/src/doomdef.js');
    const { gameaction_t } = await import('/src/d_event.js');
    const hu = await import('/src/hu_stuff.js');
    const menu = await import('/src/m_menu.js');
    const { V_DecodePatchToCanvas } = await import('/src/v_video.js');

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
    function thermo(ctx, x, y, width, dot) {
      patch(ctx, 'M_THERML', x, y);
      x += 8;
      for (let i = 0; i < width; i++, x += 8) patch(ctx, 'M_THERMM', x, y);
      patch(ctx, 'M_THERMR', x, y);
      patch(ctx, 'M_THERMO', x - width * 8 + dot * 8, y);
    }
    function mismatchCount(actual, expected) {
      const a = actual.getContext('2d').getImageData(0, 0, 320, 200).data;
      const e = expected.getContext('2d').getImageData(0, 0, 320, 200).data;
      let count = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== e[i]) count++;
      return count;
    }
    const key = (data1) => menu.M_Responder({ type: 0, data1, data2: 0, data3: 0 });
    function openOptions() {
      menu.M_ClearMenus();
      menu.M_Init();
      menu.M_StartControlPanel();
      key(KEY_DOWNARROW); // Continue -> New Game.
      key(KEY_DOWNARROW); // New Game -> Options.
      key(KEY_ENTER);
    }

    // Full 320x200 comparison against an independent OptionsDef transcription.
    openOptions();
    const actual = makeCanvas();
    menu.M_Drawer(actual.getContext('2d'), 0, 0, 320, 200);
    const expected = makeCanvas();
    const ctx = expected.getContext('2d');
    patch(ctx, 'M_OPTTTL', 108, 15);
    patch(ctx, 'M_GDHIGH', 235, 69);
    patch(ctx, hu.showMessages ? 'M_MSGON' : 'M_MSGOFF', 180, 53);
    thermo(ctx, 60, 133, 10, doomstat.mouseSensitivity);
    thermo(ctx, 60, 101, 9, menu.getScreenblocks() - 3);
    const items = [
      ['M_ENDGAM', 0], ['M_MESSG', 1], ['M_DETAIL', 2], ['M_SCRNSZ', 3],
      ['M_MSENS', 5], ['M_SVOL', 7],
    ];
    for (const [name, row] of items) patch(ctx, name, 60, 37 + row * 16);
    patch(ctx, 'M_SKULL1', 28, 32);
    const optionsMismatch = mismatchCount(actual, expected);

    // No user game: refuse in place (M_EndGame's oof path), with no message.
    doomstat.set_usergame(false);
    const inactiveConsumed = key(KEY_ENTER);
    const inactiveStayedOpen = doomstat.menuactive;
    const inactiveCanvas = makeCanvas();
    menu.M_Drawer(inactiveCanvas.getContext('2d'), 0, 0, 320, 200);
    const inactiveMismatch = mismatchCount(inactiveCanvas, expected);

    // Active netgame: informational NETEND accepts an arbitrary key.
    doomstat.set_usergame(true);
    doomstat.set_netgame(true);
    openOptions();
    const netConsumed = key(KEY_ENTER);
    const netMessageOpen = doomstat.menuactive;
    const netDismissed = key(0x78 /*x*/);
    const netClosed = doomstat.menuactive === false;

    // Active single-player: ENDGAME is a confirmation; N closes without
    // leaving the level, while Y schedules and enters the title attract loop.
    doomstat.set_netgame(false);
    openOptions();
    const confirmConsumed = key(KEY_ENTER);
    const unsupported = key(KEY_ENTER);
    const confirmStillOpen = doomstat.menuactive;
    const declined = key(0x6e /*n*/);
    const declinedStayedInGame = doomstat.usergame && doomstat.gamestate === 0;

    openOptions();
    key(KEY_ENTER);
    doomstat.set_gameaction(gameaction_t.ga_completed);
    const accepted = key(0x79 /*y*/);
    const closedImmediately = doomstat.menuactive === false;
    const deadline = performance.now() + 2000;
    while ((doomstat.gamestate !== 3 || doomstat.usergame !== false) &&
           performance.now() < deadline) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const title = {
      gamestate: doomstat.gamestate,
      usergame: doomstat.usergame,
      gameaction: doomstat.gameaction,
      demoplayback: doomstat.demoplayback,
    };
    menu.M_ClearMenus();
    return {
      optionsMismatch,
      inactiveConsumed, inactiveStayedOpen, inactiveMismatch,
      netConsumed, netMessageOpen, netDismissed, netClosed,
      confirmConsumed, unsupported, confirmStillOpen, declined,
      declinedStayedInGame, accepted, closedImmediately, title,
    };
  });

  const failures = [];
  if (result.optionsMismatch !== 0) failures.push(`Options pixels: ${result.optionsMismatch}`);
  if (!result.inactiveConsumed || !result.inactiveStayedOpen || result.inactiveMismatch !== 0) {
    failures.push(`inactive route: ${JSON.stringify(result)}`);
  }
  if (!result.netConsumed || !result.netMessageOpen || !result.netDismissed || !result.netClosed) {
    failures.push(`netgame route: ${JSON.stringify(result)}`);
  }
  if (!result.confirmConsumed || result.unsupported || !result.confirmStillOpen ||
      !result.declined || !result.declinedStayedInGame) {
    failures.push(`confirmation decline: ${JSON.stringify(result)}`);
  }
  if (!result.accepted || !result.closedImmediately || result.title.gamestate !== 3 ||
      result.title.usergame !== false || result.title.gameaction !== 0 ||
      result.title.demoplayback !== false) {
    failures.push(`title lifecycle: ${JSON.stringify(result)}`);
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
