import { P_SpawnRespawnedSpecial } from '../src/p_respawn_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('altdeath respawn resolves doomednum and performs one direct floor spawn', () => {
  const infos = [
    { doomednum: 1, flags: 0 },
    { doomednum: 2014, flags: 0 },
  ];
  const mthing = { x: -12, y: 34, angle: 91, type: 2014, options: 4 };
  const calls = [];
  const mo = P_SpawnRespawnedSpecial(mthing, infos, (x, y, z, type) => {
    calls.push({ x, y, z, type });
    return { tics: 6 };
  });

  assertEquals(calls.length, 1, 'one item spawn');
  assertEquals(calls[0].x, -12 << 16, 'fixed x');
  assertEquals(calls[0].y, 34 << 16, 'fixed y');
  assertEquals(calls[0].z, -0x80000000, 'floor sentinel');
  assertEquals(calls[0].type, 1, 'resolved mobj type');
  assertEquals(mo.tics, 6, 'spawn tics left untouched');
  assertEquals(mo.angle, 0x40000000, 'angle truncated to 45-degree step');
  assertEquals(mo.spawnpoint === mthing, false, 'spawnpoint copied by value');
  mthing.x = 99;
  assertEquals(mo.spawnpoint.x, -12, 'queue entry is not retained');
});

Deno.test('altdeath respawn honors MF_SPAWNCEILING without mapthing filters', () => {
  const mthing = { x: 1, y: 2, angle: 0, type: 77, options: 0 };
  let call = null;
  P_SpawnRespawnedSpecial(mthing, [{ doomednum: 77, flags: 0x100 }], (x, y, z, type) => {
    call = { x, y, z, type };
    return {};
  });
  assertEquals(call.z, 0x7fffffff, 'ceiling sentinel');
  assertEquals(call.type, 0, 'type resolved despite empty skill options');
});
