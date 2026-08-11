import { P_DropWeaponOnDeath } from '../src/p_death_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('player death clears solidity and enters PST_DEAD before lowering the weapon', () => {
  const player = { playerstate: 0 };
  const target = { flags: 0x82, player };
  let calls = 0;
  P_DropWeaponOnDeath(target, (actualPlayer) => {
    calls++;
    assertEquals(actualPlayer, player, 'drop receives killed player');
    assertEquals(target.flags, 0x80, 'corpse is non-solid before drop');
    assertEquals(player.playerstate, 1, 'player is dead before drop');
  });
  assertEquals(calls, 1, 'drop called exactly once');
});

Deno.test('missing P_DropWeapon wiring fails instead of silently skipping', () => {
  const target = { flags: 0x2, player: { playerstate: 0 } };
  let error = null;
  try {
    P_DropWeaponOnDeath(target, null);
  } catch (caught) {
    error = caught;
  }
  assertEquals(error instanceof Error, true, 'missing dependency throws');
  assertEquals(error.message, 'P_DropWeapon dependency was not wired', 'diagnostic');
});
