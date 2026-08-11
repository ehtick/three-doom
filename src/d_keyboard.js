// Browser-only: build player_t.cmd (ticcmd_t) from keyboard + mouse state
// each tic. Mirrors G_BuildTiccmd in g_game.c.
//
// We expose a `buildCmd(player)` function called from D_DoomLoop's tic step,
// so cmd is written exactly once per tic (in sync with P_PlayerThink).

import { renderer, I_RegisterGraphicsShutdownHook } from './i_video.js';
import { BT_CHANGE, BT_SPECIAL, BTS_PAUSE, BT_WEAPONSHIFT } from './d_event.js';
import { KEY_F11 } from './doomdef.js';
import { D_ComputeMovement, D_MouseStrafePressed } from './d_input_logic.js';

// Cache cross-module references at module load — keystrokes are a hot path
// and `await import()` per event adds microtask latency. The dynamic-import
// dance is only needed at startup to break the i_video ↔ m_menu cycle.
let _mMenu = null;
import('./m_menu.js').then((m) => { _mMenu = m; });

const keys = new Set();
let mouseDX = 0;
let mouseDY = 0;
let mouseButtons = 0;
// g_game.c:262 — two-stage accelerative turning. `turnheld` accumulates the
// number of tics the user has held a turn key; the pure movement helper picks
// the slow rate for the first six, then the normal/fast rate.
let turnheld = 0;
// g_game.c:355 — forward double-click → BT_USE shortcut.
let dclicks = 0;
let dclickstate = 0;
let dclicktime = 0;
let dclicks2 = 0;
let dclickstate2 = 0;
let dclicktime2 = 0;
// g_game.c:G_Responder — KEY_PAUSE latches sendpause; G_BuildTiccmd (buildCmd)
// drains it into the next ticcmd as BT_SPECIAL|BTS_PAUSE.
let sendpause = false;

