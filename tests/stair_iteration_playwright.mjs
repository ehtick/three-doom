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
    window.scene?.getObjectByName('level') !== undefined,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const loop = await import('/src/d_loop.js');
    const floor = await import('/src/p_floor.js');
    const setup = await import('/src/p_setup.js');
    loop.D_DoomRafLoop.stop();

    for (const sector of setup.sectors) {
      sector.tag = -1;
      sector.lines = [];
      sector.specialdata = null;
    }

    const first = setup.sectors[0];
    const skipped = setup.sectors[1];
    const chainEnd = setup.sectors[3];
    first.tag = 77;
    skipped.tag = 77;
    first.floorpic = 9;
    skipped.floorpic = 9;
    chainEnd.floorpic = 9;
    first.lines = [{
      flags: 4,
      frontsector: first,
      backsector: chainEnd,
    }];

    const started = [];
    floor.P_FloorSetExternals({
      P_AddThinker: (thinker) => started.push(setup.sectors.indexOf(thinker.__floor.sector)),
    });
    const activated = floor.EV_BuildStairs({ tag: 77 }, floor.build8);
    return { activated, started };
  });

  if (result.activated !== 1 || JSON.stringify(result.started) !== '[0,3]') {
    throw new Error(`stair seed iteration mismatch: ${JSON.stringify(result)}`);
  }
  if (errors.length !== 0) throw new Error(`page errors: ${errors.join('; ')}`);
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
