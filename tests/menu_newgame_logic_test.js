import { GameMode_t } from '../src/doomdef.js';
import { M_NewGameRoute } from '../src/m_menu_newgame_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('M_NewGame routing matches game mode and live-network guards', () => {
  for (const mode of [
    GameMode_t.shareware,
    GameMode_t.registered,
    GameMode_t.retail,
    GameMode_t.indetermined,
  ]) {
    assertEquals(M_NewGameRoute(false, false, mode), 'episode', `mode ${mode}`);
  }
  assertEquals(
    M_NewGameRoute(false, false, GameMode_t.commercial),
    'skill',
    'commercial mode',
  );
  assertEquals(
    M_NewGameRoute(true, false, GameMode_t.commercial),
    'message',
    'live commercial netgame',
  );
  assertEquals(
    M_NewGameRoute(true, false, GameMode_t.retail),
    'message',
    'live Doom 1 netgame',
  );
  assertEquals(
    M_NewGameRoute(true, true, GameMode_t.commercial),
    'skill',
    'commercial demo playback exception',
  );
  assertEquals(
    M_NewGameRoute(true, true, GameMode_t.registered),
    'episode',
    'Doom 1 demo playback exception',
  );
});

Deno.test('menu integration resets the commercial pending episode', async () => {
  const source = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const start = source.indexOf('function M_NewGame()');
  const end = source.indexOf('const SKILL_MENU', start);
  const body = source.slice(start, end);
  if (!body.includes('M_NewGameRoute(netgame, demoplayback, gamemode)') ||
      !body.includes('M_StartMessage(NEWGAME, null, false)') ||
      !body.includes("if (route === 'skill')") ||
      !body.includes('_pendingEpisode = 1') ||
      !body.includes('pushMenu(SKILL_MENU)') ||
      !body.includes('_openEpisodeMenu()')) {
    throw new Error('M_NewGame is not wired to the reference routing outcomes');
  }
});
