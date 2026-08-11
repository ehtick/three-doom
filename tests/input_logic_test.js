import { D_ComputeMovement } from '../src/d_input_logic.js';

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

Deno.test('movement and mouse turning use vanilla clamps and acceleration', () => {
  assertMovement(
    { fast: true, forward: true, mouseForward: true, strafeRight: true,
      turnRight: true, mouseX: 5000 },
    6,
    { forwardmove: 50, sidemove: 40, angleturn: -32768 },
    'fast/clamped movement',
  );
});
