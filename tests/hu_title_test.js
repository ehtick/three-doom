import * as english from '../src/d_englsh.js';
import { GameMode_t } from '../src/doomdef.js';
import {
  HU_DOOM2_TITLES,
  HU_DOOM_TITLES,
  HU_LevelTitle,
} from '../src/hu_title.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('Doom and Ultimate Doom titles map every episode through d_englsh', () => {
  assertEquals(HU_DOOM_TITLES.length, 36, 'Doom title count');
  for (let episode = 1; episode <= 4; episode++) {
    for (let map = 1; map <= 9; map++) {
      const expected = english[`HUSTR_E${episode}M${map}`];
      assertEquals(
        HU_LevelTitle(GameMode_t.retail, episode, map),
        expected,
        `E${episode}M${map} title`,
      );
    }
  }
  assertEquals(HU_LevelTitle(GameMode_t.retail, 4, 1), 'E4M1: Hell Beneath', 'E4M1 content');
  assertEquals(HU_LevelTitle(GameMode_t.retail, 4, 9), 'E4M9: Fear', 'E4M9 content');
});

Deno.test('Doom II titles map every level through d_englsh', () => {
  assertEquals(HU_DOOM2_TITLES.length, 32, 'Doom II title count');
  for (let map = 1; map <= 32; map++) {
    assertEquals(
      HU_LevelTitle(GameMode_t.commercial, 1, map),
      english[`HUSTR_${map}`],
      `MAP${map} title`,
    );
  }
  assertEquals(HU_LevelTitle(GameMode_t.commercial, 1, 1), 'level 1: entryway', 'MAP01 content');
  assertEquals(HU_LevelTitle(GameMode_t.commercial, 1, 11), "level 11: 'o' of destruction!", 'MAP11 content');
  assertEquals(HU_LevelTitle(GameMode_t.commercial, 1, 32), 'level 32: grosse', 'MAP32 content');
});

Deno.test('title selection follows HU_Start mode defaults and bounds', () => {
  assertEquals(HU_LevelTitle(GameMode_t.shareware, 1, 1), english.HUSTR_E1M1, 'shareware title');
  assertEquals(HU_LevelTitle(GameMode_t.registered, 2, 1), english.HUSTR_E2M1, 'registered title');
  assertEquals(HU_LevelTitle(GameMode_t.indetermined, 1, 1), english.HUSTR_1, 'default title');
  assertEquals(HU_LevelTitle(GameMode_t.retail, 5, 1), '', 'invalid Doom episode');
  assertEquals(HU_LevelTitle(GameMode_t.retail, 2, 0), '', 'invalid Doom map');
  assertEquals(HU_LevelTitle(GameMode_t.commercial, 1, 33), '', 'invalid Doom II map');
});
