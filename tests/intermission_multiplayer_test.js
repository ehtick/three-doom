import { GameMode_t, TICRATE } from '../src/doomdef.js';
import { G_BuildIntermissionInfo, G_IntermissionParTime } from '../src/g_completion.js';
import {
  WI_FragSum,
  WI_InitDeathmatchStats,
  WI_InitNetgameStats,
  WI_UpdateDeathmatchStats,
  WI_UpdateNetgameStats,
} from '../src/wi_multiplayer.js';
import { sfx_barexp, sfx_pistol, sfx_pldeth, sfx_sgcock, sfx_slop } from '../src/sounds.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertArray(actual, expected, message) {
  const a = Array.from(actual);
  if (a.length !== expected.length || a.some((value, i) => value !== expected[i])) {
    throw new Error(`${message}: expected [${expected}], got [${a}]`);
  }
}

function makePlayer(kills, items, secret, frags, didsecret = false) {
  return {
    killcount: kills,
    itemcount: items,
    secretcount: secret,
    frags: new Int32Array(frags),
    didsecret,
  };
}

const twoActive = [true, true, false, false];

Deno.test('G_DoCompleted payload snapshots all four frag rows and vanilla metadata', () => {
  const players = [
    makePlayer(12, 7, 1, [2, 5, 0, 0], true),
    makePlayer(9, 3, 0, [4, 1, 0, 0]),
    undefined,
    undefined,
  ];
  const wbs = G_BuildIntermissionInfo({
    gamemode: GameMode_t.commercial,
    gameepisode: 1,
    gamemap: 11,
    next: 11,
    maxkills: 20,
    maxitems: 10,
    maxsecret: 2,
    leveltime: 4321,
    consoleplayer: 0,
    players,
    playeringame: twoActive,
  });

  assertEquals(wbs.epsd, 0, 'episode index');
  assertEquals(wbs.last, 10, 'last-map index');
  assertEquals(wbs.next, 11, 'next-map index');
  assertEquals(wbs.didsecret, true, 'secret completion');
  assertEquals(wbs.maxfrags, 0, 'maxfrags reset');
  assertEquals(wbs.partime, TICRATE * 210, 'MAP11 par time');
  assertEquals(wbs.plyr.length, 4, 'player snapshot count');
  assertArray(wbs.plyr[0].frags, [2, 5, 0, 0], 'player 1 frag row');
  assertArray(wbs.plyr[1].frags, [4, 1, 0, 0], 'player 2 frag row');
  assertArray(wbs.plyr[2].frags, [0, 0, 0, 0], 'inactive frag row');
  assertEquals(wbs.plyr[1].stime, 4321, 'shared level time');
  players[0].frags[1] = 99;
  assertEquals(wbs.plyr[0].frags[1], 5, 'frag snapshot is detached');
  assertEquals(G_IntermissionParTime(GameMode_t.registered, 2, 3), TICRATE * 90, 'E2M3 par');
});

