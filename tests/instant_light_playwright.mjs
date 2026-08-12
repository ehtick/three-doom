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
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = new URL(process.env.DOOM_URL ?? 'http://127.0.0.1:8134/');
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer?.info.render.frame > 2,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const lights = await import('/src/p_lights.js');
    const loop = await import('/src/d_loop.js');
    loop.D_DoomRafLoop.stop();

    function colorSum(name) {
      const root = window.scene.getObjectByName(name);
      let sum = 0;
      root.traverse((object) => {
        const values = object.geometry?.attributes.color?.array;
        if (values === undefined) return;
        for (let i = 0; i < values.length; i++) sum += values[i];
      });
      return sum;
    }

    const player = doomstat.players[doomstat.consoleplayer];
    const sector = player.mo.subsector.sector;
    sector.tag = 32767;
    const before = {
      floors: colorSum('floors'),
      ceilings: colorSum('ceilings'),
      walls: colorSum('walls'),
    };
    const oldLight = sector.lightlevel;
    const newLight = oldLight === 32 ? 224 : 32;
    lights.EV_LightTurnOn({ tag: 32767 }, newLight);
    const after = {
      floors: colorSum('floors'),
      ceilings: colorSum('ceilings'),
      walls: colorSum('walls'),
    };
    return { oldLight, newLight, before, after };
  });

  for (const kind of ['floors', 'ceilings', 'walls']) {
    if (result.before[kind] === result.after[kind]) {
      throw new Error(`${kind} retained stale colors: ${JSON.stringify(result)}`);
    }
  }
  if (errors.length !== 0) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
