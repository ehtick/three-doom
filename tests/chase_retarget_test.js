import { A_Chase } from '../src/p_enemy_chase.js';

const MF_SHOOTABLE = 4;

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function makeActor({ threshold = 0, activeSound = 0 } = {}) {
  return {
    x: 0,
    y: 0,
    z: 0,
    angle: 0,
    reactiontime: 0,
    threshold,
    movedir: 8,
    movecount: 1,
    flags: 0,
    target: { flags: MF_SHOOTABLE, health: 100 },
    info: {
      spawnstate: 0,
      meleestate: 0,
      missilestate: 0,
      activesound: activeSound,
    },
  };
}

function makeDependencies(overrides = {}) {
  return {
    netgame: true,
    gameskill: 2,
    fastparm: false,
    MF_SHOOTABLE,
    MF_JUSTATTACKED: 0x40,
    P_CheckSight: () => true,
    P_LookForPlayers: () => false,
    P_CheckMeleeRange: () => false,
    P_CheckMissileRange: () => false,
    P_SetMobjState: () => {},
    P_Move: () => true,
    P_NewChaseDir: () => {},
    P_Random: () => 255,
    S: { S_StartSound() {} },
    ...overrides,
  };
}

Deno.test('A_Chase switches an uncommitted netgame monster before movement or RNG', () => {
  const actor = makeActor({ activeSound: 1 });
  const oldTarget = actor.target;
  const newTarget = { flags: MF_SHOOTABLE, health: 100 };
  let sightCalls = 0;
  let lookCalls = 0;
  let moveCalls = 0;
  let directionCalls = 0;
  let randomCalls = 0;
  let soundCalls = 0;

  A_Chase(actor, makeDependencies({
    P_CheckSight(checkActor, target) {
      sightCalls++;
      assertEquals(checkActor, actor, 'sight-check actor');
      assertEquals(target, oldTarget, 'sight-check target');
      return false;
    },
    P_LookForPlayers(checkActor, allaround) {
      lookCalls++;
      assertEquals(checkActor, actor, 'player-search actor');
      assertEquals(allaround, true, 'all-around player search');
      actor.target = newTarget;
      return true;
    },
    P_Move() { moveCalls++; return true; },
    P_NewChaseDir() { directionCalls++; },
    P_Random() { randomCalls++; return 0; },
    S: { S_StartSound() { soundCalls++; } },
  }));

  assertEquals(actor.target, newTarget, 'new visible target');
  assertEquals(actor.movecount, 1, 'movement countdown is untouched');
  assertEquals(sightCalls, 1, 'old-target sight checks');
  assertEquals(lookCalls, 1, 'player searches');
  assertEquals(moveCalls, 0, 'movement calls');
  assertEquals(directionCalls, 0, 'new-direction calls');
  assertEquals(randomCalls, 0, 'active-sound RNG calls');
  assertEquals(soundCalls, 0, 'active sounds');
});

Deno.test('A_Chase does not retarget in single-player', () => {
  const actor = makeActor();
  let sightCalls = 0;
  let lookCalls = 0;
  let moveCalls = 0;

  A_Chase(actor, makeDependencies({
    netgame: false,
    P_CheckSight() { sightCalls++; return false; },
    P_LookForPlayers() { lookCalls++; return true; },
    P_Move() { moveCalls++; return true; },
  }));

  assertEquals(sightCalls, 0, 'retarget sight checks');
  assertEquals(lookCalls, 0, 'player searches');
  assertEquals(moveCalls, 1, 'normal movement calls');
  assertEquals(actor.movecount, 0, 'normal movement countdown');
});

Deno.test('A_Chase does not retarget while its threshold remains active', () => {
  // A_Chase decrements threshold before the retarget check. Start at two so
  // one committed tic remains when the check is reached.
  const actor = makeActor({ threshold: 2 });
  let sightCalls = 0;
  let lookCalls = 0;
  let moveCalls = 0;

  A_Chase(actor, makeDependencies({
    P_CheckSight() { sightCalls++; return false; },
    P_LookForPlayers() { lookCalls++; return true; },
    P_Move() { moveCalls++; return true; },
  }));

  assertEquals(actor.threshold, 1, 'remaining threshold');
  assertEquals(sightCalls, 0, 'retarget sight checks');
  assertEquals(lookCalls, 0, 'player searches');
  assertEquals(moveCalls, 1, 'normal movement calls');
});

Deno.test('A_Chase keeps a visible netgame target', () => {
  const actor = makeActor();
  const originalTarget = actor.target;
  let sightCalls = 0;
  let lookCalls = 0;
  let moveCalls = 0;

  A_Chase(actor, makeDependencies({
    P_CheckSight() { sightCalls++; return true; },
    P_LookForPlayers() { lookCalls++; return true; },
    P_Move() { moveCalls++; return true; },
  }));

  assertEquals(actor.target, originalTarget, 'visible target');
  assertEquals(sightCalls, 1, 'old-target sight checks');
  assertEquals(lookCalls, 0, 'player searches');
  assertEquals(moveCalls, 1, 'normal movement calls');
});
