// Ported from: linuxdoom-1.10/hu_stuff.c — heads-up display.
// Pickup / item / secret messages, level title, and the STCFN font.

import { players, consoleplayer, gameepisode, gamemap, gamemode, automapactive } from './doomstat.js';
import { MSGON, MSGOFF } from './d_englsh.js';
import {
  HU_DrawLayout, HU_FONTEND, HU_FONTSIZE, HU_FONTSTART, HU_GetFont,
  HU_LayoutText, HU_ShutdownFont,
} from './hu_font.js';
import { HU_LevelTitle } from './hu_title.js';

// hu_stuff.c:showMessages — when false, gameplay messages are suppressed.
// The toggle's own confirmation message is forced through regardless
// (vanilla's message_dontfuckwithme).
export let showMessages = true;

export function HU_SetShowMessages(value) {
  showMessages = (value | 0) !== 0;
}

export { HU_FONTSTART, HU_FONTEND, HU_FONTSIZE };
export const HU_MSGX      = 0;
export const HU_MSGY      = 0;
export const HU_TITLEX    = 0;
export const HU_TITLEY    = 167 - 12; // bottom of view, above STBAR
export const HU_MSGTIMEOUT = 4 * 35;

// State.
let _msgText      = '';
let _msgCounter   = 0;
let _titleText    = '';
let _lastMo       = null;

export function HU_Init() { /* fonts loaded lazily on first draw */ }

export function HU_Shutdown() {
  HU_ShutdownFont();
  _msgText = '';
  _msgCounter = 0;
  _titleText = '';
  _lastMo = null;
}

export function HU_Start() {
  _msgText = ''; _msgCounter = 0;
  // hu_stuff.c:440-470 builds the title widget once per HU_Start. It has no
  // timeout; HU_Drawer gates the persistent line on automapactive.
  _titleText = HU_LevelTitle(gamemode, gameepisode, gamemap);
}

// Push a message into the HUD. Called by P_TouchSpecialThing via player.message.
// `force` shows the message even when messages are toggled off.
export function HU_QueueMessage(text, force) {
  if (text === null || text === undefined || text === '') return;
  if (showMessages === false && force !== true) return;
  _msgText = String(text);
  _msgCounter = HU_MSGTIMEOUT;
}

// m_menu.c:M_ChangeMessages — flip the message display on/off and show the
// confirmation message itself (forced through the showMessages gate).
export function HU_ToggleMessages() {
  HU_SetShowMessages(showMessages ? 0 : 1);
  HU_QueueMessage(showMessages ? MSGON : MSGOFF, true);
}

export function HU_Ticker() {
  const p = players[consoleplayer];
  if (p === null || p === undefined) return;
  // Auto-detect new level (player mo changed).
  if (p.mo !== _lastMo) {
    _lastMo = p.mo;
    HU_Start();
  }
  // Drain player.message into the widget.
  if (p.message && p.message !== '') {
    HU_QueueMessage(p.message);
    p.message = '';
  }
  if (_msgCounter > 0)   _msgCounter--;
}

export function HU_Responder(_ev) { return false; }

// Render one string at virtual (vx, vy) using the loaded STCFN font.
function drawText(ctx, text, vx, vy, dstX, dstY, sx, sy) {
  if (text === '' || text === null) return;
  const layout = HU_LayoutText(text, HU_GetFont(), { x: vx, y: vy });
  HU_DrawLayout(ctx, layout, dstX, dstY, sx, sy);
}

// HU_Drawer renders messages on top of the 3D view; the STBAR is drawn separately
// by st_stuff.js. dstX/dstY/dstW/dstH = full 320x200 virtual screen.
export function HU_Drawer(overlayCtx, dstX, dstY, dstW, dstH) {
  const p = players[consoleplayer];
  if (p === null || p === undefined || p.mo === null) return;
  const sx = dstW / 320;
  const sy = dstH / 200;
  // Pickup / item / secret message at top-left.
  if (_msgCounter > 0 && _msgText !== '') {
    drawText(overlayCtx, _msgText, HU_MSGX, HU_MSGY, dstX, dstY, sx, sy);
  }
  // hu_stuff.c:486-493 draws the persistent title only over the automap.
  if (automapactive && _titleText !== '') {
    drawText(overlayCtx, _titleText, HU_TITLEX, HU_TITLEY, dstX, dstY, sx, sy);
  }
}
