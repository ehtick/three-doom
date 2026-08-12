import {
  P_ChangeSectorFloorPic,
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

Deno.test('floorpic changes notify the retained plane renderer exactly once', () => {
  const sector = { floorpic: 12 };
  const updates = [];
  const update = (changedSector) => updates.push(changedSector.floorpic);

  assertEquals(P_ChangeSectorFloorPic(sector, 34, update), true, 'changed flat result');
  assertEquals(sector.floorpic, 34, 'changed flat stored');
  assertEquals(updates.join(','), '34', 'renderer observes changed flat');
  assertEquals(P_ChangeSectorFloorPic(sector, 34, update), false, 'unchanged flat result');
  assertEquals(updates.join(','), '34', 'unchanged flat does not upload again');
});
