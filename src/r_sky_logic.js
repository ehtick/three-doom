// Pure fixed-point sky-column projection from r_plane.c:R_DrawPlanes.

import { SCREENWIDTH } from './doomdef.js';
import { FRACUNIT } from './m_fixed.js';

export const SKY_TEXTUREMID = 100 * FRACUNIT;

export function R_SkyRowStep(viewwidth, detailshift = 0) {
  const pspriteiscale = Math.trunc(FRACUNIT * SCREENWIDTH / viewwidth);
  return pspriteiscale >> detailshift;
}

export function R_SkyTextureRow(
  screenY,
  viewwidth,
  viewheight,
  detailshift = 0,
  texturemid = SKY_TEXTUREMID,
) {
  const centery = Math.trunc(viewheight / 2);
  const frac = texturemid + (screenY - centery) * R_SkyRowStep(viewwidth, detailshift);
  return Math.floor(frac / FRACUNIT);
}

export function R_SkyVisibleRows(viewwidth, viewheight, detailshift = 0) {
  return {
    first: R_SkyTextureRow(0, viewwidth, viewheight, detailshift),
    last: R_SkyTextureRow(viewheight - 1, viewwidth, viewheight, detailshift),
  };
}
