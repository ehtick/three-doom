import { KEY_F12, gamestate_t } from '../src/doomdef.js';
import { evtype_t } from '../src/d_event.js';
import {
  G_NextDisplayPlayer,
  G_ShouldCycleDisplayPlayer,
} from '../src/g_spy_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('F12 spy gating matches single, cooperative, deathmatch, and singledemo play', () => {
  const should = (overrides = {}) => G_ShouldCycleDisplayPlayer(
    overrides.gamestate ?? gamestate_t.GS_LEVEL,
    overrides.type ?? evtype_t.ev_keydown,
    overrides.key ?? KEY_F12,
    overrides.singledemo ?? false,
    overrides.deathmatch ?? 0,
  );

  assertEquals(should(), true, 'single-player level');
  assertEquals(should({ deathmatch: 0 }), true, 'cooperative netgame');
  assertEquals(should({ deathmatch: 1 }), false, 'normal deathmatch');
  assertEquals(should({ deathmatch: 2 }), false, 'altdeath');
  assertEquals(should({ deathmatch: 1, singledemo: true }), true, 'single deathmatch demo');
  assertEquals(should({ gamestate: gamestate_t.GS_INTERMISSION }), false, 'intermission');
  assertEquals(should({ type: evtype_t.ev_keyup }), false, 'F12 release');
  assertEquals(should({ key: KEY_F12 - 1 }), false, 'other key');
});

Deno.test('spy cycling wraps active players and falls back to consoleplayer', () => {
  const active = [true, false, true, false];
  assertEquals(G_NextDisplayPlayer(0, 0, active), 2, 'skip inactive slot');
  assertEquals(G_NextDisplayPlayer(2, 0, active), 0, 'wrap to console player');

  const consoleOnly = [false, false, true, false];
  assertEquals(G_NextDisplayPlayer(2, 2, consoleOnly), 2, 'full wrap with no peer');

  const nonzeroConsole = [true, false, false, true];
  assertEquals(G_NextDisplayPlayer(3, 3, nonzeroConsole), 0, 'wrap before console');
  assertEquals(G_NextDisplayPlayer(0, 3, nonzeroConsole), 3, 'inactive slots stop at console');
});

Deno.test('display rendering and local HUD ownership follow the reference split', async () => {
  const main = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));
  const game = await Deno.readTextFile(new URL('../src/g_game.js', import.meta.url));
  const keyboard = await Deno.readTextFile(new URL('../src/d_keyboard.js', import.meta.url));
  const hud = await Deno.readTextFile(new URL('../src/hu_stuff.js', import.meta.url));
  const status = await Deno.readTextFile(new URL('../src/st_stuff.js', import.meta.url));

  const display = main.slice(main.indexOf('function D_Display()'), main.indexOf('// D_DoomLoop:'));
  if (!display.includes('const p = players[doomstat.displayplayer]') ||
      !display.includes('R_SetupFrame(p)') ||
      !display.includes('_drawPlayerSprites(o, p,')) {
    throw new Error('world view or weapon psprites still use consoleplayer');
  }
  if (!hud.includes('const p = players[consoleplayer]') ||
      !status.includes('const p = players[consoleplayer]')) {
    throw new Error('local HU/status ownership drifted away from consoleplayer');
  }
  const load = game.slice(game.indexOf('export function G_DoLoadLevel()'), game.indexOf('export function G_DeferedInitNew'));
  if (!load.includes('doomstat.set_displayplayer(consoleplayer)')) {
    throw new Error('level load does not restore the console view');
  }
  const keydown = keyboard.slice(keyboard.indexOf('async function onKeyDown'), keyboard.indexOf('function onKeyUp'));
  const spy = keydown.indexOf('G_ShouldCycleDisplayPlayer(');
  const demo = keydown.indexOf('demoInputIsIntercepted()');
  const capture = keydown.indexOf('keys.add(e.code)');
  if (spy < 0 || demo <= spy || capture <= spy) {
    throw new Error('browser F12 spy handling does not precede demo/key capture');
  }
});
