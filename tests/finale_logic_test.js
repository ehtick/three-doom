import { GameMode_t } from '../src/doomdef.js';
import { C1TEXT, C4TEXT, C5TEXT, C6TEXT, E1TEXT, E4TEXT } from '../src/d_englsh.js';
import {
  F_GetBunnyScroll, F_GetDoom1ArtPatch, F_GetFinaleSpec, F_ShouldAdvanceCommercial,
  F_ShouldStartCommercialFinale, F_UpdateBunnyStage,
} from '../src/f_finale_logic.js';

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

Deno.test('indetermined finale uses the reference sky and Doom II text', () => {
  for (const episode of [1, 2, 4, 99]) {
    const spec = F_GetFinaleSpec(GameMode_t.indetermined, episode, 1);
    assertEquals(spec.text, C1TEXT, `indetermined episode ${episode} text`);
    assertEquals(spec.flat, 'F_SKY1', `indetermined episode ${episode} flat`);
  }
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

Deno.test('Doom 1 ending art follows game mode and episode', () => {
  assertEquals(F_GetDoom1ArtPatch(GameMode_t.shareware, 1), 'HELP2', 'shareware E1');
  assertEquals(F_GetDoom1ArtPatch(GameMode_t.registered, 1), 'HELP2', 'registered E1');
  assertEquals(F_GetDoom1ArtPatch(GameMode_t.retail, 1), 'CREDIT', 'retail E1');
  assertEquals(F_GetDoom1ArtPatch(GameMode_t.retail, 2), 'VICTORY2', 'E2');
  assertEquals(F_GetDoom1ArtPatch(GameMode_t.retail, 3), null, 'E3 bunny');
  assertEquals(F_GetDoom1ArtPatch(GameMode_t.retail, 4), 'ENDPIC', 'E4');
});

Deno.test('commercial finale skipping polls held ticcmd buttons after 50 tics', () => {
  assertEquals(F_ShouldAdvanceCommercial(50, [1, 0, 0, 0]), false, 'guard includes tic 50');
  assertEquals(F_ShouldAdvanceCommercial(51, [0, 0, 0, 0]), false, 'movement/no buttons');
  assertEquals(F_ShouldAdvanceCommercial(51, [1, 0, 0, 0]), true, 'held attack');
  assertEquals(F_ShouldAdvanceCommercial(51, [0, 2, 0, 0]), true, 'held use from another player');
});

Deno.test('E3 bunny END stages fire one pistol sound per newly shown frame', () => {
  let update = F_UpdateBunnyStage(1129, 0);
  assertEquals(update.stage, -1, 'pre-END stage');
  assertEquals(update.playPistol, false, 'pre-END sound');

  update = F_UpdateBunnyStage(1130, update.laststage);
  assertEquals(update.stage, 0, 'END0 stage');
  assertEquals(update.playPistol, false, 'END0 is silent');

  update = F_UpdateBunnyStage(1185, update.laststage);
  assertEquals(update.stage, 1, 'END1 stage');
  assertEquals(update.playPistol, true, 'END1 sound');

  update = F_UpdateBunnyStage(1189, update.laststage);
  assertEquals(update.stage, 1, 'held END1 stage');
  assertEquals(update.playPistol, false, 'held END1 stays silent');

  update = F_UpdateBunnyStage(1190, update.laststage);
  assertEquals(update.stage, 2, 'END2 stage');
  assertEquals(update.playPistol, true, 'END2 sound');

  update = F_UpdateBunnyStage(9999, update.laststage);
  assertEquals(update.stage, 6, 'END stage clamp');
  assertEquals(update.playPistol, true, 'first END6 sound');
  update = F_UpdateBunnyStage(10000, update.laststage);
  assertEquals(update.playPistol, false, 'held END6 stays silent');
});

Deno.test('E3 bunny scroll truncates the half-speed offset before subtraction', () => {
  assertEquals(F_GetBunnyScroll(229), 320, 'negative half-tic clamp');
  assertEquals(F_GetBunnyScroll(230), 320, 'scroll start');
  assertEquals(F_GetBunnyScroll(231), 320, 'first odd tic');
  assertEquals(F_GetBunnyScroll(232), 319, 'first complete two-tic step');
  assertEquals(F_GetBunnyScroll(233), 319, 'second odd tic');
  assertEquals(F_GetBunnyScroll(868), 1, 'last visible step');
  assertEquals(F_GetBunnyScroll(869), 1, 'last odd tic');
  assertEquals(F_GetBunnyScroll(870), 0, 'scroll end');
  assertEquals(F_GetBunnyScroll(9999), 0, 'post-scroll clamp');
});
