import { S_AttenuatedVolume } from '../src/s_attenuation_logic.js';

const FRACUNIT = 65536;
const CLOSE = 160 * FRACUNIT;
const CLIP = 1200 * FRACUNIT;
const ATTENUATOR = 1040;

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

// Independent line-for-line transcription of s_sound.c's volume block. It
// deliberately does not share constants or intermediate helpers with the port.
function cReferenceVolume(inputDistance, volume, map8) {
  let distance = inputDistance;
  if (map8 !== true && distance > 1200 * 65536) return null;

  let result = volume;
  if (distance >= 160 * 65536) {
    if (map8 === true && distance > 1200 * 65536) distance = 1200 * 65536;
    const wholeRemainder = Math.floor(((1200 * 65536) - distance) / 65536);
    if (map8 === true) {
      result = 15 + Math.trunc((volume - 15) * wholeRemainder / 1040);
    } else {
      result = Math.trunc(volume * wholeRemainder / 1040);
    }
  }

  return result > 0 ? result * 8 : null;
}

Deno.test('attenuation truncates fixed distance before division like s_sound.c', () => {
  const distances = [
    0,
    CLOSE - 1,
    CLOSE,
    CLOSE + 1,
    CLOSE + FRACUNIT - 1,
    CLOSE + FRACUNIT,
    400 * FRACUNIT,
    400 * FRACUNIT + 1,
    400 * FRACUNIT + FRACUNIT / 2,
    1069 * FRACUNIT + FRACUNIT / 2,
    1070 * FRACUNIT,
    1070 * FRACUNIT + 1,
    CLIP - FRACUNIT,
    CLIP - 1,
    CLIP,
    CLIP + 1,
  ];
  for (const volume of [0, 1, 8, 15]) {
    for (const map8 of [false, true]) {
      for (const distance of distances) {
        assertEquals(
          S_AttenuatedVolume(distance, volume, map8),
          cReferenceVolume(distance, volume, map8),
          `volume=${volume} map8=${map8} distance=${distance}`,
        );
      }
    }
  }
});

Deno.test('normal attenuation keeps Doom rounding before the Web Audio scale', () => {
  assertEquals(S_AttenuatedVolume(400 * FRACUNIT, 8, false), 48, '400-unit volume');
  assertEquals(S_AttenuatedVolume(CLOSE, 8, false), 64, 'close boundary');
  assertEquals(S_AttenuatedVolume(CLOSE + 1, 8, false), 56, 'first fixed step after close');
  assertEquals(S_AttenuatedVolume(1070 * FRACUNIT, 8, false), 8, 'last audible whole step');
  assertEquals(S_AttenuatedVolume(1070 * FRACUNIT + 1, 8, false), null, 'first inaudible fraction');
  assertEquals(ATTENUATOR, (CLIP - CLOSE) / FRACUNIT, 'test attenuator');
});

Deno.test('map 8 applies the same integer-first rounding before its 15-volume bias', () => {
  assertEquals(S_AttenuatedVolume(CLOSE, 8, true), 64, 'boss close boundary');
  assertEquals(S_AttenuatedVolume(CLOSE + 1, 8, true), 72, 'boss first fixed step');
  assertEquals(S_AttenuatedVolume(400 * FRACUNIT, 8, true), 80, 'boss 400-unit volume');
  assertEquals(S_AttenuatedVolume(CLIP, 8, true), 120, 'boss clipping boundary');
  assertEquals(S_AttenuatedVolume(CLIP + FRACUNIT, 8, true), 120, 'boss distance clamp');
});
