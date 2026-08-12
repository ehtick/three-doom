import {
  EV_LightTurnOn,
  EV_TurnTagLightsOff,
  P_LightsSetExternals,
} from '../src/p_lights.js';
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

Deno.test('instant tag lighting refreshes retained renderer colors', () => {
  const previousSectors = sectors;
  const brightSector = { tag: 3, lightlevel: 32, lines: [] };
  const darkSector = { tag: 4, lightlevel: 192, lines: [] };
  const darkNeighbor = { tag: 0, lightlevel: 48, lines: [] };
  darkSector.lines = [connect(darkSector, darkNeighbor)];
  set_sectors([brightSector, darkSector, darkNeighbor]);

  const updates = [];
  P_LightsSetExternals({
    R_UpdateSectorLight: (sector) => updates.push([sector, sector.lightlevel]),
  });

  try {
    EV_LightTurnOn({ tag: 3 }, 160);
    EV_TurnTagLightsOff({ tag: 4 });
    assertEquals(updates.length, 2, 'renderer update count');
    assertEquals(updates[0][0], brightSector, 'bright sector update target');
    assertEquals(updates[0][1], 160, 'bright update observes new value');
    assertEquals(updates[1][0], darkSector, 'dark sector update target');
    assertEquals(updates[1][1], 48, 'dark update observes new value');
  } finally {
    P_LightsSetExternals({ R_UpdateSectorLight: () => {} });
    set_sectors(previousSectors);
  }
});
