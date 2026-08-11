// Ported from: linuxdoom-1.10/f_finale.c — episode/chapter finale text,
// Doom 1 art screens and bunny scroller, plus Doom II's cast sequence:
//   E1 → text (E1TEXT) → CREDIT/HELP2 still
//   E2 → text (E2TEXT) → VICTORY2 still
//   E3 → text (E3TEXT) → bunny scroller (PFUB1 + PFUB2) → END0..END6 punchline

import {
  gameepisode, gamemode, gamemap,
  players,
  set_automapactive, set_gameaction, set_gamestate, set_viewactive,
} from './doomstat.js';
import { GameMode_t, gamestate_t } from './doomdef.js';
import { gameaction_t } from './d_event.js';
import { V_DecodePatchToCanvas } from './v_video.js';
import { S_ChangeMusic, S_StartMusic } from './s_sound.js';
import { mus_victor, mus_read_m, mus_bunny, mus_evil } from './sounds.js';
import { W_CacheLumpNum, W_CheckNumForName } from './w_wad.js';
import { playpal_rgba } from './r_data.js';
import {
  F_GetDoom1ArtPatch, F_GetFinaleSpec, F_ShouldAdvanceCommercial,
} from './f_finale_logic.js';

// State machine: 0 = typing text, 1 = post-text still / bunny scroll.
let _stage = 0;
let _finalecount = 0;
let _active = false;
let _done   = null;
let _finaleText = '';
let _finaleFlat = '';
let _commercial = false;
const getPatch = V_DecodePatchToCanvas;
const F_TEXTWAIT = 250;
// f_finale.c:TEXTSPEED — one character per 3 tics (≈12 chars/s at 35Hz).
const F_TEXTSPEED = 3;
const F_TEXTSTART = 10; // tics before the first character appears

export function F_StartFinale(onDone) {
  // f_finale.c:96-101 — entering a finale consumes the queued game action and
  // disables the live 3D view/automap until the finale advances.
  set_gameaction(gameaction_t.ga_nothing);
  set_gamestate(gamestate_t.GS_FINALE);
  set_viewactive(false);
  set_automapactive(false);
  _active = true;
  _done = onDone || (() => {});
  _finalecount = 0;
  _stage = 0;
  _castActive = false;
  const spec = F_GetFinaleSpec(gamemode, gameepisode, gamemap);
  _finaleText = spec.text;
  _finaleFlat = spec.flat;
  _commercial = gamemode === GameMode_t.commercial;
  // The browser rebuilds the local finale ticcmd from held controls each tic.
  // Clear the previous level's last command first so stale buttons cannot skip.
  for (const player of players) {
    if (player?.cmd !== undefined) player.cmd.buttons = 0;
  }
  // f_finale.c:113 — Doom 1 (shareware/registered/retail) plays mus_victor on
  // the end-of-episode text screen; commercial/indeterminate use mus_read_m.
  const isDoom1 = gamemode === GameMode_t.shareware ||
                  gamemode === GameMode_t.registered ||
                  gamemode === GameMode_t.retail;
  S_ChangeMusic(isDoom1 ? mus_victor : mus_read_m, true);
}

export function F_Responder(ev) {
  if (!_active) return false;
  if (_castActive) return F_CastResponder(ev);
  // f_finale.c:F_Responder only handles cast keydowns. Chapter skipping is
  // driven by ticcmd buttons in F_Ticker, so movement/weapon keys cannot skip.
  return false;
}

export function F_Ticker() {
  if (_active === false) return;
  if (_commercial && !_castActive) {
    const buttons = players.map((player) => player?.cmd?.buttons ?? 0);
    if (F_ShouldAdvanceCommercial(_finalecount, buttons)) {
      if (gamemap === 30) F_StartCast();
      else {
        _active = false;
        _done(); // G_WorldDone supplied a ga_worlddone callback.
        return;
      }
    }
  }
  _finalecount++;
  if (_castActive) { F_CastTicker(); return; }
  // Doom II holds its text screen until a ticcmd button; MAP30 enters the cast.
  if (_commercial) return;
  if (_stage === 0 && _finalecount > F_TEXTWAIT + _finaleText.length * F_TEXTSPEED) {
    _stage = 1;
    _finalecount = 0;
    // f_finale.c:247 — the E3 bunny scroller gets its own track.
    if (gameepisode === 3) S_StartMusic(mus_bunny);
  }
}

