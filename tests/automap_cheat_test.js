import {
  AM_CROSSHAIR_COLOR,
  AM_CheatPlayerSegments,
  AM_GetCheatLevel,
  AM_LineColorForMode,
  AM_PlayerDrawPlan,
  AM_PlayerSegments,
  AM_Responder,
  AM_Start,
  AM_Stop,
  AM_THING_COLOR,
  AM_ThingSegments,
} from '../src/am_map.js';
import { ML_DONTDRAW, ML_MAPPED, ML_SECRET } from '../src/doomdata.js';
import { set_deathmatch, set_netgame, set_automapactive } from '../src/doomstat.js';
import { FRACUNIT } from '../src/m_fixed.js';
import { ANG90 } from '../src/tables.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertDeepEquals(actual, expected, message) {
  const actualText = JSON.stringify(actual);
  const expectedText = JSON.stringify(expected);
  if (actualText !== expectedText) {
    throw new Error(`${message}: expected ${expectedText}, got ${actualText}`);
  }
}

const segment = (ax, ay, bx, by) => ({
  a: { x: ax, y: ay },
  b: { x: bx, y: by },
});

function line(flags, backsector = null, frontsector = null, special = 0) {
  return { flags, backsector, frontsector, special };
}

function enterIddt() {
  for (const ch of 'iddt') {
    assertEquals(
      AM_Responder({ type: 0, data1: ch.charCodeAt(0) }),
      false,
      `IDDT ${ch} responder result`,
    );
  }
}

Deno.test('IDDT cycles 0/1/2 only while the automap is active and not in deathmatch', () => {
  set_deathmatch(0);
  set_automapactive(false);
  assertEquals(AM_GetCheatLevel(), 0, 'initial cheat level');

  enterIddt();
  assertEquals(AM_GetCheatLevel(), 0, 'closed-map IDDT');

  AM_Start();
  for (const key of [0x69, 0x64, 0x20, 0x64, 0x74]) {
    assertEquals(AM_Responder({ type: 0, data1: key }), false, 'interrupted IDDT key');
  }
  assertEquals(AM_GetCheatLevel(), 0, 'Space resets an IDDT prefix');

  enterIddt();
  assertEquals(AM_GetCheatLevel(), 1, 'first IDDT');
  enterIddt();
  assertEquals(AM_GetCheatLevel(), 2, 'second IDDT');
  enterIddt();
  assertEquals(AM_GetCheatLevel(), 0, 'third IDDT');

  // am_map.c gates on deathmatch rather than netgame, unlike ST_Responder's
  // gameplay cheats, so cooperative players retain the map reveal.
  set_netgame(true);
  enterIddt();
  assertEquals(AM_GetCheatLevel(), 1, 'cooperative IDDT');
  enterIddt();
  enterIddt();
  assertEquals(AM_GetCheatLevel(), 0, 'cooperative cycle reset');
  set_netgame(false);

  set_deathmatch(1);
  enterIddt();
  assertEquals(AM_GetCheatLevel(), 0, 'deathmatch IDDT');
  set_deathmatch(0);
  set_netgame(false);
  AM_Stop();
});

Deno.test('IDDT reveal modes follow AM_drawWalls visibility and color rules', () => {
  const flat = { floorheight: 0, ceilingheight: 128 };
  const raised = { floorheight: 24, ceilingheight: 128 };
  const loweredCeiling = { floorheight: 0, ceilingheight: 96 };

  assertEquals(AM_LineColorForMode(line(0), 0), null, 'unmapped wall hidden');
  assertEquals(AM_LineColorForMode(line(ML_MAPPED), 0), 176, 'mapped one-sided wall');
  assertEquals(AM_LineColorForMode(line(ML_MAPPED | ML_DONTDRAW), 0), null, 'never-see line');
  assertEquals(AM_LineColorForMode(line(ML_DONTDRAW), 1), 176, 'IDDT overrides never-see');
  assertEquals(AM_LineColorForMode(line(0, flat, flat), 1), 96, 'IDDT shows flat two-sided line');
  assertEquals(AM_LineColorForMode(line(ML_SECRET, flat, flat), 1), 176, 'IDDT secret line');
  assertEquals(AM_LineColorForMode(line(0, raised, flat), 1), 64, 'floor change');
  assertEquals(AM_LineColorForMode(line(0, loweredCeiling, flat), 1), 231, 'ceiling change');
  assertEquals(AM_LineColorForMode(line(0, flat, flat, 39), 1), 184, 'teleporter');
  assertEquals(AM_LineColorForMode(line(0, flat, flat), 0, true), 99, 'computer-map line');
  assertEquals(
    AM_LineColorForMode(line(ML_DONTDRAW, flat, flat), 0, true),
    null,
    'computer map respects never-see',
  );
});

