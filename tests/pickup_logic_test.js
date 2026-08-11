import {
  P_KeyStaysInWorld, P_WeaponAmmoClips, P_WeaponStaysInWorld,
} from '../src/p_pickup_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('placed weapon persistence and ammo match every game mode', () => {
  const cases = [
    // netgame, deathmatch, dropped, stays, ammo clips
    [false, 0, false, false, 2],
    [true,  0, false, true,  2],
    [true,  1, false, true,  5],
    [true,  2, false, false, 2],
    [true,  1, true,  false, 1],
    [true,  2, true,  false, 1],
  ];
  for (const [netgame, deathmatch, dropped, stays, clips] of cases) {
    const label = `net=${netgame} deathmatch=${deathmatch} dropped=${dropped}`;
    assertEquals(P_WeaponStaysInWorld(netgame, deathmatch, dropped), stays, `${label} persistence`);
    assertEquals(P_WeaponAmmoClips(netgame, deathmatch, dropped), clips, `${label} ammo`);
  }
});

Deno.test('keys remain for other players only in netgames', () => {
  assertEquals(P_KeyStaysInWorld(false), false, 'single player removes key');
  assertEquals(P_KeyStaysInWorld(true), true, 'netgame shares key');
});
