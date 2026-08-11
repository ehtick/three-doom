import { G_DecodeDemoTiccmd, G_EncodeDemoTiccmd } from '../src/g_demo.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('demo ticcmd codec applies vanilla byte and signed-short narrowing', () => {
  const cases = [
    { angle: -32768, byte: 0x80, decoded: -32768 },
    { angle: -320,   byte: 0xff, decoded: -256 },
    { angle: -129,   byte: 0xff, decoded: -256 },
    { angle: -128,   byte: 0x00, decoded: 0 },
    { angle: 127,    byte: 0x00, decoded: 0 },
    { angle: 128,    byte: 0x01, decoded: 256 },
    { angle: 32760,  byte: 0x80, decoded: -32768 },
  ];

  for (const test of cases) {
    const source = {
      forwardmove: 130,
      sidemove: -129,
      angleturn: test.angle,
      buttons: 0x1ff,
    };
    const bytes = G_EncodeDemoTiccmd(source);
    assertEquals(bytes[0], 130, `forward byte at angle ${test.angle}`);
    assertEquals(bytes[1], 127, `side byte at angle ${test.angle}`);
    assertEquals(bytes[2], test.byte, `angle byte at angle ${test.angle}`);
    assertEquals(bytes[3], 255, `button byte at angle ${test.angle}`);

    const decoded = { consistancy: 1234, chatchar: 65 };
    const next = G_DecodeDemoTiccmd(bytes, 0, decoded);
    assertEquals(next, 4, `next offset at angle ${test.angle}`);
    assertEquals(decoded.forwardmove, -126, `forward decode at angle ${test.angle}`);
    assertEquals(decoded.sidemove, 127, `side decode at angle ${test.angle}`);
    assertEquals(decoded.angleturn, test.decoded, `angle decode at angle ${test.angle}`);
    assertEquals(decoded.buttons, 255, `button decode at angle ${test.angle}`);
    assertEquals(decoded.consistancy, 1234, `consistancy preservation at angle ${test.angle}`);
    assertEquals(decoded.chatchar, 65, `chat preservation at angle ${test.angle}`);
  }
});

Deno.test('demo ticcmd decoder honors a stream offset', () => {
  const cmd = {};
  const next = G_DecodeDemoTiccmd([99, 98, 0xff, 0x80, 0xff, 0xa5], 2, cmd);
  assertEquals(next, 6, 'next offset');
  assertEquals(cmd.forwardmove, -1, 'signed forward');
  assertEquals(cmd.sidemove, -128, 'signed side');
  assertEquals(cmd.angleturn, -256, 'signed angle');
  assertEquals(cmd.buttons, 0xa5, 'buttons');
});
