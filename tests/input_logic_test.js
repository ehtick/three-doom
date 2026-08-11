import {
  D_ComputeMovement,
  D_MouseStrafePressed,
  D_ScaleMouseDelta,
  D_ShouldCaptureGameplayPress,
} from '../src/d_input_logic.js';

function assertMovement(input, turnheld, expected, message) {
  const actual = D_ComputeMovement(input, turnheld);
  for (const key of ['forwardmove', 'sidemove', 'angleturn']) {
    if (actual[key] !== expected[key]) {
      throw new Error(`${message} ${key}: expected ${expected[key]}, got ${actual[key]}`);
    }
  }
}

Deno.test('opposite keyboard movement contributions cancel', () => {
  assertMovement(
    { forward: true, backward: true, strafeLeft: true, strafeRight: true,
      turnLeft: true, turnRight: true },
    1,
    { forwardmove: 0, sidemove: 0, angleturn: 0 },
    'opposites',
  );
});

Deno.test('Alt or middle mouse makes turn controls strafe', () => {
  assertMovement(
    { strafe: true, turnRight: true, mouseX: 3 },
    7,
    { forwardmove: 0, sidemove: 30, angleturn: 0 },
    'strafe modifier',
  );
});

Deno.test('right mouse and vertical mouse movement move forward', () => {
  assertMovement(
    { mouseForward: true, mouseY: 10 },
    0,
    { forwardmove: 35, sidemove: 0, angleturn: 0 },
    'mouse forward',
  );
});

Deno.test('movement clamps while angleturn narrows to vanilla signed-short storage', () => {
  assertMovement(
    { fast: true, forward: true, mouseForward: true, strafeRight: true,
      turnRight: true, mouseX: 5000 },
    6,
    { forwardmove: 50, sidemove: 40, angleturn: 24256 },
    'fast/clamped movement and wrapped turn',
  );
});

Deno.test('angleturn wraps across both signed-short boundaries', () => {
  assertMovement(
    { mouseX: 4097 },
    0,
    { forwardmove: 0, sidemove: 0, angleturn: 32760 },
    'negative overflow',
  );
  assertMovement(
    { mouseX: -4097 },
    0,
    { forwardmove: 0, sidemove: 0, angleturn: -32760 },
    'positive overflow',
  );
});

Deno.test('strafe double-click edges come only from the middle mouse button', () => {
  if (D_MouseStrafePressed(0) !== false ||
      D_MouseStrafePressed(1) !== false ||
      D_MouseStrafePressed(2) !== true ||
      D_MouseStrafePressed(4) !== false ||
      D_MouseStrafePressed(7) !== true) {
    throw new Error('mousebstrafe bit decoding does not match vanilla');
  }
});

Deno.test('menu responder consumption has precedence over gameplay presses', () => {
  if (D_ShouldCaptureGameplayPress(false) !== true) {
    throw new Error('unhandled input was not offered to gameplay');
  }
  if (D_ShouldCaptureGameplayPress(true) !== false) {
    throw new Error('menu-consumed input leaked into gameplay');
  }
});

Deno.test('mouse sensitivity uses vanilla integer truncation toward zero', () => {
  const cases = [
    [1, 0, 0], [-1, 0, 0], [3, 0, 1], [-3, 0, -1],
    [4, 1, 2], [-4, 1, -2], [9, 2, 6], [-9, 2, -6],
    [7, 3, 5], [-7, 3, -5], [7, 4, 6], [-7, 4, -6],
    [123, 5, 123], [-123, 5, -123],
    [9, 6, 9], [-9, 6, -9], [9, 7, 10], [-9, 7, -10],
    [9, 8, 11], [-9, 8, -11], [9, 9, 12], [-9, 9, -12],
  ];
  for (const [delta, sensitivity, expected] of cases) {
    const actual = D_ScaleMouseDelta(delta, sensitivity);
    if (actual !== expected || Object.is(actual, -0)) {
      throw new Error(`delta ${delta}, sensitivity ${sensitivity}: expected ${expected}, got ${actual}`);
    }
  }
});
