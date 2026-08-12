import * as doomstat from '../src/doomstat.js';
import {
  R_CalculateCanvasView,
  R_CalculateViewSize,
  R_CAMERA_FAR,
  R_CAMERA_NEAR,
  R_DoomVerticalFov,
  R_GetScreenblocks,
  R_SetViewSize,
} from '../src/r_view.js';
import { R_ProjectPspritePatch } from '../src/r_psprite_projection.js';

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const REFERENCE_VIEWS = [
  [3, 96, 48, 112, 60],
  [4, 128, 64, 96, 52],
  [5, 160, 80, 80, 44],
  [6, 192, 96, 64, 36],
  [7, 224, 112, 48, 28],
  [8, 256, 128, 32, 20],
  [9, 288, 144, 16, 12],
  [10, 320, 168, 0, 0],
  [11, 320, 200, 0, 0],
];

Deno.test('Three camera clipping covers the complete signed-short map volume', () => {
  // Use the full 65,536-unit fixed-point span conservatively; camera and mobj
  // coordinates can occupy the fractional endpoints around signed map data.
  const maxMapSpan = Math.hypot(65536, 65536, 65536);
  assertEquals(R_CAMERA_NEAR, 1, 'camera near plane');
  assertEquals(R_CAMERA_FAR, 131072, 'camera far plane');
  if (R_CAMERA_FAR <= maxMapSpan) {
    throw new Error(`far plane ${R_CAMERA_FAR} does not cover ${maxMapSpan}`);
  }
});

Deno.test('screenblocks 3 through 11 reproduce R_ExecuteSetViewSize exactly', () => {
  for (const [blocks, width, height, x, y] of REFERENCE_VIEWS) {
    const view = R_CalculateViewSize(blocks);
    assertEquals(view, {
      screenblocks: blocks,
      detailshift: 0,
      scaledviewwidth: width,
      viewwidth: width,
      viewheight: height,
      viewwindowx: x,
      viewwindowy: y,
    }, `screenblocks ${blocks}`);
  }
});

Deno.test('R_SetViewSize publishes every reference field and clamps menu/config input', () => {
  try {
    for (const [blocks, width, height, x, y] of REFERENCE_VIEWS) {
      R_SetViewSize(blocks);
      assertEquals(R_GetScreenblocks(), blocks, `stored blocks ${blocks}`);
      assertEquals(
        [doomstat.scaledviewwidth, doomstat.viewwidth, doomstat.viewheight,
          doomstat.viewwindowx, doomstat.viewwindowy],
        [width, width, height, x, y],
        `doomstat fields ${blocks}`,
      );
    }
    R_SetViewSize(-100);
    assertEquals(R_GetScreenblocks(), 3, 'lower screenblocks clamp');
    R_SetViewSize(100);
    assertEquals(R_GetScreenblocks(), 11, 'upper screenblocks clamp');
  } finally {
    R_SetViewSize(9);
  }
});

Deno.test('all reference views map into the same centered 320x200 canvas box', () => {
  for (const [blocks, width, height, x, y] of REFERENCE_VIEWS) {
    const layout = R_CalculateCanvasView(960, 600, R_CalculateViewSize(blocks));
    assertEquals({
      scale: layout.scale,
      screenX: layout.screenX,
      screenY: layout.screenY,
      screenWidth: layout.screenWidth,
      screenHeight: layout.screenHeight,
      viewX: layout.viewX,
      viewY: layout.viewY,
      viewWidth: layout.viewWidth,
      viewHeight: layout.viewHeight,
      webglViewY: layout.webglViewY,
    }, {
      scale: 3,
      screenX: 0,
      screenY: 0,
      screenWidth: 960,
      screenHeight: 600,
      viewX: x * 3,
      viewY: y * 3,
      viewWidth: width * 3,
      viewHeight: height * 3,
      webglViewY: 600 - (y + height) * 3,
    }, `canvas layout ${blocks}`);
  }

  const wide = R_CalculateCanvasView(1000, 500, R_CalculateViewSize(9));
  assertEquals(
    [wide.scale, wide.screenX, wide.screenY, wide.viewX, wide.viewY,
      wide.viewWidth, wide.viewHeight, wide.webglViewY],
    [2.5, 100, 0, 140, 30, 720, 360, 110],
    'letterboxed wide canvas',
  );
});

Deno.test('derived Three camera FOV remains 90 degrees horizontally at every size', () => {
  for (const [blocks] of REFERENCE_VIEWS) {
    const view = R_CalculateViewSize(blocks);
    const aspect = view.scaledviewwidth / view.viewheight;
    const vertical = R_DoomVerticalFov(aspect) * Math.PI / 180;
    const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * aspect) * 180 / Math.PI;
    if (Math.abs(horizontal - 90) > 1e-12) {
      throw new Error(`screenblocks ${blocks} horizontal FOV is ${horizontal}`);
    }
  }
});

Deno.test('PISGA0 psprite projection follows reduced view scale and clipping', () => {
  const patch = { w: 57, h: 62, leftoffset: -126, topoffset: -106 };
  const expected = [
    [3, 38, 36, 55, 54, 38, 36, 55, 48, 19660],
    [4, 50, 47, 73, 72, 50, 47, 73, 64, 26214],
    [5, 63, 59, 92, 90, 63, 59, 92, 80, 32768],
    [6, 76, 71, 110, 108, 76, 71, 110, 96, 39321],
    [7, 88, 83, 128, 126, 88, 83, 128, 112, 45875],
    [8, 101, 94, 147, 144, 101, 94, 147, 128, 52428],
    [9, 114, 106, 165, 162, 114, 106, 165, 144, 58982],
    [10, 127, 122, 184, 184, 127, 122, 184, 168, 65536],
    [11, 127, 138, 184, 200, 127, 138, 184, 200, 65536],
  ];
  for (const [blocks, left, top, right, bottom, clipLeft, clipTop,
    clipRight, clipBottom, scale] of expected) {
    const view = R_CalculateViewSize(blocks);
    const projected = R_ProjectPspritePatch(
      65536,
      32 * 65536,
      patch,
      view.viewwidth,
      view.viewheight,
    );
    assertEquals(
      [projected.left, projected.top, projected.right, projected.bottom,
        projected.clipLeft, projected.clipTop, projected.clipRight,
        projected.clipBottom, projected.scale],
      [left, top, right, bottom, clipLeft, clipTop, clipRight, clipBottom, scale],
      `psprite screenblocks ${blocks}`,
    );
  }
});
