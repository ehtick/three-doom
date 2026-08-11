import {
  G_EnsurePlayerTopology,
  G_CollectActivePlayers,
  G_ReadDemoTiccmds,
  G_WriteDemoTiccmds,
  P_RecordDeathMatchStart,
  G_DeathMatchSpawnPlayer,
  G_CheckSpot,
  G_DoReborn,
} from '../src/g_multiplayer.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('demo topology allocates every active slot without forcing player 0', () => {
  const existing = { mo: { old: true }, playerstate: 0, cmd: { id: 1 } };
  const players = [undefined, existing, undefined, undefined];
  const playeringame = [false, true, false, true];
  let allocations = 0;

  G_EnsurePlayerTopology(players, playeringame, () => {
    allocations++;
    return { mo: { old: true }, playerstate: 0, cmd: { id: 3 } };
  });

  assertEquals(playeringame[0], false, 'header player 0 flag');
  assertEquals(playeringame[1], true, 'header player 1 flag');
  assertEquals(playeringame[3], true, 'header player 3 flag');
  assertEquals(players[0], undefined, 'inactive player 0 struct');
  assertEquals(players[1], existing, 'existing active struct is reused');
  assertEquals(players[1].mo, null, 'existing mobj link is cleared');
  assertEquals(players[3].playerstate, 2, 'new active player starts reborn');
  assertEquals(players[3].mo, null, 'new active mobj link is clear');
  assertEquals(allocations, 1, 'only missing active slot is allocated');

  const active = G_CollectActivePlayers(players, playeringame);
  assertEquals(active.length, 2, 'active player count');
  assertEquals(active[0], players[1], 'active order starts at player 1');
  assertEquals(active[1], players[3], 'active order continues at player 3');
});

Deno.test('empty local topology still defaults to the single player', () => {
  const players = new Array(4);
  const playeringame = [false, false, false, false];
  G_EnsurePlayerTopology(players, playeringame, () => ({ mo: null, playerstate: 0, cmd: {} }));
  assertEquals(playeringame[0], true, 'local player activated');
  assertEquals(playeringame.slice(1).some(Boolean), false, 'no remote players activated');
  assertEquals(players[0].playerstate, 2, 'local first spawn starts reborn');
});

Deno.test('multiplayer demo commands are consumed once per active player in slot order', () => {
  const active = [
    { cmd: { slot: 0 } },
    { cmd: { slot: 2 } },
  ];
  const reads = [];
  const completed = G_ReadDemoTiccmds(active, (cmd) => {
    reads.push(cmd.slot);
    return true;
  });
  assertEquals(completed, true, 'complete multiplayer tic');
  assertEquals(reads.join(','), '0,2', 'demo stream order');

  let stoppedReads = 0;
  const stopped = G_ReadDemoTiccmds(active, () => (++stoppedReads < 2));
  assertEquals(stopped, false, 'demo marker aborts the tic');
  assertEquals(stoppedReads, 2, 'no reads after the marker');
});

Deno.test('multiplayer demo commands are recorded once per active player in slot order', () => {
  const active = [
    { cmd: { slot: 0 } },
    { cmd: { slot: 2 } },
  ];
  const writes = [];
  const complete = G_WriteDemoTiccmds(active, (cmd) => writes.push(cmd.slot));
  assertEquals(complete, true, 'complete recording tic');
  assertEquals(writes.join(','), '0,2', 'demo stream order');

  const stoppedWrites = [];
  const stopped = G_WriteDemoTiccmds(active, (cmd) => {
    stoppedWrites.push(cmd.slot);
    return false;
  });
  assertEquals(stopped, false, 'recording finalization aborts the tic');
  assertEquals(stoppedWrites.join(','), '0', 'no command follows finalization');
});

Deno.test('deathmatch starts retain their real count and cap at ten', () => {
  const starts = Array.from({ length: 10 }, () => ({}));
  let count = 0;
  for (let i = 0; i < 12; i++) {
    count = P_RecordDeathMatchStart(starts, count, {
      x: i, y: i + 10, angle: i * 45, type: 11, options: i & 1,
    });
  }
  assertEquals(count, 10, 'deathmatch_p count');
  assertEquals(starts[0].x, 0, 'first start copied');
  assertEquals(starts[9].x, 9, 'last available start copied');
  assertEquals(starts[9].type, 11, 'mapthing fields copied');
});

