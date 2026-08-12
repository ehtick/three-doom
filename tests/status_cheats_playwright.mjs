import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const options = { headless: true };
if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) {
  options.executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
}

let browser;
try {
  browser = await chromium.launch(options);
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const url = new URL(process.env.DOOM_URL ?? 'http://127.0.0.1:8134/');
  url.searchParams.set('-map', 'E1M1');
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() =>
    window.scene?.getObjectByName('level') !== undefined,
  { timeout: 30000 });

  const result = await page.evaluate(async () => {
    const cheat = await import('/src/m_cheat.js');
    const doomdef = await import('/src/doomdef.js');
    const doomstat = await import('/src/doomstat.js');
    const english = await import('/src/d_englsh.js');
    const inter = await import('/src/p_inter.js');
    const loop = await import('/src/d_loop.js');
    loop.D_DoomRafLoop.stop();

    const player = doomstat.players[doomstat.consoleplayer];
    const deferred = [];
    cheat.M_CheatSetExternals({
      P_GivePower: inter.P_GivePower,
      G_DeferedInitNew: (...args) => deferred.push(args),
    });
    const type = (text) => {
      for (const char of text) cheat.cht_HandleKey(char.charCodeAt(0));
    };

    doomstat.set_netgame(false);
    doomstat.set_gamemode(doomdef.GameMode_t.shareware);
    player.powers.fill(0);
    player.mo.flags &= ~0x40000;
    const powerResults = [];
    const cases = [
      ['v', doomdef.INVULNTICS],
      ['s', 1],
      ['i', doomdef.INVISTICS],
      ['r', doomdef.IRONTICS],
      ['a', 1],
      ['l', doomdef.INFRATICS],
    ];
    for (let power = 0; power < cases.length; power++) {
      type(`idbehold${cases[power][0]}`);
      powerResults.push({
        power,
        value: player.powers[power],
        expected: cases[power][1],
        message: player.message,
      });
    }
    const invisibilityShadow = (player.mo.flags & 0x40000) !== 0;
    type('idbeholdv');
    const repeatedInvulnerability = player.powers[0];
    type('idbeholds');
    const repeatedStrength = player.powers[1];

    type('idbehold');
    const beholdMessage = player.message;
    player.weaponowned[doomdef.weapontype_t.wp_chainsaw] = false;
    player.powers[doomdef.powertype_t.pw_invulnerability] = 0;
    type('idchoppers');
    const choppers = {
      chainsaw: player.weaponowned[doomdef.weapontype_t.wp_chainsaw],
      invulnerability: player.powers[doomdef.powertype_t.pw_invulnerability],
      message: player.message,
    };

    player.mo.angle = -1;
    player.mo.x = -2;
    player.mo.y = 0x1234;
    type('idmypos');
    const mypos = player.message;

    type('idclev19');
    const sharewareClev = deferred.at(-1);
    const sharewareMessage = player.message;
    type('idclev21');
    const callsAfterInvalid = deferred.length;

    doomstat.set_netgame(true);
    const oldCheats = player.cheats;
    type('iddqd');
    const netgameGodChanged = player.cheats !== oldCheats;
    type('idclev18');
    const netgameClev = deferred.at(-1);

    doomstat.set_gamemode(doomdef.GameMode_t.commercial);
    type('idclev34');
    const commercialClev = deferred.at(-1);

    return {
      powerResults,
      invisibilityShadow,
      repeatedInvulnerability,
      repeatedStrength,
      beholdMessage,
      expectedBehold: english.STSTR_BEHOLD,
      choppers,
      expectedChoppers: english.STSTR_CHOPPERS,
      mypos,
      sharewareClev,
      sharewareMessage,
      expectedClev: english.STSTR_CLEV,
      callsAfterInvalid,
      netgameGodChanged,
      netgameClev,
      commercialClev,
      deferredCount: deferred.length,
    };
  });

  const failures = [];
  for (const power of result.powerResults) {
    if (power.value !== power.expected || power.message !== 'Power-up Toggled') {
      failures.push(`power ${power.power}: ${JSON.stringify(power)}`);
    }
  }
  if (result.invisibilityShadow !== true || result.repeatedInvulnerability !== 1 ||
      result.repeatedStrength !== 0) failures.push(`power toggles: ${JSON.stringify(result)}`);
  if (result.beholdMessage !== result.expectedBehold) failures.push('behold menu message');
  if (result.choppers.chainsaw !== true || result.choppers.invulnerability !== 1 ||
      result.choppers.message !== result.expectedChoppers) failures.push('choppers side effects');
  if (result.mypos !== 'ang=0xffffffff;x,y=(0xfffffffe,0x1234)') failures.push('mypos formatting');
  if (JSON.stringify(result.sharewareClev) !== '[2,1,9]' ||
      result.sharewareMessage !== result.expectedClev || result.callsAfterInvalid !== 1) {
    failures.push(`shareware idclev: ${JSON.stringify(result)}`);
  }
  if (result.netgameGodChanged !== false || JSON.stringify(result.netgameClev) !== '[2,1,8]') {
    failures.push(`netgame routing: ${JSON.stringify(result)}`);
  }
  if (JSON.stringify(result.commercialClev) !== '[2,1,34]' || result.deferredCount !== 3) {
    failures.push(`commercial idclev: ${JSON.stringify(result)}`);
  }
  if (errors.length !== 0) failures.push(`page errors: ${errors.join('; ')}`);
  if (failures.length !== 0) throw new Error(failures.join('\n'));
  console.log(JSON.stringify(result));
} finally {
  if (browser !== undefined) await browser.close();
}
