// Headless integration coverage for MF_NOSECTOR registration, thinker-list
// reconstruction, and removal after a live flag change.

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
  console.error('MF_NOSECTOR Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 640, height: 400 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const baseUrl = process.env.DOOM_URL ?? 'http://127.0.0.1:8096/';
  const url = new URL(baseUrl);
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.scene?.getObjectByName('level') !== undefined &&
    globalThis.__doom_thinkercap !== undefined,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const THREE = await import('three');
    const doomstat = await import('/src/doomstat.js');
    const info = await import('/src/info.js');
    const pMobj = await import('/src/p_mobj.js');
    const rThings = await import('/src/r_things.js');
    const spriteLogic = await import('/src/r_sprite_logic.js');

    const scratch = new THREE.Group();
    const initialGroup = rThings.R_BuildSpriteBillboards(scratch);
    const initialCount = initialGroup.children.length;
    const player = doomstat.players[doomstat.consoleplayer].mo;

    // P_SpawnMobj's renderer hook must ignore a real MAP30-style actor.
    const bossEye = pMobj.P_SpawnMobj(player.x, player.y, player.z, info.MT_BOSSSPIT);
    const afterSpawn = initialGroup.children.length;

    // The same actor is still a thinker. Reconstructing sprites from the
    // thinker list must not reintroduce it.
    let expectedFromThinkers = 0;
    const cap = globalThis.__doom_thinkercap;
    for (let cur = cap.next; cur !== cap; cur = cur.next) {
      const mo = cur.__mobj;
      if (mo !== undefined && mo !== null && spriteLogic.R_MobjHasWorldSprite(mo.flags)) {
        expectedFromThinkers++;
      }
    }
    const scanRoot = new THREE.Group();
    const scanGroup = rThings.R_BuildSpriteBillboards(scanRoot);
    const afterScan = scanGroup.children.length;

    // Defensive update-time pruning handles a mobj whose flags change after
    // it was registered, just as leaving sector.thinglist makes it disappear.
    const ordinary = {
      x: player.x,
      y: player.y,
      z: player.z,
      angle: player.angle,
      flags: player.flags & ~pMobj.MF_NOSECTOR,
      frame: player.frame,
      state: player.state,
      subsector: player.subsector,
    };
    const beforeOrdinary = scanGroup.children.length;
    rThings.R_RegisterMobjSprite(ordinary);
    const afterOrdinaryRegister = scanGroup.children.length;
    rThings.R_UpdateSprites();
    ordinary.flags |= pMobj.MF_NOSECTOR;
    rThings.R_UpdateSprites();
    const afterOrdinaryNoSector = scanGroup.children.length;

    pMobj.P_RemoveMobj(bossEye);
    return {
      initialCount,
      afterSpawn,
      expectedFromThinkers,
      afterScan,
      beforeOrdinary,
      afterOrdinaryRegister,
      afterOrdinaryNoSector,
      bossFlags: bossEye.flags,
    };
  });

  const failures = [];
  if (result.afterSpawn !== result.initialCount) {
    failures.push(`spawn registered MF_NOSECTOR actor: ${JSON.stringify(result)}`);
  }
  if (result.afterScan !== result.expectedFromThinkers) {
    failures.push(`thinker scan registered excluded actor: ${JSON.stringify(result)}`);
  }
  if (result.afterOrdinaryRegister !== result.beforeOrdinary + 1) {
    failures.push(`ordinary actor was not registered: ${JSON.stringify(result)}`);
  }
  if (result.afterOrdinaryNoSector !== result.beforeOrdinary) {
    failures.push(`updated MF_NOSECTOR actor was not removed: ${JSON.stringify(result)}`);
  }
  if ((result.bossFlags & 8) === 0) {
    failures.push(`MT_BOSSSPIT fixture lacks MF_NOSECTOR: ${JSON.stringify(result)}`);
  }
  if (pageErrors.length !== 0) failures.push(`page errors: ${pageErrors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  clearTimeout(watchdog);
  if (browser !== null) await browser.close();
}
