// Content-based IWAD mode detection. The browser can fetch any WAD under any
// filename, so unlike the original filesystem probe we classify by map lumps.

import { GameMode_t } from './doomdef.js';

// Match linuxdoom's full-game-first search order. The repository includes
// doom1.wad, so putting shareware first would otherwise mask any full IWAD a
// user adds alongside it. `-iwad` remains the explicit override.
export const D_DEFAULT_IWAD_NAMES = Object.freeze([
  'doom2f.wad',
  'doom2.wad',
  'plutonia.wad',
  'tnt.wad',
  'doomu.wad',
  'doom.wad',
  'doom1.wad',
]);

function wadView(buffer) {
  if (ArrayBuffer.isView(buffer)) {
    return new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  if (buffer instanceof ArrayBuffer) return new DataView(buffer);
  return null;
}

function readName(view, offset) {
  let name = '';
  for (let i = 0; i < 8; i++) {
    const c = view.getUint8(offset + i);
    if (c === 0) break;
    name += String.fromCharCode(c);
  }
  return name.toUpperCase();
}

export function D_GuessGameModeFromWad(buffer) {
  const view = wadView(buffer);
  if (view === null || view.byteLength < 12) return GameMode_t.indetermined;
  const ident = String.fromCharCode(
    view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3),
  );
  if (ident !== 'IWAD' && ident !== 'PWAD') return GameMode_t.indetermined;

  const numlumps = view.getInt32(4, true);
  const directory = view.getInt32(8, true);
  if (numlumps < 0 || directory < 0 || directory > view.byteLength) {
    return GameMode_t.indetermined;
  }
  if (numlumps > Math.floor((view.byteLength - directory) / 16)) {
    return GameMode_t.indetermined;
  }

  let hasMap01 = false;
  let hasE1M1 = false;
  let hasE2M1 = false;
  let hasE3M1 = false;
  let hasE4M1 = false;
  for (let i = 0; i < numlumps; i++) {
    const name = readName(view, directory + i * 16 + 8);
    if (name === 'MAP01') hasMap01 = true;
    else if (name === 'E1M1') hasE1M1 = true;
    else if (name === 'E2M1') hasE2M1 = true;
    else if (name === 'E3M1') hasE3M1 = true;
    else if (name === 'E4M1') hasE4M1 = true;
  }

  // Doom II, TNT and Plutonia all use MAPxx. Ultimate Doom adds E4; the
  // registered game adds E2/E3; shareware contains only E1.
  if (hasMap01) return GameMode_t.commercial;
  if (hasE4M1) return GameMode_t.retail;
  if (hasE2M1 || hasE3M1) return GameMode_t.registered;
  if (hasE1M1) return GameMode_t.shareware;
  return GameMode_t.indetermined;
}
