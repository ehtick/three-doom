import { FLAT_SIZE, R_FlatTextureUV } from '../src/r_plane_mapping.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function wrapTexel(value) {
  const integer = Math.floor(value * FLAT_SIZE);
  return ((integer % FLAT_SIZE) + FLAT_SIZE) % FLAT_SIZE;
}

// Independent transcription of r_draw.c:R_DrawSpan's spot calculation for an
// integer world point: row comes from (-worldY)&63 and column from worldX&63.
function referenceSpot(worldX, worldY) {
  return (((-worldY) & 63) * FLAT_SIZE) + (worldX & 63);
}

Deno.test('flat UVs reproduce R_MapPlane signed world coordinates', () => {
  const asymmetric = new Uint16Array(FLAT_SIZE * FLAT_SIZE);
  for (let y = 0; y < FLAT_SIZE; y++) {
    for (let x = 0; x < FLAT_SIZE; x++) asymmetric[y * FLAT_SIZE + x] = y * 100 + x;
  }

  for (const [worldX, worldY] of [
    [0, 0], [7, 5], [7, -5], [63, 63], [64, 64], [-1, -1], [-70, 91],
  ]) {
    const uv = R_FlatTextureUV(worldX, worldY);
    const glColumn = wrapTexel(uv.u);
    const glRow = wrapTexel(uv.v);
    const actual = asymmetric[glRow * FLAT_SIZE + glColumn];
    const expected = asymmetric[referenceSpot(worldX, worldY)];
    assertEquals(actual, expected, `flat texel at (${worldX}, ${worldY})`);
  }

  const north = R_FlatTextureUV(0, 5);
  const south = R_FlatTextureUV(0, -5);
  assertEquals(wrapTexel(north.v), 59, 'positive world Y selects negative flat row');
  assertEquals(wrapTexel(south.v), 5, 'negative world Y selects positive flat row');
});
