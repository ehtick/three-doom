// End-to-end save/load regression: complete actor/world/player restoration,
// synchronous retained-renderer rebuilds, repeated-load determinism, corrupt
// save atomicity, localStorage persistence, and write-failure reporting.

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
  const url = new URL(process.env.DOOM_URL ?? 'http://127.0.0.1:8134/');
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.renderer !== undefined &&
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer.info.render.frame > 2,
  { timeout: 30000 });

  const first = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const game = await import('/src/g_game.js');
    const info = await import('/src/info.js');
    const loop = await import('/src/d_loop.js');
    const random = await import('/src/m_random.js');
    const mobj = await import('/src/p_mobj.js');
    const floor = await import('/src/p_floor.js');
    const save = await import('/src/p_saveg.js');
    const setup = await import('/src/p_setup.js');
    const tick = await import('/src/p_tick.js');
    loop.D_DoomRafLoop.stop();
    localStorage.removeItem('doom:save:0');
    localStorage.removeItem('doom:save:1');
    localStorage.removeItem('doom:save:2');

    function liveMobjs() {
      const values = [];
      for (let current = tick.thinkercap.next;
        current !== tick.thinkercap; current = current.next) {
        if (current.function === mobj.P_MobjThinker && current.__mobj != null) {
          values.push(current.__mobj);
        }
      }
      return values;
    }

    function specialThinkers() {
      const values = [];
      for (let current = tick.thinkercap.next;
        current !== tick.thinkercap; current = current.next) {
        if (current.__floor != null) values.push(current);
      }
      return values;
    }

    function linkAudit(mobjs) {
      const sectorCounts = new Map();
      for (const sector of setup.sectors) {
        const seen = new Set();
        for (let value = sector.thinglist; value !== null; value = value.snext) {
          if (seen.has(value)) return { ok: false, reason: 'sector cycle' };
          seen.add(value);
          sectorCounts.set(value, (sectorCounts.get(value) ?? 0) + 1);
        }
      }
      const blockCounts = new Map();
      for (const head of setup.blocklinks) {
        const seen = new Set();
        for (let value = head; value !== null; value = value.bnext) {
          if (seen.has(value)) return { ok: false, reason: 'block cycle' };
          seen.add(value);
          blockCounts.set(value, (blockCounts.get(value) ?? 0) + 1);
        }
      }
      for (const value of mobjs) {
        const expectedSector = (value.flags & mobj.MF_NOSECTOR) === 0 ? 1 : 0;
        if ((sectorCounts.get(value) ?? 0) !== expectedSector) {
          return { ok: false, reason: 'sector membership' };
        }
        let expectedBlock = 0;
        if ((value.flags & mobj.MF_NOBLOCKMAP) === 0) {
          const bx = (value.x - setup.bmaporgx) >> 23;
          const by = (value.y - setup.bmaporgy) >> 23;
          if (bx >= 0 && bx < setup.bmapwidth && by >= 0 && by < setup.bmapheight) {
            expectedBlock = 1;
          }
        }
        if ((blockCounts.get(value) ?? 0) !== expectedBlock) {
          return { ok: false, reason: 'block membership' };
        }
      }
      return { ok: true };
    }

    function digest() {
      const mobjs = liveMobjs();
      const player = doomstat.players[doomstat.consoleplayer];
      const marker = mobjs.find((value) => value.movecount === 12345);
      const level = window.scene.getObjectByName('level');
      const things = level?.getObjectByName('things');
      const floorSpecials = specialThinkers().filter((value) =>
        value.__floor?.sector?.tag === 2718);
      const restoredSector = setup.sectors.find((sector) => sector.tag === 2718);
      let planeMatches = false;
      if (restoredSector !== undefined && level !== undefined) {
        level.traverse((object) => {
          if (object.userData?.doomSector !== restoredSector ||
              object.userData?.doomPlaneKind !== 'floor') return;
          const position = object.geometry?.getAttribute('position');
          if (position === undefined || position.count === 0) return;
          const expectedY = restoredSector.floorheight / 65536;
          for (let i = 0; i < position.count; i++) {
            if (Math.abs(position.getY(i) - expectedY) > 1e-6) return;
          }
          planeMatches = true;
        });
      }
      return {
        rootUuid: level?.uuid ?? null,
        levelRoots: window.scene.children.filter((value) => value.name === 'level').length,
        mobjCount: mobjs.length,
        spriteCount: things?.children.length ?? -1,
        expectedSpriteCount: mobjs.filter((value) =>
          (value.flags & mobj.MF_NOSECTOR) === 0).length,
        linkAudit: linkAudit(mobjs),
        rng: random._get_prndindex(),
        player: {
          health: player.health,
          armor: player.armorpoints,
          cmd: { ...player.cmd },
          frags: Array.from(player.frags),
          damagecount: player.damagecount,
          bonuscount: player.bonuscount,
          psprites: player.psprites.map((value) => ({ ...value })),
          didsecret: player.didsecret,
          backlink: player.mo?.player === player,
          x: player.mo?.x,
          y: player.mo?.y,
        },
        marker: marker === undefined ? null : {
          health: marker.health,
          reactiontime: marker.reactiontime,
          threshold: marker.threshold,
          lastlook: marker.lastlook,
          spawnpoint: marker.spawnpoint == null ? null : { ...marker.spawnpoint },
          targetIsPlayer: marker.target === player.mo,
          tracerIsPlayer: marker.tracer === player.mo,
        },
        sector: restoredSector === undefined ? null : {
          floorheight: restoredSector.floorheight,
          ceilingheight: restoredSector.ceilingheight,
          lightlevel: restoredSector.lightlevel,
          special: restoredSector.special,
          tag: restoredSector.tag,
        },
        line: {
          flags: setup.lines[0].flags,
          special: setup.lines[0].special,
          tag: setup.lines[0].tag,
        },
        side: {
          textureoffset: setup.sides[0].textureoffset,
          rowoffset: setup.sides[0].rowoffset,
          toptexture: setup.sides[0].toptexture,
          bottomtexture: setup.sides[0].bottomtexture,
          midtexture: setup.sides[0].midtexture,
        },
        floorSpecialCount: floorSpecials.length,
        floorSpecial: floorSpecials[0] == null ? null : {
          speed: floorSpecials[0].__floor.speed,
          direction: floorSpecials[0].__floor.direction,
          destination: floorSpecials[0].__floor.floordestheight,
          callback: floorSpecials[0].function === floor.T_MoveFloor,
          sectorBacklink: floorSpecials[0].__floor.sector.specialdata ===
            floorSpecials[0].__floor,
        },
        planeMatches,
      };
    }

    const player = doomstat.players[doomstat.consoleplayer];
    player.cmd.forwardmove = -12;
    player.cmd.sidemove = 7;
    player.cmd.angleturn = -1234;
    player.cmd.consistancy = 2345;
    player.cmd.chatchar = 65;
    player.cmd.buttons = 3;
    player.viewheight = 39 * 65536;
    player.deltaviewheight = 8192;
    player.bob = 4242;
    player.health = 87;
    player.armorpoints = 61;
    player.armortype = 2;
    player.powers.set([11, 12, 13, 14, 15, 16]);
    player.cards.splice(0, player.cards.length, true, false, true, false, true, false);
    player.backpack = true;
    player.frags.set([1, 2, 3, 4]);
    player.readyweapon = 2;
    player.pendingweapon = 10;
    player.weaponowned.fill(true);
    player.ammo.splice(0, player.ammo.length, 111, 22, 133, 14);
    player.maxammo.splice(0, player.maxammo.length, 400, 100, 600, 100);
    player.attackdown = 1;
    player.usedown = 1;
    player.cheats = 5;
    player.refire = 9;
    player.killcount = 10;
    player.itemcount = 11;
    player.secretcount = 12;
    player.damagecount = 13;
    player.bonuscount = 14;
    player.extralight = 2;
    player.fixedcolormap = 1;
    player.colormap = 3;
    player.psprites[0] = { state: 10, tics: 7, sx: 123, sy: 456 };
    player.psprites[1] = { state: 11, tics: 8, sx: 789, sy: 1011 };
    player.didsecret = true;
    player.mo.x += 8 * 65536;
    player.mo.y += 4 * 65536;
    mobj.P_UnsetThingPosition(player.mo);
    mobj.P_SetThingPosition(player.mo);

    const marker = mobj.P_SpawnMobj(
      player.mo.x + 32 * 65536,
      player.mo.y,
      mobj.ONFLOORZ,
      info.MT_TROOP,
    );
    marker.health = 37;
    marker.movedir = 6;
    marker.movecount = 12345;
    marker.reactiontime = 17;
    marker.threshold = 19;
    marker.lastlook = 3;
    marker.spawnpoint = { x: 321, y: -123, angle: 90, type: 3001, options: 7 };
    marker.target = player.mo;
    marker.tracer = player.mo;

    // A lazily removed mobj still has __mobj, but must not enter the archive.
    const removed = liveMobjs().find((value) => value !== player.mo && value !== marker);
    if (removed !== undefined) mobj.P_RemoveMobj(removed);

    const sector = setup.sectors.find((value) => value.specialdata === null);
    sector.floorheight += 3 * 65536;
    sector.ceilingheight += 2 * 65536;
    sector.lightlevel = 173;
    sector.special = 9;
    sector.tag = 2718;
    const floorData = {
      sector,
      speed: 8192,
      direction: 1,
      crush: false,
      floordestheight: sector.floorheight + 65536,
      type: floor.raiseFloor,
      newspecial: 0,
      texture: sector.floorpic,
    };
    sector.specialdata = floorData;
    tick.P_AddThinker({
      prev: null,
      next: null,
      function: floor.T_MoveFloor,
      __floor: floorData,
    });
    setup.lines[0].flags ^= 0x100;
    setup.lines[0].special = 77;
    setup.lines[0].tag = 88;
    setup.sides[0].textureoffset = 123456;
    setup.sides[0].rowoffset = -654321;
    setup.sides[0].toptexture = 1;
    setup.sides[0].bottomtexture = 2;
    setup.sides[0].midtexture = 3;

    const expectedArchiveCount = liveMobjs().length;
    const oldRoot = window.scene.getObjectByName('level');
    game.G_SaveGame(0, 'ROUNDTRIP');
    game.G_Ticker();
    const raw = localStorage.getItem('doom:save:0');
    const stored = raw === null ? null : JSON.parse(raw);
    const saveMessage = player.message;

    // Destroy every sampled value before loading.
    player.health = 1;
    player.armorpoints = 0;
    player.cmd.forwardmove = 0;
    sector.floorheight = 0;
    setup.lines[0].special = 0;
    setup.sides[0].textureoffset = 0;
    marker.health = 1;
    mobj.P_SpawnMobj(player.mo.x, player.mo.y, mobj.ONFLOORZ, info.MT_TROOP);

    game.G_LoadGame(0);
    game.G_Ticker();
    const afterFirst = digest();
    const firstRootDetached = oldRoot.parent === null;
    const rootAfterFirst = window.scene.getObjectByName('level');

    game.G_LoadGame(0);
    game.G_Ticker();
    const afterSecond = digest();
    const secondRootDetached = rootAfterFirst.parent === null;

    // A bad version must be rejected before touching the live world or scene.
    const bad = { ...stored, version: 999 };
    localStorage.setItem('doom:save:2', JSON.stringify(bad));
    const atomicBefore = digest();
    game.G_LoadGame(2);
    game.G_Ticker();
    const atomicAfter = digest();

    // Storage failures must not claim success through the player HUD message.
    player.message = 'UNCHANGED';
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function(key, value) {
      if (key === 'doom:save:1') throw new DOMException('quota', 'QuotaExceededError');
      return nativeSetItem.call(this, key, value);
    };
    game.G_SaveGame(1, 'FAIL');
    game.G_Ticker();
    Storage.prototype.setItem = nativeSetItem;
    const quota = {
      message: player.message,
      stored: localStorage.getItem('doom:save:1'),
    };

    // Render once to force the newly built resources through WebGL, and retain
    // the production save for the page-refresh persistence check below.
    window.renderer.render(window.scene, window.camera);
    return {
      expectedArchiveCount,
      storedThinkers: stored?.thinkers?.length ?? -1,
      storedSpecials: stored?.specials?.filter((value) => value.kind === 'floor').length ?? -1,
      saveMessage,
      firstRootDetached,
      secondRootDetached,
      afterFirst,
      afterSecond,
      atomicBefore,
      atomicAfter,
      quota,
      listed: save.P_ListSaves()[0]?.description ?? null,
    };
  });

  // localStorage belongs to the origin, so a full reload exercises browser
  // persistence and a fresh boot's production dependency wiring.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.scene?.getObjectByName('level') !== undefined &&
    window.renderer?.info.render.frame > 2,
  { timeout: 30000 });
  const persisted = await page.evaluate(async () => {
    const doomstat = await import('/src/doomstat.js');
    const game = await import('/src/g_game.js');
    const loop = await import('/src/d_loop.js');
    const save = await import('/src/p_saveg.js');
    loop.D_DoomRafLoop.stop();
    const description = save.P_ListSaves()[0]?.description ?? null;
    game.G_LoadGame(0);
    game.G_Ticker();
    const player = doomstat.players[doomstat.consoleplayer];
    const result = {
      description,
      health: player.health,
      armor: player.armorpoints,
      didsecret: player.didsecret,
      oneRoot: window.scene.children.filter((value) => value.name === 'level').length === 1,
    };
    localStorage.removeItem('doom:save:0');
    localStorage.removeItem('doom:save:1');
    localStorage.removeItem('doom:save:2');
    return result;
  });

  const failures = [];
  const a = first.afterFirst;
  const b = first.afterSecond;
  if (first.storedThinkers !== first.expectedArchiveCount) {
    failures.push(`removed thinker archived: ${JSON.stringify(first)}`);
  }
  if (first.storedSpecials !== 1) failures.push(`floor special archive: ${first.storedSpecials}`);
  if (first.saveMessage !== 'game saved.') failures.push(`save message: ${first.saveMessage}`);
  if (!first.firstRootDetached || !first.secondRootDetached) failures.push('old renderer root retained');
  for (const [name, value] of [['first', a], ['second', b]]) {
    if (value.levelRoots !== 1 || value.mobjCount !== first.expectedArchiveCount ||
        value.spriteCount !== value.expectedSpriteCount || value.linkAudit.ok !== true ||
        value.player.health !== 87 || value.player.armor !== 61 ||
        value.player.cmd.forwardmove !== -12 || value.player.frags.join(',') !== '1,2,3,4' ||
        value.player.damagecount !== 13 || value.player.bonuscount !== 14 ||
        value.player.psprites[0].state !== 10 || value.player.didsecret !== true ||
        value.player.backlink !== true || value.marker?.health !== 37 ||
        value.marker?.reactiontime !== 17 || value.marker?.threshold !== 19 ||
        value.marker?.lastlook !== 3 || value.marker?.spawnpoint?.x !== 321 ||
        value.marker?.targetIsPlayer !== true || value.marker?.tracerIsPlayer !== true ||
        value.sector?.lightlevel !== 173 || value.sector?.special !== 9 ||
        value.line.special !== 77 || value.line.tag !== 88 ||
        value.side.textureoffset !== 123456 || value.side.rowoffset !== -654321 ||
        value.floorSpecialCount !== 1 || value.floorSpecial?.callback !== true ||
        value.floorSpecial?.sectorBacklink !== true || value.planeMatches !== true) {
      failures.push(`${name} restore: ${JSON.stringify(value)}`);
    }
  }
  const stable = (value) => JSON.stringify({ ...value, rootUuid: null });
  if (stable(a) !== stable(b)) failures.push(`repeated load drift:\n${stable(a)}\n${stable(b)}`);
  if (stable(first.atomicBefore) !== stable(first.atomicAfter)) {
    failures.push('corrupt save mutated live state');
  }
  if (first.quota.message !== 'UNCHANGED' || first.quota.stored !== null) {
    failures.push(`quota failure reported success: ${JSON.stringify(first.quota)}`);
  }
  if (first.listed !== 'ROUNDTRIP' || persisted.description !== 'ROUNDTRIP' ||
      persisted.health !== 87 || persisted.armor !== 61 || persisted.didsecret !== true ||
      persisted.oneRoot !== true) {
    failures.push(`persistence: ${JSON.stringify({ listed: first.listed, persisted })}`);
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify({ first: a, persisted }));
} finally {
  if (browser !== undefined) await browser.close();
}
