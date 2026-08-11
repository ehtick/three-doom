import {
  PSPRITE_SHADOW_ROW,
  R_IsPspriteInvisible,
  R_PspriteColormapRow,
  R_RemapPspriteIndex,
  SPRITE_FF_FULLBRIGHT,
  SPRITE_SHADOW_PALETTE_INDEX,
} from '../src/r_sprite_logic.js';
import { R_CalculateViewSize } from '../src/r_view.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

function vanillaNormalRow(lightlevel, extralight, scaledViewWidth = 320) {
  const light = clamp((lightlevel >> 4) + extralight, 0, 15);
  const attenuation = Math.trunc(Math.trunc(47 * 320 / scaledViewWidth) / 2);
  return clamp(((15 - light) * 4) - attenuation, 0, 31);
}

Deno.test('psprite invisibility fuzz follows the final-four-seconds blink timer', () => {
  assertEquals(R_IsPspriteInvisible(129), true, 'above four seconds is continuously fuzzy');
  assertEquals(R_IsPspriteInvisible(128), false, 'four-second boundary with bit 8 clear is normal');
  assertEquals(R_IsPspriteInvisible(8), true, 'bit 8 set is fuzzy during blink interval');
  assertEquals(R_IsPspriteInvisible(15), true, 'bit 8 remains fuzzy through its eight-tic phase');
  assertEquals(R_IsPspriteInvisible(7), false, 'bit 8 clear below first blink phase is normal');
  assertEquals(R_IsPspriteInvisible(16), false, 'next eight-tic phase returns to normal');
  assertEquals(R_IsPspriteInvisible(0), false, 'expired power is normal');
});

Deno.test('psprite colormap precedence matches invisibility, fixed, fullbright, then lighting', () => {
  assertEquals(
    R_PspriteColormapRow(true, 32, SPRITE_FF_FULLBRIGHT, 255, 2),
    PSPRITE_SHADOW_ROW,
    'invisibility wins over fixed/fullbright/lighting',
  );
  assertEquals(
    R_PspriteColormapRow(false, 32, SPRITE_FF_FULLBRIGHT, 0, -2),
    32,
    'fixed colormap wins over fullbright/lighting',
  );
  assertEquals(
    R_PspriteColormapRow(false, 1, 0, 0, -2),
    1,
    'light-amplification fixed colormap is literal',
  );
  assertEquals(
    R_PspriteColormapRow(false, 0, SPRITE_FF_FULLBRIGHT, 0, -2),
    0,
    'fullbright wins over normal lighting',
  );
  assertEquals(
    R_PspriteColormapRow(false, 0, 0, 0, 0),
    vanillaNormalRow(0, 0),
    'ordinary frame uses normal lighting',
  );
});

Deno.test('psprite normal light row matches every sector bucket boundary and extralight clamp', () => {
  const levels = new Set([-1, 0, 1, 14, 15, 16, 17, 254, 255, 256]);
  for (let boundary = 0; boundary <= 256; boundary += 16) {
    for (const delta of [-1, 0, 1]) levels.add(boundary + delta);
  }

  for (let blocks = 3; blocks <= 11; blocks++) {
    const width = R_CalculateViewSize(blocks).scaledviewwidth;
    for (const lightlevel of levels) {
      for (let extralight = -2; extralight <= 2; extralight++) {
        assertEquals(
          R_PspriteColormapRow(false, 0, 0, lightlevel, extralight, width),
          vanillaNormalRow(lightlevel, extralight, width),
          `blocks=${blocks} lightlevel=${lightlevel} extralight=${extralight}`,
        );
      }
    }
  }
});

Deno.test('psprite remap applies the selected COLORMAP before PLAYPAL', () => {
  const maps = new Uint8Array(34 * 256);
  for (let row = 0; row < 34; row++) {
    for (let index = 0; index < 256; index++) maps[row * 256 + index] = (index + row * 7) & 255;
  }

  for (const row of [0, 1, 15, 31, 32, 33]) {
    for (const index of [0, 1, 0x70, 0x7f, 128, 254, 255]) {
      assertEquals(
        R_RemapPspriteIndex(index, row, maps),
        maps[row * 256 + index],
        `row=${row} index=${index}`,
      );
    }
  }
  assertEquals(
    R_RemapPspriteIndex(0x7f, PSPRITE_SHADOW_ROW, maps),
    SPRITE_SHADOW_PALETTE_INDEX,
    'shadow approximation ignores source and COLORMAP',
  );
});