Deno.test('two-player co-op follows every count/pause phase and frag formula', () => {
  const plrs = [
    { skills: 4, sitems: 2, ssecret: 2, frags: new Int32Array([1, 3, 0, 0]) },
    { skills: 2, sitems: 4, ssecret: 0, frags: new Int32Array([4, 2, 0, 0]) },
    { skills: 0, sitems: 0, ssecret: 0, frags: new Int32Array(4) },
    { skills: 0, sitems: 0, ssecret: 0, frags: new Int32Array(4) },
  ];
  const wbs = { maxkills: 100, maxitems: 100, maxsecret: 100, plyr: plrs };
  const model = WI_InitNetgameStats(plrs, twoActive);
  let bcnt = 0;
  const soundLog = [];
  const tick = (accelerate = false) => {
    bcnt++;
    const result = WI_UpdateNetgameStats(model, wbs, twoActive, bcnt, accelerate);
    for (const sound of result.sounds) soundLog.push([bcnt, sound]);
    return result;
  };

  assertEquals(WI_FragSum(0, plrs, twoActive), 2, 'player 1 frag sum');
  assertEquals(WI_FragSum(1, plrs, twoActive), 2, 'player 2 frag sum');
  assertEquals(model.dofrags, true, 'frag column enabled');

  for (let i = 0; i < 34; i++) tick();
  assertEquals(model.state, 1, 'initial pause through tic 34');
  assertEquals(model.pause, 1, 'initial pause remainder');
  tick();
  assertEquals(model.state, 2, 'kill phase begins on tic 35');

  tick();
  assertArray(model.kills, [2, 2, 0, 0], 'first kill-count tic');
  tick();
  assertEquals(model.state, 3, 'kill count completed');
  assertArray(model.kills, [4, 2, 0, 0], 'final kill percentages');

  for (let i = 0; i < TICRATE; i++) tick();
  assertEquals(model.state, 4, 'item phase after pause');
  tick();
  tick();
  assertEquals(model.state, 5, 'item count completed');
  assertArray(model.items, [2, 4, 0, 0], 'final item percentages');

  for (let i = 0; i < TICRATE; i++) tick();
  assertEquals(model.state, 6, 'secret phase after pause');
  tick();
  assertEquals(model.state, 7, 'secret count completed');
  assertArray(model.secret, [2, 0, 0, 0], 'final secret percentages');

  for (let i = 0; i < TICRATE; i++) tick();
  assertEquals(model.state, 8, 'frag phase after pause');
  tick();
  assertArray(model.frags, [1, 1, 0, 0], 'first frag-count tic');
  tick();
  assertEquals(model.state, 9, 'frag count completed');
  assertArray(model.frags, [2, 2, 0, 0], 'final frag totals');

  for (let i = 0; i < TICRATE; i++) tick();
  assertEquals(model.state, 10, 'final wait after pause');
  const advance = tick(true);
  assertEquals(advance.advance, true, 'final press advances');
  assertArray(advance.sounds, [sfx_sgcock], 'co-op advance sound');
  assertEquals(bcnt, 183, 'co-op terminal tic');

  const expectedSounds = [
    [36, sfx_pistol],
    [37, sfx_barexp],
    [74, sfx_barexp],
    [110, sfx_barexp],
    [147, sfx_pldeth],
    [183, sfx_sgcock],
  ];
  assertEquals(JSON.stringify(soundLog), JSON.stringify(expectedSounds), 'co-op sound/tic order');
});

Deno.test('co-op acceleration completes counters but requires a second press', () => {
  const plrs = [
    { skills: 4, sitems: 2, ssecret: 2, frags: new Int32Array([1, 3, 0, 0]) },
    { skills: 2, sitems: 4, ssecret: 0, frags: new Int32Array([4, 2, 0, 0]) },
    { frags: new Int32Array(4) },
    { frags: new Int32Array(4) },
  ];
  const wbs = { maxkills: 100, maxitems: 100, maxsecret: 100, plyr: plrs };
  const model = WI_InitNetgameStats(plrs, twoActive);
  const first = WI_UpdateNetgameStats(model, wbs, twoActive, 1, true);

  assertEquals(model.state, 10, 'accelerated terminal state');
  assertArray(model.kills, [4, 2, 0, 0], 'accelerated kills');
  assertArray(model.items, [2, 4, 0, 0], 'accelerated items');
  assertArray(model.secret, [2, 0, 0, 0], 'accelerated secrets');
  assertArray(model.frags, [2, 2, 0, 0], 'accelerated frags');
  assertArray(first.sounds, [sfx_barexp], 'accelerated completion sound');
  assertEquals(first.advance, false, 'first press does not advance');
  assertEquals(first.accelerate, 0, 'first press is consumed');

  const second = WI_UpdateNetgameStats(model, wbs, twoActive, 2, true);
  assertArray(second.sounds, [sfx_sgcock], 'second-press sound');
  assertEquals(second.advance, true, 'second press advances');

  const noFragPlrs = plrs.map((player) => ({ ...player, frags: new Int32Array(4) }));
  const sticky = WI_InitNetgameStats(noFragPlrs, twoActive, model.dofrags);
  assertEquals(sticky.dofrags, true, 'static dofrags seed matches Linux Doom');
});

Deno.test('zero-frag co-op skips the frag phase after secret counting', () => {
  const plrs = [
    { skills: 0, sitems: 0, ssecret: 0, frags: new Int32Array(4) },
    { skills: 0, sitems: 0, ssecret: 0, frags: new Int32Array(4) },
    { frags: new Int32Array(4) },
    { frags: new Int32Array(4) },
  ];
  const wbs = { maxkills: 1, maxitems: 1, maxsecret: 1, plyr: plrs };
  const model = WI_InitNetgameStats(plrs, twoActive, 0);
  model.state = 6;
  const result = WI_UpdateNetgameStats(model, wbs, twoActive, 1, false);

  assertEquals(model.dofrags, false, 'frag column disabled');
  assertEquals(model.state, 9, 'frag count phase skipped');
  assertArray(result.sounds, [sfx_barexp], 'secret completion sound');
});

