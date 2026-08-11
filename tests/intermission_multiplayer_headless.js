import { BT_ATTACK } from '../src/d_event.js';
import { GameMode_t, TICRATE } from '../src/doomdef.js';
import * as doomstat from '../src/doomstat.js';
import { G_DoCompleted } from '../src/g_game.js';
import { V_InitPlaypal, V_PaletteCSS } from '../src/v_palette.js';
import { V_DecodePatchToCanvas, V_DrawPatchAtCanvas } from '../src/v_video.js';
import { WI_Drawer, WI_Shutdown, WI_Start, WI_Ticker } from '../src/wi_stuff.js';
import { W_CacheLumpName, W_InitMultipleFiles } from '../src/w_wad.js';

const WI_TITLEY = 2;
const WI_SPACINGY = 33;
const NG_STATSY = 50;
const NG_SPACINGX = 64;
const DM_MATRIXX = 42;
const DM_MATRIXY = 68;
const DM_SPACINGX = 40;
const DM_TOTALSX = 269;
const DM_KILLERSX = 10;
const DM_KILLERSY = 100;
const DM_VICTIMSX = 5;
const DM_VICTIMSY = 50;

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function assertArray(actual, expected, message) {
  const values = Array.from(actual);
  if (values.length !== expected.length || values.some((value, i) => value !== expected[i])) {
    throw new Error(`${message}: expected [${expected}], got [${values}]`);
  }
}

function makeCanvas() {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 200;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { canvas, ctx };
}

function patch(name) {
  return V_DecodePatchToCanvas(name);
}

function drawPatch(ctx, info, x, y) {
  V_DrawPatchAtCanvas(ctx, info, x, y, 1, 1);
}

function drawBackground(ctx) {
  ctx.fillStyle = V_PaletteCSS(0);
  ctx.fillRect(0, 0, 320, 200);
  drawPatch(ctx, patch('WIMAP0'), 0, 0);
}

function drawLF(ctx) {
  let y = WI_TITLEY;
  const level = patch('WILV00');
  drawPatch(ctx, level, ((320 - level.w) / 2) | 0, y);
  y += ((5 * level.h) / 4) | 0;
  const finished = patch('WIF');
  drawPatch(ctx, finished, ((320 - finished.w) / 2) | 0, y);
}

function drawNum(ctx, numbers, minus, x, y, value, digits) {
  if (digits < 0) {
    if (value === 0) digits = 1;
    else {
      digits = 0;
      let temp = value;
      while (temp !== 0) {
        temp = (temp / 10) | 0;
        digits++;
      }
    }
  }
  const negative = value < 0;
  if (negative) value = -value;
  while (digits-- > 0) {
    x -= numbers[0].w;
    drawPatch(ctx, numbers[value % 10], x, y);
    value = (value / 10) | 0;
  }
  if (negative) {
    x -= 8;
    drawPatch(ctx, minus, x, y);
  }
  return x;
}

function drawPercent(ctx, numbers, percent, minus, x, y, value) {
  drawPatch(ctx, percent, x, y);
  drawNum(ctx, numbers, minus, x, y, value, -1);
}

function drawExpectedCoop(ctx) {
  const numbers = Array.from({ length: 10 }, (_, i) => patch('WINUM' + i));
  const minus = patch('WIMINUS');
  const percent = patch('WIPCNT');
  const kills = patch('WIOSTK');
  const items = patch('WIOSTI');
  const secret = patch('WIOSTS');
  const frags = patch('WIFRGS');
  const star = patch('STFST01');
  const players = [patch('STPB0'), patch('STPB1')];
  const statsX = 32 + ((star.w / 2) | 0); // frag column is active

  drawBackground(ctx);
  drawLF(ctx);
  drawPatch(ctx, kills, statsX + NG_SPACINGX - kills.w, NG_STATSY);
  drawPatch(ctx, items, statsX + 2 * NG_SPACINGX - items.w, NG_STATSY);
  drawPatch(ctx, secret, statsX + 3 * NG_SPACINGX - secret.w, NG_STATSY);
  drawPatch(ctx, frags, statsX + 4 * NG_SPACINGX - frags.w, NG_STATSY);

  let y = NG_STATSY + kills.h;
  for (let i = 0; i < players.length; i++) {
    let x = statsX;
    drawPatch(ctx, players[i], x - players[i].w, y);
    if (i === 0) drawPatch(ctx, star, x - players[i].w, y);
    x += NG_SPACINGX;
    drawPercent(ctx, numbers, percent, minus, x - percent.w, y + 10, 0);
    x += NG_SPACINGX;
    drawPercent(ctx, numbers, percent, minus, x - percent.w, y + 10, 0);
    x += NG_SPACINGX;
    drawPercent(ctx, numbers, percent, minus, x - percent.w, y + 10, 0);
    x += NG_SPACINGX;
    drawNum(ctx, numbers, minus, x, y + 10, 0, -1);
    y += WI_SPACINGY;
  }
}

