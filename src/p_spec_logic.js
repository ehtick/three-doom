// Pure fixed-point helpers for per-tic sector/line specials.

export const SCROLL_TEXTURE_STEP = 1 << 16; // FRACUNIT

// p_spec.c special 48 advances side 0 by one texture column every tic.
export function P_AdvanceScrollTextureOffset(textureOffset) {
  return (textureOffset + SCROLL_TEXTURE_STEP) | 0;
}
