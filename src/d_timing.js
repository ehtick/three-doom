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
