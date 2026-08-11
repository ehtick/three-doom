import {
  ST_ARMORX, ST_BIG_NUMBER_Y, ST_HEALTHX, ST_PERCENT_PATCH,
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