function drawExpectedDeathmatch(ctx) {
  const numbers = Array.from({ length: 10 }, (_, i) => patch('WINUM' + i));
  const minus = patch('WIMINUS');
  const total = patch('WIMSTT');
  const killers = patch('WIKILRS');
  const victims = patch('WIVCTMS');
  const star = patch('STFST01');
  const bstar = patch('STFDEAD0');
  const players = [patch('STPB0'), patch('STPB1')];

  drawBackground(ctx);
  drawLF(ctx);
  drawPatch(ctx, total, DM_TOTALSX - ((total.w / 2) | 0), DM_MATRIXY - WI_SPACINGY + 10);
  drawPatch(ctx, killers, DM_KILLERSX, DM_KILLERSY);
  drawPatch(ctx, victims, DM_VICTIMSX, DM_VICTIMSY);

  let x = DM_MATRIXX + DM_SPACINGX;
  let y = DM_MATRIXY;
  for (let i = 0; i < 4; i++) {
    if (i < players.length) {
      const halfWidth = (players[i].w / 2) | 0;
      drawPatch(ctx, players[i], x - halfWidth, DM_MATRIXY - WI_SPACINGY);
      drawPatch(ctx, players[i], DM_MATRIXX - halfWidth, y);
      if (i === 0) {
        drawPatch(ctx, bstar, x - halfWidth, DM_MATRIXY - WI_SPACINGY);
        drawPatch(ctx, star, DM_MATRIXX - halfWidth, y);
      }
    }
    x += DM_SPACINGX;
    y += WI_SPACINGY;
  }

  y = DM_MATRIXY + 10;
  for (let i = 0; i < 4; i++) {
    x = DM_MATRIXX + DM_SPACINGX;
    if (i < players.length) {
      for (let j = 0; j < 4; j++) {
        if (j < players.length) drawNum(ctx, numbers, minus, x + numbers[0].w, y, 0, 2);
        x += DM_SPACINGX;
      }
      drawNum(ctx, numbers, minus, DM_TOTALSX + numbers[0].w, y, 0, 2);
    }
    y += WI_SPACINGY;
  }
}

function compareCanvas(actual, expected, label) {
  const a = actual.getContext('2d').getImageData(0, 0, 320, 200).data;
  const e = expected.getContext('2d').getImageData(0, 0, 320, 200).data;
  let mismatched = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== e[i]) mismatched++;
  assertEquals(mismatched, 0, `${label} canvas channels`);
}

function changedPixels(canvas) {
  const data = canvas.getContext('2d').getImageData(0, 0, 320, 200).data;
  let changed = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 0) changed++;
  }
  return changed;
}

function makeLivePlayer(kills, items, secret, frags, didsecret = false) {
  return {
    cmd: { buttons: 0 },
    attackdown: 0,
    usedown: 0,
    powers: new Int32Array(6),
    cards: [false, false, false, false, false, false],
    mo: null,
    extralight: 0,
    fixedcolormap: 0,
    damagecount: 0,
    bonuscount: 0,
    killcount: kills,
    itemcount: items,
    secretcount: secret,
    frags: new Int32Array(frags),
    didsecret,
  };
}

function makeWb() {
  return {
    didsecret: false,
    epsd: 0,
    last: 0,
    next: 1,
    maxkills: 100,
    maxitems: 100,
    maxsecret: 100,
    maxfrags: 0,
    partime: TICRATE * 30,
    pnum: 0,
    plyr: [
      { in: true, skills: 4, sitems: 2, ssecret: 2, stime: 70, frags: new Int32Array([1, 3, 0, 0]) },
      { in: true, skills: 2, sitems: 4, ssecret: 0, stime: 70, frags: new Int32Array([4, 2, 0, 0]) },
      { in: false, skills: 0, sitems: 0, ssecret: 0, stime: 70, frags: new Int32Array(4) },
      { in: false, skills: 0, sitems: 0, ssecret: 0, stime: 70, frags: new Int32Array(4) },
    ],
  };
}

function resetInput() {
  for (let i = 0; i < 2; i++) {
    doomstat.players[i].cmd.buttons = 0;
    doomstat.players[i].attackdown = 0;
    doomstat.players[i].usedown = 0;
  }
}

