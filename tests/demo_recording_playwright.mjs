// Headless integration coverage for centralized recording finalization, the
// live Q key, capacity overflow, and browser-result retrieval.

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
  console.error('demo-recording Playwright test exceeded 60 seconds');
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
    const menu = await import('/src/m_menu.js');
    const wipe = await import('/src/f_wipe.js');
    const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));
    for (let i = 0; i < 180 && wipe.wipe_isActive(); i++) await nextFrame();
    menu.M_ClearMenus();
    doomstat.set_gamestate(0 /*GS_LEVEL*/);

    const events = [];
    window.addEventListener('doom:demorecorded', (event) => {
      events.push({
        name: event.detail.name,
        reason: event.detail.reason,
        bytes: Array.from(event.detail.bytes),
      });
    });

    game.G_RecordDemo('quit-key');
    document.dispatchEvent(new KeyboardEvent('keydown', {
      code: 'KeyQ', key: 'q', bubbles: true, cancelable: true,
    }));
    for (let i = 0; i < 120 && doomstat.demorecording; i++) await nextFrame();
    document.dispatchEvent(new KeyboardEvent('keyup', {
      code: 'KeyQ', key: 'q', bubbles: true, cancelable: true,
    }));
    const quit = game.G_GetDemoRecordingResult();
    const quitViaStop = game.G_StopDemo();
    const eventsAfterRepeatedStop = events.length;

    // Stop the autonomous loop so the capacity/manual cases below are driven
    // only by their explicit production G_WriteDemoTiccmd calls.
    loop.D_DoomRafLoop.stop();
    const first = { forwardmove: 1, sidemove: 2, angleturn: 3, buttons: 4 };
    const overflowCandidate = { forwardmove: 9, sidemove: 9, angleturn: 9, buttons: 9 };
    game.G_RecordDemo('capacity', 29);
    const firstWritten = game.G_WriteDemoTiccmd(first, false);
    const overflowWritten = game.G_WriteDemoTiccmd(overflowCandidate, false);
    const overflow = game.G_GetDemoRecordingResult();
    game.G_CheckDemoStatus('overflow');
    const eventsAfterRepeatedOverflow = events.length;

    game.G_RecordDemo('manual');
    game.G_WriteDemoTiccmd({ forwardmove: 5, sidemove: 6, angleturn: 7, buttons: 8 });
    const manual = game.G_StopDemo();
    const manualAgain = game.G_StopDemo();

    return {
      recordingFlag: doomstat.demorecording,
      quit: quit === null ? null : {
        name: quit.name,
        filename: quit.filename,
        reason: quit.reason,
        bytes: Array.from(quit.bytes),
      },
      quitSameResult: quit === quitViaStop,
      eventsAfterRepeatedStop,
      firstWritten,
      overflowWritten,
      overflowCandidate,
      overflow: overflow === null ? null : {
        reason: overflow.reason,
        bytes: Array.from(overflow.bytes),
      },
      eventsAfterRepeatedOverflow,
      manual: {
        reason: manual.reason,
        bytes: Array.from(manual.bytes),
      },
      manualSameResult: manual === manualAgain,
      events,
    };
  });

  const failures = [];
  if (result.quit === null || result.quit.reason !== 'quit' ||
      result.quit.name !== 'quit-key' || result.quit.filename !== 'quit-key.lmp' ||
      result.quit.bytes.length !== 14 || result.quit.bytes.at(-1) !== 0x80) {
    failures.push(`Q did not finalize before the next command: ${JSON.stringify(result.quit)}`);
  }
  if (!result.quitSameResult || result.eventsAfterRepeatedStop !== 1) {
    failures.push('repeated stop changed the Q result or appended/published another marker');
  }
  if (!result.firstWritten || result.overflowWritten || result.overflow?.reason !== 'overflow' ||
      result.overflow.bytes.length !== 18 || result.overflow.bytes.at(-1) !== 0x80 ||
      result.overflowCandidate.forwardmove !== 9) {
    failures.push(`overflow did not preserve the valid prefix: ${JSON.stringify(result.overflow)}`);
  }
  if (result.eventsAfterRepeatedOverflow !== 2) {
    failures.push('repeated overflow status published another result');
  }
  if (result.manual.reason !== 'manual' || result.manual.bytes.at(-1) !== 0x80 ||
      !result.manualSameResult || result.recordingFlag) {
    failures.push(`manual finalization was not centralized/idempotent: ${JSON.stringify(result.manual)}`);
  }
  if (result.events.length !== 3 ||
      result.events.map((event) => event.reason).join(',') !== 'quit,overflow,manual') {
    failures.push(`recording events mismatch: ${JSON.stringify(result.events)}`);
  }
  for (const event of result.events) {
    if (event.bytes.filter((byte) => byte === 0x80).length !== 1) {
      failures.push(`recording marker was not unique: ${JSON.stringify(event)}`);
    }
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(watchdog);
  if (browser !== null) await browser.close();
}
