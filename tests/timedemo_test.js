import {
  G_BeginTimeDemoSample,
  G_CompleteTimeDemoSample,
} from '../src/g_timedemo.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('timedemo reports elapsed demo and real tics from explicit starts', () => {
  const sample = G_BeginTimeDemoSample('DEMO1', 700, 1400);
  const result = G_CompleteTimeDemoSample(sample, 735, 1414);
  assertEquals(result.name, 'DEMO1', 'demo name');
  assertEquals(result.startGameTic, 700, 'start game tic');
  assertEquals(result.endGameTic, 735, 'end game tic');
  assertEquals(result.gametics, 35, 'elapsed game tics');
  assertEquals(result.realtics, 14, 'elapsed real tics');
  assertEquals(result.seconds, 0.4, 'elapsed seconds');
  assertEquals(result.fps, 87.5, 'rendered tic rate');
  assertEquals(result.message, 'timed 35 gametics in 14 realtics', 'native report');
});

Deno.test('zero-duration timedemo result is finite and deterministic', () => {
  const sample = G_BeginTimeDemoSample('', 9, 20);
  const result = G_CompleteTimeDemoSample(sample, 8, 19);
  assertEquals(result.gametics, 0, 'negative game clock clamp');
  assertEquals(result.realtics, 0, 'negative real clock clamp');
  assertEquals(result.seconds, 0, 'zero seconds');
  assertEquals(result.fps, null, 'undefined zero-time rate');
});
