import {
  P_StairSpeed,
  build8,
  turbo16,
} from '../src/p_spec_logic.js';

const FRACUNIT = 65536;

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('stair speeds match p_floor.c', () => {
  assertEquals(P_StairSpeed(build8), FRACUNIT / 4, 'build8 speed');
  assertEquals(P_StairSpeed(turbo16), 4 * FRACUNIT, 'turbo16 speed');
});
