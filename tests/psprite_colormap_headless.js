import { R_CreatePspriteCanvasInfo } from '../src/r_psprite.js';
import {
  PSPRITE_SHADOW_ROW,
  R_PspriteColormapRow,
  SPRITE_FF_FULLBRIGHT,
  SPRITE_SHADOW_PALETTE_INDEX,
} from '../src/r_sprite_logic.js';
import { V_InitPlaypal, V_SetPaletteIndex } from '../src/v_palette.js';
import { W_CacheLumpName, W_InitMultipleFiles } from '../src/w_wad.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function sourceInfo(indices, alphas = new Uint8Array(indices.length).fill(255)) {
  return {
    indices: Uint8Array.from(indices),
    alphas,
    w: indices.length,
    h: 1,
    leftoffset: 0,
    topoffset: 0,
    canvases: new Map(),
  };
}

function assertCanvasPixels(info, source, row, maps, playpal, paletteIndex, label) {
  V_SetPaletteIndex(paletteIndex);
  const pixels = info.canvas.getContext('2d').getImageData(0, 0, info.w, info.h).data;
  for (let i = 0; i < source.indices.length; i++) {
    const mapped = row === PSPRITE_SHADOW_ROW
      ? SPRITE_SHADOW_PALETTE_INDEX
      : maps[row * 256 + source.indices[i]];
    const expected = paletteIndex * 768 + mapped * 3;
    assertEquals(pixels[i * 4 + 0], playpal[expected + 0], `${label} pixel ${i} red`);
    assertEquals(pixels[i * 4 + 1], playpal[expected + 1], `${label} pixel ${i} green`);
    assertEquals(pixels[i * 4 + 2], playpal[expected + 2], `${label} pixel ${i} blue`);
    assertEquals(pixels[i * 4 + 3], source.alphas[i], `${label} pixel ${i} alpha`);
  }
}

async function run() {
  const wad = await fetch('../doom1.wad').then((response) => response.arrayBuffer());
  W_InitMultipleFiles([{ name: 'doom1.wad', buffer: wad }]);
  const playpal = W_CacheLumpName('PLAYPAL', 0);
  const maps = W_CacheLumpName('COLORMAP', 0);
  V_InitPlaypal(playpal);

  const source = sourceInfo([0, 1, 0x70, 0x7f, 128, 255]);
  const cases = [
    ['dark normal', R_PspriteColormapRow(false, 0, 0, 0, 0)],
    ['lit normal', R_PspriteColormapRow(false, 0, 0, 128, 1)],
    ['fullbright', R_PspriteColormapRow(false, 0, SPRITE_FF_FULLBRIGHT, 0, 0)],
    ['fixed inverse', R_PspriteColormapRow(false, 32, SPRITE_FF_FULLBRIGHT, 0, 0)],
    ['invisible', R_PspriteColormapRow(true, 32, SPRITE_FF_FULLBRIGHT, 255, 2)],
  ];

  for (const [label, row] of cases) {
    const info = R_CreatePspriteCanvasInfo(source, row, maps);
    // Reuse the same cached remap while switching between base, damage, and
    // radiation palettes. This catches accidental conversion straight to RGB.
    for (const palette of [0, 8, 13]) {
      assertCanvasPixels(info, source, row, maps, playpal, palette, `${label} palette ${palette}`);
    }
  }

  const transparent = sourceInfo([0x70], new Uint8Array([0]));
  const transparentInfo = R_CreatePspriteCanvasInfo(transparent, 31, maps);
  V_SetPaletteIndex(8);
  assertEquals(
    transparentInfo.canvas.getContext('2d').getImageData(0, 0, 1, 1).data[3],
    0,
    'transparent patch surround remains transparent',
  );

  return { ok: true, cases: cases.length, palettes: 3, pixelsPerCase: source.indices.length };
}

run().then((result) => {
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
}).catch((error) => {
  const result = { ok: false, error: error.stack ?? String(error) };
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
});