let _listenersInstalled = false;
let _unregisterShutdownHook = null;
let _listenerGeneration = 0;
function listenerIsActive(generation) {
  return _listenersInstalled === true && generation === _listenerGeneration;
}
async function onKeyDown(e) {
      const generation = _listenerGeneration;
      keys.add(e.code);
      // preventDefault must run SYNCHRONOUSLY during dispatch — call it before
      // any awaited dynamic imports below, otherwise the browser's default
      // (e.g. Space scrolling the page) fires first.
      if (e.code === 'Space' || e.code.startsWith('Arrow') ||
          e.code.startsWith('Key') || e.code === 'ShiftLeft' ||
          e.code === 'ControlLeft' || e.code === 'AltLeft' || e.code === 'Tab' ||
          e.code === 'Pause') {
        e.preventDefault?.();
      }
      const ds = await import('./doomstat.js');
      if (listenerIsActive(generation) !== true) return;
      // KEY_PAUSE — toggle pause during live (non-demo) gameplay. Latch the
      // request; buildCmd encodes it into the next ticcmd and G_CheckSpecialButtons
      // performs the paused/music toggle. Ignored outside a level so it can't
      // strand sendpause across a demo (which bypasses buildCmd).
      if (e.code === 'Pause') {
        if (ds.gamestate === 0 /*GS_LEVEL*/ && ds.demoplayback !== true) sendpause = true;
        return;
      }
      // Outside active gameplay (title pages / demo playback), any non-Esc
      // keypress opens the main menu so the user doesn't have to know which
      // key to press. Esc keeps the menu closed in that state.
      if (ds.menuactive !== true &&
          (ds.gamestate === 3 /*GS_DEMOSCREEN*/ ||
           (ds.gamestate === 0 /*GS_LEVEL*/ && ds.demoplayback === true))) {
        if (e.code !== 'Escape' && _mMenu !== null) _mMenu.M_StartControlPanel();
        e.preventDefault?.();
        return;
      }
      // Intermission screen — any keypress advances. Check this before
      // automap / cheats so the press-to-continue gesture isn't mistaken
      // for an in-game action. (gamestate_t.GS_INTERMISSION === 1)
      //
      // ALWAYS consume the key while gamestate==INTERMISSION, even if
      // WI_Responder returns false (it does once WI._active flips off after
      // onDone fires — there's a 1-tic gap before gamestate transitions to
      // GS_LEVEL). Without the unconditional swallow, an Escape pressed in
      // that window falls through to the menu branch below and opens the
      // main menu instead of doing nothing.
      if (ds.gamestate === 1 /*GS_INTERMISSION*/) {
        // Ignore keyboard auto-repeat so a held key accelerates the tally only
        // once per physical press — matches vanilla WI_checkForAccelerate's
        // rising-edge (attackdown/usedown) debounce.
        if (e.repeat !== true) {
          const wi = await import('./wi_stuff.js');
          if (listenerIsActive(generation) !== true) return;
          wi.WI_Responder({ type: 0, data1: e.keyCode | 0 });
        }
        e.preventDefault?.();
        return;
      }
      // Outside the MAP30 cast, finales advance from held attack/use buttons
      // sampled into ticcmds—not arbitrary key events. Consume other keys so
      // they cannot leak into automap, cheats, or weapon selection. Escape may
      // still reach the menu, matching the global menu responder.
      if (ds.gamestate === 2 /*GS_FINALE*/ && ds.menuactive !== true) {
        const finale = await import('./f_finale.js');
        if (listenerIsActive(generation) !== true) return;
        if (e.code !== 'Escape' && e.repeat !== true &&
            finale.F_Responder({ type: 0, data1: e.keyCode | 0 })) {
          e.preventDefault?.();
          return;
        }
        if (e.code !== 'Escape') {
          e.preventDefault?.();
          return;
        }
      }
      // Single-shot automap controls.
      if (e.code === 'Tab') {
        const am = await import('./am_map.js');
        if (listenerIsActive(generation) !== true) return;
        am.AM_Toggle();
      } else if (e.code === 'Equal' || e.code === 'NumpadAdd') {
        const am = await import('./am_map.js');
        if (listenerIsActive(generation) !== true) return;
        am.AM_Responder({ type: 0, data1: 0x2b });
      } else if (e.code === 'Minus' || e.code === 'NumpadSubtract') {
        const am = await import('./am_map.js');
        if (listenerIsActive(generation) !== true) return;
        am.AM_Responder({ type: 0, data1: 0x2d });
      } else if (e.code === 'KeyF') {
        const am = await import('./am_map.js');
        if (listenerIsActive(generation) !== true) return;
        am.AM_Responder({ type: 0, data1: 0x66 });
      }
      // Menu — Esc opens/closes; while menu is open or a modal is up, route
      // arrows / Enter / Backspace / y / n through M_Responder.
      else if (e.code === 'Escape' || e.code === 'F11' || ds.menuactive) {
        const m = await import('./m_menu.js');
        if (listenerIsActive(generation) !== true) return;
        const codeToKey = {
          Escape: 27, Enter: 13, NumpadEnter: 13, Backspace: 127 /*KEY_BACKSPACE*/,
          ArrowUp: 0xad, ArrowDown: 0xaf, ArrowLeft: 0xac, ArrowRight: 0xae,
          F11: KEY_F11,
          KeyY: 0x79, KeyN: 0x6e,
        };
        const data1 = codeToKey[e.code];
        if (data1 !== undefined && m.M_Responder({ type: 0, data1 })) {
          e.preventDefault?.();
          return;
        }
      }
      // Cheat sequencer — feed each lowercase letter through the table.
      else if (e.code.startsWith('Key')) {
        const ch = e.code.charAt(3).toLowerCase().charCodeAt(0);
        const cheat = await import('./m_cheat.js');
        if (listenerIsActive(generation) !== true) return;
        cheat.cht_HandleKey(ch);
      }
      // Weapon digits are sampled into BT_CHANGE by buildCmd, so recordings
      // carry the switch in the ticcmd instead of mutating pendingweapon here.
      if (e.code.startsWith('Digit')) {
        // Vanilla ST_Responder feeds every key (digits included) to the cheat
        // sequencer; without this IDMUS could never collect its 2-digit param.
        const digCh = e.code.slice(5).charCodeAt(0); // '0'..'9'
        const cheat = await import('./m_cheat.js');
        if (listenerIsActive(generation) !== true) return;
        cheat.cht_HandleKey(digCh);
      }
}

