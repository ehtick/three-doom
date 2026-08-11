// Headless E1M1 integration check for IDDT input and drawing. Start a static
// server at the repository root, then run with the same Playwright environment
// variables as the other *_playwright.mjs tests.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const watchdog = setTimeout(() => {
  console.error('automap cheat Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);
const pageErrors = [];

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8096/';
  const url = new URL(baseUrl);
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer !== undefined &&
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const automap = await import('/src/am_map.js');
    const doomstat = await import('/src/doomstat.js');
    const keyboard = await import('/src/d_keyboard.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');
    const palette = await import('/src/v_palette.js');
    const setup = await import('/src/p_setup.js');
    // Match normal startup, where the status cheat module has loaded before a
    // human can type a four-key sequence; this also keeps synthetic keydowns
    // ordered across d_keyboard's asynchronous module boundary.
    await import('/src/m_cheat.js');

    loop.D_DoomRafLoop.stop();
    keyboard.D_KeyboardInput.shutdown();
    keyboard.D_KeyboardInput.init(null);
    menu.M_ClearMenus();
    doomstat.set_gamestate(0 /*GS_LEVEL*/);
    doomstat.set_demoplayback(false);
    doomstat.set_netgame(false);
    doomstat.set_deathmatch(0);
    automap.AM_Start();

    const playerCheatsBefore = doomstat.players[doomstat.consoleplayer].cheats;
    const typeKeys = async (entries) => {
      for (const [code, key] of entries) {
        document.dispatchEvent(new KeyboardEvent('keydown', {
          code, key, bubbles: true, cancelable: true,
        }));
        document.dispatchEvent(new KeyboardEvent('keyup', {
          code, key, bubbles: true, cancelable: true,
        }));
      }
      await new Promise((resolve) => setTimeout(resolve, 0));
      return automap.AM_GetCheatLevel();
    };
    const iddt = [...'iddt'].map((ch) => [`Key${ch.toUpperCase()}`, ch]);

    const ctx = document.getElementById('overlay').getContext('2d');
    ctx.strokeStyle = palette.V_PaletteCSS(automap.AM_THING_COLOR);
    const thingStyle = ctx.strokeStyle;
    ctx.strokeStyle = palette.V_PaletteCSS(256 - 47);
    const playerStyle = ctx.strokeStyle;
    let thingCount = 0;
    for (const sector of setup.sectors) {
      for (let thing = sector.thinglist; thing !== null; thing = thing.snext) thingCount++;
    }

    const capture = () => {
      let count = 0;
      let pathLines = 0;
      let thingSegments = 0;
      let playerSegments = 0;
      let clipRect = null;
      const originalLineTo = ctx.lineTo;
      const originalBeginPath = ctx.beginPath;
      const originalRect = ctx.rect;
      const originalStroke = ctx.stroke;
      ctx.beginPath = function (...args) {
        pathLines = 0;
        return originalBeginPath.apply(this, args);
      };
      ctx.lineTo = function (...args) {
        count++;
        pathLines++;
        return originalLineTo.apply(this, args);
      };
      ctx.rect = function (...args) {
        clipRect = args.slice(0, 4);
        return originalRect.apply(this, args);
      };
      ctx.stroke = function (...args) {
        if (this.strokeStyle === thingStyle) thingSegments += pathLines;
        if (this.strokeStyle === playerStyle) playerSegments += pathLines;
        return originalStroke.apply(this, args);
      };
      try {
        automap.AM_Drawer(ctx, 0, 0, 320, 168);
      } finally {
        ctx.lineTo = originalLineTo;
        ctx.beginPath = originalBeginPath;
        ctx.rect = originalRect;
        ctx.stroke = originalStroke;
      }
      return { count, thingSegments, playerSegments, clipRect };
    };

    const interruptedMode = await typeKeys([
      ['KeyI', 'i'], ['KeyD', 'd'], ['Space', ' '], ['KeyD', 'd'], ['KeyT', 't'],
    ]);
    const mode0Draw = capture();
    const mode1 = await typeKeys(iddt);
    const mode1Draw = capture();
    const mode2 = await typeKeys(iddt);
    const mode2Draw = capture();
    const mode0Again = await typeKeys(iddt);

    doomstat.set_deathmatch(1);
    const deathmatchMode = await typeKeys(iddt);
    const playerCheatsAfter = doomstat.players[doomstat.consoleplayer].cheats;

    keyboard.D_KeyboardInput.shutdown();
    automap.AM_Stop();
    doomstat.set_deathmatch(0);
    doomstat.set_netgame(false);

    return {
      interruptedMode,
      mode0Draw,
      mode1,
      mode1Draw,
      mode2,
      mode2Draw,
      mode0Again,
      deathmatchMode,
      thingCount,
      thingColor: automap.AM_THING_COLOR,
      thingStyle,
      playerCheatsBefore,
      playerCheatsAfter,
    };
  });

  const failures = [];
  if (result.interruptedMode !== 0 || result.mode1 !== 1 ||
      result.mode2 !== 2 || result.mode0Again !== 0) {
    failures.push(`IDDT cycle mismatch: ${JSON.stringify(result)}`);
  }
  if (result.deathmatchMode !== 0) {
    failures.push(`IDDT advanced in deathmatch: ${result.deathmatchMode}`);
  }
  if (result.mode1Draw.count <= result.mode0Draw.count) {
    failures.push(`mode 1 did not reveal E1M1 lines: ${result.mode0Draw.count} -> ${result.mode1Draw.count}`);
  }
  if (result.mode2Draw.count - result.mode1Draw.count !== result.thingCount * 3 ||
      result.mode2Draw.thingSegments !== result.thingCount * 3) {
    failures.push(`mode 2 thing segments mismatch: ${JSON.stringify(result)}`);
  }
  if (result.mode0Draw.playerSegments !== 2 || result.mode1Draw.playerSegments !== 16 ||
      result.mode2Draw.playerSegments !== 16) {
    failures.push(`player arrow segment mismatch: ${JSON.stringify(result)}`);
  }
  for (const draw of [result.mode0Draw, result.mode1Draw, result.mode2Draw]) {
    if (JSON.stringify(draw.clipRect) !== JSON.stringify([0, 0, 320, 168])) {
      failures.push(`automap clip is not 320x168: ${JSON.stringify(draw.clipRect)}`);
    }
  }
  if (result.thingColor !== 112 || result.thingStyle !== '#78ff70') {
    failures.push(`thing color mismatch: ${JSON.stringify(result)}`);
  }
  if (result.playerCheatsAfter !== result.playerCheatsBefore) {
    failures.push(`IDDT altered gameplay cheat flags: ${result.playerCheatsBefore} -> ${result.playerCheatsAfter}`);
  }
  if (pageErrors.length > 0) failures.push(`page errors: ${pageErrors.join(' | ')}`);
  if (failures.length > 0) throw new Error(failures.join('\n'));

  console.log(`automap cheat headless check passed: ${JSON.stringify(result)}`);
} finally {
  clearTimeout(watchdog);
  if (browser !== null) await browser.close();
}
