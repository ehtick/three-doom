const source = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));

Deno.test('console-player spawn starts status and HUD modules synchronously', () => {
  const start = source.indexOf('const P_SpawnPlayer = (mt) =>');
  const end = source.indexOf('// g_game.c:843', start);
  const spawn = source.slice(start, end);

  const psprites = spawn.indexOf('pp.P_SetupPsprites(p)');
  const consoleGate = spawn.indexOf('if (mt.type - 1 === doomstat.consoleplayer)');
  const status = spawn.indexOf('stStuff.ST_Start()', consoleGate);
  const hud = spawn.indexOf('huStuff.HU_Start()', consoleGate);

  if (start < 0 || end < 0 || psprites < 0 || consoleGate < psprites ||
      status < consoleGate || hud < status) {
    throw new Error('P_SpawnPlayer does not reproduce p_mobj.c UI startup order');
  }
});
