// Browser-backed subset of linuxdoom m_misc.c's defaults[] table.

import * as doomstat from './doomstat.js';
import { M_RegisterDefault } from './m_misc.js';
import { set_usegamma, usegamma } from './v_video.js';

let _registered = false;

export function M_RegisterDoomDefaults() {
  if (_registered === true) return;
  _registered = true;
  M_RegisterDefault('mouse_sensitivity', {
    get: () => doomstat.mouseSensitivity,
    set: (value) => doomstat.set_mouseSensitivity(value | 0),
  }, 5);
  M_RegisterDefault('sfx_volume', {
    get: () => doomstat.snd_SfxVolume,
    set: (value) => doomstat.set_snd_SfxVolume(value | 0),
  }, 8);
  M_RegisterDefault('music_volume', {
    get: () => doomstat.snd_MusicVolume,
    set: (value) => doomstat.set_snd_MusicVolume(value | 0),
  }, 8);
  M_RegisterDefault('usegamma', {
    get: () => usegamma,
    set: (value) => set_usegamma(value | 0),
  }, 0);
}
