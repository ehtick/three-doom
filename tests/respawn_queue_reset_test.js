function assert(condition, message) {
  if (!condition) throw new Error(message);
}

Deno.test('level setup resets the altdeath queue after player placement', async () => {
  const setup = await Deno.readTextFile(new URL('../src/p_setup.js', import.meta.url));
  const things = setup.indexOf('P_LoadThings(lumpnum + ML_THINGS);');
  const deathmatch = setup.indexOf('if (deathmatch !== 0 && _G_DeathMatchSpawnPlayer !== null)', things);
  const reset = setup.indexOf('if (_P_ResetRespawnQueue !== null) _P_ResetRespawnQueue();', things);
  const specials = setup.indexOf('if (_P_SpawnSpecials !== null) _P_SpawnSpecials();', things);
  assert(things !== -1, 'THINGS load missing');
  assert(deathmatch > things, 'deathmatch placement must follow THINGS');
  assert(reset > deathmatch, 'queue reset must follow deathmatch placement');
  assert(specials > reset, 'special setup must follow queue reset');

  const mobj = await Deno.readTextFile(new URL('../src/p_mobj.js', import.meta.url));
  assert(mobj.includes('export function P_ResetRespawnQueue()'), 'queue reset export missing');
  assert(mobj.includes('iquehead = 0;\n  iquetail = 0;'), 'both queue cursors must reset');

  const main = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));
  assert(main.includes('P_ResetRespawnQueue: PM.P_ResetRespawnQueue'), 'level setup wiring missing');
});
