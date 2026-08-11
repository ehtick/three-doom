import {
  R_WallLightRow,
  R_PlaneLightRow,
} from '../src/r_light_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

const FRACUNIT = 1n << 16n;
const LIGHTSCALESHIFT = 12n;
const LIGHTZSHIFT = 20n;
const MAXLIGHTSCALE = 48;
const MAXLIGHTZ = 128;
const LIGHTLEVELS = 16;
const NUMCOLORMAPS = 32;
const DISTMAP = 2;
const SCREENWIDTH = 320n;

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

// Independent integer transcription of R_ExecuteSetViewSize and
// R_RenderSegLoop for a perpendicular wall at the 320-wide reference view.
function cWallRow(lightBucket, extralight, depthFixed) {
  const light = clamp(lightBucket + extralight, 0, LIGHTLEVELS - 1);
  const startmap = Math.trunc(((LIGHTLEVELS - 1 - light) * 2) * NUMCOLORMAPS / LIGHTLEVELS);
  const projection = (SCREENWIDTH / 2n) * FRACUNIT;
  let rwScale = Number((projection << 16n) / depthFixed);
  rwScale = clamp(rwScale, 256, 64 * Number(FRACUNIT));
  let index = rwScale >> Number(LIGHTSCALESHIFT);
  if (index >= MAXLIGHTSCALE) index = MAXLIGHTSCALE - 1;
  let level = startmap - Math.trunc(index * Number(SCREENWIDTH) / 320 / DISTMAP);
  level = clamp(level, 0, NUMCOLORMAPS - 1);
  return level;
}

// Independent integer transcription of R_InitLightTables and R_MapPlane.
function cPlaneRow(lightBucket, extralight, distanceFixed) {
  const light = clamp(lightBucket + extralight, 0, LIGHTLEVELS - 1);
  const startmap = Math.trunc(((LIGHTLEVELS - 1 - light) * 2) * NUMCOLORMAPS / LIGHTLEVELS);
  let index = Number(distanceFixed >> LIGHTZSHIFT);
  if (index >= MAXLIGHTZ) index = MAXLIGHTZ - 1;
  const numerator = (SCREENWIDTH / 2n) * FRACUNIT;
  const denominator = BigInt(index + 1) << LIGHTZSHIFT;
  const fixedScale = Number((numerator << 16n) / denominator);
  const scale = fixedScale >> Number(LIGHTSCALESHIFT);
  return clamp(startmap - Math.trunc(scale / DISTMAP), 0, NUMCOLORMAPS - 1);
}

Deno.test('wall shader light formula matches every scalelight index and boundary', () => {
  const depths = new Set([1n, FRACUNIT]);
  // Exercise both sides of every ideal rw_scale >> LIGHTSCALESHIFT boundary.
  for (let index = 1; index <= MAXLIGHTSCALE; index++) {
    const boundary = (160n * FRACUNIT * 16n) / BigInt(index);
    for (const delta of [-1n, 0n, 1n]) {
      if (boundary + delta > 0n) depths.add(boundary + delta);
    }
  }
  // Include the far-scale clamp and representative long sight lines.
  for (const units of [64, 128, 256, 512, 1024, 2048, 2560, 4096, 32767]) {
    depths.add(BigInt(units) * FRACUNIT);
  }

  for (let lightBucket = -1; lightBucket <= 16; lightBucket++) {
    for (let extralight = 0; extralight <= 2; extralight++) {
      for (const depthFixed of depths) {
        const depth = Number(depthFixed) / Number(FRACUNIT);
        assertEquals(
          R_WallLightRow(lightBucket, extralight, depth),
          cWallRow(lightBucket, extralight, depthFixed),
          `wall bucket=${lightBucket} extra=${extralight} depthFixed=${depthFixed}`,
        );
      }
    }
  }
});

Deno.test('plane shader light formula matches every zlight index and boundary', () => {
  const distances = new Set([0n, 1n]);
  for (let index = 0; index <= MAXLIGHTZ; index++) {
    const boundary = BigInt(index) << LIGHTZSHIFT;
    for (const delta of [-1n, 0n, 1n]) {
      if (boundary + delta >= 0n) distances.add(boundary + delta);
    }
  }
  distances.add(32767n * FRACUNIT);

  for (let lightBucket = 0; lightBucket < LIGHTLEVELS; lightBucket++) {
    for (let extralight = 0; extralight <= 2; extralight++) {
      for (const distanceFixed of distances) {
        const depth = Number(distanceFixed) / Number(FRACUNIT);
        assertEquals(
          R_PlaneLightRow(lightBucket, extralight, depth),
          cPlaneRow(lightBucket, extralight, distanceFixed),
          `plane bucket=${lightBucket} extra=${extralight} distanceFixed=${distanceFixed}`,
        );
      }
    }
  }
});
