import {
  R_DrawPspritePatch,
  R_PspritePatchBounds,
} from '../src/r_psprite_projection.js';

function assertEquals(actual, expected, message) {
  const actualJson = JSON.stringify(actual);
  const expectedJson = JSON.stringify(expected);
  if (actualJson !== expectedJson) {
    throw new Error(`${message}: expected ${expectedJson}, got ${actualJson}`);
  }
}

function readWadPatch(bytes, name) {
  const wad = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = wad.getInt32(4, true);
  const directory = wad.getInt32(8, true);
  for (let i = 0; i < count; i++) {
    const entry = directory + i * 16;
    let lumpName = '';
    for (let c = 0; c < 8; c++) {
      const value = bytes[entry + 8 + c];
      if (value === 0) break;
      lumpName += String.fromCharCode(value);
    }
    if (lumpName !== name) continue;
    const offset = wad.getInt32(entry, true);
    return {
      w: wad.getInt16(offset, true),
      h: wad.getInt16(offset + 2, true),
      leftoffset: wad.getInt16(offset + 4, true),
      topoffset: wad.getInt16(offset + 6, true),
    };
  }
  throw new Error(`missing WAD patch ${name}`);
}

Deno.test('psprite bounds match stock R_DrawPSprite origin math', async () => {
  const wad = await Deno.readFile(new URL('../doom1.wad', import.meta.url));
  const patch = readWadPatch(wad, 'PISGA0');
  const fracunit = 65536;
  const bounds = R_PspritePatchBounds(fracunit, 32 * fracunit, patch);

  assertEquals(patch, { w: 57, h: 62, leftoffset: -126, topoffset: -106 }, 'stock PISGA0 header');
  assertEquals(bounds, {
    left: 127,
    top: 138,
    right: 184,
    bottom: 200,
    width: 57,
    height: 62,
  }, 'stock PISGA0 projected rectangle');

  // The source adds FRACUNIT/2 before rounding the top. Exercise both sides
  // of that exact half-pixel threshold used by fractional weapon bob.
  const beforeHalf = R_PspritePatchBounds(0, 10 * fracunit + fracunit / 2 - 1, {
    w: 1, h: 1, leftoffset: 0, topoffset: 0,
  });
  const afterHalf = R_PspritePatchBounds(0, 10 * fracunit + fracunit / 2 + 1, {
    w: 1, h: 1, leftoffset: 0, topoffset: 0,
  });
  assertEquals(beforeHalf.top, 10, 'bob immediately before half-pixel');
  assertEquals(afterHalf.top, 11, 'bob immediately after half-pixel');
});

Deno.test('psprite flip reverses sampling inside unchanged patch bounds', () => {
  const calls = [];
  const ctx = {
    drawImage: (...args) => calls.push(['drawImage', ...args]),
    save: () => calls.push(['save']),
    translate: (...args) => calls.push(['translate', ...args]),
    scale: (...args) => calls.push(['scale', ...args]),
    restore: () => calls.push(['restore']),
  };
  const canvas = { name: 'source' };
  const bounds = { left: 3, top: 2, right: 6, bottom: 4, width: 3, height: 2 };

  R_DrawPspritePatch(ctx, canvas, bounds, 4, 3, 2, 3, true);
  assertEquals(calls[0], ['save'], 'save transform');
  assertEquals(calls[1], ['translate', 16, 9], 'translate to unchanged right/top edge');
  assertEquals(calls[2], ['scale', -1, 1], 'reverse only local X');
  assertEquals(
    calls[3],
    ['drawImage', canvas, 0, 0, 3, 2, 0, 0, 6, 6],
    'draw within original scaled dimensions',
  );
  assertEquals(calls[4], ['restore'], 'restore transform');
});
