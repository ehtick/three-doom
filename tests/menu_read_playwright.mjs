// Real/synthetic-WAD pixel and navigation checks for ReadDef1/ReadDef2.

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
    const { GameMode_t, gamestate_t, KEY_BACKSPACE, KEY_DOWNARROW, KEY_ENTER, KEY_F1 } =
      await import('/src/doomdef.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');
    const video = await import('/src/v_video.js');
    const wad = await import('/src/w_wad.js');
    loop.D_DoomRafLoop.stop();

    function makeCanvas() {
      const value = document.createElement('canvas');
      value.width = 320;
      value.height = 200;
      return value;
    }
    function patch(ctx, name, x, y) {
      const value = video.V_DecodePatchToCanvas(name);
      if (value === null) throw new Error(`missing patch ${name}`);
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
    function actualCanvas() {
      const value = makeCanvas();
      menu.M_Drawer(value.getContext('2d'), 0, 0, 320, 200);
      return value;
    }
    function expectedMain(commercial, selected = 0) {
      const value = makeCanvas();
      const ctx = value.getContext('2d');
      const y = commercial ? 72 : 64;
      const names = commercial
        ? ['M_NGAME', 'M_OPTION', 'M_QUITG']
        : ['M_NGAME', 'M_OPTION', 'M_RDTHIS', 'M_QUITG'];
      patch(ctx, 'M_DOOM', 94, 2);
      for (let i = 0; i < names.length; i++) patch(ctx, names[i], 97, y + i * 16);
      patch(ctx, 'M_SKULL1', 65, y - 5 + selected * 16);
      return value;
    }
    function expectedHelp(name, secondPage = false, commercialFirst = false) {
      const value = makeCanvas();
      const ctx = value.getContext('2d');
      patch(ctx, name, 0, 0);
      patch(
        ctx,
        'M_SKULL1',
        secondPage || commercialFirst ? 298 : 248,
        secondPage ? 170 : (commercialFirst ? 160 : 180),
      );
      return value;
    }
    const key = (data1) => menu.M_Responder({ type: 0, data1, data2: 0, data3: 0 });
    function openMain(mode, inLevel = false) {
      menu.M_ClearMenus();
      doomstat.set_gamemode(mode);
      doomstat.set_demoplayback(false);
      doomstat.set_gamestate(inLevel ? gamestate_t.GS_LEVEL : gamestate_t.GS_DEMOSCREEN);
      menu.M_Init();
      menu.M_StartControlPanel();
    }
    function testTwoPage(mode, secondPatch) {
      openMain(mode);
      const mainMismatch = mismatchCount(actualCanvas(), expectedMain(false));
      key(KEY_DOWNARROW);
      key(KEY_DOWNARROW);
      key(KEY_ENTER); // Read This -> ReadDef1.
      const firstMismatch = mismatchCount(actualCanvas(), expectedHelp('HELP1'));
      key(KEY_ENTER); // ReadDef1 -> ReadDef2.
      const secondMismatch = mismatchCount(actualCanvas(), expectedHelp(secondPatch, true));
      key(KEY_ENTER); // M_FinishReadThis -> MainDef, still active.
      const finishMismatch = mismatchCount(actualCanvas(), expectedMain(false, 2));
      return {
        mainMismatch, firstMismatch, secondMismatch, finishMismatch,
        activeAfterFinish: doomstat.menuactive,
      };
    }

    const shareware = testTwoPage(GameMode_t.shareware, 'HELP2');
    const registered = testTwoPage(GameMode_t.registered, 'HELP2');
    const retail = testTwoPage(GameMode_t.retail, 'CREDIT');

    // Retail F1 starts directly on ReadDef2/CREDIT; Backspace follows its
    // source prevMenu link to ReadDef1/HELP1.
    menu.M_ClearMenus();
    doomstat.set_gamemode(GameMode_t.retail);
    doomstat.set_gamestate(gamestate_t.GS_DEMOSCREEN);
    menu.M_Init();
    const retailF1Consumed = key(KEY_F1);
    const retailF1Mismatch = mismatchCount(actualCanvas(), expectedHelp('CREDIT', true));
    const retailBack = key(KEY_BACKSPACE);
    const retailBackMismatch = mismatchCount(actualCanvas(), expectedHelp('HELP1'));

    // Commercial removes Read This, shifts the real remaining rows down 8,
    // and Continue prefixes only the rows that actually exist in this port.
    openMain(GameMode_t.commercial);
    const commercialMain = expectedMain(true);
    const commercialMainMismatch = mismatchCount(actualCanvas(), commercialMain);
    key(KEY_DOWNARROW);
    key(KEY_DOWNARROW); // Quit is the third and final visible row.
    const commercialQuit = key(KEY_ENTER);
    const commercialQuitRejectsX = key(0x78 /*x*/) === false;
    const commercialQuitDismissed = key(0x6e /*n*/);

    openMain(GameMode_t.commercial, true);
    key(KEY_DOWNARROW);
    key(KEY_DOWNARROW);
    key(KEY_DOWNARROW); // Continue, New Game, Options, Quit.
    const commercialContinueQuit = key(KEY_ENTER);
    const commercialContinueRejectsX = key(0x78 /*x*/) === false;
    key(0x6e /*n*/);

    openMain(GameMode_t.shareware, true);
    key(KEY_DOWNARROW);
    key(KEY_DOWNARROW);
    key(KEY_DOWNARROW); // Continue, New Game, Options, Read This.
    const doom1ContinueRead = key(KEY_ENTER);
    const doom1ContinueHelpMismatch = mismatchCount(actualCanvas(), expectedHelp('HELP1'));

    // Build a one-lump PWAD that aliases real HELP1 pixels as Doom II's HELP.
    // This exercises the commercial-only name even though the bundled IWAD is
    // shareware and therefore has no native HELP lump.
    const helpBytes = wad.W_CacheLumpName('HELP1', 0).slice();
    const baseWad = await (await fetch('/doom1.wad')).arrayBuffer();
    const overlay = new Uint8Array(12 + helpBytes.length + 16);
    const view = new DataView(overlay.buffer);
    overlay.set([0x50, 0x57, 0x41, 0x44], 0); // PWAD
    view.setInt32(4, 1, true);
    view.setInt32(8, 12 + helpBytes.length, true);
    overlay.set(helpBytes, 12);
    const directory = 12 + helpBytes.length;
    view.setInt32(directory, 12, true);
    view.setInt32(directory + 4, helpBytes.length, true);
    overlay.set([0x48, 0x45, 0x4c, 0x50], directory + 8); // HELP
    wad.W_InitMultipleFiles([
      { name: 'doom1.wad', buffer: baseWad },
      { name: 'help.wad', buffer: overlay.buffer },
    ]);

    menu.M_ClearMenus();
    doomstat.set_gamemode(GameMode_t.commercial);
    doomstat.set_gamestate(gamestate_t.GS_DEMOSCREEN);
    menu.M_Init();
    const commercialF1Consumed = key(KEY_F1);
    const commercialHelpMismatch = mismatchCount(actualCanvas(), expectedHelp('HELP', false, true));
    const commercialFinish = key(KEY_ENTER);
    const commercialFinishMismatch = mismatchCount(actualCanvas(), commercialMain);
    const commercialOnePageActive = doomstat.menuactive;
    menu.M_ClearMenus();

    return {
      shareware, registered, retail,
      retailF1Consumed, retailF1Mismatch, retailBack, retailBackMismatch,
      commercialMainMismatch, commercialQuit, commercialQuitRejectsX,
      commercialQuitDismissed, commercialContinueQuit, commercialContinueRejectsX,
      doom1ContinueRead, doom1ContinueHelpMismatch,
      commercialF1Consumed, commercialHelpMismatch, commercialFinish,
      commercialFinishMismatch, commercialOnePageActive,
    };
  });

  const failures = [];
  for (const [mode, value] of Object.entries({
    shareware: result.shareware,
    registered: result.registered,
    retail: result.retail,
  })) {
    if (value.mainMismatch !== 0 || value.firstMismatch !== 0 ||
        value.secondMismatch !== 0 || value.finishMismatch !== 0 ||
        !value.activeAfterFinish) {
      failures.push(`${mode} pages: ${JSON.stringify(value)}`);
    }
  }
  if (!result.retailF1Consumed || result.retailF1Mismatch !== 0 ||
      !result.retailBack || result.retailBackMismatch !== 0) {
    failures.push(`retail F1: ${JSON.stringify(result)}`);
  }
  if (result.commercialMainMismatch !== 0 || !result.commercialQuit ||
      !result.commercialQuitRejectsX || !result.commercialQuitDismissed ||
      !result.commercialContinueQuit || !result.commercialContinueRejectsX) {
    failures.push(`commercial main rows: ${JSON.stringify(result)}`);
  }
  if (!result.doom1ContinueRead || result.doom1ContinueHelpMismatch !== 0) {
    failures.push(`Doom 1 Continue rows: ${JSON.stringify(result)}`);
  }
  if (!result.commercialF1Consumed || result.commercialHelpMismatch !== 0 ||
      !result.commercialFinish || result.commercialFinishMismatch !== 0 ||
      !result.commercialOnePageActive) {
    failures.push(`commercial synthetic HELP: ${JSON.stringify(result)}`);
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
