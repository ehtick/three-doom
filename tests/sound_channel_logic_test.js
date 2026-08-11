import { MAX_SOUND_CHANNELS, numChannels, set_numChannels } from '../src/doomstat.js';
import { S_ChooseChannel } from '../src/s_channel_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function occupied(priority, origin = {}) {
  return { sfxinfo: { priority }, origin, handle: 1 };
}

function empty() {
  return { sfxinfo: null, origin: null, handle: 0 };
}

function choose(channels, origin, priority) {
  const stopped = [];
  const cnum = S_ChooseChannel(
    channels,
    origin,
    { priority },
    (index) => channels[index].sfxinfo === null,
    (index) => {
      stopped.push(index);
      channels[index] = empty();
    },
  );
  return { cnum, stopped };
}

Deno.test('snd_channels keeps the Linux default and mixer-safe range', () => {
  try {
    assertEquals(numChannels, 3, 'linuxdoom m_misc.c default');
    assertEquals(MAX_SOUND_CHANNELS, 8, 'linuxdoom i_sound.c mixer capacity');
    set_numChannels(0);
    assertEquals(numChannels, 0, 'zero configured channels');
    set_numChannels(3);
    assertEquals(numChannels, 3, 'default configured channels');
    set_numChannels(8);
    assertEquals(numChannels, 8, 'full mixer capacity');
    set_numChannels(99);
    assertEquals(numChannels, 8, 'above-capacity config');
    set_numChannels(-4);
    assertEquals(numChannels, 0, 'negative config');
  } finally {
    set_numChannels(3);
  }
});

Deno.test('channel selection takes the first free configured slot', () => {
  const channels = [occupied(64), empty(), empty()];
  const result = choose(channels, {}, 64);
  assertEquals(result.cnum, 1, 'selected slot');
  assertEquals(result.stopped.length, 0, 'preemptions');
  assertEquals(channels[1].sfxinfo.priority, 64, 'claimed slot');
});

Deno.test('channel selection reuses an origin before a later free slot', () => {
  const shared = {};
  const channels = [occupied(80, shared), empty(), empty()];
  const result = choose(channels, shared, 64);
  assertEquals(result.cnum, 0, 'reused slot');
  assertEquals(result.stopped.join(','), '0', 'stopped origin slot');
  assertEquals(channels[1].sfxinfo, null, 'later free slot untouched');
});

Deno.test('null origins do not coalesce in S_getChannel', () => {
  const channels = [occupied(64, null), empty(), empty()];
  const result = choose(channels, null, 64);
  assertEquals(result.cnum, 1, 'selected free slot');
  assertEquals(result.stopped.length, 0, 'null-origin preemptions');
});

Deno.test('priority preemption replaces the first eligible slot only', () => {
  const channels = [occupied(63), occupied(90), occupied(70)];
  const result = choose(channels, {}, 70);
  assertEquals(result.cnum, 1, 'first eligible slot');
  assertEquals(result.stopped.join(','), '1', 'preempted slot');
  assertEquals(channels[0].sfxinfo.priority, 63, 'more important slot retained');
  assertEquals(channels[2].sfxinfo.priority, 70, 'later eligible slot retained');
});

Deno.test('priority preemption rejects a sound when every slot is more important', () => {
  const channels = [occupied(10), occupied(20), occupied(30)];
  const result = choose(channels, {}, 31);
  assertEquals(result.cnum, -1, 'rejected result');
  assertEquals(result.stopped.length, 0, 'preemptions');
});

Deno.test('zero configured channels reject allocation safely', () => {
  const result = choose([], {}, 64);
  assertEquals(result.cnum, -1, 'zero-channel result');
  assertEquals(result.stopped.length, 0, 'zero-channel preemptions');
});
