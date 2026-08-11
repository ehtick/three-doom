import { R_SkyRowStep, R_SkyTextureRow, R_SkyVisibleRows } from '../src/r_sky_logic.js';
import { R_CalculateViewSize } from '../src/r_view.js';

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const FRACUNIT = 65536;
const EXPECTED_RANGES = [
  [3, 218453, 20, 176],
  [4, 163840, 20, 177],
  [5, 131072, 20, 178],
  [6, 109226, 20, 178],
  [7, 93622, 20, 178],
  [8, 81920, 20, 178],
  [9, 72817, 20, 178],
  [10, 65536, 16, 183],
  [11, 65536, 0, 199],
];

Deno.test('sky rows match dc_texturemid/centery/pspriteiscale for every view row', () => {
  for (const [blocks, expectedStep, first, last] of EXPECTED_RANGES) {
    const view = R_CalculateViewSize(blocks);
    const cStep = Math.trunc(FRACUNIT * 320 / view.viewwidth) >> view.detailshift;
    assertEquals(R_SkyRowStep(view.viewwidth, view.detailshift), cStep, `step blocks ${blocks}`);
    assertEquals(cStep, expectedStep, `reference step blocks ${blocks}`);

    for (let y = 0; y < view.viewheight; y++) {
      const cRow = Math.floor(
        (100 * FRACUNIT + (y - Math.trunc(view.viewheight / 2)) * cStep) / FRACUNIT,
      );
      assertEquals(
        R_SkyTextureRow(y, view.viewwidth, view.viewheight, view.detailshift),
        cRow,
        `row blocks ${blocks} y ${y}`,
      );
    }
    assertEquals(
      R_SkyVisibleRows(view.viewwidth, view.viewheight, view.detailshift),
      { first, last },
      `visible range blocks ${blocks}`,
    );
  }
});

Deno.test('block 9 sky crops source rows 20 through 178 instead of stretching 0 through 199', () => {
  const view = R_CalculateViewSize(9);
  assertEquals(
    R_SkyVisibleRows(view.viewwidth, view.viewheight, view.detailshift),
    { first: 20, last: 178 },
    'block 9 sky range',
  );
});
