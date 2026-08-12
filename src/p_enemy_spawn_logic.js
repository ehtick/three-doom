// Pure fixed-point helpers extracted from p_enemy.c spawn actions.

import { FixedMul } from './m_fixed.js';

// p_enemy.c:A_PainShootSkull — retain FixedMul's arithmetic right-shift for
// negative products instead of JavaScript's truncation toward zero.
export function P_PainSkullCoordinate(origin, prestep, fineComponent) {
  return (origin + FixedMul(prestep, fineComponent)) | 0;
}
