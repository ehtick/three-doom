// Headless integration checks for m_menu.c:M_NewGame routing. Start a static
// server at the repository root, then run with:
//   NODE_PATH=/path/to/node_modules node tests/menu_newgame_playwright.mjs

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const pageErrors = [];
const watchdog = setTimeout(() => {
  console.error('New Game menu Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8135/';
  const url = new URL(baseUrl);
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer !== undefined &&
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const { gamestate_t, GameMode_t, KEY_DOWNARROW, KEY_ENTER } =
      await import('/src/doomdef.js');
    const { gameaction_t } = await import('/src/d_event.js');
    const game = await import('/src/g_game.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');

    loop.D_DoomRafLoop.stop();
    Object.defineProperty(window.renderer.domElement, 'requestPointerLock', {
      configurable: true,
      value: () => {},
    });
    const key = (data1) => menu.M_Responder({ type: 0, data1, data2: 0, data3: 0 });

    function resetMain(mode, net, demo) {
      menu.M_ClearMenus();
      menu.M_Init();
      doomstat.set_gamemode(mode);
      doomstat.set_netgame(net);
      doomstat.set_demoplayback(demo);
      doomstat.set_gamestate(gamestate_t.GS_DEMOSCREEN);
      doomstat.set_gameaction(gameaction_t.ga_nothing);
      menu.M_StartControlPanel();
    }

    function chooseCommercial(seedEpisode, net = false, demo = false) {
      doomstat.set_gameepisode(seedEpisode);
      resetMain(GameMode_t.commercial, net, demo);
      const opened = key(KEY_ENTER); // Main -> Skill, never Episode.
      const chosen = key(KEY_ENTER); // Default NewDef row: Hurt Me Plenty.
      const deferred = doomstat.gameaction === gameaction_t.ga_newgame;
      game.G_DoNewGame();
      const value = {
        seedEpisode,
        opened,
        chosen,
        deferred,
        episode: doomstat.gameepisode,
        skill: doomstat.gameskill,
        map: doomstat.gamemap,
      };
      doomstat.set_gameaction(gameaction_t.ga_nothing);
      return value;
    }

    const commercial = [chooseCommercial(2), chooseCommercial(3)];

    // Noncommercial games still pass through Episode. Selecting the third row
    // must carry episode 3 into the deferred new game.
    doomstat.set_gameepisode(1);
    resetMain(GameMode_t.registered, false, false);
    key(KEY_ENTER); // Main -> Episode.
    key(KEY_DOWNARROW);
    key(KEY_DOWNARROW);
    key(KEY_ENTER); // Episode 3 -> Skill.
    key(KEY_ENTER); // Default NewDef row: Hurt Me Plenty.
    const noncommercialDeferred = doomstat.gameaction === gameaction_t.ga_newgame;
    game.G_DoNewGame();
    const noncommercial = {
      deferred: noncommercialDeferred,
      episode: doomstat.gameepisode,
      skill: doomstat.gameskill,
      map: doomstat.gamemap,
    };
    doomstat.set_gameaction(gameaction_t.ga_nothing);

    // A live netgame gets NEWGAME as an informational message. Its next key
    // dismisses the message and closes the panel; it must not queue ga_newgame.
    resetMain(GameMode_t.commercial, true, false);
    const refusalOpened = key(KEY_ENTER);
    const activeWithMessage = doomstat.menuactive;
    const refusalDismissed = key(0x78 /*x*/);
    const refusal = {
      refusalOpened,
      activeWithMessage,
      refusalDismissed,
      closed: doomstat.menuactive === false,
      action: doomstat.gameaction,
    };

    // Demo playback is the exact reference exception to the netgame refusal.
    const demoException = chooseCommercial(3, true, true);
    return { commercial, noncommercial, refusal, demoException };
  });

  const failures = [];
  for (const commercial of result.commercial) {
    if (!commercial.opened || !commercial.chosen || !commercial.deferred ||
        commercial.episode !== 1 || commercial.skill !== 2 || commercial.map !== 1) {
      failures.push(`commercial route retained/selectable episode ${commercial.seedEpisode}: ${JSON.stringify(commercial)}`);
    }
  }
  if (!result.noncommercial.deferred || result.noncommercial.episode !== 3 ||
      result.noncommercial.skill !== 2 || result.noncommercial.map !== 1) {
    failures.push(`noncommercial episode route failed: ${JSON.stringify(result.noncommercial)}`);
  }
  if (!result.refusal.refusalOpened || !result.refusal.activeWithMessage ||
      !result.refusal.refusalDismissed || !result.refusal.closed ||
      result.refusal.action !== 0 /*ga_nothing*/) {
    failures.push(`live netgame was not refused: ${JSON.stringify(result.refusal)}`);
  }
  if (!result.demoException.deferred || result.demoException.episode !== 1 ||
      result.demoException.skill !== 2 || result.demoException.map !== 1) {
    failures.push(`demo playback did not bypass netgame refusal: ${JSON.stringify(result.demoException)}`);
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== null) await browser.close();
  clearTimeout(watchdog);
}
