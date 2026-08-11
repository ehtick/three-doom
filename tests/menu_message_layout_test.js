import { M_LayoutMessage, M_StringHeight, M_StringWidth } from '../src/m_menu_text.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function makeFont() {
  const font = new Array(63).fill(null);
  font[0] = { w: 3, h: 9 };
  font['A'.charCodeAt(0) - '!'.charCodeAt(0)] = { w: 5, h: 7 };
  font['B'.charCodeAt(0) - '!'.charCodeAt(0)] = { w: 7, h: 8 };
  return font;
}

Deno.test('menu string measurements match STCFN width and line-height rules', () => {
  const font = makeFont();
  assertEquals(M_StringWidth('a b', font), 16, 'upper-case glyph widths plus space');
  assertEquals(M_StringHeight('A\nB\n', font), 27, 'one font-zero height per line');
});

Deno.test('modal message lines are independently centered around the screen midpoint', () => {
  const font = makeFont();
  const layout = M_LayoutMessage('A B\nBA', font);
  assertEquals(layout.glyphs.length, 4, 'glyph count');
  assertEquals(layout.glyphs[0].x, 152, 'first-line x');
  assertEquals(layout.glyphs[0].y, 91, 'first-line y');
  assertEquals(layout.glyphs[1].x, 161, 'first-line second glyph x');
  assertEquals(layout.glyphs[2].x, 154, 'second-line x');
  assertEquals(layout.glyphs[2].y, 100, 'second-line y');
});

Deno.test('modal drawing returns before any underlying menu rendering and uses no CSS text', async () => {
  const source = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const drawer = source.slice(
    source.indexOf('export function M_Drawer('),
    source.indexOf('// ---------- API expected', source.indexOf('export function M_Drawer(')),
  );
  const messageCheck = drawer.indexOf('if (_message !== null)');
  const menuCheck = drawer.indexOf('if (!menuactive) return;');
  if (messageCheck < 0 || menuCheck < 0 || messageCheck > menuCheck ||
      !drawer.includes('M_LayoutMessage(_message.text, HU_GetFont())') ||
      drawer.slice(drawer.indexOf('function drawMessage')).includes('fillText(')) {
    throw new Error('modal drawer does not exclusively render centered WAD-font text');
  }
});
