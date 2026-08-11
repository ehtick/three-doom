// Pure movement portion of g_game.c:G_BuildTiccmd. Keeping the arithmetic
// separate from DOM state makes the default keyboard/mouse combinations easy
// to verify without a browser.

const SLOWTURN = 320;
const NORMALTURN = 640;
const FASTTURN = 1280;
const MAXPLMOVE = 50;

function clampMove(value) {
  return Math.max(-MAXPLMOVE, Math.min(MAXPLMOVE, value));
}

// ticcmd_t.angleturn is a signed short. C narrows each accumulated turn into
// that field; it does not saturate it. A single modulo-16-bit narrowing after
// the additive contributions is equivalent and preserves demo byte semantics.
function narrowAngle(value) {
  return (value << 16) >> 16;
}

// g_game.c's bstrafe double-click detector reads only mousebstrafe (middle
// mouse by default). The keyboard Alt strafe modifier affects movement but is
// deliberately not part of this mouse-button edge detector.
export function D_MouseStrafePressed(mouseButtons) {
  return (mouseButtons & 2) !== 0;
}

export function D_ComputeMovement(input, turnheld) {
  const fast = input.fast === true;
  const forwardStep = fast ? 50 : 25;
  const sideStep = fast ? 40 : 24;
  const turnStep = turnheld < 6 ? SLOWTURN : (fast ? FASTTURN : NORMALTURN);

  let forward = 0;
  let side = 0;
  let angle = 0;

  // Contributions are additive in vanilla, so opposite controls cancel.
  if (input.forward === true) forward += forwardStep;
  if (input.backward === true) forward -= forwardStep;
  if (input.strafeRight === true) side += sideStep;
  if (input.strafeLeft === true) side -= sideStep;

  if (input.strafe === true) {
    if (input.turnRight === true) side += sideStep;
    if (input.turnLeft === true) side -= sideStep;
  } else {
    if (input.turnRight === true) angle -= turnStep;
    if (input.turnLeft === true) angle += turnStep;
  }

  if (input.mouseForward === true) forward += forwardStep;
  forward += input.mouseY | 0;
  if (input.strafe === true) side += (input.mouseX | 0) * 2;
  else                       angle -= (input.mouseX | 0) * 8;

  return {
    forwardmove: clampMove(forward),
    sidemove: clampMove(side),
    angleturn: narrowAngle(angle),
  };
}