function onKeyUp(e) { keys.delete(e.code); }

async function onMouseDown(e) {
    const generation = _listenerGeneration;
    mouseButtons |= (1 << e.button);
    // Recapture pointer lock only during interactive play. Demo playback
    // shouldn't grab the cursor — the user might want to click out.
    const ds = await import('./doomstat.js');
    if (listenerIsActive(generation) !== true) return;
    if (ds.gamestate === 2 /*GS_FINALE*/) {
      // Mouse attack remains visible to the per-tic finale command sampler;
      // cast death input is keyboard-only in f_finale.c.
      e.preventDefault?.();
      return;
    }
    if (ds.gamestate === 0 /*GS_LEVEL*/ && !ds.demoplayback &&
        renderer !== null && document.pointerLockElement !== renderer.domElement) {
      renderer.domElement.requestPointerLock?.();
    }
}

function onMouseUp(e) { mouseButtons &= ~(1 << e.button); }

function onMouseMove(e) {
    if (renderer !== null && document.pointerLockElement === renderer.domElement) {
      mouseDX += e.movementX;
      mouseDY -= e.movementY;
    }
}

function installListeners() {
  if (_listenersInstalled) return;
  _listenersInstalled = true;
  _listenerGeneration++;
  document.addEventListener('keydown', onKeyDown);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('mousedown', onMouseDown);
  document.addEventListener('mouseup', onMouseUp);
  document.addEventListener('mousemove', onMouseMove);
  _unregisterShutdownHook = I_RegisterGraphicsShutdownHook(shutdownListeners);
}

function shutdownListeners() {
  _listenerGeneration++;
  if (_listenersInstalled === true) {
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousedown', onMouseDown);
    document.removeEventListener('mouseup', onMouseUp);
    document.removeEventListener('mousemove', onMouseMove);
    _listenersInstalled = false;
  }
  if (_unregisterShutdownHook !== null) {
    const unregister = _unregisterShutdownHook;
    _unregisterShutdownHook = null;
    unregister();
  }
  keys.clear();
  mouseDX = 0;
  mouseDY = 0;
  mouseButtons = 0;
  turnheld = 0;
  dclicks = 0;
  dclickstate = 0;
  dclicktime = 0;
  dclicks2 = 0;
  dclickstate2 = 0;
  dclicktime2 = 0;
  sendpause = false;
}

// Called when a level starts — captures the mouse for look-around. Falls back
// silently if the browser refuses (e.g. requires a user gesture in some flows).
export function D_AcquirePointerLock() {
  try { renderer?.domElement.requestPointerLock?.(); } catch { /* ignore */ }
}

