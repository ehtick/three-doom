import {
  R_MobjHasWorldSprite,
  SPRITE_MF_NOSECTOR,
} from '../src/r_sprite_logic.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

Deno.test('MF_NOSECTOR thinkers are excluded from world sprites', async () => {
  const pMobjSource = await Deno.readTextFile(new URL('../src/p_mobj.js', import.meta.url));
  const infoSource = await Deno.readTextFile(new URL('../src/info.js', import.meta.url));
  const flagMatch = pMobjSource.match(/export const MF_NOSECTOR\s*=\s*(\d+);/);
  assert(flagMatch !== null, 'p_mobj.js must define MF_NOSECTOR');
  const gameFlag = Number(flagMatch[1]);
  assert(SPRITE_MF_NOSECTOR === gameFlag, 'renderer flag must match p_mobj.h');
  assert(R_MobjHasWorldSprite(0), 'ordinary mobj should have a world sprite');
  assert(!R_MobjHasWorldSprite(gameFlag), 'MF_NOSECTOR mobj should not have a world sprite');

  for (const type of ['MT_BOSSSPIT', 'MT_BOSSTARGET']) {
    const line = infoSource.split('\n').find((candidate) => candidate.endsWith(`// ${type}`));
    assert(line !== undefined, `${type} definition must exist`);
    assert(line.includes('MF_NOSECTOR'), `${type} must exercise MF_NOSECTOR`);
  }
});
