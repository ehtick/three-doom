// Browser timing helper for D_DoomLoop.
//
// Rendering may run slower or faster than Doom's fixed 35 Hz simulation.
// Convert elapsed wall time into a whole-tic count while carrying the
// fractional remainder forward. No due tics are discarded: a sustained low
// render rate must not slow the game clock.

import { TICRATE } from './doomdef.js';

export function D_AccumulateTics(remainder, elapsedSeconds) {
  const accumulated = remainder + elapsedSeconds * TICRATE;
  const due = Math.floor(accumulated);
  return { due, remainder: accumulated - due };
}

// d_main.c:D_Display completes the entire blocking melt before D_DoomLoop can
// return to TryRunTics.  A browser frame cannot block, so discard every whole
// simulation tic that passes while the melt spans RAFs.  Keep only the updated
// sub-tic phase: native timing is anchored to integer I_GetTime boundaries, and
// resetting the fraction would add up to one extra tic of post-wipe latency.
export function D_AdvanceSimulationClock(remainder, elapsedSeconds, wipeActive, singletics = false) {
  if (wipeActive === true) {
    const accumulated = remainder + elapsedSeconds * TICRATE;
    return { due: 0, remainder: accumulated - Math.floor(accumulated) };
  }
  // d_main.c:D_DoomLoop's singletics branch advances once per presented loop
  // iteration, independent of wall time. In the browser one RAF is that
  // iteration. Drop adaptive-clock debt so leaving timedemo cannot burst it.
  if (singletics === true) return { due: 1, remainder: 0 };
  return D_AccumulateTics(remainder, elapsedSeconds);
}
