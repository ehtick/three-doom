import {
  KEY_F1, KEY_F2, KEY_F3, KEY_F4, KEY_F5, KEY_F6,
  KEY_F7, KEY_F8, KEY_F9, KEY_F10, KEY_F11,
} from '../src/doomdef.js';
import { M_ClosedShortcutRoute } from '../src/m_menu_shortcut_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${expected}, got ${actual}`);
  }
}

Deno.test('closed-menu shortcut routes preserve the feasible source subset', () => {
  for (const [key, route] of [
    [KEY_F4, 'sound'],
    [KEY_F5, 'detail'],
    [KEY_F7, 'endgame'],
    [KEY_F8, 'messages'],
    [KEY_F10, 'quit'],
  ]) {
    assertEquals(M_ClosedShortcutRoute(key), route, `route ${route}`);
  }
  // F1/F11 retain their dedicated routes in m_menu.js. The Save/Load family
  // is intentionally disabled in the browser rather than half-wired here.
  for (const key of [KEY_F1, KEY_F2, KEY_F3, KEY_F6, KEY_F9, KEY_F11, 0]) {
    assertEquals(M_ClosedShortcutRoute(key), null, `unsupported route ${key}`);
  }
});

Deno.test('closed-menu shortcuts preserve source action and sound order', async () => {
  const source = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const start = source.indexOf("switch (M_ClosedShortcutRoute(key))");
  const end = source.indexOf('// m_menu.c:1597-1603', start);
  const responder = source.slice(start, end);
  if (start < 0 || end < 0) throw new Error('closed shortcut switch not found');

  function route(name, next) {
    const routeStart = responder.indexOf(`case '${name}':`);
    const routeEnd = responder.indexOf(`case '${next}':`, routeStart);
    if (routeStart < 0 || routeEnd < 0) throw new Error(`shortcut block ${name} not found`);
    return responder.slice(routeStart, routeEnd);
  }
  function ordered(block, first, second, name) {
    const a = block.indexOf(first);
    const b = block.indexOf(second);
    if (a < 0 || b < 0 || a >= b) throw new Error(`${name} order changed`);
  }

  const sound = route('sound', 'detail');
  ordered(sound, '_currentMenu = SOUND_MENU;', 'S_StartSound(null, sfx_swtchn);', 'F4');
  const detail = route('detail', 'endgame');
  ordered(detail, 'M_ChangeDetail();', 'S_StartSound(null, sfx_swtchn);', 'F5');
  const endgame = route('endgame', 'messages');
  ordered(endgame, 'S_StartSound(null, sfx_swtchn);', 'M_EndGame();', 'F7');
  const messages = route('messages', 'quit');
  ordered(messages, 'HU_ToggleMessages();', 'S_StartSound(null, sfx_swtchn);', 'F8');
  const quitStart = responder.indexOf("case 'quit':");
  const quit = responder.slice(quitStart);
  ordered(quit, 'S_StartSound(null, sfx_swtchn);', 'M_QuitDOOM();', 'F10');
  for (const key of ['KEY_F2', 'KEY_F3', 'KEY_F6', 'KEY_F9']) {
    if (responder.includes(key)) throw new Error(`${key} was unexpectedly enabled`);
  }
});
