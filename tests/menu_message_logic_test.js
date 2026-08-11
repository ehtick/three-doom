import { KEY_ESCAPE, KEY_UPARROW } from '../src/doomdef.js';
import { M_MessageAcceptsKey } from '../src/m_menu_message_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('informational menu messages accept any key', () => {
  for (const key of [0, 13, KEY_UPARROW, 0x61, 0xff]) {
    assertEquals(M_MessageAcceptsKey(false, key), true, `key ${key}`);
  }
});

Deno.test('confirmation messages accept only Space, N, Y, and Escape', () => {
  for (const key of [0x20, 0x6e, 0x79, KEY_ESCAPE]) {
    assertEquals(M_MessageAcceptsKey(true, key), true, `accepted key ${key}`);
  }
  for (const key of [0, 13, KEY_UPARROW, 0x61, 0xff]) {
    assertEquals(M_MessageAcceptsKey(true, key), false, `rejected key ${key}`);
  }
});

Deno.test('menu call sites use the reference message-input modes', async () => {
  const source = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const shareware = source.slice(
    source.indexOf('if (gamemode === GameMode_t.shareware'),
    source.indexOf('let _pendingEpisode'),
  );
  const nightmare = source.slice(
    source.indexOf('function _chooseSkill'),
    source.indexOf('function _doStart'),
  );
  const quit = source.slice(
    source.indexOf('function M_QuitDOOM'),
    source.indexOf('// ---------- Lifecycle'),
  );
  if (!shareware.includes('null, false)') ||
      !nightmare.includes('}, true)') ||
      !quit.includes('}, true)')) {
    throw new Error('shareware/Nightmare/Quit message modes differ from m_menu.c');
  }
});
