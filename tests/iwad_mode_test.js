import { GameMode_t } from '../src/doomdef.js';
import { D_DEFAULT_IWAD_NAMES, D_GuessGameModeFromWad } from '../src/d_iwad.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function syntheticWad(names, ident = 'IWAD') {
  const directory = 12;
  const bytes = new Uint8Array(directory + names.length * 16);
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < 4; i++) bytes[i] = ident.charCodeAt(i) || 0;
  view.setInt32(4, names.length, true);
  view.setInt32(8, directory, true);
  for (let i = 0; i < names.length; i++) {
    const off = directory + i * 16;
    view.setInt32(off, 0, true);
    view.setInt32(off + 4, 0, true);
    const name = names[i].toUpperCase();
    for (let j = 0; j < Math.min(8, name.length); j++) bytes[off + 8 + j] = name.charCodeAt(j);
  }
  return bytes;
}

Deno.test('map-lump families identify each IWAD game mode', () => {
  assertEquals(D_GuessGameModeFromWad(syntheticWad(['E1M1'])), GameMode_t.shareware, 'shareware');
  assertEquals(D_GuessGameModeFromWad(syntheticWad(['E1M1', 'E2M1', 'E3M1'])), GameMode_t.registered, 'registered');
  assertEquals(D_GuessGameModeFromWad(syntheticWad(['E1M1', 'E2M1', 'E3M1', 'E4M1'])), GameMode_t.retail, 'retail');
  assertEquals(D_GuessGameModeFromWad(syntheticWad(['MAP01'])), GameMode_t.commercial, 'commercial');
});

Deno.test('default search accepts the documented full-game filenames', () => {
  assertEquals(D_DEFAULT_IWAD_NAMES.includes('doom.wad'), true, 'registered IWAD filename');
  assertEquals(D_DEFAULT_IWAD_NAMES.includes('doom2.wad'), true, 'commercial IWAD filename');
});

Deno.test('classification follows contents for renamed IWADs and typed-array views', () => {
  const wrapped = new Uint8Array(32 + syntheticWad(['MAP01']).length);
  wrapped.set(syntheticWad(['MAP01']), 16);
  const view = wrapped.subarray(16, wrapped.length - 16);
  assertEquals(D_GuessGameModeFromWad(view), GameMode_t.commercial, 'offset typed-array view');
});

Deno.test('bundled doom1.wad is detected as shareware', async () => {
  const wad = await Deno.readFile(new URL('../doom1.wad', import.meta.url));
  assertEquals(D_GuessGameModeFromWad(wad), GameMode_t.shareware, 'bundled IWAD');
});

Deno.test('malformed or mapless WADs remain indetermined', () => {
  assertEquals(D_GuessGameModeFromWad(new Uint8Array(4)), GameMode_t.indetermined, 'short file');
  assertEquals(D_GuessGameModeFromWad(syntheticWad(['E1M1'], 'NOPE')), GameMode_t.indetermined, 'bad id');
  assertEquals(D_GuessGameModeFromWad(syntheticWad(['PLAYPAL'])), GameMode_t.indetermined, 'no map marker');

  const badDirectory = syntheticWad(['MAP01']);
  new DataView(badDirectory.buffer).setInt32(8, badDirectory.length + 1, true);
  assertEquals(D_GuessGameModeFromWad(badDirectory), GameMode_t.indetermined, 'directory out of bounds');
});
