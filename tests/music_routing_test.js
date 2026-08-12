import { GameMode_t } from '../src/doomdef.js';
import { S_LevelMusic } from '../src/s_music_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('Ultimate Doom E4 music uses the Linux Doom substitution table', () => {
  const expected = [22, 20, 21, 5, 16, 13, 15, 14, 9];
  for (let map = 1; map <= 9; map++) {
    assertEquals(S_LevelMusic(GameMode_t.retail, 4, map), expected[map - 1], `E4M${map}`);
  }
});

Deno.test('ordinary Doom and Doom II level music retains enum ordering', () => {
  for (let episode = 1; episode <= 3; episode++) {
    for (let map = 1; map <= 9; map++) {
      assertEquals(
        S_LevelMusic(GameMode_t.registered, episode, map),
        1 + (episode - 1) * 9 + map - 1,
        `E${episode}M${map}`,
      );
    }
  }
  for (let map = 1; map <= 32; map++) {
    assertEquals(S_LevelMusic(GameMode_t.commercial, 1, map), 33 + map - 1, `MAP${map}`);
  }
});
