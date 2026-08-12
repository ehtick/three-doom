// Real-WAD and lifecycle checks for closed-menu function-key shortcuts.

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
    const {
      GameMode_t, KEY_BACKSPACE, KEY_ENTER, KEY_ESCAPE,
      KEY_F2, KEY_F3, KEY_F4, KEY_F5, KEY_F6, KEY_F7, KEY_F8, KEY_F9, KEY_F10,
    } = await import('/src/doomdef.js');
    const loop = await import('/src/d_loop.js');
    const hu = await import('/src/hu_stuff.js');
    const menu = await import('/src/m_menu.js');
    const video = await import('/src/v_video.js');
    loop.D_DoomRafLoop.stop();

    const key = (data1) => menu.M_Responder({ type: 0, data1, data2: 0, data3: 0 });
    function makeCanvas() {
      const value = document.createElement('canvas');
      value.width = 320;
      value.height = 200;
      return value;
    }
    function patch(ctx, name, x, y) {
      video.V_DrawPatchAtCanvas(ctx, video.V_DecodePatchToCanvas(name), x, y, 1, 1);
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
      let mismatch = 0;
      for (let i = 0; i < a.length; i++) if (a[i] !== e[i]) mismatch++;
      return mismatch;
    }
    function compareOpaquePatch(canvas, name, anchorX, anchorY) {
      const actual = canvas.getContext('2d').getImageData(0, 0, 320, 200).data;
      const value = video.V_DecodePatchToCanvas(name);
      const expected = value.canvas.getContext('2d')
        .getImageData(0, 0, value.w, value.h).data;
      let opaque = 0;
      let mismatch = 0;
      for (let y = 0; y < value.h; y++) {
        for (let x = 0; x < value.w; x++) {
          const pi = (y * value.w + x) * 4;
          if (expected[pi + 3] === 0) continue;
          opaque++;
          const ax = anchorX - value.leftoffset + x;
          const ay = anchorY - value.topoffset + y;
          const ai = (ay * 320 + ax) * 4;
          for (let c = 0; c < 4; c++) {
            if (actual[ai + c] !== expected[pi + c]) mismatch++;
          }
        }
      }
      return { opaque, mismatch };
    }
    function drawMenu() {
      const canvas = makeCanvas();
      menu.M_Drawer(canvas.getContext('2d'), 0, 0, 320, 200);
      return canvas;
    }

    menu.M_ClearMenus();
    menu.M_Init();
    doomstat.set_gamemode(GameMode_t.registered);
    doomstat.set_gamestate(0 /*GS_LEVEL*/);
    doomstat.set_demoplayback(false);
    doomstat.set_netgame(false);

    // F4 enters SoundDef at sfx_vol. Compare every pixel to an independent
    // transcription of M_DrawSound + SoundMenu + the row-zero cursor.
    const f4Consumed = key(KEY_F4);
    const f4Actual = drawMenu();
    const f4Expected = makeCanvas();
    const f4ctx = f4Expected.getContext('2d');
    patch(f4ctx, 'M_SVOL', 60, 38);
    patch(f4ctx, 'M_SFXVOL', 80, 64);
    patch(f4ctx, 'M_MUSVOL', 80, 96);
    thermo(f4ctx, 80, 80, 16, doomstat.snd_SfxVolume);
    thermo(f4ctx, 80, 112, 16, doomstat.snd_MusicVolume);
    patch(f4ctx, 'M_SKULL1', 48, 59);
    const f4Mismatch = mismatchCount(f4Actual, f4Expected);
    const f4BackToOptions = key(KEY_BACKSPACE);
    const optionsCursor = compareOpaquePatch(drawMenu(), 'M_SKULL1', 28, 32);
    const f4BackToMain = key(KEY_BACKSPACE);
    const mainCursor = compareOpaquePatch(drawMenu(), 'M_SKULL1', 65, 59);
    key(KEY_ESCAPE);

    // F5 changes detail without opening the menu; the Options indicator then
    // comes from the real M_GDLOW patch. F5 while open remains unhandled.
    const f5Consumed = key(KEY_F5);
    const f5StayedClosed = doomstat.menuactive === false;
    key(KEY_ESCAPE);
    key('o'.charCodeAt(0));
    key(KEY_ENTER);
    const detailLow = compareOpaquePatch(drawMenu(), 'M_GDLOW', 235, 53);
    const activeF5Consumed = key(KEY_F5);
    const detailStillLow = compareOpaquePatch(drawMenu(), 'M_GDLOW', 235, 53);
    key(KEY_ESCAPE);

    // F8 changes the setting first and queues the exact forced confirmation.
    const f8OffConsumed = key(KEY_F8);
    const f8Off = {
      showMessages: hu.showMessages,
      message: doomstat.players[doomstat.consoleplayer].message,
      menuactive: doomstat.menuactive,
    };
    const f8OnConsumed = key(KEY_F8);
    const f8On = {
      showMessages: hu.showMessages,
      message: doomstat.players[doomstat.consoleplayer].message,
      menuactive: doomstat.menuactive,
    };

    // F7 is consumed in both the inactive oof path and active prompt path.
    doomstat.set_usergame(false);
    const f7InactiveConsumed = key(KEY_F7);
    const f7InactiveClosed = doomstat.menuactive === false;
    doomstat.set_usergame(true);
    const f7ActiveConsumed = key(KEY_F7);
    const f7PromptOpen = doomstat.menuactive;
    const f7Unsupported = key('x'.charCodeAt(0));
    const f7Declined = key('n'.charCodeAt(0));
    const f7Closed = doomstat.menuactive === false;

    // F10 opens its y/n prompt.
    const f10Consumed = key(KEY_F10);
    const f10PromptOpen = doomstat.menuactive;
    const f10Unsupported = key(KEY_ENTER);
    const f10Declined = key('n'.charCodeAt(0));
    const f10Closed = doomstat.menuactive === false;
    // The native Save/Load shortcut family is available again. F2/F3 open
    // their screens, F6 asks the user to choose an initial quick slot, and a
    // subsequent F9 reports that no completed quick slot exists yet.
    const f2Consumed = key(KEY_F2);
    const f2Open = doomstat.menuactive;
    const f2Closed = key(KEY_ESCAPE) && doomstat.menuactive === false;
    const f3Consumed = key(KEY_F3);
    const f3Open = doomstat.menuactive;
    const f3Closed = key(KEY_ESCAPE) && doomstat.menuactive === false;
    const f6Consumed = key(KEY_F6);
    const f6PickOpen = doomstat.menuactive;
    const f6Closed = key(KEY_ESCAPE) && doomstat.menuactive === false;
    const f9Consumed = key(KEY_F9);
    const f9NoSlotPrompt = doomstat.menuactive;
    const f9Dismissed = key(KEY_ENTER) && doomstat.menuactive === false;

    return {
      f4Consumed,
      f4Mismatch,
      f4BackToOptions,
      optionsCursor,
      f4BackToMain,
      mainCursor,
      f5Consumed,
      f5StayedClosed,
      detailLow,
      activeF5Consumed,
      detailStillLow,
      f8OffConsumed,
      f8Off,
      f8OnConsumed,
      f8On,
      f7InactiveConsumed,
      f7InactiveClosed,
      f7ActiveConsumed,
      f7PromptOpen,
      f7Unsupported,
      f7Declined,
      f7Closed,
      f10Consumed,
      f10PromptOpen,
      f10Unsupported,
      f10Declined,
      f10Closed,
      f2Consumed,
      f2Open,
      f2Closed,
      f3Consumed,
      f3Open,
      f3Closed,
      f6Consumed,
      f6PickOpen,
      f6Closed,
      f9Consumed,
      f9NoSlotPrompt,
      f9Dismissed,
    };
  });

  const failures = [];
  for (const name of [
    'f4Consumed', 'f4BackToOptions', 'f4BackToMain', 'f5Consumed',
    'f5StayedClosed', 'f8OffConsumed', 'f8OnConsumed',
    'f7InactiveConsumed', 'f7InactiveClosed', 'f7ActiveConsumed',
    'f7PromptOpen', 'f7Declined', 'f7Closed', 'f10Consumed',
    'f10PromptOpen', 'f10Declined', 'f10Closed', 'f2Consumed', 'f2Open',
    'f2Closed', 'f3Consumed', 'f3Open', 'f3Closed', 'f6Consumed',
    'f6PickOpen', 'f6Closed', 'f9Consumed', 'f9NoSlotPrompt', 'f9Dismissed',
  ]) {
    if (result[name] !== true) failures.push(`${name}: ${result[name]}`);
  }
  if (result.f4Mismatch !== 0) failures.push(`F4 pixels: ${result.f4Mismatch}`);
  for (const name of ['optionsCursor', 'mainCursor', 'detailLow', 'detailStillLow']) {
    const value = result[name];
    if (value.opaque === 0 || value.mismatch !== 0) {
      failures.push(`${name}: ${JSON.stringify(value)}`);
    }
  }
  if (result.activeF5Consumed !== false) failures.push(`active F5: ${result.activeF5Consumed}`);
  if (result.f8Off.showMessages !== false || result.f8Off.message !== 'Messages OFF' ||
      result.f8Off.menuactive !== false) failures.push(`F8 off: ${JSON.stringify(result.f8Off)}`);
  if (result.f8On.showMessages !== true || result.f8On.message !== 'Messages ON' ||
      result.f8On.menuactive !== false) failures.push(`F8 on: ${JSON.stringify(result.f8On)}`);
  if (result.f7Unsupported !== false) failures.push(`F7 unsupported: ${result.f7Unsupported}`);
  if (result.f10Unsupported !== false) failures.push(`F10 unsupported: ${result.f10Unsupported}`);
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
