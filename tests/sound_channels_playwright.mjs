// Headless integration check for configured SFX allocation and priority
// preemption. It instruments AudioBufferSourceNode without exposing production
// channel internals.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser = null;
const watchdog = setTimeout(() => {
  console.error('sound channel Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);

try {
  browser = await chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 640, height: 400 } });
  await context.addInitScript(() => {
    const active = new Set();
    const originalStart = AudioBufferSourceNode.prototype.start;
    const originalStop = AudioBufferSourceNode.prototype.stop;
    const probe = {
      starts: 0,
      stops: 0,
      reset() {
        active.clear();
        this.starts = 0;
        this.stops = 0;
      },
      snapshot() {
        return { starts: this.starts, stops: this.stops, active: active.size };
      },
    };
    AudioBufferSourceNode.prototype.start = function(...args) {
      probe.starts++;
      active.add(this);
      this.addEventListener('ended', () => active.delete(this), { once: true });
      return originalStart.apply(this, args);
    };
    AudioBufferSourceNode.prototype.stop = function(...args) {
      if (active.delete(this)) probe.stops++;
      return originalStop.apply(this, args);
    };
    globalThis.__doomSoundChannelProbe = probe;
  });

  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const url = new URL(process.env.DOOM_URL ?? 'http://127.0.0.1:8095/');
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer !== undefined &&
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer.info.render.frame > 2,
  { timeout: 30000 });

  // Resume Web Audio through the same gesture path used by the game.
  await page.keyboard.press('Space');
  await page.waitForTimeout(100);

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const sound = await import('/src/s_sound.js');
    doomstat.set_paused(true);

    const mo = doomstat.players[doomstat.consoleplayer].mo;
    const origin = () => ({ x: mo.x, y: mo.y });
    const probe = globalThis.__doomSoundChannelProbe;

    function initialize(count) {
      doomstat.set_numChannels(count);
      sound.S_Init(doomstat.snd_SfxVolume, doomstat.snd_MusicVolume);
      probe.reset();
    }

    function startMany(count, sfxid) {
      for (let i = 0; i < count; i++) {
        sound.S_StartSoundAtVolume(origin(), sfxid, doomstat.snd_SfxVolume);
      }
    }

    const defaultCount = doomstat.numChannels;

    initialize(3);
    startMany(3, 14 /* sfx_rlaunc, priority 64 */);
    const threeFilled = probe.snapshot();
    startMany(1, 14);
    const threePreempted = probe.snapshot();

    initialize(3);
    startMany(3, 35 /* sfx_telept, priority 32 */);
    const priorityFilled = probe.snapshot();
    startMany(1, 14 /* priority 64 cannot replace 32 */);
    const priorityRejected = probe.snapshot();

    initialize(8);
    startMany(8, 14);
    const eightFilled = probe.snapshot();
    startMany(1, 14);
    const eightPreempted = probe.snapshot();

    initialize(0);
    startMany(1, 14);
    const zeroRejected = probe.snapshot();

    return {
      defaultCount,
      threeFilled,
      threePreempted,
      priorityFilled,
      priorityRejected,
      eightFilled,
      eightPreempted,
      zeroRejected,
    };
  });

  const expected = {
    defaultCount: 3,
    threeFilled: { starts: 3, stops: 0, active: 3 },
    threePreempted: { starts: 4, stops: 1, active: 3 },
    priorityFilled: { starts: 3, stops: 0, active: 3 },
    priorityRejected: { starts: 3, stops: 0, active: 3 },
    eightFilled: { starts: 8, stops: 0, active: 8 },
    eightPreempted: { starts: 9, stops: 1, active: 8 },
    zeroRejected: { starts: 0, stops: 0, active: 0 },
  };
  if (JSON.stringify(result) !== JSON.stringify(expected)) {
    throw new Error(`sound channel integration mismatch:\nexpected ${JSON.stringify(expected)}\nactual   ${JSON.stringify(result)}`);
  }
  if (pageErrors.length !== 0) throw new Error(`page errors: ${pageErrors.join('; ')}`);
  console.log(JSON.stringify(result));
} finally {
  if (browser !== null) await browser.close();
  clearTimeout(watchdog);
}
