const source = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));

Deno.test('demo and live ticcmds are sampled before every state ticker', () => {
  const loopStart = source.indexOf('while (dueTics-- > 0)');
  const loopEnd = source.indexOf('doomstat.set_gametic(doomstat.gametic + 1)', loopStart);
  const loop = source.slice(loopStart, loopEnd);
  const commands = loop.indexOf('G_ReadDemoTiccmds(activePlayers, _gReadDemoCmd)');
  const level = loop.indexOf('_pTicker()');
  const intermission = loop.indexOf('_wiTicker()');
  const finale = loop.indexOf('_fTicker()');
  const demoPage = loop.indexOf('D_PageTicker()');
  if (commands < 0 || level < commands || intermission < commands ||
      finale < commands || demoPage < commands) {
    throw new Error('ticcmd sampling is not ahead of every state ticker');
  }
  if (!loop.includes('for (const activePlayer of activePlayers) _gCheckSpecial(activePlayer)')) {
    throw new Error('special buttons are not checked for every active player');
  }

  const finaleBranch = loop.slice(loop.indexOf('GS_FINALE'), finale);
  if (finaleBranch.includes('buildFinaleCmd') || finaleBranch.includes('buildCmd')) {
    throw new Error('finale branch overwrites commands after demo sampling');
  }
});
