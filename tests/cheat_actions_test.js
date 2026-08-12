import { GameMode_t, powertype_t, weapontype_t } from '../src/doomdef.js';
import {
  M_ApplyChoppersCheat,
  M_ParseClev,
  M_PlayerPositionMessage,
  M_TogglePowerCheat,
} from '../src/m_cheat_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

Deno.test('behold power cheats follow give, timer-collapse, and strength-toggle rules', () => {
  const player = { powers: new Int32Array(6) };
  const given = [];
  const givePower = (target, power) => {
    given.push(power);
    target.powers[power] = 1000 + power;
  };

  for (let power = 0; power < 6; power++) {
    M_TogglePowerCheat(player, power, givePower);
    assertEquals(given[given.length - 1], power, `power ${power} given`);
    M_TogglePowerCheat(player, power, givePower);
    assertEquals(
      player.powers[power],
      power === powertype_t.pw_strength ? 0 : 1,
      `power ${power} second toggle`,
    );
  }
  assertEquals(given.length, 6, 'only absent powers call P_GivePower');
});

Deno.test('choppers and mypos match status cheat side effects and formatting', () => {
  const player = {
    powers: new Int32Array(6),
    weaponowned: new Array(9).fill(false),
  };
  M_ApplyChoppersCheat(player);
  assertEquals(player.weaponowned[weapontype_t.wp_chainsaw], true, 'chainsaw owned');
  assertEquals(player.powers[powertype_t.pw_invulnerability], 1, 'one-tic invulnerability');
  assertEquals(
    M_PlayerPositionMessage({ angle: -1, x: -2, y: 0x1234 }),
    'ang=0xffffffff;x,y=(0xfffffffe,0x1234)',
    'unsigned lowercase hexadecimal position',
  );
});

Deno.test('idclev validation covers every IWAD mode', () => {
  const parse = (mode, digits) => M_ParseClev(mode, digits.charCodeAt(0), digits.charCodeAt(1));
  assertEquals(JSON.stringify(parse(GameMode_t.shareware, '19')), '{"episode":1,"map":9}', 'shareware max');
  assertEquals(parse(GameMode_t.shareware, '21'), null, 'shareware episode rejected');
  assertEquals(JSON.stringify(parse(GameMode_t.registered, '39')), '{"episode":3,"map":9}', 'registered max');
  assertEquals(parse(GameMode_t.registered, '49'), null, 'registered episode rejected');
  assertEquals(JSON.stringify(parse(GameMode_t.retail, '49')), '{"episode":4,"map":9}', 'retail max');
  assertEquals(parse(GameMode_t.retail, '50'), null, 'retail invalid destination');
  assertEquals(JSON.stringify(parse(GameMode_t.commercial, '34')), '{"episode":1,"map":34}', 'commercial max');
  assertEquals(parse(GameMode_t.commercial, '35'), null, 'commercial MAP35 rejected');
  assertEquals(parse(GameMode_t.commercial, '0x'), null, 'nondigit rejected');
});
