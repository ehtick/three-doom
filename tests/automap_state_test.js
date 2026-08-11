import {
  automapactive as doomstatAutomapActive,
  set_automapactive as setDoomstatAutomapActive,
} from '../src/doomstat.js';
import {
  AM_Responder, AM_Start, AM_Stop,
  automapactive as automapModuleActive,
} from '../src/am_map.js';
import * as doomstat from '../src/doomstat.js';
import {
  KEY_DOWNARROW, KEY_EQUALS, KEY_LEFTARROW, KEY_MINUS, KEY_RIGHTARROW,
  KEY_TAB, KEY_UPARROW,
} from '../src/doomdef.js';
import { evtype_t } from '../src/d_event.js';

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

Deno.test('automap responder matches active keydown and keyup ownership', () => {
  setDoomstatAutomapActive(false);
  const closedKeys = [
    KEY_EQUALS, KEY_MINUS, KEY_LEFTARROW, KEY_RIGHTARROW,
    KEY_UPARROW, KEY_DOWNARROW, 0x30, 0x66, 0x67, 0x6d, 0x63,
  ];
  for (const key of closedKeys) {
    assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: key }), false, `closed key ${key}`);
    assertEquals(doomstatAutomapActive, false, `closed key ${key} state`);
  }
  assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: KEY_TAB }), true, 'Tab opens map');
  assertEquals(doomstatAutomapActive, true, 'map opened');

  // Follow mode leaves arrow presses to gamekeydown. Once F disables follow,
  // automap owns the same presses, while every release still filters down.
  for (const key of [KEY_LEFTARROW, KEY_RIGHTARROW, KEY_UPARROW, KEY_DOWNARROW]) {
    assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: key }), false, `follow arrow ${key}`);
  }
  assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: 0x66 }), true, 'F disables follow');
  for (const key of [KEY_LEFTARROW, KEY_RIGHTARROW, KEY_UPARROW, KEY_DOWNARROW]) {
    assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: key }), true, `pan arrow ${key}`);
    assertEquals(AM_Responder({ type: evtype_t.ev_keyup, data1: key }), false, `pan release ${key}`);
  }
  assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: 0x66 }), true, 'F restores follow');

  for (const key of [KEY_EQUALS, KEY_MINUS, 0x67, 0x6d, 0x63]) {
    assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: key }), true, `open key ${key}`);
    assertEquals(AM_Responder({ type: evtype_t.ev_keyup, data1: key }), false, `open release ${key}`);
  }
  assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: 0x30 }), true, '0 enters big map');
  assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: 0x30 }), true, '0 restores map');
  assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: 0x2b }), false, "'+' is not Doom's '=' binding");
  assertEquals(AM_Responder({ type: evtype_t.ev_keydown, data1: KEY_TAB }), true, 'Tab closes map');
  assertEquals(doomstatAutomapActive, false, 'map closed');
});

Deno.test('cheat fan-out precedes active automap handling', async () => {
  const source = await Deno.readTextFile(new URL('../src/d_keyboard.js', import.meta.url));
  const handler = source.slice(source.indexOf('async function onKeyDown'), source.indexOf('function onKeyUp'));
  const cheat = handler.indexOf('cht_HandleKey(ch)');
  const automap = handler.indexOf('AM_Responder', cheat);
  if (cheat < 0 || automap <= cheat ||
      !handler.includes('const wasHeld = keys.has(e.code)') ||
      !handler.includes('if (wasHeld !== true) keys.delete(e.code)') ||
      !handler.includes("e.code === 'Equal' || e.code === 'NumpadAdd'")) {
    throw new Error('letter cheats do not fan out to automap in reference order');
  }
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
