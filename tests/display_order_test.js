const source = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));

Deno.test('automap suppresses psprites without suppressing HUD or status bar', () => {
  const displayStart = source.indexOf('function D_Display()');
  const displayEnd = source.indexOf('// D_DoomLoop:', displayStart);
  const display = source.slice(displayStart, displayEnd);
  const automap = display.indexOf('_amDrawer(o, 0, 0, overlay.width, overlay.height)');
  const guard = display.indexOf('if (doomstat.automapactive !== true)', automap);
  const psprites = display.indexOf('_drawPlayerSprites(o, p, dx, dy, dw, dh)', guard);
  const guardEnd = display.indexOf('\n      }', psprites);
  const hud = display.indexOf('_huDrawer(o, dx, dy, dw, dh)', psprites);
  const status = display.indexOf('_stDrawer(o, 0, virtY, cw, virtH)', hud);
  const menu = display.indexOf('_menuDrawer(o, 0, 0, overlay.width, overlay.height)', status);

  if (displayStart < 0 || displayEnd < 0 || automap < 0 || guard < 0 ||
      psprites <= guard || guardEnd <= psprites || hud <= guardEnd ||
      status <= hud || menu <= status) {
    throw new Error('level overlay order is not automap -> guarded psprites -> HUD -> status -> menu');
  }
});
