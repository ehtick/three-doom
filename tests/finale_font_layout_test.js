import {
  HU_FONTSTART, HU_LayoutCenteredText, HU_LayoutText, HU_TextWidth,
} from '../src/hu_font.js';
import { F_GetFinaleTextCount } from '../src/f_finale_logic.js';

const finaleSource = await Deno.readTextFile(new URL('../src/f_finale.js', import.meta.url));

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function makeFont(widths) {
  const font = new Array(63).fill(null);
  for (const [character, width] of Object.entries(widths)) {
    font[character.charCodeAt(0) - HU_FONTSTART] = {
      w: width,
      h: 8,
      leftoffset: 2,
      topoffset: 3,
      canvas: null,
    };
  }
  return font;
}

Deno.test('finale HU layout uppercases, spaces unsupported characters, and advances lines', () => {
  const font = makeFont({ A: 5, B: 7 });
  const layout = HU_LayoutText('a \x01\nb', font, {
    x: 10,
    y: 10,
    maxChars: 5,
    lineHeight: 11,
    maxX: 320,
  });

  assertEquals(layout.glyphs.length, 2, 'drawn glyph count');
  assertEquals(layout.glyphs[0].index, 'A'.charCodeAt(0) - HU_FONTSTART, 'lowercase maps to A');
  assertEquals(layout.glyphs[0].x, 10, 'first glyph x');
  assertEquals(layout.glyphs[0].y, 10, 'first glyph y');
  assertEquals(layout.glyphs[1].index, 'B'.charCodeAt(0) - HU_FONTSTART, 'lowercase maps to B');
  assertEquals(layout.glyphs[1].x, 10, 'newline resets x');
  assertEquals(layout.glyphs[1].y, 21, 'newline adds eleven pixels');
  assertEquals(layout.x, 17, 'final proportional advance');
  assertEquals(layout.consumed, 5, 'newlines and unsupported characters consume reveal slots');
});

Deno.test('finale HU layout stops before a glyph crossing SCREENWIDTH', () => {
  const font = makeFont({ A: 6, B: 7 });
  const layout = HU_LayoutText('abA', font, { x: 310, y: 10, maxX: 320 });

  assertEquals(layout.glyphs.length, 1, 'only fitting glyph is drawn');
  assertEquals(layout.glyphs[0].x, 310, 'fitting glyph origin');
  assertEquals(layout.x, 316, 'rejected glyph does not advance x');
  assertEquals(layout.consumed, 2, 'overflow glyph is the last character examined');
  assertEquals(layout.stopped, true, 'layout reports screen-width stop');
});

Deno.test('cast HU layout uses proportional width, integer centering, and y 180', () => {
  const font = makeFont({ A: 5, B: 6 });
  assertEquals(HU_TextWidth('a b', font), 15, 'space advances four pixels');

  const layout = HU_LayoutCenteredText('a b', font, 160, 180);
  assertEquals(layout.width, 15, 'cast width');
  assertEquals(layout.glyphs[0].x, 153, 'odd width uses truncated integer half');
  assertEquals(layout.glyphs[0].y, 180, 'cast baseline origin');
  assertEquals(layout.glyphs[1].x, 162, 'second proportional glyph origin');
  assertEquals(layout.glyphs[1].y, 180, 'single cast line');
});

Deno.test('finale text reveal count matches C truncation at every boundary', () => {
  const cases = [
    [-1, 0], [0, 0], [7, 0], [8, 0], [9, 0], [10, 0], [12, 0],
    [13, 1], [15, 1], [16, 2], [19, 3],
  ];
  for (const [tic, expected] of cases) {
    assertEquals(F_GetFinaleTextCount(tic), expected, `finalecount ${tic}`);
  }
});

Deno.test('finale drawers use WAD glyph layouts instead of browser text', () => {
  const textWriter = finaleSource.slice(
    finaleSource.indexOf('export function F_TextWrite'),
    finaleSource.indexOf('// F_BunnyScroll'),
  );
  const castPrinter = finaleSource.slice(
    finaleSource.indexOf('export function F_CastPrint'),
    finaleSource.indexOf('export function F_CastDrawer'),
  );

  if (!textWriter.includes('HU_LayoutText') || !textWriter.includes('HU_DrawLayout')) {
    throw new Error('F_TextWrite is not routed through the HU patch layout');
  }
  if (!castPrinter.includes('HU_LayoutCenteredText') || !castPrinter.includes('HU_DrawLayout')) {
    throw new Error('F_CastPrint is not routed through the centered HU patch layout');
  }
  if (textWriter.includes('fillText') || castPrinter.includes('fillText')) {
    throw new Error('finale typography still uses browser font rendering');
  }
});
