import { GameMode_t } from '../src/doomdef.js';
import { M_RestoreMainCursor } from '../src/m_menu_cursor_logic.js';
import { M_ReadThisPlan } from '../src/m_menu_read_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

Deno.test('dynamic main menus restore the same semantic item', () => {
  const doom1Title = M_ReadThisPlan(GameMode_t.registered, false).mainItems;
  const doom1Game = M_ReadThisPlan(GameMode_t.registered, true).mainItems;
  const doom2Title = M_ReadThisPlan(GameMode_t.commercial, false).mainItems;
  const doom2Game = M_ReadThisPlan(GameMode_t.commercial, true).mainItems;

  assertEquals(M_RestoreMainCursor(doom1Title, 'options', 0), 1, 'Doom 1 title Options');
  assertEquals(M_RestoreMainCursor(doom1Game, 'options', 0), 2, 'Doom 1 game Options');
  assertEquals(M_RestoreMainCursor(doom2Title, 'quit', 0), 2, 'Doom II title Quit');
  assertEquals(M_RestoreMainCursor(doom2Game, 'quit', 0), 3, 'Doom II game Quit');
});

Deno.test('unavailable dynamic rows fall back to New Game', () => {
  const doom1Title = M_ReadThisPlan(GameMode_t.registered, false).mainItems;
  const doom2Game = M_ReadThisPlan(GameMode_t.commercial, true).mainItems;

  assertEquals(M_RestoreMainCursor(doom1Title, 'continue', 3), 0, 'removed Continue');
  assertEquals(M_RestoreMainCursor(doom2Game, 'readthis', 3), 1, 'removed Read This');
});

Deno.test('first open retains the compiled row and clamps malformed state', () => {
  const inGame = M_ReadThisPlan(GameMode_t.registered, true).mainItems;
  assertEquals(M_RestoreMainCursor(inGame, null, 0), 0, 'initial Continue row');
  assertEquals(M_RestoreMainCursor(inGame, null, 99), inGame.length - 1, 'upper clamp');
  assertEquals(M_RestoreMainCursor(inGame, null, -99), 0, 'lower clamp');
  assertEquals(M_RestoreMainCursor([], 'options', 0), -1, 'empty menu');
});
