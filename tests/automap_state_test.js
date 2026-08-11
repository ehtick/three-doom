import {
  automapactive as doomstatAutomapActive,
  set_automapactive as setDoomstatAutomapActive,
} from '../src/doomstat.js';
import {
  AM_Start, AM_Stop,
  automapactive as automapModuleActive,
} from '../src/am_map.js';

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
