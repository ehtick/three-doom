import { D_AccumulateTics } from '../src/d_timing.js';

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
