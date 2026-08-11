import {
  V_FindClosestBasePaletteIndex, V_GetActivePalette, V_GetPalette,
  V_GetPaletteIndex, V_GetPaletteRevision, V_InitPlaypal, V_PaletteCSS,
  V_SetPaletteIndex,
} from '../src/v_palette.js';
import { gammatable } from '../src/v_video.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('PLAYPAL selection preserves exact RGB entries for every flash class', () => {
  const rgb = new Uint8Array(14 * 256 * 3);
  for (let palette = 0; palette < 14; palette++) {
    for (let index = 0; index < 256; index++) {
      const offset = palette * 768 + index * 3;
      rgb[offset + 0] = (palette * 17 + index * 3 + 1) & 255;
      rgb[offset + 1] = (palette * 29 + index * 5 + 2) & 255;
      rgb[offset + 2] = (palette * 43 + index * 7 + 3) & 255;
    }
  }

  const beforeInit = V_GetPaletteRevision();
  V_InitPlaypal(rgb);
  assertEquals(V_GetPaletteRevision(), beforeInit + 1, 'initialization revision');
  const initializedRevision = V_GetPaletteRevision();
  V_SetPaletteIndex(8);
  assertEquals(V_GetPaletteRevision(), initializedRevision + 1, 'selection invalidates cached canvases');
  V_SetPaletteIndex(8);
  assertEquals(V_GetPaletteRevision(), initializedRevision + 1, 'reselecting palette avoids needless invalidation');
  V_SetPaletteIndex(0);
  assertEquals(V_GetPaletteRevision(), initializedRevision + 2, 'return to base invalidates cached canvases');

  // Base, strongest damage red, first bonus, and radiation suit palettes.
  for (const [palette, index] of [[0, 37], [8, 103], [9, 176], [13, 231]]) {
    V_SetPaletteIndex(palette);
    assertEquals(V_GetPaletteIndex(), palette, `active palette ${palette}`);
    const actual = V_GetActivePalette();
    const rgbaOffset = index * 4;
    const rgbOffset = palette * 768 + index * 3;
    assertEquals(actual[rgbaOffset + 0], rgb[rgbOffset + 0], `palette ${palette} red`);
    assertEquals(actual[rgbaOffset + 1], rgb[rgbOffset + 1], `palette ${palette} green`);
    assertEquals(actual[rgbaOffset + 2], rgb[rgbOffset + 2], `palette ${palette} blue`);
    assertEquals(actual[rgbaOffset + 3], 255, `palette ${palette} alpha`);
    assertEquals(
      V_PaletteCSS(index),
      `rgb(${rgb[rgbOffset + 0]}, ${rgb[rgbOffset + 1]}, ${rgb[rgbOffset + 2]})`,
      `palette ${palette} CSS`,
    );
  }

  // PNG quantization always uses the unflashed source palette.
  const baseIndex = 53;
  const base = V_GetPalette(0);
  assertEquals(
    V_FindClosestBasePaletteIndex(base[baseIndex * 4], base[baseIndex * 4 + 1], base[baseIndex * 4 + 2]),
    baseIndex,
    'base-palette exact color quantizes to its source index',
  );

  V_SetPaletteIndex(99);
  assertEquals(V_GetPaletteIndex(), 0, 'out-of-range palette falls back to base');

  // A standalone 768-byte palette remains usable if flash indices are asked
  // for: with no alternate data, every selection resolves to that one palette.
  const single = rgb.slice(0, 768);
  V_InitPlaypal(single);
  V_SetPaletteIndex(13);
  for (const index of [0, 64, 103, 176, 231, 255]) {
    const baseOffset = index * 4;
    assertEquals(V_GetActivePalette()[baseOffset + 0], V_GetPalette(0)[baseOffset + 0], `single red ${index}`);
    assertEquals(V_GetActivePalette()[baseOffset + 1], V_GetPalette(0)[baseOffset + 1], `single green ${index}`);
    assertEquals(V_GetActivePalette()[baseOffset + 2], V_GetPalette(0)[baseOffset + 2], `single blue ${index}`);
  }
});

Deno.test('PLAYPAL channels pass through every Doom gamma table exactly', () => {
  const rgb = new Uint8Array(14 * 256 * 3);
  for (let i = 0; i < rgb.length; i++) rgb[i] = (i * 37 + 11) & 255;

  for (let gamma = 0; gamma < gammatable.length; gamma++) {
    V_InitPlaypal(rgb, gammatable[gamma]);
    for (const paletteIndex of [0, 8, 13]) {
      V_SetPaletteIndex(paletteIndex);
      const actual = V_GetActivePalette();
      for (const colorIndex of [0, 1, 63, 127, 255]) {
        for (let channel = 0; channel < 3; channel++) {
          const source = rgb[paletteIndex * 768 + colorIndex * 3 + channel];
          const expected = gammatable[gamma][source];
          const value = actual[colorIndex * 4 + channel];
          if (value !== expected) {
            throw new Error(
              `gamma=${gamma} palette=${paletteIndex} color=${colorIndex} channel=${channel}: ` +
              `expected ${expected}, got ${value}`,
            );
          }
        }
      }
    }
  }

  // PNG/source quantization must stay in raw PLAYPAL index space so loading
  // an asset after an F11 change cannot choose a different source index.
  const sourceIndex = 53;
  const source = sourceIndex * 3;
  if (V_FindClosestBasePaletteIndex(rgb[source], rgb[source + 1], rgb[source + 2]) !== sourceIndex) {
    throw new Error('gamma-adjusted presentation changed base-palette quantization');
  }
});