export const D_KeyboardInput = {
  init(_player) { installListeners(); },
  installEarly() { installListeners(); },
  shutdown() { shutdownListeners(); },

  // Finale F_Ticker reads player.cmd.buttons exactly like linuxdoom. Movement
  // is irrelevant here, so sample only the controls that can set ticcmd bits.
  buildFinaleCmd(player) {
    if (player?.cmd === undefined) return;
    player.cmd.buttons = 0;
    if ((mouseButtons & 1) !== 0 || keys.has('ControlLeft') || keys.has('ControlRight')) player.cmd.buttons |= 1;
    if (keys.has('Space')) player.cmd.buttons |= 2;
  },

  // Build the ticcmd from current input. Called once per 35Hz tic.
  // Mirrors g_game.c::G_BuildTiccmd using vanilla's movement tables:
  //   forwardmove[2] = { 25, 50 }
  //   sidemove[2]    = { 24, 40 }
  //   angleturn[3]   = { 640, 1280, 320 }   // [normal, fast, slow]
  buildCmd(player) {
    const cmd = player.cmd;
    cmd.forwardmove = 0;
    cmd.sidemove    = 0;
    cmd.angleturn   = 0;
    cmd.buttons     = 0;
    // g_game.c:328 — vanilla pulls a queued chat character every tic. We
    // don't ship chat, but match the byte layout so demos record/play with
    // a deterministic chatchar slot.
    cmd.chatchar    = 0;
    // g_game.c:175 — vanilla movement tables.
    //   forwardmove[2] = { 25, 50 }
    //   sidemove[2]    = { 24, 40 }
    //   angleturn[3]   = { 640, 1280, 320 }  // [normal, fast, slow]
    const fast = keys.has('ShiftLeft') || keys.has('ShiftRight');
    // g_game.c:262 — accumulative turnheld. Slow turn only for the first
    // SLOWTURNTICS tics of the press, then accelerate.
    const turning = keys.has('ArrowLeft') || keys.has('ArrowRight');
    if (turning === true) turnheld++;
    else                  turnheld = 0;
    const mouseStrafe = D_MouseStrafePressed(mouseButtons);
    const strafe = keys.has('AltLeft') || keys.has('AltRight') || mouseStrafe;
    const movement = D_ComputeMovement({
      fast,
      forward: keys.has('KeyW') || keys.has('ArrowUp'),
      backward: keys.has('KeyS') || keys.has('ArrowDown'),
      strafeRight: keys.has('KeyD') || keys.has('Period'),
      strafeLeft: keys.has('KeyA') || keys.has('Comma'),
      turnRight: keys.has('ArrowRight'),
      turnLeft: keys.has('ArrowLeft'),
      strafe,
      mouseForward: (mouseButtons & 4) !== 0,
      mouseX: mouseDX,
      mouseY: mouseDY,
    }, turnheld);
    cmd.forwardmove = movement.forwardmove;
    cmd.sidemove = movement.sidemove;
    cmd.angleturn = movement.angleturn;
    mouseDX = mouseDY = 0;

    // Buttons.
    const attack = (mouseButtons & 1) !== 0 || keys.has('ControlLeft') || keys.has('ControlRight');
    const use    = keys.has('Space');
    if (attack === true) cmd.buttons |= 1; // BT_ATTACK
    if (use === true) {
      cmd.buttons |= 2; // BT_USE
      dclicks = 0;       // pressing Use cancels any pending forward dclick
    }

    // g_game.c:340 — weapon changes are part of the ticcmd (and therefore
    // demo/net data), not an immediate pendingweapon side effect.
    for (let slot = 1; slot <= 8; slot++) {
      if (!keys.has(`Digit${slot}`)) continue;
      cmd.buttons |= BT_CHANGE | ((slot - 1) << BT_WEAPONSHIFT);
      break;
    }

    // g_game.c:354 — double-clicking the forward mouse button within 20 tics
    // latches BT_USE. Lets you door-bump without leaving the mouse.
    const forwardDC = (mouseButtons & 4) !== 0; // right-mouse here = forward
    if (forwardDC !== (dclickstate !== 0) && dclicktime > 1) {
      dclickstate = forwardDC ? 1 : 0;
      if (dclickstate === 1) dclicks++;
      if (dclicks === 2) { cmd.buttons |= 2 /*BT_USE*/; dclicks = 0; }
      else dclicktime = 0;
    } else {
      dclicktime++;
      if (dclicktime > 20) { dclicks = 0; dclickstate = 0; }
    }
    // Middle-mouse strafe double-click uses the original second BT_USE state
    // machine. Keyboard Alt changes movement mode but contributes no click.
    if (mouseStrafe !== (dclickstate2 !== 0) && dclicktime2 > 1) {
      dclickstate2 = mouseStrafe ? 1 : 0;
      if (dclickstate2 === 1) dclicks2++;
      if (dclicks2 === 2) { cmd.buttons |= 2 /*BT_USE*/; dclicks2 = 0; }
      else dclicktime2 = 0;
    } else {
      dclicktime2++;
      if (dclicktime2 > 20) { dclicks2 = 0; dclickstate2 = 0; }
    }

    // g_game.c:430 — a queued pause overrides all other buttons this tic.
    if (sendpause === true) {
      sendpause = false;
      cmd.buttons = BT_SPECIAL | BTS_PAUSE;
    }
  },
};
