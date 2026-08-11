// Headless scheduler coverage for visible low-FPS catch-up and Page Visibility
// suspension. The RAF harness supplies monotonic timestamps without waiting a
// real minute or opening a GUI browser.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const options = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser;
try {
  browser = await chromium.launch(options);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.addInitScript(() => {
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const held = [];
    const visibilityListeners = new Set();
    const nativeDocumentAdd = document.addEventListener.bind(document);
    const nativeDocumentRemove = document.removeEventListener.bind(document);
    let forcedVisibility = 'visible';

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => forcedVisibility,
    });
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => forcedVisibility === 'hidden',
    });
    document.addEventListener = (type, listener, eventOptions) => {
      if (type === 'visibilitychange') visibilityListeners.add(listener);
      nativeDocumentAdd(type, listener, eventOptions);
    };
    document.removeEventListener = (type, listener, eventOptions) => {
      if (type === 'visibilitychange') visibilityListeners.delete(listener);
      nativeDocumentRemove(type, listener, eventOptions);
    };

    const harness = {
      hold: false,
      lastTimestamp: 0,
      heldCount: () => held.length,
      listenerCount: () => visibilityListeners.size,
      setVisibility(state) {
        forcedVisibility = state;
        document.dispatchEvent(new Event('visibilitychange'));
      },
      release(timestamp) {
        const entry = held.shift();
        if (entry === undefined) throw new Error('no held Doom RAF');
        this.lastTimestamp = timestamp;
        entry.callback(timestamp);
      },
    };
    window.__doomSuspensionHarness = harness;
    window.requestAnimationFrame = (callback) => nativeRequest((now) => {
      if (harness.hold === true) held.push({ callback, now });
      else callback(now);
    });
    window.cancelAnimationFrame = (id) => nativeCancel(id);
  });

  const url = new URL(process.env.DOOM_URL ?? 'http://127.0.0.1:8134/');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer?.info.render.frame > 2,
  { timeout: 30000 });
  await page.evaluate(async () => {
    const wipe = await import('/src/f_wipe.js');
    if (wipe.wipe_isActive()) {
      wipe.wipe_ScreenWipe(0, 0, 0, 320, 200, 1000);
      wipe.wipe_ScreenWipe(0, 0, 0, 320, 200, 1);
    }
    if (wipe.wipe_isActive()) throw new Error('startup wipe did not complete');
    await new Promise((resolve) => requestAnimationFrame(resolve));
    window.__doomSuspensionHarness.hold = true;
  });
  const waitHeld = async () => {
    for (let attempt = 0; attempt < 200; attempt++) {
      const count = await page.evaluate(() =>
        window.__doomSuspensionHarness.heldCount());
      if (count >= 1) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error('Doom RAF was not held');
  };
  await waitHeld();

  // Release one naturally-timestamped frame to establish a controlled clock
  // baseline, then feed five visible 200ms frames: exactly 35 simulation tics.
  await page.evaluate(() => {
    const harness = window.__doomSuspensionHarness;
    const timestamp = performance.now();
    harness.release(timestamp);
  });
  await waitHeld();
  const slowStart = await page.evaluate(async () =>
    (await import('/src/doomstat.js')).gametic);
  for (let frame = 0; frame < 5; frame++) {
    await page.evaluate(() => {
      const harness = window.__doomSuspensionHarness;
      harness.release(harness.lastTimestamp + 200);
    });
    await waitHeld();
  }
  const slowEnd = await page.evaluate(async () =>
    (await import('/src/doomstat.js')).gametic);

  // A hidden RAF with a one-minute timestamp jump must advance nothing and
  // retain the latch. The first visible RAF gets only NetUpdate's five-command
  // debt; the remaining 2,095 tics are discarded.
  const suspension = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const harness = window.__doomSuspensionHarness;
    harness.setVisibility('hidden');
    const beforeHidden = doomstat.gametic;
    harness.release(harness.lastTimestamp + 60000);
    return { beforeHidden, afterHidden: doomstat.gametic };
  });
  await waitHeld();
  const resumed = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const loop = await import('/src/d_loop.js');
    const main = await import('/src/d_main.js');
    const harness = window.__doomSuspensionHarness;
    harness.setVisibility('visible');
    const beforeResume = doomstat.gametic;
    harness.release(harness.lastTimestamp + 60000);
    const afterResume = doomstat.gametic;
    loop.D_DoomRafLoop.stop();
    const listenersBeforeShutdown = harness.listenerCount();
    main.D_ShutdownDoomLoop();
    return {
      beforeResume,
      afterResume,
      listenersBeforeShutdown,
      listenersAfterShutdown: harness.listenerCount(),
    };
  });

  const result = {
    visibleSlowTics: slowEnd - slowStart,
    hiddenTics: suspension.afterHidden - suspension.beforeHidden,
    resumedTics: resumed.afterResume - resumed.beforeResume,
    listenersBeforeShutdown: resumed.listenersBeforeShutdown,
    listenersAfterShutdown: resumed.listenersAfterShutdown,
  };
  const failures = [];
  if (result.visibleSlowTics !== 35) {
    failures.push(`visible 5 Hz catch-up: ${result.visibleSlowTics}`);
  }
  if (result.hiddenTics !== 0) failures.push(`hidden RAF tics: ${result.hiddenTics}`);
  if (result.resumedTics !== 5) failures.push(`resumed RAF tics: ${result.resumedTics}`);
  if (result.listenersBeforeShutdown < 1 ||
      result.listenersAfterShutdown !== result.listenersBeforeShutdown - 1) {
    failures.push(`visibility listener lifecycle: ${JSON.stringify(resumed)}`);
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
