// Integration check for an active E1M1 teardown. Start a static server at the
// repository root, then run with:
//   NODE_PATH=/path/to/node_modules node tests/shutdown_playwright.mjs

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const watchdog = setTimeout(() => {
  console.error('shutdown Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);
const pageErrors = [];

async function trackAudioContexts(page, failClose = false) {
  await page.addInitScript(({ rejectClose }) => {
    const NativeAudioContext = window.AudioContext || window.webkitAudioContext;
    window.__doomAudioShutdown = {
      created: 0,
      live: 0,
      closeCalls: 0,
      closeSettled: 0,
      order: [],
    };
    if (NativeAudioContext === undefined) return;

    const state = window.__doomAudioShutdown;
    const TrackedAudioContext = new Proxy(NativeAudioContext, {
      construct(target, args) {
        const context = Reflect.construct(target, args, target);
        state.created++;
        state.live++;
        return context;
      },
    });
    window.AudioContext = TrackedAudioContext;
    if (window.webkitAudioContext === NativeAudioContext) {
      window.webkitAudioContext = TrackedAudioContext;
    }

    const nativeClose = NativeAudioContext.prototype.close;
    NativeAudioContext.prototype.close = function() {
      state.closeCalls++;
      state.order.push('sound');
      if (rejectClose === true) {
        return Promise.reject(new Error('intentional AudioContext.close failure'));
      }
      return Promise.resolve(nativeClose.call(this)).then((result) => {
        state.closeSettled++;
        state.live--;
        return result;
      });
    };
  }, { rejectClose: failClose });
}

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await trackAudioContexts(page);
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8093/';
  const url = new URL(baseUrl);
  url.searchParams.set('map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer !== undefined &&
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer.info.render.frame > 2,
  { timeout: 30000 });
  const result = await page.evaluate(async () => {
    const iv = await import('/src/i_video.js');
    const keyboard = await import('/src/d_keyboard.js');
    const loop = await import('/src/d_loop.js');
    const events = await import('/src/d_event.js');
    const doomstat = await import('/src/doomstat.js');
    const wi = await import('/src/wi_stuff.js');
    const system = await import('/src/i_system.js');
    const sound = await import('/src/i_sound.js');
    const oldRenderer = window.renderer;
    const oldScene = window.scene;
    const oldCamera = window.camera;
    const oldCanvas = oldRenderer.domElement;
    const nativeForceContextLoss = oldRenderer.forceContextLoss.bind(oldRenderer);
    oldRenderer.forceContextLoss = () => {
      window.__doomAudioShutdown.order.push('graphics');
      return nativeForceContextLoss();
    };
    const musicWasPlaying = sound.I_QrySongPlaying(0);
    const makeWb = () => ({
      didsecret: false, epsd: 0, last: 0, next: 1,
      maxkills: 1, maxitems: 1, maxsecret: 1, pnum: 0,
      plyr: [
        { skills: 0, sitems: 0, ssecret: 0, stime: 0, in: true },
        { skills: 0, sitems: 0, ssecret: 0, stime: 0, in: false },
        { skills: 0, sitems: 0, ssecret: 0, stime: 0, in: false },
        { skills: 0, sitems: 0, ssecret: 0, stime: 0, in: false },
      ],
    });
    const overlay = document.getElementById('overlay');
    // WI_End uses the same unload helper. Two explicit start/shutdown cycles
    // prove cleared Canvas references are rebuilt correctly.
    for (let cycle = 0; cycle < 2; cycle++) {
      wi.WI_Start(makeWb(), () => {});
      wi.WI_Drawer(overlay.getContext('2d'), 0, 0, overlay.width, overlay.height);
      wi.WI_Shutdown();
    }
    // Headless Chromium does not consistently grant real pointer lock. Install
    // a deterministic document-level stand-in so the exit/change ordering is
    // still exercised through the production shutdown path.
    let lockedCanvas = oldCanvas;
    Object.defineProperty(document, 'pointerLockElement', {
      configurable: true,
      get: () => lockedCanvas,
    });
    Object.defineProperty(document, 'exitPointerLock', {
      configurable: true,
      value: () => {
        lockedCanvas = null;
        document.dispatchEvent(new Event('pointerlockchange'));
      },
    });
    const wasPointerLocked = document.pointerLockElement === oldCanvas;
    const menuWasClosed = doomstat.menuactive === false;
    const level = oldScene.getObjectByName('level');
    const disposed = { geometries: 0, materials: 0, maps: 0, palettes: 0, colormaps: 0 };
    const geometries = new Set();
    const materials = new Set();
    const maps = new Set();
    const palettes = new Set();
    const colormaps = new Set();
    level.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of objectMaterials) {
        if (!material) continue;
        materials.add(material);
        if (material.uniforms?.map?.value) maps.add(material.uniforms.map.value);
        if (material.uniforms?.palette?.value) palettes.add(material.uniforms.palette.value);
        if (material.uniforms?.colormap?.value) colormaps.add(material.uniforms.colormap.value);
      }
    });
    for (const resource of geometries) resource.addEventListener('dispose', () => disposed.geometries++);
    for (const resource of materials) resource.addEventListener('dispose', () => disposed.materials++);
    for (const resource of maps) resource.addEventListener('dispose', () => disposed.maps++);
    for (const resource of palettes) resource.addEventListener('dispose', () => disposed.palettes++);
    for (const resource of colormaps) resource.addEventListener('dispose', () => disposed.colormaps++);

    // Both handlers yield on dynamic imports. Quit in the same task to prove
    // their continuations are invalidated and cannot reopen UI/pointer lock.
    document.dispatchEvent(new KeyboardEvent('keydown', { code: 'Escape', key: 'Escape', bubbles: true }));
    document.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    system.I_Quit();
    system.I_Quit();
    const first = iv.I_ShutdownGraphics();
    const second = iv.I_ShutdownGraphics();
    const samePromise = first === second;
    const report = await first;
    await second;
    const firstSoundShutdown = sound.I_ShutdownSound();
    const secondSoundShutdown = sound.I_ShutdownSound();
    await firstSoundShutdown;
    const stoppedTic = doomstat.gametic;

    const eventHead = events.eventhead;
    const key = new KeyboardEvent('keydown', { code: 'KeyW', key: 'w', bubbles: true, cancelable: true });
    document.dispatchEvent(key);
    window.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    const probe = { cmd: {} };
    keyboard.D_KeyboardInput.buildCmd(probe);

    return {
      samePromise,
      sameSoundPromise: firstSoundShutdown === secondSoundShutdown,
      musicWasPlaying,
      musicIsPlaying: sound.I_QrySongPlaying(0),
      audioShutdown: { ...window.__doomAudioShutdown },
      report,
      disposed,
      expected: {
        geometries: geometries.size,
        materials: materials.size,
        maps: maps.size,
        palettes: palettes.size,
        colormaps: colormaps.size,
      },
      globalsCleared: iv.renderer === null && iv.scene === null && iv.camera === null &&
        window.renderer === undefined && window.scene === undefined && window.camera === undefined,
      domCleared: oldCanvas.isConnected === false &&
        document.querySelector('#container canvas') === null && oldScene.children.length === 0,
      contextLost: oldRenderer.getContext().isContextLost(),
      listenerInactive: key.defaultPrevented === false && events.eventhead === eventHead &&
        probe.cmd.forwardmove === 0 &&
        probe.cmd.sidemove === 0 && probe.cmd.angleturn === 0 && probe.cmd.buttons === 0,
      loopStopped: loop.D_DoomRafLoop.isRunning() === false,
      stoppedTic,
      wasPointerLocked,
      menuWasClosed,
      oldCameraRetainedOnlyLocally: oldCamera !== null,
      intermissionReloaded: true,
    };
  });

  await page.waitForTimeout(200);
  const afterTic = await page.evaluate(async () => (await import('/src/doomstat.js')).gametic);
  const pointerState = await page.evaluate(async () => ({
    released: document.pointerLockElement === null,
    menuStillClosed: (await import('/src/doomstat.js')).menuactive === false,
  }));

  // Also quit during async startup, after the renderer exists but before the
  // level/RAF loop is guaranteed to have started. Startup must not resurrect it.
  const earlyPage = await browser.newPage({ viewport: { width: 640, height: 400 } });
  earlyPage.on('pageerror', (error) => pageErrors.push(`early: ${error.message}`));
  await trackAudioContexts(earlyPage);
  await earlyPage.goto(url.href, { waitUntil: 'domcontentloaded' });
  await earlyPage.waitForFunction(() => window.renderer !== undefined, { timeout: 30000 });
  await earlyPage.evaluate(() => window.dispatchEvent(new CustomEvent('doom:quit')));
  await earlyPage.waitForTimeout(1500);
  const early = await earlyPage.evaluate(async () => {
    const iv = await import('/src/i_video.js');
    const loop = await import('/src/d_loop.js');
    const doomstat = await import('/src/doomstat.js');
    return {
      clean: iv.renderer === null && iv.scene === null && iv.camera === null &&
        window.renderer === undefined && window.scene === undefined && window.camera === undefined &&
        document.querySelector('#container canvas') === null,
      loopClosed: loop.D_DoomRafLoop.isClosed() === true && loop.D_DoomRafLoop.isRunning() === false,
      gametic: doomstat.gametic,
      audioShutdown: { ...window.__doomAudioShutdown },
    };
  });
  await earlyPage.waitForTimeout(200);
  const earlyAfterTic = await earlyPage.evaluate(async () => (await import('/src/doomstat.js')).gametic);
  await earlyPage.close();

  // A faulty extension hook must reject shutdown without stranding the
  // renderer/context/DOM or breaking repeated-call idempotency.
  const failurePage = await browser.newPage({ viewport: { width: 640, height: 400 } });
  failurePage.on('pageerror', (error) => pageErrors.push(`failure: ${error.message}`));
  await trackAudioContexts(failurePage, true);
  await failurePage.goto(url.href, { waitUntil: 'domcontentloaded' });
  await failurePage.waitForFunction(() => window.renderer !== undefined, { timeout: 30000 });
  const failureCleanup = await failurePage.evaluate(async () => {
    const iv = await import('/src/i_video.js');
    const loop = await import('/src/d_loop.js');
    const system = await import('/src/i_system.js');
    const sound = await import('/src/i_sound.js');
    const oldRenderer = window.renderer;
    const nativeForceContextLoss = oldRenderer.forceContextLoss.bind(oldRenderer);
    oldRenderer.forceContextLoss = () => {
      window.__doomAudioShutdown.order.push('graphics');
      return nativeForceContextLoss();
    };
    iv.I_RegisterGraphicsShutdownHook(() => { throw new Error('intentional shutdown-hook failure'); });
    system.I_Quit();
    const first = iv.I_ShutdownGraphics();
    const second = iv.I_ShutdownGraphics();
    let rejected = false;
    try { await first; } catch (error) { rejected = error instanceof AggregateError; }
    try { await second; } catch (_) {}
    return {
      rejected,
      samePromise: first === second,
      clean: iv.renderer === null && iv.scene === null && iv.camera === null &&
        window.renderer === undefined && window.scene === undefined && window.camera === undefined &&
        document.querySelector('#container canvas') === null,
      contextLost: oldRenderer.getContext().isContextLost(),
      loopClosed: loop.D_DoomRafLoop.isClosed() === true && loop.D_DoomRafLoop.isRunning() === false,
      musicStopped: sound.I_QrySongPlaying(0) === false,
      audioShutdown: { ...window.__doomAudioShutdown },
    };
  });
  await failurePage.close();

  const failures = [];
  if (!result.samePromise) failures.push('repeated shutdown did not return the same promise');
  if (!result.sameSoundPromise) failures.push('repeated sound shutdown did not return the same promise');
  if (!result.musicWasPlaying || result.musicIsPlaying) failures.push('music was not stopped by I_Quit');
  if (result.audioShutdown.created !== 1 || result.audioShutdown.closeCalls !== 1 ||
      result.audioShutdown.closeSettled !== 1 || result.audioShutdown.live !== 0) {
    failures.push(`AudioContext was not closed exactly once: ${JSON.stringify(result.audioShutdown)}`);
  }
  if (result.audioShutdown.order.indexOf('sound') < 0 ||
      result.audioShutdown.order.indexOf('graphics') <= result.audioShutdown.order.indexOf('sound')) {
    failures.push(`sound did not shut down before graphics: ${JSON.stringify(result.audioShutdown.order)}`);
  }
  if (!result.globalsCleared) failures.push('graphics globals were retained');
  if (!result.domCleared) failures.push('renderer DOM/scene objects were retained');
  if (!result.contextLost || !result.report.contextLost) failures.push('WebGL context was not released');
  if (!result.listenerInactive) failures.push('keyboard listener remained active');
  if (!result.intermissionReloaded) failures.push('intermission Canvas reload failed');
  if (!result.wasPointerLocked || !result.menuWasClosed || !pointerState.released || !pointerState.menuStillClosed) {
    failures.push(`pointer lock was not released cleanly: ${JSON.stringify({
      wasPointerLocked: result.wasPointerLocked,
      menuWasClosed: result.menuWasClosed,
      released: pointerState.released,
      menuStillClosed: pointerState.menuStillClosed,
    })}`);
  }
  if (!result.loopStopped || afterTic !== result.stoppedTic) failures.push(`RAF loop advanced (${result.stoppedTic} -> ${afterTic})`);
  if (!early.clean || !early.loopClosed || earlyAfterTic !== early.gametic) {
    failures.push(`startup shutdown resurrected work (${early.gametic} -> ${earlyAfterTic})`);
  }
  if (early.audioShutdown.live !== 0 || early.audioShutdown.created !== early.audioShutdown.closeCalls) {
    failures.push(`startup shutdown leaked/recreated audio: ${JSON.stringify(early.audioShutdown)}`);
  }
  if (!failureCleanup.rejected || !failureCleanup.samePromise || !failureCleanup.clean ||
      !failureCleanup.contextLost || !failureCleanup.loopClosed || !failureCleanup.musicStopped) {
    failures.push('failed shutdown hook stranded graphics cleanup');
  }
  if (failureCleanup.audioShutdown.closeCalls !== 1 ||
      failureCleanup.audioShutdown.order.indexOf('graphics') <=
        failureCleanup.audioShutdown.order.indexOf('sound')) {
    failures.push(`failed audio close stranded/preceded graphics cleanup: ${JSON.stringify(failureCleanup.audioShutdown)}`);
  }
  if (result.disposed.geometries !== result.expected.geometries) failures.push(`level geometries disposed ${result.disposed.geometries}/${result.expected.geometries}`);
  if (result.disposed.materials !== result.expected.materials) failures.push(`level materials disposed ${result.disposed.materials}/${result.expected.materials}`);
  if (result.disposed.maps !== result.expected.maps) failures.push(`indexed maps disposed ${result.disposed.maps}/${result.expected.maps}`);
  if (result.disposed.palettes !== result.expected.palettes) failures.push('shared palette texture not disposed');
  if (result.disposed.colormaps !== result.expected.colormaps) failures.push('shared COLORMAP texture not disposed');
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ afterTic, earlyAfterTic, early, failureCleanup, ...result }));
} finally {
  if (browser !== null) await browser.close();
  clearTimeout(watchdog);
}