const _flatCanvasCache = new Map();
function getFlatCanvas(name) {
  if (_flatCanvasCache.has(name)) return _flatCanvasCache.get(name);
  if (typeof document === 'undefined' || playpal_rgba === null) return null;
  const lumpnum = W_CheckNumForName(name);
  if (lumpnum < 0) { _flatCanvasCache.set(name, null); return null; }
  const bytes = W_CacheLumpNum(lumpnum, 0);
  if (bytes.length < 64 * 64) { _flatCanvasCache.set(name, null); return null; }
  const tile = document.createElement('canvas');
  tile.width = 64; tile.height = 64;
  const tileCtx = tile.getContext('2d');
  const image = tileCtx.createImageData(64, 64);
  for (let i = 0; i < 64 * 64; i++) {
    const pal = bytes[i] * 4;
    const out = i * 4;
    image.data[out]     = playpal_rgba[pal];
    image.data[out + 1] = playpal_rgba[pal + 1];
    image.data[out + 2] = playpal_rgba[pal + 2];
    image.data[out + 3] = 255;
  }
  tileCtx.putImageData(image, 0, 0);
  const screen = document.createElement('canvas');
  screen.width = 320; screen.height = 200;
  const screenCtx = screen.getContext('2d');
  screenCtx.fillStyle = screenCtx.createPattern(tile, 'repeat');
  screenCtx.fillRect(0, 0, 320, 200);
  _flatCanvasCache.set(name, screen);
  return screen;
}

function F_TextWrite(ctx, dx, dy, dw, dh) {
  const background = getFlatCanvas(_finaleFlat);
  if (background !== null) ctx.drawImage(background, dx, dy, dw, dh);
  else { ctx.fillStyle = '#000'; ctx.fillRect(dx, dy, dw, dh); }
  const sx = dw / 320, sy = dh / 200;
  const lineH = 11 * sy;
  ctx.font = `bold ${lineH}px monospace`;
  ctx.fillStyle = '#ffcf00';
  ctx.textAlign = 'left';
  // f_finale.c:F_TextWrite — `count = (finalecount - 10) / TEXTSPEED`
  // characters revealed so far. Clamped to text length.
  const maxChars = Math.min(_finaleText.length,
    Math.max(0, ((_finalecount - F_TEXTSTART) / F_TEXTSPEED) | 0));
  const visible = _finaleText.slice(0, maxChars);
  const lines = visible.split('\n');
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], dx + 10 * sx, dy + (10 + i * 11) * sy);
  }
}

// F_BunnyScroll — E3 ending. Two 320-wide images (PFUB1 + PFUB2) scroll
// horizontally over ~3 seconds, then DOOM-style "THE END" END0..END6 patches
// pop in stage-by-stage with a pistol shot per frame.
function F_BunnyScroll(ctx, dx, dy, dw, dh) {
  const sx = dw / 320, sy = dh / 200;
  const p1 = getPatch('PFUB2'); // left image (drawn first)
  const p2 = getPatch('PFUB1'); // right image
  let scrolled = 320 - ((_finalecount - 230) / 2) | 0;
  if (scrolled > 320) scrolled = 320;
  if (scrolled < 0)   scrolled = 0;
  // Composite: 320-pixel-wide viewport sourced from p1 (cols 0..320-scrolled-1)
  // followed by p2 (cols 0..scrolled-1). Pillarbox black if absent.
  ctx.fillStyle = '#000';
  ctx.fillRect(dx, dy, dw, dh);
  if (p1 !== null) {
    const visW = 320 - scrolled;
    if (visW > 0) ctx.drawImage(p1.canvas, scrolled, 0, visW, p1.h, dx, dy, visW * sx, dh);
  }
  if (p2 !== null && scrolled > 0) {
    ctx.drawImage(p2.canvas, 0, 0, scrolled, p2.h, dx + (320 - scrolled) * sx, dy, scrolled * sx, dh);
  }
  if (_finalecount < 1130) return;
  let stage;
  if (_finalecount < 1180) stage = 0;
  else {
    stage = ((_finalecount - 1180) / 5) | 0;
    if (stage > 6) stage = 6;
  }
  const end = getPatch(`END${stage}`);
  if (end !== null) {
    const ex = dx + ((320 - end.w) / 2) * sx;
    const ey = dy + ((200 - end.h) / 2) * sy;
    ctx.drawImage(end.canvas, ex, ey, end.w * sx, end.h * sy);
  }
}

export function F_Drawer(ctx, dx, dy, dw, dh) {
  if (!_active) return;
  if (_castActive) { F_CastDrawer(ctx, dx, dy, dw, dh); return; }
  if (_stage === 0) { F_TextWrite(ctx, dx, dy, dw, dh); return; }
  // Stage 1: still picture (or bunny scroll for E3).
  if (gameepisode === 3) { F_BunnyScroll(ctx, dx, dy, dw, dh); return; }
  const sx = dw / 320, sy = dh / 200;
  ctx.fillStyle = '#000';
  ctx.fillRect(dx, dy, dw, dh);
  const patchName = F_GetDoom1ArtPatch(gamemode, gameepisode);
  const pic = patchName === null ? null : getPatch(patchName);
  if (pic !== null) ctx.drawImage(pic.canvas, dx, dy, pic.w * sx, pic.h * sy);
}

