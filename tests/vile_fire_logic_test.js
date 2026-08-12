import { P_RelinkVileFire } from '../src/p_enemy_fire_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('Arch-vile fire is unlinked before moving and relinked afterward', () => {
  const actor = { x: 10, y: 20, z: 30, subsector: { id: 'old' } };
  const dest = { x: 1000, y: -2000, z: 3000 };
  const calls = [];

  P_RelinkVileFire(
    actor,
    dest,
    -32768,
    65536,
    (movingActor) => {
      calls.push(`unset:${movingActor.x},${movingActor.y},${movingActor.z}`);
      movingActor.subsector = null;
    },
    (movingActor) => {
      calls.push(`set:${movingActor.x},${movingActor.y},${movingActor.z}`);
      movingActor.subsector = { id: 'new' };
    },
  );

  assertEquals(calls[0], 'unset:10,20,30', 'unlink observes old position');
  assertEquals(calls[1], 'set:-785432,1570864,3000', 'relink observes new position');
  assertEquals(actor.subsector.id, 'new', 'sector link refreshed');
});
