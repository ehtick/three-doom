import { D_CreateRafLoop } from '../src/d_loop.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('RAF loop cancellation invalidates queued and in-flight generations', () => {
  let nextId = 1;
  const queued = new Map();
  const cancelled = [];
  const loop = D_CreateRafLoop({
    requestFrame(callback) {
      const id = nextId++;
      queued.set(id, callback);
      return id;
    },
    cancelFrame(id) {
      cancelled.push(id);
      queued.delete(id);
    },
  });

  let calls = 0;
  const firstToken = loop.begin();
  const firstId = loop.schedule(firstToken, () => { calls++; });
  const staleCallback = queued.get(firstId);
  loop.stop();
  assertEquals(cancelled.length, 1, 'queued RAF cancellation count');
  staleCallback(10);
  assertEquals(calls, 0, 'cancelled generation callback count');

  const secondToken = loop.begin();
  const secondId = loop.schedule(secondToken, () => {
    calls++;
    loop.stop();
    loop.schedule(secondToken, () => { calls++; });
  });
  const activeCallback = queued.get(secondId);
  queued.delete(secondId);
  activeCallback(20);
  assertEquals(calls, 1, 'active callback count');
  assertEquals(loop.isRunning(), false, 'loop stopped from inside callback');
  assertEquals(queued.size, 0, 'stopped callback could not queue another frame');

  loop.stop();
  assertEquals(cancelled.length, 1, 'idempotent stop does not recancel a frame');

  loop.close();
  assertEquals(loop.isClosed(), true, 'loop permanently closed');
  assertEquals(loop.begin(), null, 'closed loop cannot restart');
  assertEquals(loop.schedule(secondToken, () => { calls++; }), null, 'closed loop cannot schedule');
});
