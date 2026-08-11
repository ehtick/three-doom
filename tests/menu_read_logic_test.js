import { GameMode_t } from '../src/doomdef.js';
import { M_ReadThisPlan } from '../src/m_menu_read_logic.js';

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('Read This page routing matches every game-mode draw routine and M_Init hack', () => {
  const base = ['newgame', 'options', 'readthis', 'quit'];
  for (const mode of [GameMode_t.shareware, GameMode_t.registered]) {
    assertEquals(M_ReadThisPlan(mode), {
      mainItems: base,
      mainY: 64,
      firstPatch: 'HELP1',
      firstX: 280,
      firstY: 185,
      secondPatch: 'HELP2',
      firstAction: 'next',
      shortcutPage: 'first',
    }, `Doom 1 mode ${mode}`);
  }
  assertEquals(M_ReadThisPlan(GameMode_t.retail), {
    mainItems: base,
    mainY: 64,
    firstPatch: 'HELP1',
    firstX: 280,
    firstY: 185,
    secondPatch: 'CREDIT',
    firstAction: 'next',
    shortcutPage: 'second',
  }, 'retail');
  assertEquals(M_ReadThisPlan(GameMode_t.commercial), {
    mainItems: ['newgame', 'options', 'quit'],
    mainY: 72,
    firstPatch: 'HELP',
    firstX: 330,
    firstY: 165,
    secondPatch: 'CREDIT',
    firstAction: 'finish',
    shortcutPage: 'first',
  }, 'commercial');
  assertEquals(M_ReadThisPlan(GameMode_t.indetermined), {
    mainItems: base,
    mainY: 64,
    firstPatch: null,
    firstX: 280,
    firstY: 185,
    secondPatch: null,
    firstAction: 'next',
    shortcutPage: 'first',
  }, 'indetermined');
});

Deno.test('Continue prefixes real browser rows without changing commercial layout', () => {
  assertEquals(
    M_ReadThisPlan(GameMode_t.shareware, true).mainItems,
    ['continue', 'newgame', 'options', 'readthis', 'quit'],
    'Doom 1 Continue rows',
  );
  const commercial = M_ReadThisPlan(GameMode_t.commercial, true);
  assertEquals(
    commercial.mainItems,
    ['continue', 'newgame', 'options', 'quit'],
    'commercial Continue rows',
  );
  assertEquals(commercial.mainY, 72, 'commercial +8 y adjustment with Continue');
});

Deno.test('menu integration uses semantic rows and mode-specific help actions', async () => {
  const source = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const mainStart = source.indexOf('const MAIN_MENU_ITEMS');
  const mainEnd = source.indexOf('const MAIN_MENU =', mainStart);
  const main = source.slice(mainStart, mainEnd);
  if (main.includes("patch: 'M_LOADG'") || main.includes("patch: 'M_SAVEG'") ||
      !main.includes('mode layout uses the semantic table above')) {
    throw new Error('browser menu silently reintroduced or indexed omitted Load/Save rows');
  }
  for (const fragment of [
    'M_ReadThisPlan(gamemode, inUserGame)',
    'plan.mainItems.map((name) => MAIN_MENU_ITEMS[name])',
    "M_ReadThisPlan(gamemode).firstAction === 'finish'",
    'M_FinishReadThis()',
    'if (key === KEY_F1 && menuactive !== true)',
    "if (plan.shortcutPage === 'second')",
  ]) {
    if (!source.includes(fragment)) throw new Error(`missing Read This integration: ${fragment}`);
  }
});
