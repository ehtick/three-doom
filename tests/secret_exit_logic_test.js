import { GameMode_t } from '../src/doomdef.js';
import { G_SecretExitAvailable } from '../src/g_game_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('commercial secret exits require MAP31', () => {
  let checkedName = null;
  assertEquals(G_SecretExitAvailable(GameMode_t.commercial, (name) => {
    checkedName = name;
    return 42;
  }), true, 'MAP31 present');
  assertEquals(checkedName, 'MAP31', 'checked lump');

  assertEquals(
    G_SecretExitAvailable(GameMode_t.commercial, () => -1),
    false,
    'MAP31 absent',
  );
});

Deno.test('noncommercial secret exits do not consult MAP31', () => {
  for (const mode of [GameMode_t.shareware, GameMode_t.registered, GameMode_t.retail]) {
    const available = G_SecretExitAvailable(mode, () => {
      throw new Error('Doom 1 must not look for a Doom II map');
    });
    assertEquals(available, true, `mode ${mode}`);
  }
});
