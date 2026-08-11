import {
  ST_ARMORX, ST_BIG_NUMBER_Y, ST_DeathmatchStatusPlan, ST_FRAGSX,
  ST_FRAGSWIDTH, ST_HEALTHX, ST_KeyPatch, ST_PERCENT_PATCH,
} from '../src/st_status_logic.js';

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('health and armor percent widgets use the reference patch anchors', () => {
  assertEquals(
    { patch: ST_PERCENT_PATCH, y: ST_BIG_NUMBER_Y, healthX: ST_HEALTHX, armorX: ST_ARMORX },
    { patch: 'STTPRCNT', y: 171, healthX: 90, armorX: 221 },
    'STlib percent layout',
  );
});

Deno.test('deathmatch replaces arms with the reference frag sum widget', () => {
  assertEquals(
    ST_DeathmatchStatusPlan(0, new Int32Array([3, 10, 5, 0]), 0),
    { showArms: true, showFrags: false, fragCount: 12 },
    'normal status middle',
  );
  assertEquals(
    ST_DeathmatchStatusPlan(1, new Int32Array([3, 10, 5, 0]), 0),
    { showArms: false, showFrags: true, fragCount: 12 },
    'deathmatch status middle',
  );
  assertEquals(
    ST_DeathmatchStatusPlan(2, new Int32Array([12, 2, 1, 0]), 0).fragCount,
    -9,
    'self frags subtract from the total',
  );
  assertEquals({ x: ST_FRAGSX, y: ST_BIG_NUMBER_Y, width: ST_FRAGSWIDTH },
    { x: 138, y: 171, width: 2 }, 'frag widget geometry');
});

Deno.test('a skull key overrides its matching card using loaded STKEYS patches', () => {
  for (let slot = 0; slot < 3; slot++) {
    const cards = [false, false, false, false, false, false];
    assertEquals(ST_KeyPatch(cards, slot), null, `empty slot ${slot}`);
    cards[slot] = true;
    assertEquals(ST_KeyPatch(cards, slot), `STKEYS${slot}`, `card ${slot}`);
    cards[slot + 3] = true;
    assertEquals(ST_KeyPatch(cards, slot), `STKEYS${slot + 3}`, `skull overrides card ${slot}`);
    cards[slot] = false;
    assertEquals(ST_KeyPatch(cards, slot), `STKEYS${slot + 3}`, `skull ${slot}`);
  }
});
