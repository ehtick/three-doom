// Ported from: linuxdoom-1.10/am_map.c — automap (2D overhead line map).
// Draws all linedefs + the player triangle on the Canvas2D overlay, with
// per-linedef colors (am_map.c:AM_drawWalls), pan/zoom via +/-, follow toggle
// via 'f', Tab to open/close, mark placement via 'm', and mark clear via 'c'.

import {
  bmaporgx, bmaporgy, lines, numlines, vertexes,
} from './p_setup.js';
import {
  players, playeringame, consoleplayer, automapactive, set_automapactive,
  gameepisode, gamemap,
} from './doomstat.js';
import { ML_DONTDRAW, ML_SECRET, ML_MAPPED } from './doomdata.js';
import { KEY_TAB } from './doomdef.js';
import { evtype_t } from './d_event.js';
import { FRACUNIT } from './m_fixed.js';
import { V_PaletteCSS } from './v_palette.js';
import {
  AMSTR_FOLLOWON, AMSTR_FOLLOWOFF, AMSTR_GRIDON, AMSTR_GRIDOFF,
  AMSTR_MARKEDSPOT, AMSTR_MARKSCLEARED,
} from './d_englsh.js';
import {
  AM_ApplyControlEvent, AM_CreateViewState, AM_FRAME_HEIGHT, AM_FRAME_WIDTH,
  AM_OpenView, AM_ProjectFixedPoint, AM_TickViewState,
} from './am_map_logic.js';

// automapactive is a single engine-wide global in vanilla. Re-export the
// doomstat live binding so finale/level transitions and AM_* always mutate
// and observe the same state.
export { automapactive, set_automapactive } from './doomstat.js';

let _viewState = AM_CreateViewState(null, null);
let _lastLevel = -1;
let _lastEpisode = -1;
let _stopped = true;

// am_map.c color classes (AM_drawWalls): one-sided walls are red, teleporter
// lines mid-red, floor-height changes brown, ceiling-height changes yellow.
const COLOR_BACKGROUND = 0;              // BLACK
const COLOR_WALL       = 256 - 5 * 16;   // WALLCOLORS (REDS)
const COLOR_TELEPORT   = COLOR_WALL + 8; // WALLCOLORS + WALLRANGE/2
const COLOR_FLOORDIFF  = 4 * 16;         // FDWALLCOLORS (BROWNS)
const COLOR_CEILDIFF   = 256 - 32 + 7;   // CDWALLCOLORS (YELLOWS)
const COLOR_PLAYER     = 256 - 47;        // YOURCOLORS (WHITE)
const COLOR_GRID       = 6 * 16 + 8;     // GRIDCOLORS (GRAYS + 8)
const COLOR_MARK       = 103;            // opaque AMMNUM patch pixel index

// am_map.c:AM_NUMMARKPOINTS — player-placed map markers. x === -1 means empty.
const AM_NUMMARKPOINTS = 10;
const _markpoints = [];
for (let i = 0; i < AM_NUMMARKPOINTS; i++) _markpoints.push({ x: -1, y: -1 });
let _markpointnum = 0;

// am_map.c:524 — AM_clearMarks.
export function AM_clearMarks() {
  for (let i = 0; i < AM_NUMMARKPOINTS; i++) _markpoints[i].x = -1;
  _markpointnum = 0;
}

// am_map.c:377 — AM_addMark drops a marker at the automap view center.
export function AM_addMark() {
  _markpoints[_markpointnum].x = _viewState.mX + Math.trunc(_viewState.mW / 2);
  _markpoints[_markpointnum].y = _viewState.mY + Math.trunc(_viewState.mH / 2);
  _markpointnum = (_markpointnum + 1) % AM_NUMMARKPOINTS;
}

function mapPlayer() {
  let pnum = consoleplayer;
  if (playeringame[pnum] !== true) {
    pnum = playeringame.findIndex((active) => active === true);
  }
  return pnum >= 0 ? players[pnum] : null;
}

