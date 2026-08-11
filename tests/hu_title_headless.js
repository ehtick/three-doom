import { HUSTR_E1M1 } from '../src/d_englsh.js';
import { GameMode_t } from '../src/doomdef.js';
import {
  players,
  set_automapactive,
  set_gameepisode,
  set_gamemap,
  set_gamemode,
} from '../src/doomstat.js';
import { HU_FONTSTART, HU_GetFont } from '../src/hu_font.js';
import { HU_Drawer, HU_Start, HU_Ticker, HU_TITLEY } from '../src/hu_stuff.js';
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

function drawReferenceTitle(ctx, text, font) {
  let x = 0;
  for (let i = 0; i < text.length; i++) {
    const glyph = fontGlyph(font, text.charCodeAt(i));
    if (glyph === null || glyph === undefined) {
      x += 4;
      continue;
    }
    ctx.drawImage(
      glyph.canvas,
      x - glyph.leftoffset,
      HU_TITLEY - glyph.topoffset,
      glyph.w,
      glyph.h,
    );
    x += glyph.w;
  }
}

function changedPixels(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, 320, 200).data;
  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 0) changed++;
  }
  return changed;
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

async function run() {
  const wad = await fetch('../doom1.wad').then((response) => response.arrayBuffer());
  W_InitMultipleFiles([{ name: 'doom1.wad', buffer: wad }]);
  V_InitPlaypal(W_CacheLumpName('PLAYPAL', 0));
  const font = HU_GetFont();

  players[0] = { mo: {}, cmd: { buttons: 0 }, message: '' };
  set_gamemode(GameMode_t.shareware);
  set_gameepisode(1);
  set_gamemap(1);
  set_automapactive(false);
  HU_Start();

  const firstPerson = makeCanvas();
  HU_Drawer(firstPerson.ctx, 0, 0, 320, 200);
  assertEquals(changedPixels(firstPerson.canvas), 0, 'first-person title pixels');

  set_automapactive(true);
  const expected = makeCanvas();
  drawReferenceTitle(expected.ctx, HUSTR_E1M1, font);
  const automap = makeCanvas();
  HU_Drawer(automap.ctx, 0, 0, 320, 200);
  compareCanvas(automap.canvas, expected.canvas, 'automap title');
  const titlePixels = changedPixels(automap.canvas);
  if (titlePixels === 0) throw new Error('automap title drew no WAD glyph pixels');

  // The old port removed the title after five seconds. Vanilla keeps it for as
  // long as the automap remains active, so exercise well past that boundary.
  for (let tic = 0; tic < 10 * 35; tic++) HU_Ticker();
  const persistent = makeCanvas();
  HU_Drawer(persistent.ctx, 0, 0, 320, 200);
  compareCanvas(persistent.canvas, expected.canvas, 'persistent automap title');

  set_automapactive(false);
  const closed = makeCanvas();
  HU_Drawer(closed.ctx, 0, 0, 320, 200);
  assertEquals(changedPixels(closed.canvas), 0, 'closed-automap title pixels');

  return { ok: true, title: HUSTR_E1M1, titlePixels, persistentTics: 10 * 35 };
}

run().then((result) => {
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
}).catch((error) => {
  const result = { ok: false, error: error.stack ?? String(error) };
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
});
