import { M_ALPHA_KEYS, M_FindAlphaItem } from '../src/m_menu_alpha_logic.js';

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('menu alpha keys match the source tables and browser Continue is c', () => {
  const chars = (values) => values.map((value) => value === 0 ? '\0' : String.fromCharCode(value));
  assertEquals(String.fromCharCode(M_ALPHA_KEYS.continue), 'c', 'browser Continue');
  assertEquals(chars(M_ALPHA_KEYS.main), ['n', 'o', 'r', 'q'], 'available main rows');
  assertEquals(chars(M_ALPHA_KEYS.episode), ['k', 't', 'i', 't'], 'EpisodeMenu');
  assertEquals(chars(M_ALPHA_KEYS.skill), ['i', 'h', 'h', 'u', 'n'], 'NewGameMenu');
  assertEquals(chars(M_ALPHA_KEYS.options), ['e', 'm', 'g', 's', '\0', 'm', '\0', 's'], 'OptionsMenu');
  assertEquals(chars(M_ALPHA_KEYS.sound), ['s', '\0', 'm', '\0'], 'SoundMenu');
  assertEquals(chars(M_ALPHA_KEYS.slots), ['1', '2', '3', '4', '5', '6'], 'save/load slots');
});

Deno.test('alpha routing advances duplicates, wraps, includes current, and rejects misses', () => {
  const items = M_ALPHA_KEYS.episode.map((alphaKey) => ({ alphaKey }));
  const t = 't'.charCodeAt(0);
  assertEquals(M_FindAlphaItem(items, 0, t), 1, 'first duplicate after current');
  assertEquals(M_FindAlphaItem(items, 1, t), 3, 'next duplicate later in menu');
  assertEquals(M_FindAlphaItem(items, 3, t), 1, 'duplicate wraps');
  assertEquals(M_FindAlphaItem(items, 2, 'i'.charCodeAt(0)), 2, 'unique current reselects');
  assertEquals(M_FindAlphaItem(items, 2, 'x'.charCodeAt(0)), -1, 'unsupported key');
});