export function AM_Start() {
  if (_stopped !== true) AM_Stop();
  _stopped = false;
  const player = mapPlayer();
  const mo = player?.mo ?? null;
  if (_lastLevel !== gamemap || _lastEpisode !== gameepisode ||
      (_viewState.hasBounds !== true && Array.isArray(vertexes))) {
    _viewState = AM_CreateViewState(vertexes, mo, _viewState);
    AM_clearMarks();
    _lastLevel = gamemap;
    _lastEpisode = gameepisode;
  } else {
    _viewState = AM_OpenView(_viewState, mo);
  }
  set_automapactive(true);
}

export function AM_Stop() {
  set_automapactive(false);
  _stopped = true;
}
export function AM_Toggle() { if (automapactive) AM_Stop(); else AM_Start(); }

export function AM_Ticker() {
  if (!automapactive) return;
  _viewState = AM_TickViewState(_viewState, mapPlayer()?.mo ?? null);
}

export function AM_Responder(ev) {
  if (ev === undefined || ev === null) return false;
  if (!automapactive) {
    if (ev.type === evtype_t.ev_keydown && ev.data1 === KEY_TAB) {
      AM_Start();
      return true;
    }
    return false;
  }
  const player = mapPlayer();
  const result = AM_ApplyControlEvent(_viewState, ev, player?.mo ?? null);
  _viewState = result.state;
  if (result.action === 'stop') AM_Stop();
  else if (result.action === 'mark') {
    if (player !== null) player.message = `${AMSTR_MARKEDSPOT} ${_markpointnum}`;
    AM_addMark();
  } else if (result.action === 'clear') {
    AM_clearMarks();
  }
  if (player !== null && result.message !== null) {
    const messages = {
      followOn: AMSTR_FOLLOWON,
      followOff: AMSTR_FOLLOWOFF,
      gridOn: AMSTR_GRIDON,
      gridOff: AMSTR_GRIDOFF,
      marksCleared: AMSTR_MARKSCLEARED,
    };
    player.message = messages[result.message];
  }
  return result.handled;
}