Deno.test('two-player deathmatch preserves matrix, total, pause, and sound timing', () => {
  const plrs = [
    { frags: new Int32Array([1, 3, 0, 0]) },
    { frags: new Int32Array([-2, 0, 0, 0]) },
    { frags: new Int32Array(4) },
    { frags: new Int32Array(4) },
  ];
  const model = WI_InitDeathmatchStats(twoActive);
  let bcnt = 0;
  const soundLog = [];
  const tick = (accelerate = false) => {
    bcnt++;
    const result = WI_UpdateDeathmatchStats(model, plrs, twoActive, bcnt, accelerate);
    for (const sound of result.sounds) soundLog.push([bcnt, sound]);
    return result;
  };

  for (let i = 0; i < TICRATE; i++) tick();
  assertEquals(model.state, 2, 'matrix phase begins on tic 35');
  tick();
  assertArray(model.frags[0], [1, 1, 0, 0], 'first player matrix tic');
  assertArray(model.frags[1], [-1, 0, 0, 0], 'second player matrix tic');
  assertArray(model.totals, [2, -2, 0, 0], 'totals jump to final frag sums');
  tick();
  tick();
  assertArray(model.frags[0], [1, 3, 0, 0], 'matrix reaches target');
  assertArray(model.frags[1], [-2, 0, 0, 0], 'negative matrix reaches target');
  assertEquals(model.state, 2, 'matrix retains vanilla extra completion tic');
  tick();
  assertEquals(model.state, 3, 'matrix completes on following tic');

  for (let i = 0; i < TICRATE; i++) tick();
  assertEquals(model.state, 4, 'deathmatch final wait after pause');
  const advance = tick(true);
  assertEquals(advance.advance, true, 'deathmatch final press advances');
  assertArray(advance.sounds, [sfx_slop], 'deathmatch advance sound');
  assertEquals(bcnt, 75, 'deathmatch terminal tic');
  assertEquals(
    JSON.stringify(soundLog),
    JSON.stringify([[36, sfx_pistol], [39, sfx_barexp], [75, sfx_slop]]),
    'deathmatch sound/tic order',
  );
});

Deno.test('deathmatch acceleration copies raw matrix and requires a second press', () => {
  const plrs = [
    { frags: new Int32Array([1, 120, 0, 0]) },
    { frags: new Int32Array([-105, 0, 0, 0]) },
    { frags: new Int32Array(4) },
    { frags: new Int32Array(4) },
  ];
  const model = WI_InitDeathmatchStats(twoActive);
  const first = WI_UpdateDeathmatchStats(model, plrs, twoActive, 1, true);

  assertEquals(model.state, 4, 'accelerated deathmatch terminal state');
  assertArray(model.frags[0], [1, 120, 0, 0], 'raw positive frag row');
  assertArray(model.frags[1], [-105, 0, 0, 0], 'raw negative frag row');
  assertArray(model.totals, [119, -105, 0, 0], 'raw accelerated totals');
  assertArray(first.sounds, [sfx_barexp], 'deathmatch completion sound');
  assertEquals(first.advance, false, 'first deathmatch press does not advance');

  const second = WI_UpdateDeathmatchStats(model, plrs, twoActive, 2, true);
  assertArray(second.sounds, [sfx_slop], 'deathmatch second-press sound');
  assertEquals(second.advance, true, 'second deathmatch press advances');
});

Deno.test('natural deathmatch counting clamps displayed cells and totals to two digits', () => {
  const plrs = [
    { frags: new Int32Array([1, 120, 0, 0]) },
    { frags: new Int32Array([-105, 0, 0, 0]) },
    { frags: new Int32Array(4) },
    { frags: new Int32Array(4) },
  ];
  const model = WI_InitDeathmatchStats(twoActive);
  model.state = 2;
  for (let bcnt = 1; bcnt <= 110; bcnt++) {
    WI_UpdateDeathmatchStats(model, plrs, twoActive, bcnt, false);
  }

  assertEquals(model.state, 2, 'out-of-range target keeps vanilla counter active');
  assertArray(model.frags[0], [1, 99, 0, 0], 'positive matrix clamp');
  assertArray(model.frags[1], [-99, 0, 0, 0], 'negative matrix clamp');
  assertArray(model.totals, [99, -99, 0, 0], 'total clamps');
});
