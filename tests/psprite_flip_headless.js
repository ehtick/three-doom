import { S_PISTOL, states } from '../src/info.js';
import { R_InitData } from '../src/r_data.js';
import { R_DrawPlayerSprites } from '../src/r_psprite.js';
import { R_InitSprites, sprites } from '../src/r_things.js';
import { V_InitPlaypal } from '../src/v_palette.js';
import { W_CacheLumpName, W_InitMultipleFiles } from '../src/w_wad.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function draw(player) {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  R_DrawPlayerSprites(ctx, player, 0, 0, 320, 200);
  return ctx.getImageData(0, 0, 320, 200).data;
}

async function run() {
  const wad = await fetch('../doom1.wad').then((response) => response.arrayBuffer());
  W_InitMultipleFiles([{ name: 'doom1.wad', buffer: wad }]);
  V_InitPlaypal(W_CacheLumpName('PLAYPAL', 0));
  R_InitData();
  R_InitSprites();

  const state = states[S_PISTOL];
  const frame = sprites[state.sprite].spriteframes[state.frame & 0x7fff];
  const player = {
    mo: { subsector: { sector: { lightlevel: 255 } } },
    powers: [],
    fixedcolormap: 0,
    extralight: 0,
    psprites: [
      { state: S_PISTOL, sx: 65536, sy: 32 * 65536 },
      { state: 0, sx: 0, sy: 0 },
    ],
  };

  const originalFlip = frame.flip[0];
  let normal;
  let flipped;
  try {
    frame.flip[0] = 0;
    normal = draw(player);
    frame.flip[0] = 1;
    flipped = draw(player);
  } finally {
    frame.flip[0] = originalFlip;
  }

  // Stock PISGA0 projects to x=127..183, y=138..199. Flip must reverse every
  // Canvas pixel within those same patch-origin bounds and alter no pixel
  // outside them.
  const left = 127, top = 138, width = 57, height = 62;
  let opaque = 0;
  let asymmetric = 0;
  for (let y = 0; y < 200; y++) {
    for (let x = 0; x < 320; x++) {
      const dst = (y * 320 + x) * 4;
      const inside = x >= left && x < left + width && y >= top && y < top + height;
      const sourceX = inside ? left + width - 1 - (x - left) : x;
      const src = (y * 320 + sourceX) * 4;
      for (let channel = 0; channel < 4; channel++) {
        const expected = inside ? normal[src + channel] : normal[dst + channel];
        assertEquals(flipped[dst + channel], expected, `pixel ${x},${y} channel ${channel}`);
      }
      if (!inside) {
        assertEquals(normal[dst + 3], 0, `normal pixel ${x},${y} outside patch bounds`);
        assertEquals(flipped[dst + 3], 0, `flipped pixel ${x},${y} outside patch bounds`);
      }
      if (inside && normal[dst + 3] !== 0) opaque++;
      if (inside && normal[dst] !== flipped[dst]) asymmetric++;
    }
  }
  if (opaque === 0) throw new Error('stock psprite drew no opaque pixels');
  if (asymmetric === 0) throw new Error('stock psprite did not prove horizontal reversal');

  return { ok: true, bounds: { left, top, width, height }, opaque, asymmetric };
}

run().then((result) => {
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
}).catch((error) => {
  const result = { ok: false, error: error.stack ?? String(error) };
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
});
