import {
  P_KeyStaysInWorld, P_PickupSoundIsLocal,
  P_WeaponAmmoClips, P_WeaponStaysInWorld,
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

Deno.test('pickup sound belongs only to the console player', async () => {
  const players = [{ name: 'local' }, { name: 'remote' }, null, null];
  assertEquals(P_PickupSoundIsLocal(players[0], players, 0), true, 'local pickup');
  assertEquals(P_PickupSoundIsLocal(players[1], players, 0), false, 'remote pickup');
  assertEquals(P_PickupSoundIsLocal(players[1], players, 1), true, 'remote console slot');

  const source = await Deno.readTextFile(new URL('../src/p_inter.js', import.meta.url));
  if (!source.includes('P_PickupSoundIsLocal(player, _players, consoleplayer)')) {
    throw new Error('P_TouchSpecialThing does not gate its final pickup sound');
  }
});