function pressAndTick() {
  doomstat.players[0].cmd.buttons = BT_ATTACK;
  WI_Ticker();
}

function releaseAndTick() {
  doomstat.players[0].cmd.buttons = 0;
  WI_Ticker();
}

function exerciseInputCompletion(label) {
  let done = 0;
  resetInput();
  WI_Start(makeWb(), () => done++);
  pressAndTick();
  assertEquals(done, 0, `${label} first press completion`);
  releaseAndTick();
  pressAndTick();
  assertEquals(done, 0, `${label} second press completion`);
  releaseAndTick();
  pressAndTick(); // skip ShowNextLoc into NoState
  assertEquals(done, 0, `${label} show-next press completion`);
  for (let i = 0; i < 10; i++) WI_Ticker();
  assertEquals(done, 1, `${label} callback count`);
}

async function run() {
  const wad = await fetch('../doom1.wad').then((response) => response.arrayBuffer());
  W_InitMultipleFiles([{ name: 'doom1.wad', buffer: wad }]);
  V_InitPlaypal(W_CacheLumpName('PLAYPAL', 0));

  doomstat.players[0] = makeLivePlayer(4, 2, 2, [1, 3, 0, 0], true);
  doomstat.players[1] = makeLivePlayer(2, 4, 0, [4, 2, 0, 0]);
  doomstat.players[2] = makeLivePlayer(0, 0, 0, [0, 0, 0, 0]);
  doomstat.players[3] = makeLivePlayer(0, 0, 0, [0, 0, 0, 0]);
  for (let i = 0; i < 4; i++) doomstat.playeringame[i] = i < 2;
  doomstat.set_consoleplayer(0);
  doomstat.set_gamemode(GameMode_t.shareware);
  doomstat.set_netgame(true);
  doomstat.set_deathmatch(0);

  WI_Start(makeWb(), () => {});
  const actualCoop = makeCanvas();
  WI_Drawer(actualCoop.ctx, 0, 0, 320, 200);
  const expectedCoop = makeCanvas();
  drawExpectedCoop(expectedCoop.ctx);
  compareCanvas(actualCoop.canvas, expectedCoop.canvas, 'co-op table');
  const coopPixels = changedPixels(actualCoop.canvas);
  WI_Shutdown();
  exerciseInputCompletion('co-op');

  doomstat.set_deathmatch(1);
  resetInput();
  WI_Start(makeWb(), () => {});
  const actualDeathmatch = makeCanvas();
  WI_Drawer(actualDeathmatch.ctx, 0, 0, 320, 200);
  const expectedDeathmatch = makeCanvas();
  drawExpectedDeathmatch(expectedDeathmatch.ctx);
  compareCanvas(actualDeathmatch.canvas, expectedDeathmatch.canvas, 'deathmatch table');
  const deathmatchPixels = changedPixels(actualDeathmatch.canvas);
  WI_Shutdown();
  exerciseInputCompletion('deathmatch');

  // Production G_DoCompleted integration: the global wminfo must receive a
  // detached four-row frag snapshot before WI_Start consumes it.
  doomstat.set_deathmatch(0);
  doomstat.set_netgame(true);
  doomstat.set_gameepisode(1);
  doomstat.set_gamemap(1);
  doomstat.set_totalkills(10);
  doomstat.set_totalitems(8);
  doomstat.set_totalsecret(2);
  doomstat.set_leveltime(4321);
  resetInput();
  G_DoCompleted();
  assertArray(doomstat.wminfo.plyr[0].frags, [1, 3, 0, 0], 'G_DoCompleted player 1 frags');
  assertArray(doomstat.wminfo.plyr[1].frags, [4, 2, 0, 0], 'G_DoCompleted player 2 frags');
  assertEquals(doomstat.wminfo.maxfrags, 0, 'G_DoCompleted maxfrags');
  assertEquals(doomstat.wminfo.partime, TICRATE * 30, 'G_DoCompleted partime');
  doomstat.players[0].frags[1] = 99;
  assertEquals(doomstat.wminfo.plyr[0].frags[1], 3, 'G_DoCompleted detached frags');
  WI_Shutdown();

  return { ok: true, coopPixels, deathmatchPixels, coopDone: 1, deathmatchDone: 1 };
}

run().then((result) => {
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
}).catch((error) => {
  const result = { ok: false, error: error.stack ?? String(error) };
  window.__headlessResult = result;
  document.getElementById('result').textContent = JSON.stringify(result);
});
