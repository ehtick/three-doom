import { BT_ATTACK, BT_CHANGE, BT_USE } from '../src/d_event.js';
import { WI_CheckForAccelerate } from '../src/wi_input_logic.js';

function makePlayer(buttons = 0, attackdown = 0, usedown = 0) {
  return { cmd: { buttons }, attackdown, usedown };
}

Deno.test('intermission acceleration follows active attack/use rising edges', () => {
  const players = [makePlayer(BT_ATTACK), makePlayer(BT_ATTACK), makePlayer(), null];
  const active = [true, false, true, false];

  if (WI_CheckForAccelerate(players, active) !== true || players[0].attackdown !== 1) {
    throw new Error('initial local attack edge did not accelerate');
  }
  if (WI_CheckForAccelerate(players, active) !== false) {
    throw new Error('held attack accelerated more than once');
  }

  players[0].cmd.buttons = 0;
  players[2].cmd.buttons = BT_USE;
  if (WI_CheckForAccelerate(players, active) !== true ||
      players[0].attackdown !== 0 || players[2].usedown !== 1) {
    throw new Error('remote use edge or local release was not detected');
  }
  if (WI_CheckForAccelerate(players, active) !== false) {
    throw new Error('held remote use accelerated more than once');
  }

  players[2].cmd.buttons = BT_CHANGE;
  if (WI_CheckForAccelerate(players, active) !== false ||
      players[2].attackdown !== 0 || players[2].usedown !== 0) {
    throw new Error('non-attack/use buttons accelerated or retained an edge');
  }
  if (players[1].attackdown !== 0) {
    throw new Error('inactive player state was mutated');
  }
});

Deno.test('intermission responder stays a stub and ticker owns command polling', async () => {
  const wi = await Deno.readTextFile(new URL('../src/wi_stuff.js', import.meta.url));
  const keyboard = await Deno.readTextFile(new URL('../src/d_keyboard.js', import.meta.url));
  const responder = wi.slice(wi.indexOf('export function WI_Responder'), wi.indexOf('// Updates stuff each tick'));
  if (!responder.includes('return false') || responder.includes('acceleratestage = 1')) {
    throw new Error('WI_Responder still accelerates from raw events');
  }
  const ticker = wi.slice(wi.indexOf('export function WI_Ticker'), wi.indexOf('function WI_loadData'));
  if (!ticker.includes('WI_CheckForAccelerate(players, playeringame)')) {
    throw new Error('WI_Ticker does not poll active-player ticcmd edges');
  }
  if (keyboard.includes("import('./wi_stuff.js')") || keyboard.includes('WI_Responder({')) {
    throw new Error('DOM keyboard path still advances intermission directly');
  }
});
