const sound = await Deno.readTextFile(new URL('../src/s_sound.js', import.meta.url));
const main = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));

Deno.test('sound starts read the live console player instead of a cached listener', () => {
  if (!sound.includes('const listener = players[consoleplayer];') ||
      sound.includes('let _listener') || sound.includes('_listener = listener')) {
    throw new Error('S_StartSoundAtVolume no longer reads the live console listener');
  }
});

Deno.test('the live listener is resolved before channel allocation', () => {
  const start = sound.indexOf('export function S_StartSoundAtVolume');
  const end = sound.indexOf('export function S_StopSound', start);
  const body = sound.slice(start, end);
  const params = body.indexOf('S_StartSoundParams(origin, volume)');
  const random = body.indexOf('M_Random()');
  const channel = body.indexOf('S_getChannel(origin, sfx)');
  if (start < 0 || end < 0 || params < 0 || random <= params || channel <= random) {
    throw new Error('live sound parameters are not applied at the reference point');
  }
});

Deno.test('first level tic can start sounds before its listener update', () => {
  const ticker = main.indexOf('if (gamestate === gamestate_t.GS_LEVEL');
  const playerTick = main.indexOf('_pTicker();', ticker);
  const soundUpdate = main.indexOf('_sUpdate(p);', playerTick);
  if (ticker < 0 || playerTick < 0 || soundUpdate <= playerTick) {
    throw new Error('level-tic sound/update timing assumption changed');
  }
});