export function AM_Drawer(overlayCtx, dstX, dstY, dstW, dstH) {
  if (!automapactive) return;
  // AM_clipMline constrains every framebuffer write to f_w/f_h. Canvas paths
  // need the equivalent explicit clip or off-window strokes can cover the
  // status-bar/lower letterbox region.
  overlayCtx.save();
  overlayCtx.beginPath();
  overlayCtx.rect(dstX, dstY, dstW, dstH);
  overlayCtx.clip();
  overlayCtx.fillStyle = V_PaletteCSS(COLOR_BACKGROUND);
  overlayCtx.fillRect(dstX, dstY, dstW, dstH);

  const sx = dstW / AM_FRAME_WIDTH;
  const sy = dstH / AM_FRAME_HEIGHT;

  function project(x, y) {
    const p = AM_ProjectFixedPoint(_viewState, x, y);
    return [dstX + p.x * sx, dstY + p.y * sy];
  }

  // am_map.c:AM_drawGrid — disabled by default and aligned to the BLOCKMAP
  // origin, not world coordinate zero.
  if (_viewState.grid === true) {
    overlayCtx.strokeStyle = V_PaletteCSS(COLOR_GRID);
    overlayCtx.lineWidth = 1;
    overlayCtx.beginPath();
    const step = 128 * FRACUNIT; // MAPBLOCKUNITS
    let start = _viewState.mX;
    let remainder = (start - bmaporgx) % step;
    if (remainder !== 0) start += step - remainder;
    const endX = _viewState.mX + _viewState.mW;
    for (let gx = start; gx < endX; gx += step) {
      const [px] = project(gx, 0);
      overlayCtx.moveTo(px, dstY);
      overlayCtx.lineTo(px, dstY + dstH);
    }
    start = _viewState.mY;
    remainder = (start - bmaporgy) % step;
    if (remainder !== 0) start += step - remainder;
    const endY = _viewState.mY + _viewState.mH;
    for (let gy = start; gy < endY; gy += step) {
      const [, py] = project(0, gy);
      overlayCtx.moveTo(dstX, py);
      overlayCtx.lineTo(dstX + dstW, py);
    }
    overlayCtx.stroke();
  }

  // Lines, bucketed by color (am_map.c:AM_drawWalls).
  overlayCtx.lineWidth = 1.5;
  const buckets = new Map();
  for (let i = 0; i < numlines; i++) {
    const li = lines[i];
    // LINE_NEVERSEE — never draw.
    if ((li.flags & ML_DONTDRAW) !== 0) continue;
    // Fog of war: only show linedefs the player has been near (ML_MAPPED set
    // by r_main.R_SetupFrame for the player's current subsector).
    if ((li.flags & ML_MAPPED) === 0) continue;
    let color;
    if (li.backsector === null) {
      color = COLOR_WALL;                        // one-sided wall
    } else if (li.special === 39) {
      color = COLOR_TELEPORT;                    // teleporter line
    } else if ((li.flags & ML_SECRET) !== 0) {
      color = COLOR_WALL;                        // secret door — looks solid
    } else if (li.backsector.floorheight !== li.frontsector.floorheight) {
      color = COLOR_FLOORDIFF;                   // floor-level change
    } else if (li.backsector.ceilingheight !== li.frontsector.ceilingheight) {
      color = COLOR_CEILDIFF;                    // ceiling-level change
    } else {
      continue;                                  // two-sided, no height change
    }
    let b = buckets.get(color);
    if (b === undefined) { b = []; buckets.set(color, b); }
    b.push(li);
  }
  for (const [color, list] of buckets) {
    overlayCtx.strokeStyle = V_PaletteCSS(color);
    overlayCtx.beginPath();
    for (const li of list) {
      const [x1, y1] = project(li.v1.x, li.v1.y);
      const [x2, y2] = project(li.v2.x, li.v2.y);
      overlayCtx.moveTo(x1, y1);
      overlayCtx.lineTo(x2, y2);
    }
    overlayCtx.stroke();
  }

  // Player triangle.
  const p = mapPlayer();
  if (p !== undefined && p !== null && p.mo !== null) {
    const [px, py] = project(p.mo.x, p.mo.y);
    const angle = (p.mo.angle >>> 0) / 0x100000000 * Math.PI * 2;
    const r = 12;
    overlayCtx.strokeStyle = V_PaletteCSS(COLOR_PLAYER);
    overlayCtx.lineWidth = 2;
    overlayCtx.beginPath();
    overlayCtx.moveTo(px + Math.cos(angle) * r, py - Math.sin(angle) * r);
    overlayCtx.lineTo(px + Math.cos(angle + 2.5) * r * 0.7, py - Math.sin(angle + 2.5) * r * 0.7);
    overlayCtx.lineTo(px + Math.cos(angle - 2.5) * r * 0.7, py - Math.sin(angle - 2.5) * r * 0.7);
    overlayCtx.closePath();
    overlayCtx.stroke();
  }

  // Player-placed marks (am_map.c:AM_drawMarks).
  overlayCtx.fillStyle = V_PaletteCSS(COLOR_MARK);
  overlayCtx.font = 'bold 10px monospace';
  overlayCtx.textAlign = 'center';
  overlayCtx.textBaseline = 'middle';
  for (let i = 0; i < AM_NUMMARKPOINTS; i++) {
    const m = _markpoints[i];
    if (m.x === -1) continue;
    const [mx, my] = project(m.x, m.y);
    if (mx < dstX || mx > dstX + dstW || my < dstY || my > dstY + dstH) continue;
    overlayCtx.fillText(String(i), mx, my);
  }
  overlayCtx.restore();
}
