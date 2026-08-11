import { D_PausePatchPosition } from '../src/d_display_logic.js';

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
  const menu = display.indexOf(
    '_menuDrawer(overlay, 0, 0, _overlayCanvas.width, _overlayCanvas.height)',
    status,
  );

  if (displayStart < 0 || displayEnd < 0 || automap < 0 || guard < 0 ||
      psprites <= guard || guardEnd <= psprites || hud <= guardEnd ||
      status <= hud || menu <= status) {
    throw new Error('level overlay order is not automap -> guarded psprites -> HUD -> status -> menu');
  }
});

Deno.test('pause patch uses the reference centered coordinates', () => {
  const view = D_PausePatchPosition(false, 16, 12, 288);
  if (view.x !== 126 || view.y !== 16) {
    throw new Error(`view pause position mismatch: ${JSON.stringify(view)}`);
  }

  const map = D_PausePatchPosition(true, 16, 12, 288);
  if (map.x !== 126 || map.y !== 4) {
    throw new Error(`automap pause position mismatch: ${JSON.stringify(map)}`);
  }

  const fullView = D_PausePatchPosition(false, 0, 0, 0);
  if (fullView.x !== 126 || fullView.y !== 4) {
    throw new Error(`browser full-view fallback mismatch: ${JSON.stringify(fullView)}`);
  }
});

Deno.test('pause patch is composed after state drawers and before the menu', () => {
  const displayStart = source.indexOf('function D_Display()');
  const displayEnd = source.indexOf('// D_DoomLoop:', displayStart);
  const display = source.slice(displayStart, displayEnd);
  const finale = display.lastIndexOf('_fDrawer(');
  const pause = display.lastIndexOf('D_DrawPausePatch(overlay)');
  const menu = display.lastIndexOf('_menuDrawer(overlay, 0, 0, _overlayCanvas.width, _overlayCanvas.height)');
  if (finale < 0 || pause <= finale || menu <= pause) {
    throw new Error('pause/menu composition is not state drawers -> M_PAUSE -> menu');
  }
});
