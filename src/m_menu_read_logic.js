// Pure game-mode plan for m_menu.c's MainDef and ReadDef1/ReadDef2 hacks.

import { GameMode_t } from './doomdef.js';

// Load Game and Save Game are intentionally absent from the browser menu.
// Return semantic keys for the rows that really exist here, so the commercial
// Read This removal cannot accidentally target a phantom C-array index.
export function M_ReadThisPlan(gamemode, includeContinue = false) {
  const commercial = gamemode === GameMode_t.commercial;
  const retail = gamemode === GameMode_t.retail;
  const doom1 = gamemode === GameMode_t.shareware ||
                gamemode === GameMode_t.registered || retail;
  const mainItems = ['newgame', 'options'];
  if (!commercial) mainItems.push('readthis');
  mainItems.push('quit');
  if (includeContinue === true) mainItems.unshift('continue');
  return {
    mainItems,
    mainY: commercial ? 72 : 64,
    firstPatch: commercial ? 'HELP' : (doom1 ? 'HELP1' : null),
    firstX: commercial ? 330 : 280,
    firstY: commercial ? 165 : 185,
    secondPatch: commercial || retail
      ? 'CREDIT'
      : (doom1 ? 'HELP2' : null),
    firstAction: commercial ? 'finish' : 'next',
    shortcutPage: retail ? 'second' : 'first',
  };
}
