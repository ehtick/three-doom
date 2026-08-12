import * as doomstat from '../src/doomstat.js';
import * as pSetup from '../src/p_setup.js';
import { thinker_t } from '../src/d_think.js';
import { P_InitThinkers, thinkercap } from '../src/p_tick.js';
import { M_ClearRandom, P_Random, _get_prndindex } from '../src/m_random.js';
import {
  P_SaveGameSetExternals,
  P_UnArchiveThinkers,
} from '../src/p_saveg.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function P_MobjThinker() {}

class TestMobj {
  constructor() {
    this.thinker = new thinker_t();
    this.snext = null; this.sprev = null; this.bnext = null; this.bprev = null;
    this.subsector = null;
  }
}

function record(id, overrides = {}) {
  return {
    id,
    x: 100 + id,
    y: 200 + id,
    z: 300 + id,
    angle: 0xf0000000 + id,
    sprite: 2,
    frame: 3,
    floorz: -1,
    ceilingz: -1,
    radius: 20 << 16,
    height: 56 << 16,
    momx: 4,
    momy: -5,
    momz: 6,
    validcount: 7,
    type: id,
    tics: 8,
    state: 9,
    flags: 6,
    health: 10,
    movedir: 8,
    movecount: 11,
    reactiontime: 12,
    threshold: 13,
    lastlook: 3,
    spawnpoint: { x: 14, y: 15, angle: 90, type: 16, options: 7 },
    playerIndex: null,
    targetId: null,
    tracerId: null,
    ...overrides,
  };
}

Deno.test('raw thinker hydration preserves fields, refs, backlinks, and RNG index', () => {
  const oldSectors = pSetup.sectors;
  const oldPlayer = doomstat.players[0];
  const oldActive = doomstat.playeringame[0];
  const sector = { floorheight: 17 << 16, ceilingheight: 128 << 16, thinglist: null };
  pSetup.set_sectors([sector]);
  const player = { mo: null };
  doomstat.players[0] = player;
  doomstat.playeringame[0] = true;
  const infos = new Array(137).fill(null).map((_, type) => ({ type }));
  let positioned = 0;
  P_SaveGameSetExternals({
    mobj_t: TestMobj,
    P_MobjThinker,
    P_RemoveMobj: () => {},
    P_SetThingPosition: (mobj) => {
      positioned++;
      mobj.subsector = { sector };
    },
    mobjinfo: infos,
    NUMMOBJTYPES: 137,
    NUMSPRITES: 138,
    NUMSTATES: 967,
  });
  P_InitThinkers();
  M_ClearRandom();
  P_Random();
  P_Random();
  const before = _get_prndindex();
  try {
    const restored = P_UnArchiveThinkers([
      record(0, { playerIndex: 0, targetId: 1 }),
      record(1, { tracerId: 0, health: -5 }),
    ]);
    assert(_get_prndindex() === before, 'raw hydration consumed P_Random');
    assert(positioned === 2, 'not every mobj was spatially linked');
    assert(restored[0].info === infos[0] && restored[1].info === infos[1], 'info pointer not rebound');
    assert(restored[0].floorz === sector.floorheight, 'floorz was not recomputed');
    assert(restored[0].ceilingz === sector.ceilingheight, 'ceilingz was not recomputed');
    assert(restored[0].player === player && player.mo === restored[0], 'player backlink not restored');
    assert(restored[0].target === restored[1], 'target ID was not relinked');
    assert(restored[1].tracer === restored[0], 'tracer ID was not relinked');
    assert(restored[1].health === -5 && restored[1].momx === 4, 'mobj scalar fields changed');
    assert(restored[0].spawnpoint instanceof Object && restored[0].spawnpoint.options === 7,
      'spawnpoint was not hydrated by value');
    assert(thinkercap.next.__mobj === restored[0] && thinkercap.prev.__mobj === restored[1],
      'thinker order changed');
  } finally {
    P_InitThinkers();
    pSetup.set_sectors(oldSectors);
    doomstat.players[0] = oldPlayer;
    doomstat.playeringame[0] = oldActive;
  }
});