Deno.test('deathmatch spawning preserves vanilla retry and RNG order', () => {
  const starts = [
    { x: 10, y: 10, type: 11 },
    { x: 20, y: 20, type: 11 },
    { x: 30, y: 30, type: 11 },
    { x: 40, y: 40, type: 11 },
  ];
  const coop = [{ type: 1 }, { type: 2 }, { type: 3 }, { type: 4 }];
  // Selection p0=0, player-mobj lastlook, selection p1=0 (rejected),
  // selection p1=2, player-mobj lastlook: five total play-RNG calls.
  const randomValues = [0, 99, 0, 2, 88];
  let randomCalls = 0;
  const occupied = new Set();
  const spawned = [];
  const deps = {
    deathmatchstarts: starts,
    deathmatchCount: starts.length,
    playerstarts: coop,
    P_Random: () => randomValues[randomCalls++],
    G_CheckSpot: (_playernum, spot) => !occupied.has(`${spot.x},${spot.y}`),
    P_SpawnPlayer: (spot) => {
      occupied.add(`${spot.x},${spot.y}`);
      spawned.push(spot);
      // P_SpawnMobj consumes P_Random once to initialize lastlook.
      randomValues[randomCalls++];
    },
    I_Error: (message) => { throw new Error(message); },
  };

  G_DeathMatchSpawnPlayer(0, deps);
  G_DeathMatchSpawnPlayer(1, deps);
  assertEquals(spawned[0], starts[0], 'player 0 selected start');
  assertEquals(spawned[1], starts[2], 'player 1 retried occupied start');
  assertEquals(spawned[0].type, 1, 'player 0 mapthing type');
  assertEquals(spawned[1].type, 2, 'player 1 mapthing type');
  assertEquals(randomCalls, 5, 'selection, rejection, and mobj RNG calls');
});

Deno.test('deathmatch spawning retries twenty times then uses the co-op fallback', () => {
  const starts = Array.from({ length: 4 }, (_, i) => ({ x: i, y: i, type: 11 }));
  const fallback = { x: 99, y: 99, type: 3 };
  let randomCalls = 0;
  let checks = 0;
  let spawned = null;
  G_DeathMatchSpawnPlayer(2, {
    deathmatchstarts: starts,
    deathmatchCount: 4,
    playerstarts: [{}, {}, fallback, {}],
    P_Random: () => { randomCalls++; return 0; },
    G_CheckSpot: () => { checks++; return false; },
    P_SpawnPlayer: (spot) => { spawned = spot; },
    I_Error: (message) => { throw new Error(message); },
  });
  assertEquals(randomCalls, 20, 'random selections');
  assertEquals(checks, 20, 'occupancy checks');
  assertEquals(spawned, fallback, 'co-op fallback');
});

Deno.test('fewer than four deathmatch starts fails before consuming RNG', () => {
  let randomCalls = 0;
  let message = '';
  G_DeathMatchSpawnPlayer(0, {
    deathmatchstarts: [{}, {}, {}],
    deathmatchCount: 3,
    playerstarts: [{}],
    P_Random: () => { randomCalls++; return 0; },
    G_CheckSpot: () => true,
    P_SpawnPlayer: () => { throw new Error('must not spawn'); },
    I_Error: (text) => { message = text; },
  });
  assertEquals(message, 'Only 3 deathmatch spots, 4 required', 'vanilla error');
  assertEquals(randomCalls, 0, 'no RNG after fatal setup error');
});

Deno.test('respawn spot queues the corpse and spawns teleport fog before the player', () => {
  const corpse = { player: { old: true } };
  const evicted = { old: 'corpse' };
  const players = [{ mo: corpse, viewz: 2 }];
  const bodyqueue = [evicted, { old: 'newer corpse' }];
  let bodyqueslot = 2;
  const trace = [];
  const finecosine = [65536];
  const finesine = [0];

  const accepted = G_CheckSpot(0, { x: 10, y: 20, angle: 0 }, {
    players,
    playeringame: [true],
    consoleplayer: 0,
    bodyqueue,
    getBodyqueSlot: () => bodyqueslot,
    setBodyqueSlot: (slot) => { bodyqueslot = slot; },
    P_CheckPosition: (mo, x, y) => {
      trace.push(['check', mo, x, y]);
      return true;
    },
    P_RemoveMobj: (mo) => trace.push(['remove', mo]),
    R_PointInSubsector: () => ({ sector: { floorheight: 1234 } }),
    P_SpawnMobj: (x, y, z, type) => {
      trace.push(['fog', x, y, z, type]);
      return { fog: true };
    },
    S_StartSound: (mo, sound) => trace.push(['sound', mo, sound]),
    finecosine,
    finesine,
    ANG45: 0x20000000,
    ANGLETOFINESHIFT: 19,
    MT_TFOG: 39,
    sfx_telept: 35,
  });

  assertEquals(accepted, true, 'open respawn spot');
  assertEquals(trace[0][0], 'check', 'position checked first');
  assertEquals(trace[1][0], 'remove', 'oldest queued corpse removed second');
  assertEquals(trace[1][1], evicted, 'correct corpse evicted');
  assertEquals(trace[2][0], 'fog', 'fog spawned before player callback');
  assertEquals(trace[2][1], (10 << 16) + 20 * 65536, 'fog x offset');
  assertEquals(trace[2][2], 20 << 16, 'fog y offset');
  assertEquals(trace[2][3], 1234, 'fog floor height');
  assertEquals(trace[2][4], 39, 'teleport fog type');
  assertEquals(trace[3][0], 'sound', 'teleport sound follows fog');
  assertEquals(bodyqueue[0], corpse, 'current corpse queued');
  assertEquals(bodyqueslot, 3, 'corpse queue advanced');
});

