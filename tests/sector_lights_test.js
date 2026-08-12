import { EV_LightTurnOn } from '../src/p_lights.js';
import { sectors, set_sectors } from '../src/p_setup.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function connect(sector, neighbor) {
  return { frontsector: sector, backsector: neighbor };
}

Deno.test('zero-brightness tag lighting preserves the mutated C parameter', () => {
  const previousSectors = sectors;
  const first = { tag: 9, lightlevel: 255, lines: [] };
  const second = { tag: 9, lightlevel: 255, lines: [] };
  const firstNeighbor = { tag: 0, lightlevel: 64, lines: [] };
  const secondNeighbor = { tag: 0, lightlevel: 192, lines: [] };
  first.lines = [connect(first, firstNeighbor)];
  second.lines = [connect(second, secondNeighbor)];
  set_sectors([first, second, firstNeighbor, secondNeighbor]);

  try {
    EV_LightTurnOn({ tag: 9 }, 0);
    assertEquals(first.lightlevel, 64, 'first tagged sector');
    assertEquals(second.lightlevel, 64, 'later sector reuses mutated bright value');
  } finally {
    set_sectors(previousSectors);
  }
});
