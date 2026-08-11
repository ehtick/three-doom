import { GameMode_t } from '../src/doomdef.js';
import * as doomstat from '../src/doomstat.js';
import { P_SetExternals, P_SetupLevel } from '../src/p_setup.js';
import { W_InitMultipleFiles } from '../src/w_wad.js';

Deno.test('level sound restart precedes map things and setup-created sounds', async () => {
  const wad = await Deno.readFile(new URL('../doom1.wad', import.meta.url));
  W_InitMultipleFiles([{ name: 'doom1.wad', buffer: wad.buffer }]);
  doomstat.set_gamemode(GameMode_t.shareware);

  const oldPlayer = doomstat.players[0];
  const oldActive = doomstat.playeringame[0];
  const player = {
    viewz: 99,
    killcount: 7,
    itemcount: 8,
    secretcount: 9,
  };
  doomstat.players[0] = player;
  doomstat.playeringame[0] = true;

  const calls = [];
  P_SetExternals({
    R_TextureNumForName: () => 0,
    R_FlatNumForName: () => 0,
    P_SpawnMapThing: () => { calls.push('thing'); },
    P_SpawnSpecials: () => { calls.push('specials'); },
    P_ResetRespawnQueue: () => { calls.push('respawn-reset'); },
    R_PrecacheLevel: () => { calls.push('precache'); },
    S_Start: () => {
      if (player.viewz !== 1) throw new Error(`S_Start observed viewz ${player.viewz}`);
      calls.push('sound');
    },
  });

  try {
    P_SetupLevel(1, 1, 0, 2);
  } finally {
    doomstat.players[0] = oldPlayer;
    doomstat.playeringame[0] = oldActive;
  }

  const sound = calls.indexOf('sound');
  const firstThing = calls.indexOf('thing');
  const reset = calls.indexOf('respawn-reset');
  const specials = calls.indexOf('specials');
  const precache = calls.indexOf('precache');
  if (sound !== 0 || firstThing <= sound || reset <= firstThing ||
      specials <= reset || precache <= specials ||
      calls.filter((call) => call === 'sound').length !== 1) {
    throw new Error(`setup order mismatch: ${calls.join(', ')}`);
  }
});
