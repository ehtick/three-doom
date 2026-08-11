import { GameMode_t } from '../src/doomdef.js';
import { C1TEXT, C4TEXT, C5TEXT, C6TEXT, E1TEXT, E4TEXT } from '../src/d_englsh.js';
import { F_GetFinaleSpec, F_ShouldStartCommercialFinale } from '../src/f_finale_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('Doom episode finales select the reference text and flat', () => {
  let spec = F_GetFinaleSpec(GameMode_t.shareware, 1, 8);
  assertEquals(spec.text, E1TEXT, 'E1 text');
  assertEquals(spec.flat, 'FLOOR4_8', 'E1 flat');

  spec = F_GetFinaleSpec(GameMode_t.retail, 4, 8);
  assertEquals(spec.text, E4TEXT, 'E4 text');
  assertEquals(spec.flat, 'MFLR8_3', 'E4 flat');
});

Deno.test('Doom II chapter and ending finales select the reference content', () => {
  let spec = F_GetFinaleSpec(GameMode_t.commercial, 1, 6);
  assertEquals(spec.text, C1TEXT, 'MAP06 text');
  assertEquals(spec.flat, 'SLIME16', 'MAP06 flat');

  spec = F_GetFinaleSpec(GameMode_t.commercial, 1, 30);
  assertEquals(spec.text, C4TEXT, 'MAP30 text');
  assertEquals(spec.flat, 'RROCK17', 'MAP30 flat');

  assertEquals(F_GetFinaleSpec(GameMode_t.commercial, 1, 15).text, C5TEXT, 'MAP15 text');
  assertEquals(F_GetFinaleSpec(GameMode_t.commercial, 1, 31).text, C6TEXT, 'MAP31 text');
});

Deno.test('commercial finale breakpoints match G_WorldDone', () => {
  for (const map of [6, 11, 20, 30]) {
    assertEquals(F_ShouldStartCommercialFinale(GameMode_t.commercial, map, false), true, `MAP${map}`);
  }
  assertEquals(F_ShouldStartCommercialFinale(GameMode_t.commercial, 15, false), false, 'normal MAP15 exit');
  assertEquals(F_ShouldStartCommercialFinale(GameMode_t.commercial, 15, true), true, 'secret MAP15 exit');
  assertEquals(F_ShouldStartCommercialFinale(GameMode_t.commercial, 31, false), false, 'normal MAP31 exit');
  assertEquals(F_ShouldStartCommercialFinale(GameMode_t.commercial, 31, true), true, 'secret MAP31 exit');
  assertEquals(F_ShouldStartCommercialFinale(GameMode_t.registered, 6, false), false, 'Doom 1 map');
});
