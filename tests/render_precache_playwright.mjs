// Real-WAD regression for render-time sprite/psprite cache construction.
// Start a static server at the repository root, then run with:
//   NODE_PATH=/path/to/node_modules node tests/render_precache_playwright.mjs

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const launchOptions = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  launchOptions.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sameFields(before, after, fields, label) {
  for (const field of fields) {
    assert(after[field] === before[field],
      `${label}.${field} grew during display: ${before[field]} -> ${after[field]}`);
  }
}

let browser = null;
const watchdog = setTimeout(() => {
  console.error('render precache Playwright test exceeded 60 seconds');
  process.exit(1);
}, 60000);
const pageErrors = [];

try {
  browser = await chromium.launch(launchOptions);
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const url = new URL(process.env.DOOM_URL ?? 'http://127.0.0.1:8134/');
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer !== undefined &&
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer.info.render.frame > 3,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const dMain = await import('/src/d_main.js');
    const doomstat = await import('/src/doomstat.js');
    const info = await import('/src/info.js');
    const pMobj = await import('/src/p_mobj.js');
    const pSetup = await import('/src/p_setup.js');
    const pSwitch = await import('/src/p_switch.js');
    const rData = await import('/src/r_data.js');
    const rPsprite = await import('/src/r_psprite.js');
    const rThings = await import('/src/r_things.js');
    const { weaponinfo } = await import('/src/d_items.js');

    // Freeze the normal RAF owner so resource counters change only through the
    // explicit display probes below.
    dMain.D_ShutdownDoomLoop();
    const renderer = window.renderer;
    const scene = window.scene;
    const camera = window.camera;
    renderer.render(scene, camera);

    const snapshot = () => ({
      world: rThings.R_GetSpriteCacheStats(),
      psprite: rPsprite.R_GetPspriteCacheStats(),
      data: rData.R_GetDataCacheStats(),
      gpuTextures: renderer.info.memory.textures,
    });

    const mobjs = [];
    const cap = globalThis.__doom_thinkercap;
    for (let current = cap.next; current !== cap; current = current.next) {
      if (current.__mobj != null) mobjs.push(current.__mobj);
    }
    const player = doomstat.players[doomstat.consoleplayer];
    const probe = mobjs.find((mobj) => mobj !== player.mo && (mobj.flags & 8) === 0);
    if (probe == null) throw new Error('E1M1 has no world-sprite probe actor');

    const stateRoots = (mobj) => [
      mobj.state,
      mobj.info?.spawnstate,
      mobj.info?.seestate,
      mobj.info?.painstate,
      mobj.info?.meleestate,
      mobj.info?.missilestate,
      mobj.info?.deathstate,
      mobj.info?.xdeathstate,
      mobj.info?.raisestate,
    ];
    const stateClosure = (roots) => {
      const output = new Set();
      for (const root of roots) {
        let stateIndex = root;
        while (Number.isInteger(stateIndex) && stateIndex > 0 && !output.has(stateIndex)) {
          output.add(stateIndex);
          const state = info.states[stateIndex];
          if (state == null) break;
          stateIndex = state.nextstate;
        }
      }
      return [...output].filter((stateIndex) => info.states[stateIndex]?.tics !== 0);
    };

    const originalProbe = {
      state: probe.state,
      sprite: probe.sprite,
      frame: probe.frame,
      angle: probe.angle,
    };
    const initial = snapshot();

    // The map only references one member of each animation at load time.
    // Cycling far enough to visit every frame must not decode or upload a
    // previously unseen flat/wall texture from inside the simulation tick.
    for (let leveltime = 0; leveltime <= 64; leveltime++) {
      rData.R_AnimateTextures(leveltime);
      renderer.render(scene, camera);
    }
    const afterMapAnimations = snapshot();

    // A switch's alternate texture is absent from the map sidedefs until the
    // line is used. Toggle a real E1M1 switch and render its retained wall;
    // both the CPU cache and WebGL upload count must already be stable.
    const switchLine = pSetup.lines.find((line) => {
      const side = pSetup.sides[line.sidenum?.[0]];
      return side != null && [side.toptexture, side.midtexture, side.bottomtexture]
        .some((texture) => pSwitch.P_IsSwitchTexture(texture));
    });
    if (switchLine == null) throw new Error('E1M1 has no switch texture probe');
    pSwitch.P_ChangeSwitchTexture(switchLine, 1);
    renderer.render(scene, camera);
    const afterSwitch = snapshot();

    const initialStates = new Set();
    for (const mobj of mobjs) {
      for (const stateIndex of stateClosure(stateRoots(mobj))) initialStates.add(stateIndex);
    }
    rThings.set_view(player.mo.x, player.mo.y);
    for (const stateIndex of initialStates) {
      const state = info.states[stateIndex];
      probe.state = stateIndex;
      probe.sprite = state.sprite;
      probe.frame = state.frame;
      // Exercise every rotation lookup. One render per state is sufficient to
      // catch a missing GPU upload; cache miss counters catch every lookup.
      for (let rotation = 0; rotation < 8; rotation++) {
        probe.angle = (rotation * 0x20000000) >>> 0;
        rThings.R_UpdateSprites();
      }
      renderer.render(scene, camera);
    }
    Object.assign(probe, originalProbe);
    rThings.R_UpdateSprites();
    renderer.render(scene, camera);
    const afterInitialActors = snapshot();

    // Exercise every state chain behind all nine weaponinfo records, including
    // the direct sibling flash states used by chaingun and plasma.
    const weaponRoots = [];
    for (let weapon = 0; weapon < weaponinfo.length; weapon++) {
      const weaponData = weaponinfo[weapon];
      weaponRoots.push(
        weaponData.upstate,
        weaponData.downstate,
        weaponData.readystate,
        weaponData.atkstate,
        weaponData.flashstate,
      );
      if ((weapon === 3 || weapon === 5) && weaponData.flashstate > 0) {
        weaponRoots.push(weaponData.flashstate + 1);
      }
    }
    const weaponStates = stateClosure(weaponRoots);
    const originalPlayer = {
      psprites: player.psprites.map((psprite) => ({ ...psprite })),
      fixedcolormap: player.fixedcolormap,
      extralight: player.extralight,
      invisibility: player.powers[4],
      lightlevel: player.mo.subsector.sector.lightlevel,
    };
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 200;
    const context = canvas.getContext('2d');
    for (const stateIndex of weaponStates) {
      player.psprites[0].state = stateIndex;
      player.psprites[0].sx = 0;
      player.psprites[0].sy = 32 << 16;
      player.psprites[1].state = 0;
      const modes = [
        { fixed: 0, invisibility: 0, light: 0, extra: 0 },
        { fixed: 0, invisibility: 0, light: 160, extra: 2 },
        { fixed: 32, invisibility: 0, light: 0, extra: -2 },
        { fixed: 0, invisibility: 129, light: 255, extra: 0 },
      ];
      for (const mode of modes) {
        player.fixedcolormap = mode.fixed;
        player.powers[4] = mode.invisibility;
        player.mo.subsector.sector.lightlevel = mode.light;
        player.extralight = mode.extra;
        rPsprite.R_DrawPlayerSprites(context, player, 0, 0, 320, 200);
      }
    }
    for (let i = 0; i < player.psprites.length; i++) {
      Object.assign(player.psprites[i], originalPlayer.psprites[i]);
    }
    player.fixedcolormap = originalPlayer.fixedcolormap;
    player.extralight = originalPlayer.extralight;
    player.powers[4] = originalPlayer.invisibility;
    player.mo.subsector.sector.lightlevel = originalPlayer.lightlevel;
    const afterPsprites = snapshot();

    // A rocket is not present in E1M1's initial thinker population. Its spawn
    // registration must warm both flight and explosion families before draw.
    const rocket = pMobj.P_SpawnMobj(
      player.mo.x + (64 << 16), player.mo.y, player.mo.z + (32 << 16), info.MT_ROCKET,
    );
    const afterRocketSpawn = snapshot();
    for (const stateIndex of stateClosure(stateRoots(rocket))) {
      const state = info.states[stateIndex];
      rocket.state = stateIndex;
      rocket.sprite = state.sprite;
      rocket.frame = state.frame;
      for (let rotation = 0; rotation < 8; rotation++) {
        rocket.angle = (rotation * 0x20000000) >>> 0;
        rThings.R_UpdateSprites();
      }
      renderer.render(scene, camera);
    }
    const afterRocketDraws = snapshot();

    // Crusher gibs are an exceptional explicit state assignment outside an
    // actor's mobjinfo roots. P_SetMobjState must warm that definition before
    // the subsequent display operation.
    pMobj.P_SetMobjState(probe, info.S_GIBS);
    const afterGibState = snapshot();
    rThings.R_UpdateSprites();
    renderer.render(scene, camera);
    const afterGibDraw = snapshot();

    return {
      initial,
      afterMapAnimations,
      afterSwitch,
      afterInitialActors,
      afterPsprites,
      afterRocketSpawn,
      afterRocketDraws,
      afterGibState,
      afterGibDraw,
      initialStateCount: initialStates.size,
      weaponStateCount: weaponStates.length,
    };
  });

  assert(pageErrors.length === 0, `page errors: ${pageErrors.join('; ')}`);
  assert(result.initial.world.baseEntries > 0, 'world sprite precache stayed empty');
  assert(result.initial.world.flippedEntries > 0, 'flipped world sprite precache stayed empty');
  assert(result.initial.psprite.sourceEntries >= 28, 'weapon psprite precache is incomplete');
  assert(result.initial.psprite.canvasEntries === result.initial.psprite.sourceEntries,
    'not every decoded psprite owns a reusable canvas');
  assert(result.initial.data.flatEntries > 0 && result.initial.data.wallEntries > 0,
    'map flat/wall precache stayed empty');

  sameFields(result.initial.data, result.afterMapAnimations.data,
    ['flatEntries', 'wallEntries', 'flatBuilds', 'wallBuilds'], 'map animations');
  assert(result.afterMapAnimations.gpuTextures === result.initial.gpuTextures,
    'map animation uploaded a texture during a later tic');

  sameFields(result.afterMapAnimations.data, result.afterSwitch.data,
    ['flatEntries', 'wallEntries', 'flatBuilds', 'wallBuilds'], 'switch counterpart');
  assert(result.afterSwitch.gpuTextures === result.afterMapAnimations.gpuTextures,
    'switch counterpart uploaded a texture during display');

  sameFields(result.initial.world, result.afterInitialActors.world,
    ['baseEntries', 'flippedEntries', 'baseBuilds', 'flipBuilds'], 'initial world sprites');
  sameFields(result.initial.data, result.afterInitialActors.data,
    ['flatEntries', 'wallEntries', 'flatBuilds', 'wallBuilds'], 'initial map textures');
  assert(result.afterInitialActors.gpuTextures === result.initial.gpuTextures,
    'initial actor animation/rotation uploaded a texture during display');

  sameFields(result.afterInitialActors.psprite, result.afterPsprites.psprite,
    ['sourceEntries', 'canvasEntries', 'sourceBuilds', 'canvasBuilds'], 'player sprites');
  assert(result.afterPsprites.gpuTextures === result.afterInitialActors.gpuTextures,
    'Canvas player-sprite drawing grew Three GPU textures');

  sameFields(result.afterRocketSpawn.world, result.afterRocketDraws.world,
    ['baseEntries', 'flippedEntries', 'baseBuilds', 'flipBuilds'], 'dynamic rocket sprites');
  assert(result.afterRocketDraws.gpuTextures === result.afterRocketSpawn.gpuTextures,
    'dynamic rocket animation uploaded a texture during display');

  sameFields(result.afterGibState.world, result.afterGibDraw.world,
    ['baseEntries', 'flippedEntries', 'baseBuilds', 'flipBuilds'], 'explicit gib state');
  assert(result.afterGibDraw.gpuTextures === result.afterGibState.gpuTextures,
    'explicit gib state uploaded a texture during display');

  console.log(JSON.stringify(result));
} finally {
  clearTimeout(watchdog);
  if (browser !== null) await browser.close();
}
