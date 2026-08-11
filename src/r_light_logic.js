// Pure mirrors of linuxdoom-1.10's light-table indexing.  The WebGL shader
// uses the same constants and formulas; keeping CPU versions here makes the
// integer lookup behavior independently testable without importing Three.js.

export const LIGHTLEVELS = 16;
export const MAXLIGHTSCALE = 48;
export const MAXLIGHTZ = 128;
export const NUMCOLORMAPS = 32;
export const DISTMAP = 2;

// The port keeps Doom's 320-pixel-wide, 90-degree horizontal projection even
// when the canvas is resized.  At that reference projection, rw_scale >> 12
// is floor((SCREENWIDTH / 2) * 16 / perpendicularDepth).
export const LIGHT_PROJECTION = 160;
export const WALL_SCALE_NUMERATOR = LIGHT_PROJECTION * 16;

function clamp(value, low, high) {
  return Math.min(Math.max(value, low), high);
}

function startMap(lightBucket, extralight) {
  const light = clamp((lightBucket + extralight) | 0, 0, LIGHTLEVELS - 1);
  return (((LIGHTLEVELS - 1 - light) * 2) * NUMCOLORMAPS / LIGHTLEVELS) | 0;
}

// r_segs.c:R_RenderSegLoop / R_RenderMaskedSegRange plus the scalelight table
// built by r_main.c:R_ExecuteSetViewSize at viewwidth == SCREENWIDTH.
export function R_WallLightRow(lightBucket, extralight, viewDepth) {
  const depth = Math.max(viewDepth, 1 / 65536);
  const scaleIndex = Math.min(Math.floor(WALL_SCALE_NUMERATOR / depth), MAXLIGHTSCALE - 1);
  const level = startMap(lightBucket, extralight) - Math.floor(scaleIndex / DISTMAP);
  return clamp(level, 0, NUMCOLORMAPS - 1);
}

// r_plane.c:R_MapPlane plus the zlight table built by
// r_main.c:R_InitLightTables.  One LIGHTZ step is 2^20 fixed-point units,
// i.e. 16 map units after removing FRACBITS (16).
export function R_PlaneLightRow(lightBucket, extralight, viewDepth) {
  const zIndex = Math.min(Math.floor(Math.max(viewDepth, 0) / 16), MAXLIGHTZ - 1);
  const scale = Math.floor(LIGHT_PROJECTION / (zIndex + 1));
  const level = startMap(lightBucket, extralight) - Math.floor(scale / DISTMAP);
  return clamp(level, 0, NUMCOLORMAPS - 1);
}
