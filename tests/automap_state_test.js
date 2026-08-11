import {
  automapactive as doomstatAutomapActive,
  set_automapactive as setDoomstatAutomapActive,
} from '../src/doomstat.js';
import {
  AM_Start, AM_Stop,
  automapactive as automapModuleActive,
} from '../src/am_map.js';
import * as doomstat from '../src/doomstat.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('automap and game transitions share one live active-state binding', () => {
  setDoomstatAutomapActive(false);
  assertEquals(automapModuleActive, false, 'initial automap module state');

  AM_Start();
  assertEquals(doomstatAutomapActive, true, 'AM_Start publishes to doomstat');

  // F_StartFinale and G_DoLoadLevel clear this doomstat binding. The automap
  // module must immediately observe that transition instead of retaining a
  // private true value into the next level.
  setDoomstatAutomapActive(false);
  assertEquals(automapModuleActive, false, 'transition reset reaches automap');

  AM_Start();
  AM_Stop();
  assertEquals(doomstatAutomapActive, false, 'AM_Stop publishes to doomstat');
});

Deno.test('completion clears automap before victory and brackets view state', async () => {
  const source = await Deno.readTextFile(new URL('../src/g_game.js', import.meta.url));
  const completed = source.slice(source.indexOf('export function G_DoCompleted'), source.indexOf('export function G_DoVictory'));
  const worldDone = source.slice(source.indexOf('export function G_DoWorldDone'), source.indexOf('// g_game.c:897'));
  const clearAutomap = completed.indexOf('doomstat.set_automapactive(false)');
  const victory = completed.indexOf('gamemap === 8');
  if (clearAutomap < 0 || victory <= clearAutomap ||
      !completed.includes('doomstat.set_viewactive(false)') ||
      !completed.includes('doomstat.set_automapactive(false)') ||
      !worldDone.includes('doomstat.set_viewactive(true)')) {
    throw new Error('transition view/automap state does not match G_DoCompleted/G_DoWorldDone');
  }
});