Deno.test('thing and IDDT arrow geometry use exact fixed-point line characters', () => {
  assertEquals(AM_THING_COLOR, 112, 'thing color');
  assertEquals(AM_CROSSHAIR_COLOR, 96, 'crosshair color');
  const originX = 100 * FRACUNIT;
  const originY = -50 * FRACUNIT;
  assertDeepEquals(
    AM_ThingSegments({ x: originX, y: originY, angle: 0 }),
    [
      segment(6029312, -4010800, 7602176, -3276800),
      segment(7602176, -3276800, 6029312, -2542800),
      segment(6029312, -2542800, 6029312, -4010800),
    ],
    'unrotated thin triangle',
  );
  assertDeepEquals(
    AM_ThingSegments({ x: originX, y: originY, angle: ANG90 }),
    [
      segment(7287789, -3800801, 6553200, -2228240),
      segment(6553200, -2228240, 5819812, -3801360),
      segment(5819812, -3801360, 7287789, -3800801),
    ],
    'fine-table quarter-turn triangle',
  );

  assertDeepEquals(
    AM_PlayerSegments({ x: 0, y: 0, angle: 0 }),
    [
      segment(-1048576, 0, 1198372, 0),
      segment(1198372, 0, 599186, 299593),
      segment(1198372, 0, 599186, -299593),
      segment(-1048576, 0, -1348168, 299593),
      segment(-1048576, 0, -1348168, -299593),
      segment(-748983, 0, -1048576, 299593),
      segment(-748983, 0, -1048576, -299593),
    ],
    'seven-stroke normal player arrow',
  );

  assertDeepEquals(
    AM_CheatPlayerSegments({ x: 0, y: 0, angle: 0 }),
    [
      segment(-1048576, 0, 1198372, 0),
      segment(1198372, 0, 599186, 199728),
      segment(1198372, 0, 599186, -199728),
      segment(-1048576, 0, -1348168, 199728),
      segment(-1048576, 0, -1348168, -199728),
      segment(-748983, 0, -1048576, 199728),
      segment(-748983, 0, -1048576, -199728),
      segment(-599186, 0, -599186, -199728),
      segment(-599186, -199728, -399458, -199728),
      segment(-399458, -199728, -399458, 299593),
      segment(-199728, 0, -199728, -199728),
      segment(-199728, -199728, 0, -199728),
      segment(0, -199728, 0, 299593),
      segment(199728, 299593, 199728, -171196),
      segment(199728, -171196, 237177, -208645),
      segment(237177, -208645, 319565, -171196),
    ],
    '16-stroke DDT player arrow',
  );
});

Deno.test('automap player plan matches co-op, deathmatch, and invisibility rules', () => {
  const roster = Array.from({ length: 4 }, (_, i) => ({
    mo: { x: i, y: -i, angle: 0 },
    powers: [0, 0, i === 2 ? 1 : 0, 0, 0, 0],
  }));
  const active = [true, true, true, true];

  const single = AM_PlayerDrawPlan({
    roster,
    active,
    localIndex: 0,
    isNetgame: false,
    cheatLevel: 0,
  });
  assertDeepEquals(
    single.map(({ playerIndex, color, cheat }) => ({ playerIndex, color, cheat })),
    [{ playerIndex: 0, color: 209, cheat: false }],
    'single-player arrow',
  );
  const singleCheat = AM_PlayerDrawPlan({
    roster,
    active,
    localIndex: 0,
    isNetgame: false,
    cheatLevel: 1,
  });
  assertEquals(singleCheat[0].cheat, true, 'single-player DDT arrow');

  const coop = AM_PlayerDrawPlan({
    roster,
    active,
    localIndex: 0,
    isNetgame: true,
    deathmatchMode: 0,
  });
  assertDeepEquals(
    coop.map(({ playerIndex, color, cheat }) => ({ playerIndex, color, cheat })),
    [
      { playerIndex: 0, color: 112, cheat: false },
      { playerIndex: 1, color: 96, cheat: false },
      { playerIndex: 2, color: 246, cheat: false },
      { playerIndex: 3, color: 176, cheat: false },
    ],
    'co-op slot and invisibility colors',
  );

  const deathmatchOnlyLocal = AM_PlayerDrawPlan({
    roster,
    active,
    localIndex: 2,
    isNetgame: true,
    deathmatchMode: 1,
    isSingleDemo: false,
  });
  assertDeepEquals(
    deathmatchOnlyLocal.map(({ playerIndex, color }) => ({ playerIndex, color })),
    [{ playerIndex: 2, color: 246 }],
    'deathmatch hides opponents',
  );

  const singleDemo = AM_PlayerDrawPlan({
    roster,
    active: [true, false, true, false],
    localIndex: 0,
    isNetgame: true,
    deathmatchMode: 2,
    isSingleDemo: true,
  });
  assertDeepEquals(
    singleDemo.map(({ playerIndex, color }) => ({ playerIndex, color })),
    [{ playerIndex: 0, color: 112 }, { playerIndex: 2, color: 246 }],
    'single demo shows active opponents without compacting slot colors',
  );
});

Deno.test('browser input fans every level key to AM_Responder after cheats', async () => {
  const source = await Deno.readTextFile(new URL('../src/d_keyboard.js', import.meta.url));
  const handler = source.slice(source.indexOf('async function onKeyDown'), source.indexOf('function onKeyUp'));
  const statusCheats = handler.indexOf('cht_HandleKey(ch)');
  const levelFanout = handler.indexOf('if (doomstat.gamestate === 0', statusCheats);
  const automap = handler.indexOf('AM_Responder', levelFanout);
  const keyup = source.slice(source.indexOf('function onKeyUp'), source.indexOf('function onMouseDown'));
  if (statusCheats < 0 || levelFanout <= statusCheats || automap <= levelFanout ||
      !keyup.includes('AM_Responder({ type: evtype_t.ev_keyup')) {
    throw new Error('level keys do not reach AM_Responder in reference order');
  }
});

Deno.test('automap marks use WAD patches instead of browser text', async () => {
  const source = await Deno.readTextFile(new URL('../src/am_map.js', import.meta.url));
  const drawer = source.slice(source.indexOf('export function AM_Drawer'));
  if (!source.includes("V_DecodePatchToCanvas(`AMMNUM${i}`)") ||
      !drawer.includes('V_DrawPatchAtCanvas(') ||
      drawer.includes('fillText(') || drawer.includes('.font =')) {
    throw new Error('automap marks are not rendered through AMMNUM WAD patches');
  }
});
