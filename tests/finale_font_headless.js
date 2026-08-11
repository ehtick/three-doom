import { E1TEXT } from '../src/d_englsh.js';
import { GameMode_t } from '../src/doomdef.js';
import {
  players, set_gameepisode, set_gamemap, set_gamemode,
} from '../src/doomstat.js';
import {
  F_CastPrint, F_Drawer, F_Shutdown, F_StartFinale, F_Ticker,
} from '../src/f_finale.js';
import { HU_FONTSTART, HU_GetFont } from '../src/hu_font.js';
import { HU_Drawer, HU_QueueMessage } from '../src/hu_stuff.js';
import { V_InitPlaypal } from '../src/v_palette.js';
import { W_CacheLumpName, W_InitMultipleFiles } from '../src/w_wad.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function fontGlyph(font, code) {
  if (code >= 97 && code <= 122) code -= 32;
  const index = code - HU_FONTSTART;
  return index >= 0 && index < font.length ? font[index] : null;
}

// Independent transcription of f_finale.c:F_TextWrite's layout loop. This is
// deliberately separate from HU_LayoutText so the browser test can catch a
// wrong production layout while using the real WAD patch pixels.
function drawReferenceFinaleText(ctx, text, count, font) {
  let cx = 10;
  let cy = 10;
  for (let i = 0; i < text.length && i < count; i++) {
    const code = text.charCodeAt(i);
    if (code === 10) {
      cx = 10;
      cy += 11;
      continue;
    }
    const glyph = fontGlyph(font, code);
    if (glyph === null || glyph === undefined) {
      cx += 4;
      continue;
    }
    if (cx + glyph.w > 320) break;
    ctx.drawImage(
      glyph.canvas,
      cx - glyph.leftoffset,
      cy - glyph.topoffset,
      glyph.w,
      glyph.h,
    );
    cx += glyph.w;
  }
}

function drawReferenceCastText(ctx, text, font) {
  let width = 0;
  for (let i = 0; i < text.length; i++) {
    const glyph = fontGlyph(font, text.charCodeAt(i));
    width += glyph === null || glyph === undefined ? 4 : glyph.w;
  }
  let cx = 160 - Math.trunc(width / 2);
  for (let i = 0; i < text.length; i++) {
    const glyph = fontGlyph(font, text.charCodeAt(i));
    if (glyph === null || glyph === undefined) {
      cx += 4;
      continue;
    }
    ctx.drawImage(
      glyph.canvas,
      cx - glyph.leftoffset,
      180 - glyph.topoffset,
      glyph.w,
      glyph.h,
    );
    cx += glyph.w;
  }
  return width;
}

function drawReferenceHudText(ctx, text, font) {
  let cx = 0;
  for (let i = 0; i < text.length; i++) {
    const glyph = fontGlyph(font, text.charCodeAt(i));
    if (glyph === null || glyph === undefined) {
      cx += 4;
      continue;
    }
    ctx.drawImage(
      glyph.canvas,
      cx - glyph.leftoffset,
      -glyph.topoffset,
      glyph.w,
      glyph.h,
    );
    cx += glyph.w;
  }
}

function compareCanvas(actual, expected, label) {
  const a = actual.getContext('2d').getImageData(0, 0, 320, 200).data;
  const e = expected.getContext('2d').getImageData(0, 0, 320, 200).data;
  let mismatchedChannels = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== e[i]) mismatchedChannels++;
  }
  assertEquals(mismatchedChannels, 0, `${label} canvas pixels`);
}

function changedPixels(before, after) {
  const a = before.getContext('2d').getImageData(0, 0, 320, 200).data;
  const b = after.getContext('2d').getImageData(0, 0, 320, 200).data;
  let changed = 0;
  for (let i = 0; i < a.length; i += 4) {
    if (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2] || a[i + 3] !== b[i + 3]) {
      changed++;
    }
  }
  return changed;
}

async function run() {
  const wad = await fetch('../doom1.wad').then((response) => response.arrayBuffer());
  W_InitMultipleFiles([{ name: 'doom1.wad', buffer: wad }]);
  V_InitPlaypal(W_CacheLumpName('PLAYPAL', 0));
  const font = HU_GetFont();

  // The extraction must leave the gameplay HUD's existing STCFN rendering
  // unchanged as well.
  players[0] = { mo: {}, cmd: { buttons: 0 } };
  HU_QueueMessage('a-b');
  const actualHud = makeCanvas();
  HU_Drawer(actualHud.ctx, 0, 0, 320, 200);
  const expectedHud = makeCanvas();
  drawReferenceHudText(expectedHud.ctx, 'a-b', font);
  compareCanvas(actualHud.canvas, expectedHud.canvas, 'HU_Drawer');
  const hudPixels = changedPixels(makeCanvas().canvas, actualHud.canvas);
  if (hudPixels === 0) throw new Error('HU_Drawer drew no WAD glyph pixels');

  // Exercise F_TextWrite through the public finale drawer. Reveal through the
  // first comma so the sample includes lowercase, spaces, newlines, and a WAD
  // glyph with a negative top origin.
  set_gamemode(GameMode_t.shareware);
  set_gameepisode(1);
  set_gamemap(8);
  for (let i = 0; i < players.length; i++) players[i] = undefined;
  F_StartFinale(() => {});

  const base = makeCanvas();
  F_Drawer(base.ctx, 0, 0, 320, 200);
  const revealCount = E1TEXT.indexOf(',') + 1;
  const finalecount = 10 + revealCount * 3;
  for (let tic = 0; tic < finalecount; tic++) F_Ticker();

  const actualText = makeCanvas();
  F_Drawer(actualText.ctx, 0, 0, 320, 200);
  const expectedText = makeCanvas();
  expectedText.ctx.drawImage(base.canvas, 0, 0);
  drawReferenceFinaleText(expectedText.ctx, E1TEXT, revealCount, font);
  compareCanvas(actualText.canvas, expectedText.canvas, 'F_TextWrite');
  const textPixels = changedPixels(base.canvas, actualText.canvas);
  if (textPixels === 0) throw new Error('F_TextWrite drew no WAD glyph pixels');

  // Use a lowercase sample to prove uppercase conversion and a hyphen whose
  // STCFN patch has a non-zero top origin in the bundled IWAD.
  const hyphen = font['-'.charCodeAt(0) - HU_FONTSTART];
  if (hyphen === null || hyphen === undefined || hyphen.topoffset === 0) {
    throw new Error('real STCFN045 origin fixture is missing');
  }
  const castText = 'a-b';
  const actualCast = makeCanvas();
  F_CastPrint(actualCast.ctx, castText, 0, 0, 320, 200);
  const expectedCast = makeCanvas();
  const castWidth = drawReferenceCastText(expectedCast.ctx, castText, font);
  compareCanvas(actualCast.canvas, expectedCast.canvas, 'F_CastPrint');
  const castPixels = changedPixels(makeCanvas().canvas, actualCast.canvas);
  if (castPixels === 0) throw new Error('F_CastPrint drew no WAD glyph pixels');

  F_Shutdown();
  return {
    ok: true,
    revealCount,
    finalecount,
    textPixels,
    castWidth,
    castPixels,
    hudPixels,
    hyphenTopOffset: hyphen.topoffset,
  };
}

run().then((result) => {
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
}).catch((error) => {
  const result = { ok: false, error: error.stack ?? String(error) };
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
});
