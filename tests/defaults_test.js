import * as doomstat from '../src/doomstat.js';
import { I_Quit } from '../src/i_system.js';
import { HU_SetShowMessages, showMessages } from '../src/hu_stuff.js';
import { M_RegisterDoomDefaults } from '../src/m_defaults.js';
import { M_LoadDefaults, M_SaveDefaults } from '../src/m_misc.js';
import { set_usegamma, usegamma } from '../src/v_video.js';
import { R_GetScreenblocks, R_SetViewSize } from '../src/r_view.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('input, sound, messages, and video round-trip through registered defaults', () => {
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
    doomstat.set_snd_SfxVolume(12);
    doomstat.set_snd_MusicVolume(3);
    HU_SetShowMessages(0);
    set_usegamma(3);
    R_SetViewSize(10);
    M_SaveDefaults();
    assertEquals(
      values.get('doom:defaults'),
      'mouse_sensitivity\t\t8\nsfx_volume\t\t12\nmusic_volume\t\t3\nshow_messages\t\t0\nusegamma\t\t3\nscreenblocks\t\t10',
      'saved defaults',
    );

    doomstat.set_mouseSensitivity(1);
    doomstat.set_snd_SfxVolume(1);
    doomstat.set_snd_MusicVolume(1);
    HU_SetShowMessages(1);
    set_usegamma(1);
    R_SetViewSize(3);
    M_LoadDefaults();
    assertEquals(doomstat.mouseSensitivity, 8, 'loaded mouse sensitivity');
    assertEquals(doomstat.snd_SfxVolume, 12, 'loaded sfx volume');
    assertEquals(doomstat.snd_MusicVolume, 3, 'loaded music volume');
    assertEquals(showMessages, false, 'loaded message visibility');
    assertEquals(usegamma, 3, 'loaded gamma');
    assertEquals(R_GetScreenblocks(), 10, 'loaded screen blocks');

    values.delete('doom:defaults');
    M_LoadDefaults();
    assertEquals(doomstat.mouseSensitivity, 5, 'reference mouse default');
    assertEquals(doomstat.snd_SfxVolume, 8, 'reference sfx default');
    assertEquals(doomstat.snd_MusicVolume, 8, 'reference music default');
    assertEquals(showMessages, true, 'reference message default');
    assertEquals(usegamma, 0, 'reference gamma default');
    assertEquals(R_GetScreenblocks(), 9, 'reference screen-block default');
  } finally {
    doomstat.set_mouseSensitivity(5);
    doomstat.set_snd_SfxVolume(8);
    doomstat.set_snd_MusicVolume(8);
    HU_SetShowMessages(1);
    set_usegamma(0);
    R_SetViewSize(9);
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
    doomstat.set_snd_SfxVolume(11);
    doomstat.set_snd_MusicVolume(4);
    HU_SetShowMessages(0);
    set_usegamma(4);
    R_SetViewSize(8);
    I_Quit();
    assertEquals(calls.join(','), 'save,quit', 'quit lifecycle order');
    assertEquals(
      values.get('doom:defaults'),
      'mouse_sensitivity\t\t7\nsfx_volume\t\t11\nmusic_volume\t\t4\nshow_messages\t\t0\nusegamma\t\t4\nscreenblocks\t\t8',
      'quit defaults',
    );
  } finally {
    doomstat.set_mouseSensitivity(5);
    doomstat.set_snd_SfxVolume(8);
    doomstat.set_snd_MusicVolume(8);
    HU_SetShowMessages(1);
    set_usegamma(0);
    R_SetViewSize(9);
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
  if (!boot.includes('S.S_Init(doomstat.snd_SfxVolume, doomstat.snd_MusicVolume)')) {
    throw new Error('sound startup ignores loaded volume defaults');
  }

  const menu = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const quit = menu.slice(menu.indexOf('function M_QuitDOOM()'), menu.indexOf('// ---------- Lifecycle ----------'));
  if (!quit.includes('if (key === 0x79 /*y*/) I_Quit()') ||
      quit.includes('window.location.reload')) {
    throw new Error('menu quit does not route through the saving I_Quit path');
  }
});
