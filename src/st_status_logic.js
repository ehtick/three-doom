// Pure status-bar layout/state helpers from st_stuff.c.

export const ST_HEALTHX = 90;
export const ST_ARMORX = 221;
export const ST_BIG_NUMBER_Y = 171;
export const ST_PERCENT_PATCH = 'STTPRCNT';
export const ST_FRAGSX = 138;
export const ST_FRAGSWIDTH = 2;

export function ST_DeathmatchStatusPlan(deathmatch, frags, consoleplayer) {
  const active = deathmatch !== 0;
  let fragCount = 0;
  for (let i = 0; i < 4; i++) {
    const value = frags?.[i] | 0;
    fragCount = (fragCount + (i === consoleplayer ? -value : value)) | 0;
  }
  return { showArms: !active, showFrags: active, fragCount };
}
