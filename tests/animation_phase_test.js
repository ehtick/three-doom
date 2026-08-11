const spec = await Deno.readTextFile(new URL('../src/p_spec.js', import.meta.url));
const ticker = await Deno.readTextFile(new URL('../src/p_tick.js', import.meta.url));
const main = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));

Deno.test('texture animation observes pre-increment leveltime inside P_UpdateSpecials', () => {
  const updateStart = spec.indexOf('export function P_UpdateSpecials()');
  const updateEnd = spec.indexOf('\n}', updateStart);
  const update = spec.slice(updateStart, updateEnd);
  const animation = update.indexOf('_RAnimateTextures(doomstat.leveltime)');
  const buttons = update.indexOf('_PSwitch.P_UpdateButtons()');
  if (updateStart < 0 || updateEnd < 0 || animation < 0 || buttons < 0 || animation > buttons) {
    throw new Error('P_UpdateSpecials does not animate at the reference point');
  }

  const specials = ticker.indexOf('P_UpdateSpecials();');
  const increment = ticker.indexOf('set_leveltime(leveltime + 1);');
  if (specials < 0 || increment < 0 || specials > increment) {
    throw new Error('P_Ticker increments leveltime before texture animation');
  }

  const wiringStart = main.indexOf('pSpec.P_SpecSetExternals({');
  const wiringEnd = main.indexOf('\n  });', wiringStart);
  const wiring = main.slice(wiringStart, wiringEnd);
  if (wiringStart < 0 || wiringEnd < 0 || !wiring.includes('R_AnimateTextures')) {
    throw new Error('renderer animation callback is not wired into P_UpdateSpecials');
  }
  const browserLoop = main.slice(
    main.indexOf('while (dueTics-- > 0)'),
    main.indexOf('D_Display();'),
  );
  if (browserLoop.includes('R_AnimateTextures') || browserLoop.includes('_animTextures')) {
    throw new Error('browser loop advances animation after P_Ticker');
  }
});
