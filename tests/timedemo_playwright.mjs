// Headless integration coverage for browser timedemo scheduling/reporting.

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
  console.error('timedemo Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8098/';
  const url = new URL(baseUrl);
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer?.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const game = await import('/src/g_game.js');
    const loop = await import('/src/d_loop.js');
    const wipe = await import('/src/f_wipe.js');
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (let i = 0; i < 180 && wipe.wipe_isActive(); i++) await nextFrame();

    const commandCount = 5;
    const bytes = [
      109, 2, 1, 1, // version, skill, episode, map
      0, 0, 0, 0,  // deathmatch, respawn, fast, nomonsters
      0,            // consoleplayer
      1, 0, 0, 0,  // playeringame
    ];
    for (let i = 0; i < commandCount; i++) bytes.push(i + 1, 0, 0, 0);
    bytes.push(0x80);

    let eventResult = null;
    window.addEventListener('doom:timedemo', (event) => { eventResult = event.detail; }, { once: true });
    game.G_TimeDemo(new Uint8Array(bytes));
    const startFlags = {
      timingdemo: doomstat.timingdemo,
      singletics: doomstat.singletics,
      singledemo: doomstat.singledemo,
    };

    const perFrameTics = [];
    let previous = doomstat.gametic;
    for (let frame = 0; frame < 240; frame++) {
      await nextFrame();
      const current = doomstat.gametic;
      perFrameTics.push(current - previous);
      previous = current;
      if (game.G_GetTimeDemoResult() !== null) break;
    }
    const report = game.G_GetTimeDemoResult();
    const endFlags = {
      timingdemo: doomstat.timingdemo,
      singletics: doomstat.singletics,
      singledemo: doomstat.singledemo,
      demoplayback: doomstat.demoplayback,
    };
    loop.D_DoomRafLoop.stop();
    game.G_PlayDemo(new Uint8Array());
    const playFlags = {
      timingdemo: doomstat.timingdemo,
      singletics: doomstat.singletics,
      singledemo: doomstat.singledemo,
    };
    game.G_Ticker(); // invalid demo request clears the explicit single-demo flag
    const abortedPlayFlags = {
      timingdemo: doomstat.timingdemo,
      singletics: doomstat.singletics,
      singledemo: doomstat.singledemo,
    };
    game.G_TimeDemo(new Uint8Array());
    game.G_Ticker();
    const abortedTimeFlags = {
      timingdemo: doomstat.timingdemo,
      singletics: doomstat.singletics,
      singledemo: doomstat.singledemo,
    };
    return {
      commandCount, startFlags, endFlags, playFlags, abortedPlayFlags, abortedTimeFlags,
      perFrameTics, report, eventResult,
    };
  });

  const failures = [];
  if (!result.startFlags.timingdemo || !result.startFlags.singletics || result.startFlags.singledemo) {
    failures.push(`G_TimeDemo flags differ from reference: ${JSON.stringify(result.startFlags)}`);
  }
  if (result.report === null || result.report.gametics !== result.commandCount ||
      result.report.message !== `timed ${result.commandCount} gametics in ${result.report?.realtics} realtics`) {
    failures.push(`timedemo report mismatch: ${JSON.stringify(result.report)}`);
  }
  if (result.eventResult === null ||
      JSON.stringify(result.eventResult) !== JSON.stringify(result.report)) {
    failures.push('doom:timedemo event did not publish the stored report');
  }
  if (result.perFrameTics.some((count) => count < 0 || count > 1)) {
    failures.push(`singletics ran more than one simulation tic per RAF: ${JSON.stringify(result.perFrameTics)}`);
  }
  if (result.endFlags.timingdemo || result.endFlags.singletics ||
      result.endFlags.singledemo || result.endFlags.demoplayback) {
    failures.push(`timedemo flags leaked after completion: ${JSON.stringify(result.endFlags)}`);
  }
  if (result.playFlags.timingdemo || result.playFlags.singletics ||
      !result.playFlags.singledemo || result.abortedPlayFlags.singledemo) {
    failures.push(`G_PlayDemo did not remain distinct/reset safely: ${JSON.stringify({
      play: result.playFlags,
      aborted: result.abortedPlayFlags,
    })}`);
  }
  if (result.abortedTimeFlags.timingdemo || result.abortedTimeFlags.singletics ||
      result.abortedTimeFlags.singledemo) {
    failures.push(`failed timedemo leaked flags: ${JSON.stringify(result.abortedTimeFlags)}`);
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(watchdog);
  if (browser !== null) await browser.close();
}