Deno.test('deathmatch rebirth dissociates the corpse and preserves fog/player RNG order', () => {
  const corpse = { player: { attached: true } };
  const players = [{ mo: corpse, viewz: 2 }];
  const starts = Array.from({ length: 4 }, (_, i) => ({ x: i * 10, y: 0, angle: 0, type: 11 }));
  let bodyqueslot = 0;
  let randomCalls = 0;
  const trace = [];

  const checkSpot = (playernum, mapthing) => G_CheckSpot(playernum, mapthing, {
    players,
    playeringame: [true],
    consoleplayer: 0,
    bodyqueue: new Array(32),
    getBodyqueSlot: () => bodyqueslot,
    setBodyqueSlot: (slot) => { bodyqueslot = slot; },
    P_CheckPosition: () => true,
    P_RemoveMobj: () => {},
    R_PointInSubsector: () => ({ sector: { floorheight: 0 } }),
    P_SpawnMobj: () => { trace.push('fog'); randomCalls++; return {}; },
    S_StartSound: () => {},
    finecosine: [65536],
    finesine: [0],
    ANG45: 0x20000000,
    ANGLETOFINESHIFT: 19,
    MT_TFOG: 39,
    sfx_telept: 35,
  });
  const deathmatchSpawn = (playernum) => G_DeathMatchSpawnPlayer(playernum, {
    deathmatchstarts: starts,
    deathmatchCount: starts.length,
    playerstarts: [{ type: 1 }],
    P_Random: () => { trace.push('selection'); randomCalls++; return 0; },
    G_CheckSpot: checkSpot,
    P_SpawnPlayer: () => { trace.push('player'); randomCalls++; },
    I_Error: (message) => { throw new Error(message); },
  });

  G_DoReborn(0, {
    netgame: true,
    deathmatch: 1,
    players,
    playerstarts: [{ type: 1 }],
    queueLoadLevel: () => { throw new Error('must not reload'); },
    G_CheckSpot: checkSpot,
    G_DeathMatchSpawnPlayer: deathmatchSpawn,
    P_SpawnPlayer: () => { throw new Error('must use deathmatch spawn'); },
  });

  assertEquals(corpse.player, null, 'corpse dissociated');
  assertEquals(trace.join(','), 'selection,fog,player', 'rebirth RNG-producing order');
  assertEquals(randomCalls, 3, 'selection, fog mobj, and player mobj RNG calls');
});

Deno.test('co-op rebirth tries own start, then fakes and restores another slot', () => {
  const corpse = { player: {} };
  const players = [{ mo: null }, { mo: null }, { mo: corpse }];
  const starts = [{ type: 1 }, { type: 2 }, { type: 3 }, { type: 4 }];
  const checked = [];
  let spawnedType = -1;
  G_DoReborn(2, {
    netgame: true,
    deathmatch: 0,
    players,
    playerstarts: starts,
    queueLoadLevel: () => { throw new Error('must not reload'); },
    G_CheckSpot: (_playernum, spot) => {
      const index = starts.indexOf(spot);
      checked.push(index);
      return index === 1;
    },
    G_DeathMatchSpawnPlayer: () => { throw new Error('must not deathmatch spawn'); },
    P_SpawnPlayer: (spot) => { spawnedType = spot.type; },
  });
  assertEquals(corpse.player, null, 'co-op corpse dissociated');
  assertEquals(checked.join(','), '2,0,1', 'own start then all slots in order');
  assertEquals(spawnedType, 3, 'other start faked as reborn player');
  assertEquals(starts[1].type, 2, 'other start type restored');
});

Deno.test('single-player rebirth still queues a level reload', () => {
  let reloads = 0;
  G_DoReborn(0, {
    netgame: false,
    deathmatch: 0,
    players: [],
    playerstarts: [],
    queueLoadLevel: () => { reloads++; },
    G_CheckSpot: null,
    G_DeathMatchSpawnPlayer: null,
    P_SpawnPlayer: null,
  });
  assertEquals(reloads, 1, 'single-player reload action');
});

Deno.test('P_SetupLevel keeps deathmatch spawning between THINGS and specials', async () => {
  const source = await Deno.readTextFile(new URL('../src/p_setup.js', import.meta.url));
  const things = source.indexOf('P_LoadThings(lumpnum + ML_THINGS);');
  const deathmatch = source.indexOf('if (deathmatch !== 0 && _G_DeathMatchSpawnPlayer !== null)', things);
  const specials = source.indexOf('if (_P_SpawnSpecials !== null) _P_SpawnSpecials();', things);
  assert(things !== -1, 'P_LoadThings call missing');
  assert(deathmatch > things, 'deathmatch players must spawn after THINGS');
  assert(specials > deathmatch, 'deathmatch players must spawn before specials');
});
