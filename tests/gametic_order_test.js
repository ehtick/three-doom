const source = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));

Deno.test('gametic advances after every state ticker in the completed tic', () => {
  const loopStart = source.indexOf('while (dueTics-- > 0)');
  const loopEnd = source.indexOf('D_Display();', loopStart);
  const loop = source.slice(loopStart, loopEnd);
  const increment = loop.lastIndexOf('doomstat.set_gametic(doomstat.gametic + 1)');

  if (loopStart < 0 || loopEnd < 0 || increment < 0) {
    throw new Error('could not locate the browser tic loop and gametic increment');
  }
  for (const ticker of [
    'D_DoAdvanceDemo()',
    '_menuTicker()',
    '_gTicker()',
    '_pTicker()',
    '_wiTicker()',
    '_fTicker()',
  ]) {
    const call = loop.lastIndexOf(ticker);
    if (call < 0 || call > increment) {
      throw new Error(`${ticker} must run before gametic advances`);
    }
  }
  if (loop.slice(0, increment).includes('doomstat.set_gametic(')) {
    throw new Error('gametic is advanced before the completed-tic boundary');
  }
  if (loop.includes('continue;')) {
    throw new Error('a transient player topology can skip the gametic boundary');
  }
});
