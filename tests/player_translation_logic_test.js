import {
  R_PlayerTranslationFromFlags,
  R_TranslatePlayerPaletteIndex,
  SPRITE_MF_TRANSLATION,
  SPRITE_MF_TRANSSHIFT,
} from '../src/r_sprite_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const bases = [0x70, 0x60, 0x40, 0x20];

Deno.test('player translation flags decode slots one through four exactly', () => {
  for (let translation = 0; translation < 4; translation++) {
    const unrelated = 0x01234567 & ~SPRITE_MF_TRANSLATION;
    const flags = unrelated | (translation << SPRITE_MF_TRANSSHIFT);
    assertEquals(
      R_PlayerTranslationFromFlags(flags),
      translation,
      `translation ${translation}`,
    );
  }
});

Deno.test('player translations change only every index in the green ramp', () => {
  for (let translation = 0; translation < 4; translation++) {
    for (let source = 0; source < 256; source++) {
      const expected = source >= 0x70 && source <= 0x7f
        ? bases[translation] + (source - 0x70)
        : source;
      assertEquals(
        R_TranslatePlayerPaletteIndex(source, translation),
        expected,
        `translation=${translation} source=${source}`,
      );
    }
  }
});