export function F_isActive() { return _active; }

// ---------- F_CastDrawer / F_Cast* (Doom 2 cast call) ----------
// The cast call is a roster of every Doom monster, one at a time, looped
// through their attack animation. Shareware doom1.wad has no MAP30 to trigger
// it, but the functions are here for source-map parity with f_finale.c.

// f_finale.c:118 — castorder[]. HERO is the FINAL entry (the loop runs
// monsters first, hero last).
const CAST_ORDER = [
  { name: 'ZOMBIEMAN',             spr: 'POSS', type: 39 },
  { name: 'SHOTGUN GUY',           spr: 'SPOS', type: 40 },
  { name: 'HEAVY WEAPON DUDE',     spr: 'CPOS', type: 41 },
  { name: 'IMP',                   spr: 'TROO', type: 2  },
  { name: 'DEMON',                 spr: 'SARG', type: 42 },
  { name: 'LOST SOUL',             spr: 'SKUL', type: 18 },
  { name: 'CACODEMON',             spr: 'HEAD', type: 17 },
  { name: 'HELL KNIGHT',           spr: 'BOS2', type: 16 },
  { name: 'BARON OF HELL',         spr: 'BOSS', type: 15 },
  { name: 'ARACHNOTRON',           spr: 'BSPI', type: 20 },
  { name: 'PAIN ELEMENTAL',        spr: 'PAIN', type: 22 },
  { name: 'REVENANT',              spr: 'SKEL', type: 7  },
  { name: 'MANCUBUS',              spr: 'FATT', type: 8  },
  { name: 'ARCH-VILE',             spr: 'VILE', type: 3  },
  { name: 'THE SPIDER MASTERMIND', spr: 'SPID', type: 19 },
  { name: 'THE CYBERDEMON',        spr: 'CYBR', type: 21 },
  { name: 'OUR HERO',              spr: 'PLAY', type: 38 /*MT_PLAYER*/ },
];
let _castNum = 0, _castFrame = 0, _castTics = 0, _castActive = false, _castAttacking = false;

export function F_StartCast() { _castActive = true; _castNum = 0; _castFrame = 0; _castTics = 35; _castAttacking = false; S_ChangeMusic(mus_evil, true); /* f_finale.c:388 */ }
export function F_CastTicker() {
  if (!_castActive) return;
  if (--_castTics > 0) return;
  _castFrame = (_castFrame + 1) & 3;
  _castTics = 12;
  // After ~3 seconds, swing to the next monster.
  if (_castFrame === 0) {
    _castNum = (_castNum + 1) % CAST_ORDER.length;
    _castAttacking = false;
  }
}
export function F_CastResponder(ev) {
  if (!_castActive) return false;
  if (ev && ev.type === 0) {
    _castNum = (_castNum + 1) % CAST_ORDER.length;
    _castFrame = 0; _castTics = 12;
    return true;
  }
  return false;
}
export function F_CastDrawer(ctx, dx, dy, dw, dh) {
  if (!_castActive) return;
  const sx = dw / 320, sy = dh / 200;
  ctx.fillStyle = '#000';
  ctx.fillRect(dx, dy, dw, dh);
  // Background — use BOSSBACK if present (Doom 2 only), else solid.
  const bg = getPatch('BOSSBACK');
  if (bg !== null) ctx.drawImage(bg.canvas, dx, dy, bg.w * sx, bg.h * sy);
  // Monster name as a centred label.
  const cast = CAST_ORDER[_castNum];
  ctx.fillStyle = '#ffcf00';
  ctx.font = `bold ${Math.round(dh * 0.06)}px monospace`;
  ctx.textAlign = 'center';
  ctx.fillText(cast.name, dx + dw * 0.5, dy + dh * 0.92);
  // Sprite — first idle frame, rotation 0 (front).
  const sprName = cast.spr + String.fromCharCode(65 + (_castFrame & 3)) + '0'; // e.g. POSSA0
  const sp = getPatch(sprName);
  if (sp !== null) {
    const x = dx + (160 - sp.leftoffset) * sx;
    const y = dy + (170 - sp.topoffset)  * sy;
    ctx.drawImage(sp.canvas, x, y, sp.w * sx, sp.h * sy);
  }
  ctx.textAlign = 'left';
}
export function F_CastActive() { return _castActive; }
