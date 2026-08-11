// 2D overlay renderer for the player's "psprite" (weapon + muzzle flash).
// In linuxdoom this is part of r_things.c's masked-sprite path (R_DrawPlayerSprites);
// in the 3D port we render the same patches via Canvas2D since they live in
// screen space (no perspective).
//
// Each pspr entry references a state via player.psprites[].state which is an
// index into the global states[] table. The state has a sprite + frame; the
// sprite name + 'A' + '0' (rotation) gives the lump name (e.g. PISGA0).

import { sprnames, states } from './info.js';
import { sprites } from './r_things.js';
import { W_CacheLumpNum } from './w_wad.js';
import { colormaps, firstspritelump } from './r_data.js';
import { patch_t, V_CreatePaletteCanvasInfo } from './v_video.js';
import { powertype_t, SCREENWIDTH, SCREENHEIGHT } from './doomdef.js';
import {
  PSPRITE_SHADOW_ROW,
  R_IsPspriteInvisible,
  R_PspriteColormapRow,
  R_RemapPspriteIndex,
  SPRITE_SHADOW_FLICKER,
  SPRITE_SHADOW_OPACITY,
} from './r_sprite_logic.js';
import {
  R_DrawPspritePatch,
  R_ProjectPspritePatch,
  R_PspritePatchBounds,
} from './r_psprite_projection.js';

// Cache source indices and one remapped Canvas per COLORMAP row. Each Canvas
// still resolves those remapped indices through the active PLAYPAL lazily.
const _cache = new Map();
export function R_ShutdownPlayerSprites() { _cache.clear(); }
function decodePatch(lumpIdx) {
  let entry = _cache.get(lumpIdx);
  if (entry !== undefined) return entry;
  const bytes = W_CacheLumpNum(firstspritelump + lumpIdx, 0);
  const p = patch_t(bytes);
  const indices = new Uint8Array(p.width * p.height);
  const alphas = new Uint8Array(p.width * p.height);
  for (let col = 0; col < p.width; col++) {
    let colptr = p.columnofs(col);
    while (bytes[colptr] !== 0xff) {
      const topdelta = bytes[colptr];
      const length   = bytes[colptr + 1];
      const src      = colptr + 3;
      for (let i = 0; i < length; i++) {
        const y = topdelta + i;
        const dst = y * p.width + col;
        indices[dst] = bytes[src + i];
        alphas[dst] = 255;
      }
      colptr += length + 4;
    }
  }
  entry = {
    indices,
    alphas,
    w: p.width,
    h: p.height,
    leftoffset: p.leftoffset,
    topoffset: p.topoffset,
    canvases: new Map(),
  };
  _cache.set(lumpIdx, entry);
  return entry;
}

// Build the palette-index image selected by R_DrawPSprite. The mapping is
// cached independently of PLAYPAL; V_CreatePaletteCanvasInfo repaints it when
// damage/bonus/radiation palette selection changes.
export function R_CreatePspriteCanvasInfo(source, colormapRow, maps = colormaps) {
  let canvasInfo = source.canvases.get(colormapRow);
  if (canvasInfo !== undefined) return canvasInfo;

  const remapped = new Uint8Array(source.indices.length);
  for (let i = 0; i < remapped.length; i++) {
    if (source.alphas[i] !== 0) {
      remapped[i] = R_RemapPspriteIndex(source.indices[i], colormapRow, maps);
    }
  }
  canvasInfo = V_CreatePaletteCanvasInfo(
    remapped,
    source.alphas,
    source.w,
    source.h,
    source.leftoffset,
    source.topoffset,
  );
  source.canvases.set(colormapRow, canvasInfo);
  return canvasInfo;
}

// Draw the player's psprites onto the overlay canvas. Called from D_Display
// after the 3D scene is painted. dstX/Y/W/H describe the complete logical
// 320x200 screen; an optional view applies native reduced-view projection.
export function R_DrawPlayerSprites(overlayCtx, player, dstX, dstY, dstW, dstH, view = null) {
  if (player === null || player.mo === null) return;
  const sx = dstW / SCREENWIDTH;
  const sy = dstH / SCREENHEIGHT;
  const invisible = R_IsPspriteInvisible(player.powers?.[powertype_t.pw_invisibility] ?? 0);
  const sectorLight = player.mo.subsector?.sector?.lightlevel ?? 255;
  // Exact fuzzcolfunc would have to sample neighbouring pixels from the final
  // composed indexed framebuffer. The Canvas overlay cannot access that
  // structure, so it deliberately matches the world renderer's dark indexed
  // silhouette plus translucent shimmer approximation instead.
  const shadowOpacity = invisible
    ? SPRITE_SHADOW_OPACITY + (Math.random() - 0.5) * 2 * SPRITE_SHADOW_FLICKER
    : 1;
  const reduced = view !== null && view !== undefined;
  if (reduced) {
    overlayCtx.save();
    overlayCtx.beginPath();
    overlayCtx.rect(
      dstX + view.viewwindowx * sx,
      dstY + view.viewwindowy * sy,
      view.scaledviewwidth * sx,
      view.viewheight * sy,
    );
    overlayCtx.clip();
  }
  try {
    for (const psp of player.psprites) {
      // Vanilla: `if (!psp->state) continue;` — state pointer NULL means inactive.
      // The JS port uses index 0 (S_NULL) or -1 as the inactive marker.
      if (psp.state === -1 || psp.state === 0 || psp.state == null) continue;
      const st = states[psp.state];
      if (st === undefined) continue;
      const sd = sprites[st.sprite];
      if (sd === undefined || sd.numframes === 0) continue;
      const frame = st.frame & 0x7fff;
      if (frame >= sd.numframes) continue;
      const sf = sd.spriteframes[frame];
      const lumpIdx = sf.lump[0];
      if (lumpIdx < 0) continue;
      const source = decodePatch(lumpIdx);
      const colormapRow = R_PspriteColormapRow(
        invisible,
        player.fixedcolormap,
        st.frame,
        sectorLight,
        player.extralight,
        reduced ? view.scaledviewwidth : SCREENWIDTH,
      );
      const t = R_CreatePspriteCanvasInfo(source, colormapRow);
      // R_DrawPSprite computes its patch bounds before inspecting flip. The
      // flipped branch only reverses startfrac/xiscale, so both orientations
      // retain the exact same spriteoffset/spritetopoffset rectangle.
      let bounds;
      if (reduced) {
        const projected = R_ProjectPspritePatch(psp.sx, psp.sy, t, view.viewwidth, view.viewheight);
        if (projected.clipLeft >= projected.clipRight || projected.clipTop >= projected.clipBottom) continue;
        const detailScale = 1 << view.detailshift;
        bounds = {
          ...projected,
          left: view.viewwindowx + projected.left * detailScale,
          right: view.viewwindowx + projected.right * detailScale,
          top: view.viewwindowy + projected.top,
          bottom: view.viewwindowy + projected.bottom,
          width: projected.width * detailScale,
        };
      } else {
        bounds = R_PspritePatchBounds(psp.sx, psp.sy, t);
      }
      const previousAlpha = overlayCtx.globalAlpha;
      if (colormapRow === PSPRITE_SHADOW_ROW) overlayCtx.globalAlpha = shadowOpacity;
      try {
        R_DrawPspritePatch(
          overlayCtx,
          t.canvas,
          bounds,
          dstX,
          dstY,
          sx,
          sy,
          sf.flip[0] === 1,
        );
      } finally {
        overlayCtx.globalAlpha = previousAlpha;
      }
    }
  } finally {
    if (reduced) overlayCtx.restore();
  }
}
