// Pure codec for Doom v1.9's four-byte per-player demo command.

export const DEMO_DEFAULT_BUFFER_SIZE = 0x20000;
export const DEMO_WRITE_TAIL_RESERVE = 16;

// g_game.c:G_WriteDemoTiccmd checks `demo_p > demoend - 16` after a
// provisional write and rewind. Testing the command's starting offset before
// appending is equivalent and avoids ever writing beyond a browser buffer.
export function G_DemoCanWriteTiccmd(bufferLength, maxBytes) {
  return Math.trunc(bufferLength) <=
    Math.trunc(maxBytes) - DEMO_WRITE_TAIL_RESERVE;
}

function signedByte(value) {
  return ((value & 0xff) << 24) >> 24;
}

function signedAngleByte(value) {
  // g_game.c assigns `(unsigned char)value << 8` into ticcmd_t.angleturn,
  // whose type is signed short. Narrow after the shift to preserve 0x80..ff
  // as -32768..-256 instead of JavaScript's positive 32768..65280.
  return (((value & 0xff) << 8) << 16) >> 16;
}

export function G_EncodeDemoTiccmd(cmd) {
  return [
    cmd.forwardmove & 0xff,
    cmd.sidemove & 0xff,
    ((cmd.angleturn + 128) >> 8) & 0xff,
    cmd.buttons & 0xff,
  ];
}

export function G_DecodeDemoTiccmd(bytes, offset, cmd) {
  cmd.forwardmove = signedByte(bytes[offset]);
  cmd.sidemove = signedByte(bytes[offset + 1]);
  cmd.angleturn = signedAngleByte(bytes[offset + 2]);
  cmd.buttons = bytes[offset + 3] & 0xff;
  return offset + 4;
}
