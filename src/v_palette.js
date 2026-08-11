// Shared PLAYPAL state for every renderer. Doom changes the DAC palette for
// the complete indexed framebuffer, so WebGL textures and Canvas2D-decoded
// patches must all resolve their source indices through the same selection.

const V_PALETTE_COUNT = 14;
const V_PALETTE_COLORS = 256;

const RGB_BYTES = V_PALETTE_COLORS * 3;
const RGBA_BYTES = V_PALETTE_COLORS * 4;
const _playpalRGBA = new Uint8Array(V_PALETTE_COUNT * RGBA_BYTES);

let _activeIndex = 0;
let _revision = 0;
let _initialized = false;

// Accept either PLAYPAL's full 14-palette lump or one RGB palette. A lone
// palette is mirrored into every slot because there is no alternate flash
// palette data to select in that form.
export function V_InitPlaypal(rgbBytes) {
  const fullPlaypal = rgbBytes.length >= V_PALETTE_COUNT * RGB_BYTES;
  for (let p = 0; p < V_PALETTE_COUNT; p++) {
    const srcBase = fullPlaypal ? p * RGB_BYTES : 0;
    const dstBase = p * RGBA_BYTES;
    for (let i = 0; i < V_PALETTE_COLORS; i++) {
      const src = srcBase + i * 3;
      const dst = dstBase + i * 4;
      _playpalRGBA[dst + 0] = rgbBytes[src + 0] ?? 0;
      _playpalRGBA[dst + 1] = rgbBytes[src + 1] ?? 0;
      _playpalRGBA[dst + 2] = rgbBytes[src + 2] ?? 0;
      _playpalRGBA[dst + 3] = 255;
    }
  }
  _activeIndex = 0;
  _initialized = true;
  _revision++;
  return _playpalRGBA;
}

export function V_IsPlaypalReady() { return _initialized; }
export function V_GetPaletteIndex() { return _activeIndex; }
export function V_GetPaletteRevision() { return _revision; }

export function V_GetPalette(index = _activeIndex) {
  const selected = Number.isInteger(index) && index >= 0 && index < V_PALETTE_COUNT
    ? index
    : 0;
  const start = selected * RGBA_BYTES;
  return _playpalRGBA.subarray(start, start + RGBA_BYTES);
}

export function V_GetActivePalette() { return V_GetPalette(_activeIndex); }

export function V_SetPaletteIndex(index) {
  const selected = Number.isInteger(index) && index >= 0 && index < V_PALETTE_COUNT
    ? index
    : 0;
  if (selected !== _activeIndex) {
    _activeIndex = selected;
    _revision++;
  }
  return _activeIndex;
}

// Canvas source colors that stand in for indexed Doom pixels still need to
// follow PLAYPAL. Alpha is only for browser compositing and is not quantized.
export function V_PaletteCSS(index, alpha = 1) {
  const palette = V_GetActivePalette();
  const selected = Number.isInteger(index) && index >= 0 && index < V_PALETTE_COLORS
    ? index
    : 0;
  const offset = selected * 4;
  const r = palette[offset + 0];
  const g = palette[offset + 1];
  const b = palette[offset + 2];
  if (alpha >= 1) return `rgb(${r}, ${g}, ${b})`;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

// External RGB art has no source palette index. Quantize it once against
// PLAYPAL 0, after which normal palette selection can remap it exactly.
export function V_FindClosestBasePaletteIndex(r, g, b) {
  const base = V_GetPalette(0);
  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < V_PALETTE_COLORS; i++) {
    const offset = i * 4;
    const dr = r - base[offset + 0];
    const dg = g - base[offset + 1];
    const db = b - base[offset + 2];
    const distance = dr * dr + dg * dg + db * db;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
      if (distance === 0) break;
    }
  }
  return bestIndex;
}
