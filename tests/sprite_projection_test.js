import {
  R_SpriteBillboardCenterY,
  R_SpritePatchWorldBounds,
} from '../src/r_sprite_projection.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
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
      width: wad.getInt16(offset, true),
      height: wad.getInt16(offset + 2, true),
      leftoffset: wad.getInt16(offset + 4, true),
      topoffset: wad.getInt16(offset + 6, true),
    };
  }
  throw new Error(`missing WAD patch ${name}`);
}

Deno.test('world sprite bounds match R_ProjectSprite for stock patch origins', async () => {
  const wad = await Deno.readFile(new URL('../doom1.wad', import.meta.url));
  const fracunit = 65536;
  const mobjZ = 37 * fracunit + fracunit / 2;

  // BON1 deliberately extends four source pixels below its mobj origin;
  // TROOA1 extends five. These catch the former floor-origin clamp directly.
  for (const name of ['BON1A0', 'TROOA1']) {
    const patch = readWadPatch(wad, name);
    const bounds = R_SpritePatchWorldBounds(mobjZ, patch.topoffset, patch.height);
    const vanillaGzt = mobjZ + patch.topoffset * fracunit;
    const vanillaBottom = vanillaGzt - patch.height * fracunit;

    assertEquals(bounds.top * fracunit, vanillaGzt, `${name} gzt`);
    assertEquals(bounds.bottom * fracunit, vanillaBottom, `${name} patch bottom`);
    assertEquals(bounds.center * fracunit * 2, vanillaGzt + vanillaBottom, `${name} midpoint`);
    assertEquals(
      R_SpriteBillboardCenterY(mobjZ, patch.topoffset, patch.height),
      bounds.center,
      `${name} allocation-free midpoint`,
    );
    if (bounds.bottom >= mobjZ / fracunit) {
      throw new Error(`${name} no longer exercises a below-origin stock patch`);
    }
  }
});

Deno.test('world sprite projection never consults the sector floor height', () => {
  const patch = { height: 18, topoffset: 14 };
  const mobjZ = 12 * 65536;
  const expected = R_SpritePatchWorldBounds(mobjZ, patch.topoffset, patch.height);
  for (const unrelatedFloor of [-1024, 0, 12, 128]) {
    // R_ProjectSprite receives only thing->z and spritetopoffset here. A floor
    // value is intentionally absent from the helper and cannot alter bounds.
    const actual = R_SpritePatchWorldBounds(mobjZ, patch.topoffset, patch.height);
    assertEquals(actual.top, expected.top, `floor ${unrelatedFloor} top`);
    assertEquals(actual.bottom, expected.bottom, `floor ${unrelatedFloor} bottom`);
    assertEquals(actual.center, expected.center, `floor ${unrelatedFloor} center`);
  }
});
