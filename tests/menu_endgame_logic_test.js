import { M_EndGameRoute } from '../src/m_menu_endgame_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('End Game routing gives inactive-game refusal precedence over netgame', () => {
  assertEquals(M_EndGameRoute(false, false), 'inactive', 'inactive single-player');
  assertEquals(M_EndGameRoute(false, true), 'inactive', 'inactive netgame');
  assertEquals(M_EndGameRoute(true, true), 'netgame', 'active netgame');
  assertEquals(M_EndGameRoute(true, false), 'confirm', 'active single-player');
});

Deno.test('End Game integration uses exact messages, input flags, sound, and title wiring', async () => {
  const menu = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const start = menu.indexOf('function M_EndGameResponse(');
  const end = menu.indexOf('// ---------- Navigation ----------', start);
  const implementation = menu.slice(start, end);
  if (!implementation.includes("if (key !== 0x79 /*y*/) return;") ||
      !implementation.includes('S_StartSound(null, sfx_oof);') ||
      !implementation.includes('M_StartMessage(NETEND, null, false);') ||
      !implementation.includes('M_StartMessage(ENDGAME, M_EndGameResponse, true);') ||
      !implementation.includes('_startTitle();')) {
    throw new Error('M_EndGame gates differ from m_menu.c:996-1022');
  }
  const main = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));
  if (!main.includes('mMenu.M_SetExternals({ D_StartTitle });') ||
      !main.slice(main.indexOf('export function D_StartTitle()'), main.indexOf('// Overlay canvas'))
        .includes('doomstat.set_gameaction(0 /*ga_nothing*/);')) {
    throw new Error('End Game is not synchronously wired to the full D_StartTitle entry');
  }
});

Deno.test('Options rows and thermometer indices match OptionsDef', async () => {
  const source = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const start = source.indexOf('const OPTIONS_MENU');
  const end = source.indexOf('// m_menu.c:422-447', start);
  const options = source.slice(start, end);
  for (const fragment of [
    "{ patch: 'M_ENDGAM'",
    'const opt_messages = 1',
    'opt_detail = 2',
    'opt_scrnsize = 3',
    'opt_mousesens = 5',
  ]) {
    if (!options.includes(fragment)) throw new Error(`missing OptionsDef fragment: ${fragment}`);
  }
});
