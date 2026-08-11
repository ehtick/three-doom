import { D_AccumulateTics, D_AdvanceSimulationClock } from '../src/d_timing.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('simulation remains 35 Hz at a sustained 5 Hz render rate', () => {
  let remainder = 0;
  let tics = 0;
  for (let frame = 0; frame < 5; frame++) {
    const clock = D_AccumulateTics(remainder, 0.2);
    tics += clock.due;
    remainder = clock.remainder;
  }
  assertEquals(tics, 35, 'whole simulation tics after one second');
  assertEquals(remainder, 0, 'fractional remainder after one second');
});

Deno.test('fractional tic time carries across render frames', () => {
  let clock = D_AccumulateTics(0, 1 / 60);
  assertEquals(clock.due, 0, 'first 60 Hz frame');
  clock = D_AccumulateTics(clock.remainder, 1 / 60);
  assertEquals(clock.due, 1, 'second 60 Hz frame');
  if (!(clock.remainder > 0 && clock.remainder < 1)) {
    throw new Error(`remainder must stay fractional, got ${clock.remainder}`);
  }
});

Deno.test('wipe frames discard whole tics but retain wall-clock phase', () => {
  const frozen = D_AdvanceSimulationClock(0.75, 0.02, true);
  assertEquals(frozen.due, 0, 'wipe frame due tics');
  if (Math.abs(frozen.remainder - 0.45) > Number.EPSILON * 4) {
    throw new Error(`wipe frame phase: expected 0.45, got ${frozen.remainder}`);
  }

  const resumed = D_AdvanceSimulationClock(frozen.remainder, 0.55 / 35, false);
  assertEquals(resumed.due, 1, 'remaining phase completes one resumed tic');
  if (Math.abs(resumed.remainder) > Number.EPSILON * 4) {
    throw new Error(`resumed phase: expected 0, got ${resumed.remainder}`);
  }
});

Deno.test('singletics advances exactly once per non-wipe rendered frame', () => {
  for (const elapsed of [0, 1 / 240, 1 / 60, 0.5, 10]) {
    const clock = D_AdvanceSimulationClock(0.875, elapsed, false, true);
    assertEquals(clock.due, 1, `singletics due count at ${elapsed}s`);
    assertEquals(clock.remainder, 0, `singletics remainder at ${elapsed}s`);
  }
  const wipe = D_AdvanceSimulationClock(0.25, 1 / 60, true, true);
  assertEquals(wipe.due, 0, 'singletics remains frozen during a wipe');
});
