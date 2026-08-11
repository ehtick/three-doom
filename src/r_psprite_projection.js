// Pure player-sprite projection and Canvas drawing helpers. These mirror the
// fixed-point bounds and flip branch in r_things.c:R_DrawPSprite.

import { FRACUNIT } from './m_fixed.js';

function fixedFloor(value) {
  return Math.floor(value / FRACUNIT);
}

function fixedCeil(value) {
  return Math.floor((value + FRACUNIT - 1) / FRACUNIT);
}

// At the reference 320-wide view, pspritescale is FRACUNIT. R_DrawPSprite's
// horizontal projection therefore reduces to sx - spriteoffset. Vertically,
// its BASEYCENTER + FRACUNIT/2 texture midpoint puts the first patch row at
// ceil(sy - spritetopoffset - 0.5), including fractional weapon bob.
export function R_PspritePatchBounds(pspSx, pspSy, patch) {
  const left = fixedFloor(pspSx - patch.leftoffset * FRACUNIT);
  const top = fixedCeil(pspSy - patch.topoffset * FRACUNIT - FRACUNIT / 2);
  return {
    left,
    top,
    right: left + patch.w,
    bottom: top + patch.h,
    width: patch.w,
    height: patch.h,
  };
}

// A flipped sprite keeps the exact same projected rectangle. Vanilla starts
// at spritewidth-1 with a negative xiscale; Canvas expresses that by moving
// the origin to the rectangle's right edge and reversing the local X axis.
export function R_DrawPspritePatch(ctx, canvas, bounds, dstX, dstY, scaleX, scaleY, flipped) {
  const x = dstX + bounds.left * scaleX;
  const y = dstY + bounds.top * scaleY;
  const width = bounds.width * scaleX;
  const height = bounds.height * scaleY;
  if (flipped !== true) {
    ctx.drawImage(canvas, 0, 0, bounds.width, bounds.height, x, y, width, height);
    return;
  }

  ctx.save();
  try {
    ctx.translate(x + width, y);
    ctx.scale(-1, 1);
    ctx.drawImage(canvas, 0, 0, bounds.width, bounds.height, 0, 0, width, height);
  } finally {
    ctx.restore();
  }
}
