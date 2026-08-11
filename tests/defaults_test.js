import * as doomstat from '../src/doomstat.js';
import { I_Quit } from '../src/i_system.js';
import { M_RegisterDoomDefaults } from '../src/m_defaults.js';
import { M_LoadDefaults, M_SaveDefaults } from '../src/m_misc.js';
import { set_usegamma, usegamma } from '../src/v_video.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('mouse sensitivity and gamma round-trip through registered defaults', () => {
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const values = new Map();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  });
  try {
    M_RegisterDoomDefaults();
    doomstat.set_mouseSensitivity(8);
    set_usegamma(3);
    M_SaveDefaults();
    assertEquals(
      values.get('doom:defaults'),
      'mouse_sensitivity\t\t8\nusegamma\t\t3',
      'saved defaults',
    );

    doomstat.set_mouseSensitivity(1);
    set_usegamma(1);
    M_LoadDefaults();
    assertEquals(doomstat.mouseSensitivity, 8, 'loaded mouse sensitivity');
    assertEquals(usegamma, 3, 'loaded gamma');

    values.delete('doom:defaults');
    M_LoadDefaults();
    assertEquals(doomstat.mouseSensitivity, 5, 'reference mouse default');
    assertEquals(usegamma, 0, 'reference gamma default');
  } finally {
    doomstat.set_mouseSensitivity(5);
    set_usegamma(0);
    if (oldStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', oldStorage);
  }
});

Deno.test('I_Quit saves defaults before dispatching graphics shutdown', () => {
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const values = new Map();
  const calls = [];
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key) => values.has(key) ? values.get(key) : null,
      setItem: (key, value) => {
        calls.push('save');
        values.set(key, String(value));
      },
    },
  });
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { dispatchEvent: () => { calls.push('quit'); } },
  });
  try {
    M_RegisterDoomDefaults();
    doomstat.set_mouseSensitivity(7);
    set_usegamma(4);
    I_Quit();
    assertEquals(calls.join(','), 'save,quit', 'quit lifecycle order');
    assertEquals(
      values.get('doom:defaults'),
      'mouse_sensitivity\t\t7\nusegamma\t\t4',
      'quit defaults',
    );
  } finally {
    doomstat.set_mouseSensitivity(5);
    set_usegamma(0);
    if (oldStorage === undefined) delete globalThis.localStorage;
    else Object.defineProperty(globalThis, 'localStorage', oldStorage);
    if (oldWindow === undefined) delete globalThis.window;
    else Object.defineProperty(globalThis, 'window', oldWindow);
  }
});

Deno.test('startup registers defaults before loading and menu quit uses I_Quit', async () => {
  const main = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));
  const boot = main.slice(main.indexOf('export async function D_DoomMain()'));
  const register = boot.indexOf('M_RegisterDoomDefaults()');
  const load = boot.indexOf('M_LoadDefaults()');
  if (register < 0 || load <= register) {
    throw new Error('D_DoomMain does not register defaults before loading them');
  }

  const menu = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const quit = menu.slice(menu.indexOf('function M_QuitDOOM()'), menu.indexOf('// ---------- Lifecycle ----------'));
  if (!quit.includes('if (key === 0x79 /*y*/) I_Quit()') ||
      quit.includes('window.location.reload')) {
    throw new Error('menu quit does not route through the saving I_Quit path');
  }
});
