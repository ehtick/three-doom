// Real-WAD pixel and lifecycle checks for the native Load/Save menus.

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
      GameMode_t, KEY_BACKSPACE, KEY_ENTER, KEY_ESCAPE, KEY_F2, KEY_F6, KEY_F9,
      gamestate_t,
    } = await import('/src/doomdef.js');
    const { gameaction_t } = await import('/src/d_event.js');
    const game = await import('/src/g_game.js');
    const { HU_FONTSTART, HU_GetFont } = await import('/src/hu_font.js');
    const { I_TranslateKey } = await import('/src/i_video.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');
    const video = await import('/src/v_video.js');
    loop.D_DoomRafLoop.stop();

    const key = (data1) => menu.M_Responder({ type: 0, data1, data2: 0, data3: 0 });
    const letter = (value) => value.charCodeAt(0);
    function canvas() {
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
    function glyph(font, character) {
      let code = character.charCodeAt(0);
      if (code >= 97 && code <= 122) code -= 32;
      const index = code - HU_FONTSTART;
      return index >= 0 && index < font.length ? font[index] : null;
    }
    function textWidth(text, font) {
      let width = 0;
      for (const character of text) width += glyph(font, character)?.w ?? 4;
      return width;
    }
    function drawText(ctx, text, x, y, font, maxX = Infinity) {
      for (const character of text) {
        const value = glyph(font, character);
        if (value === null) { x += 4; continue; }
        if (x + value.w > maxX) break;
        ctx.drawImage(
          value.canvas,
          x - value.leftoffset,
          y - value.topoffset,
          value.w,
          value.h,
        );
        x += value.w;
      }
    }
    function border(ctx, x, y) {
      patch(ctx, 'M_LSLEFT', x - 8, y + 7);
      for (let i = 0; i < 24; i++) patch(ctx, 'M_LSCNTR', x + i * 8, y + 7);
      patch(ctx, 'M_LSRGHT', x + 24 * 8, y + 7);
    }
    function drawSlotReference(header, names, selected, editSlot = -1) {
      const value = canvas();
      const ctx = value.getContext('2d');
      const font = HU_GetFont();
      patch(ctx, header, 72, 28);
      for (let i = 0; i < 6; i++) {
        const y = 54 + i * 16;
        border(ctx, 80, y);
        drawText(ctx, names[i], 80, y, font);
      }
      if (editSlot >= 0) {
        drawText(
          ctx,
          '_',
          80 + textWidth(names[editSlot], font),
          54 + editSlot * 16,
          font,
        );
      }
      patch(ctx, 'M_SKULL1', 48, 49 + selected * 16);
      return value;
    }
    function drawMessageReference(text) {
      const value = canvas();
      const ctx = value.getContext('2d');
      const font = HU_GetFont();
      const lines = text.split('\n');
      let y = 100 - Math.trunc(font[0].h * lines.length / 2);
      for (const line of lines) {
        const x = 160 - Math.trunc(textWidth(line, font) / 2);
        drawText(ctx, line, x, y, font, 320);
        y += font[0].h;
      }
      return value;
    }
    function actualCanvas() {
      const value = canvas();
      menu.M_Drawer(value.getContext('2d'), 0, 0, 320, 200);
      return value;
    }
    function mismatchCount(leftCanvas, rightCanvas) {
      const left = leftCanvas.getContext('2d').getImageData(0, 0, 320, 200).data;
      const right = rightCanvas.getContext('2d').getImageData(0, 0, 320, 200).data;
      let mismatch = 0;
      for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) mismatch++;
      return mismatch;
    }

    const records = [
      null,
      { slot: 1, description: 'E1M1' },
      null,
      null,
      { slot: 4, description: 'lower case' },
      null,
    ];
    const listedNames = ['empty slot', 'E1M1', 'empty slot', 'empty slot', 'lower case', 'empty slot'];
    const saveCalls = [];
    const loadCalls = [];
    menu.M_SetExternals({ listSaves: () => records });
    game.G_SetExternals({
      saveGame: (slot, description) => {
        saveCalls.push({ slot, description });
        return true;
      },
      readSave: (slot) => {
        loadCalls.push(slot);
        return null;
      },
    });

    menu.M_ClearMenus();
    menu.M_Init();
    doomstat.set_gamemode(GameMode_t.registered);
    doomstat.set_gamestate(gamestate_t.GS_LEVEL);
    doomstat.set_demoplayback(false);
    doomstat.set_netgame(false);
    doomstat.set_usergame(true);
    doomstat.set_gameaction(gameaction_t.ga_nothing);
    const deleteMapsBackspace = I_TranslateKey({ code: 'Delete', key: 'Delete' }) ===
      KEY_BACKSPACE;

    menu.M_StartControlPanel(false);
    key(letter('l'));
    key(KEY_ENTER);
    const loadMismatch = mismatchCount(
      actualCanvas(),
      drawSlotReference('M_LOADG', listedNames, 0),
    );
    const emptyLoadConsumed = key(KEY_ENTER);
    const emptyLoadStayedOpen = doomstat.menuactive === true &&
      doomstat.gameaction === gameaction_t.ga_nothing;
    const loadAlphaConsumed = key(letter('2'));
    const occupiedLoadConsumed = key(KEY_ENTER);
    const occupiedLoadQueued = doomstat.menuactive === false &&
      doomstat.gameaction === gameaction_t.ga_loadgame;
    game.G_Ticker();

    const f2Consumed = key(KEY_F2);
    const saveMismatch = mismatchCount(
      actualCanvas(),
      drawSlotReference('M_SAVEG', listedNames, 0),
    );
    key(letter('2'));
    key(KEY_ENTER);
    const occupiedEditMismatch = mismatchCount(
      actualCanvas(),
      drawSlotReference('M_SAVEG', listedNames, 1, 1),
    );
    const occupiedEditCancelled = key(KEY_ESCAPE);
    const cancelRestoreMismatch = mismatchCount(
      actualCanvas(),
      drawSlotReference('M_SAVEG', listedNames, 1),
    );

    key(letter('3'));
    key(KEY_ENTER);
    const emptyEditFinished = key(KEY_ENTER);
    const emptyEditStayedOpen = doomstat.menuactive === true &&
      doomstat.gameaction === gameaction_t.ga_nothing;
    key(KEY_ENTER);
    key(letter('a'));
    key(letter('b'));
    const editedNames = listedNames.slice();
    editedNames[2] = 'AB';
    const emptyEditMismatch = mismatchCount(
      actualCanvas(),
      drawSlotReference('M_SAVEG', editedNames, 2, 2),
    );
    const editBackspaceConsumed = key(KEY_BACKSPACE);
    key(letter('b'));
    const saveCommitConsumed = key(KEY_ENTER);
    const saveCommitQueued = doomstat.menuactive === false &&
      doomstat.gameaction === gameaction_t.ga_savegame;
    game.G_Ticker();

    const firstQuickSaveConsumed = key(KEY_F6);
    const quickPickerOpen = doomstat.menuactive === true;
    key(letter('5'));
    key(KEY_ENTER);
    const quickNameCommit = key(KEY_ENTER);
    const quickSaveQueued = doomstat.menuactive === false &&
      doomstat.gameaction === gameaction_t.ga_savegame;
    game.G_Ticker();

    const quickSavePromptConsumed = key(KEY_F6);
    const quickSavePrompt = "quicksave over your game named\n\n'lower case'?\n\npress y or n.";
    const quickSavePromptMismatch = mismatchCount(
      actualCanvas(),
      drawMessageReference(quickSavePrompt),
    );
    const quickSaveDeclined = key(letter('n'));
    const saveCountAfterDecline = saveCalls.length;

    const quickLoadPromptConsumed = key(KEY_F9);
    const quickLoadPrompt = "do you want to quickload the game named\n\n'lower case'?\n\npress y or n.";
    const quickLoadPromptMismatch = mismatchCount(
      actualCanvas(),
      drawMessageReference(quickLoadPrompt),
    );
    const quickLoadAccepted = key(letter('y'));
    const quickLoadQueued = doomstat.menuactive === false &&
      doomstat.gameaction === gameaction_t.ga_loadgame;
    game.G_Ticker();

    return {
      loadMismatch,
      deleteMapsBackspace,
      emptyLoadConsumed,
      emptyLoadStayedOpen,
      loadAlphaConsumed,
      occupiedLoadConsumed,
      occupiedLoadQueued,
      loadCalls,
      f2Consumed,
      saveMismatch,
      occupiedEditMismatch,
      occupiedEditCancelled,
      cancelRestoreMismatch,
      emptyEditFinished,
      emptyEditStayedOpen,
      emptyEditMismatch,
      editBackspaceConsumed,
      saveCommitConsumed,
      saveCommitQueued,
      saveCalls,
      firstQuickSaveConsumed,
      quickPickerOpen,
      quickNameCommit,
      quickSaveQueued,
      quickSavePromptConsumed,
      quickSavePromptMismatch,
      quickSaveDeclined,
      saveCountAfterDecline,
      quickLoadPromptConsumed,
      quickLoadPromptMismatch,
      quickLoadAccepted,
      quickLoadQueued,
    };
  });

  const failures = [];
  for (const name of [
    'deleteMapsBackspace', 'emptyLoadConsumed', 'emptyLoadStayedOpen', 'loadAlphaConsumed',
    'occupiedLoadConsumed', 'occupiedLoadQueued', 'f2Consumed',
    'occupiedEditCancelled', 'emptyEditFinished', 'emptyEditStayedOpen',
    'editBackspaceConsumed', 'saveCommitConsumed', 'saveCommitQueued',
    'firstQuickSaveConsumed', 'quickPickerOpen', 'quickNameCommit',
    'quickSaveQueued', 'quickSavePromptConsumed', 'quickSaveDeclined',
    'quickLoadPromptConsumed', 'quickLoadAccepted', 'quickLoadQueued',
  ]) {
    if (result[name] !== true) failures.push(`${name}: ${result[name]}`);
  }
  for (const name of [
    'loadMismatch', 'saveMismatch', 'occupiedEditMismatch',
    'cancelRestoreMismatch', 'emptyEditMismatch', 'quickSavePromptMismatch',
    'quickLoadPromptMismatch',
  ]) {
    if (result[name] !== 0) failures.push(`${name}: ${result[name]}`);
  }
  if (JSON.stringify(result.loadCalls) !== JSON.stringify([1, 4])) {
    failures.push(`numeric load slots: ${JSON.stringify(result.loadCalls)}`);
  }
  if (JSON.stringify(result.saveCalls) !== JSON.stringify([
    { slot: 2, description: 'AB' },
    { slot: 4, description: 'lower case' },
  ])) {
    failures.push(`numeric save slots/descriptions: ${JSON.stringify(result.saveCalls)}`);
  }
  if (result.saveCountAfterDecline !== 2) {
    failures.push(`declined quicksave queued a save: ${result.saveCountAfterDecline}`);
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
