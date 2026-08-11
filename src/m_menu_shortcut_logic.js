// Pure routing for the feasible closed-menu function-key subset.

import {
  KEY_F4, KEY_F5, KEY_F7, KEY_F8, KEY_F10,
} from './doomdef.js';

export function M_ClosedShortcutRoute(key) {
  switch (key) {
    case KEY_F4: return 'sound';
    case KEY_F5: return 'detail';
    case KEY_F7: return 'endgame';
    case KEY_F8: return 'messages';
    case KEY_F10: return 'quit';
    default: return null;
  }
}
