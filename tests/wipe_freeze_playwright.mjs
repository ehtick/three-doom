// Headless integration coverage for the browser-only, multi-RAF equivalent of
// d_main.c's blocking wipe loop. Start a static server at the repository root,
// then run with:
//   NODE_PATH=/path/to/node_modules node tests/wipe_freeze_playwright.mjs

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
  console.error('wipe freeze Playwright test exceeded 90 seconds');
  process.exit(1);
}, 90000);

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8134/';
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
    const { gamestate_t } = await import('/src/doomdef.js');
    const dmain = await import('/src/d_main.js');
    const finale = await import('/src/f_finale.js');
    const loop = await import('/src/d_loop.js');
    const menu = await import('/src/m_menu.js');
    const wipe = await import('/src/f_wipe.js');
    const wi = await import('/src/wi_stuff.js');
    const { I_GetTime } = await import('/src/i_system.js');

    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    async function waitUntil(predicate, message, timeoutMs = 30000) {
      const deadline = performance.now() + timeoutMs;
      while (!predicate()) {
        if (performance.now() >= deadline) throw new Error(message);
        await nextFrame();
      }
    }
    async function waitGametics(count, message) {
      const start = doomstat.gametic;
      await waitUntil(() => doomstat.gametic - start >= count, message);
      return doomstat.gametic - start;
    }

    function hashDraw(draw) {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, 320, 200);
      draw(ctx);
      const data = ctx.getImageData(0, 0, 320, 200).data;
      let hash = 2166136261;
      for (let i = 0; i < data.length; i++) {
        hash ^= data[i];
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(16).padStart(8, '0');
    }
    const intermissionHash = () => hashDraw((ctx) => wi.WI_Drawer(ctx, 0, 0, 320, 200));
    const finaleHash = () => hashDraw((ctx) => finale.F_Drawer(ctx, 0, 0, 320, 200));
    const menuHash = () => hashDraw((ctx) => menu.M_Drawer(ctx, 0, 0, 320, 200));

    async function runFrozenWipe(name, expectedState, trigger, snapshot) {
      wipe.wipe_RecordScreen();
      trigger();
      await waitUntil(() => wipe.wipe_isActive(), `${name} wipe never started`);
      if (doomstat.gamestate !== expectedState) {
        throw new Error(`${name} entered state ${doomstat.gamestate}, expected ${expectedState}`);
      }

      const frozenGametic = doomstat.gametic;
      const startedAt = I_GetTime();
      const before = snapshot();
      await waitUntil(
        () => wipe.wipe_isActive() === false || I_GetTime() - startedAt >= 8,
        `${name} wipe did not advance`,
      );
      if (wipe.wipe_isActive() !== true) {
        throw new Error(`${name} wipe ended before its eighth wall-clock tic`);
      }
      const middleGametic = doomstat.gametic;
      const middle = snapshot();
      await waitUntil(() => wipe.wipe_isActive() === false, `${name} wipe never finished`);
      const endedGametic = doomstat.gametic;
      const after = snapshot();

      const resumeStart = doomstat.gametic;
      await waitUntil(() => doomstat.gametic > resumeStart, `${name} simulation did not resume`);
      const resumeDelta = doomstat.gametic - resumeStart;
      return {
        name,
        expectedState,
        frozenGametic,
        middleGametic,
        endedGametic,
        before,
        middle,
        after,
        resumed: snapshot(),
        resumeDelta,
      };
    }

    await waitUntil(
      () => doomstat.gamestate === gamestate_t.GS_LEVEL &&
        doomstat.players[doomstat.consoleplayer]?.mo != null &&
        loop.D_DoomRafLoop.isRunning() === true &&
        wipe.wipe_isActive() === false,
      'E1M1 did not reach a stable running state',
    );
    menu.M_ClearMenus();
    doomstat.set_demoplayback(false);
    doomstat.set_paused(false);

    // Same-state level loads use the same forced wipe path. P_Ticker's
    // leveltime is an independent state-specific proof in addition to gametic.
    const level = await runFrozenWipe(
      'level',
      gamestate_t.GS_LEVEL,
      () => doomstat.set_wipegamestate(-1),
      () => ({ state: doomstat.gamestate, leveltime: doomstat.leveltime }),
    );

    // M_Ticker is outside the state switch but must be frozen by the same gate.
    // Reset its animation phase so eight live tics would necessarily flip SKULL.
    menu.M_Init();
    menu.M_StartControlPanel();
    const menuWipe = await runFrozenWipe(
      'menu',
      gamestate_t.GS_LEVEL,
      () => doomstat.set_wipegamestate(-1),
      () => ({ state: doomstat.gamestate, hash: menuHash() }),
    );
    await waitGametics(8, 'menu ticker did not resume');
    const resumedMenuHash = menuHash();
    menu.M_ClearMenus();

    const makeWb = () => ({
      didsecret: false, epsd: 0, last: 0, next: 1,
      maxkills: 2, maxitems: 2, maxsecret: 2, pnum: 0,
      plyr: [
        { skills: 1, sitems: 1, ssecret: 1, stime: 70, in: true },
        { skills: 0, sitems: 0, ssecret: 0, stime: 0, in: false },
        { skills: 0, sitems: 0, ssecret: 0, stime: 0, in: false },
        { skills: 0, sitems: 0, ssecret: 0, stime: 0, in: false },
      ],
    });
    const player = doomstat.players[doomstat.consoleplayer];
    player.cmd.buttons = 0;
    player.attackdown = 0;
    player.usedown = 0;
    wi.WI_Start(makeWb(), () => {});
    // Leave the first single-player pause one tic from the first counter stage,
    // so a resumed WI_Ticker produces an observable Canvas state promptly.
    for (let i = 0; i < 34; i++) wi.WI_Ticker();
    const intermission = await runFrozenWipe(
      'intermission',
      gamestate_t.GS_INTERMISSION,
      () => {
        doomstat.set_gamestate(gamestate_t.GS_INTERMISSION);
        doomstat.set_viewactive(false);
        doomstat.set_automapactive(false);
      },
      () => ({ state: doomstat.gamestate, hash: intermissionHash() }),
    );
    await waitGametics(4, 'intermission ticker did not resume');
    const resumedIntermissionHash = intermissionHash();

    const finaleWipe = await runFrozenWipe(
      'finale',
      gamestate_t.GS_FINALE,
      () => finale.F_StartFinale(() => {}),
      () => ({ state: doomstat.gamestate, hash: finaleHash() }),
    );
    await waitGametics(15, 'finale ticker did not resume');
    const resumedFinaleHash = finaleHash();

    // Enter the attract title normally, then run its page timer close to expiry.
    // A forced same-state wipe must hold GS_DEMOSCREEN; once it finishes, the
    // remaining D_PageTicker tics must resume and launch DEMO1.
    const titleTransition = await runFrozenWipe(
      'title-transition',
      gamestate_t.GS_DEMOSCREEN,
      () => dmain.D_StartTitle(),
      () => ({ state: doomstat.gamestate }),
    );
    await waitGametics(145, 'title page timer did not advance');
    const demoPage = await runFrozenWipe(
      'demo-page',
      gamestate_t.GS_DEMOSCREEN,
      () => doomstat.set_wipegamestate(-1),
      () => ({ state: doomstat.gamestate }),
    );
    await waitUntil(
      () => doomstat.gamestate !== gamestate_t.GS_DEMOSCREEN,
      'demo page ticker did not resume and launch DEMO1',
    );

    return {
      runs: [level, menuWipe, intermission, finaleWipe, titleTransition, demoPage],
      resumedMenuHash,
      resumedIntermissionHash,
      resumedFinaleHash,
      finalState: doomstat.gamestate,
    };
  });

  const failures = [];
  for (const run of result.runs) {
    if (run.frozenGametic !== run.middleGametic || run.frozenGametic !== run.endedGametic) {
      failures.push(`${run.name} advanced gametic during wipe: ${JSON.stringify(run)}`);
    }
    if (JSON.stringify(run.before) !== JSON.stringify(run.middle) ||
        JSON.stringify(run.before) !== JSON.stringify(run.after)) {
      failures.push(`${run.name} state-specific ticker advanced during wipe: ${JSON.stringify(run)}`);
    }
    if (run.resumeDelta < 1 || run.resumeDelta > 4) {
      failures.push(`${run.name} resumed with ${run.resumeDelta} tics (catch-up or stall)`);
    }
  }
  const level = result.runs.find((run) => run.name === 'level');
  if (level.resumed.leveltime <= level.after.leveltime) {
    failures.push(`level P_Ticker did not resume: ${JSON.stringify(level)}`);
  }
  const menuWipe = result.runs.find((run) => run.name === 'menu');
  if (result.resumedMenuHash === menuWipe.after.hash) {
    failures.push('menu skull ticker did not resume after eight tics');
  }
  const intermission = result.runs.find((run) => run.name === 'intermission');
  if (result.resumedIntermissionHash === intermission.after.hash) {
    failures.push('intermission counter state did not resume');
  }
  const finaleWipe = result.runs.find((run) => run.name === 'finale');
  if (result.resumedFinaleHash === finaleWipe.after.hash) {
    failures.push('finale text ticker did not resume');
  }
  if (result.finalState === 3 /*GS_DEMOSCREEN*/) {
    failures.push('demo page remained stuck after the wipe');
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== null) await browser.close();
  clearTimeout(watchdog);
}
