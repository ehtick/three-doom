import {
  KEY_BACKSPACE, KEY_ENTER, KEY_ESCAPE, gamestate_t,
} from '../src/doomdef.js';
import { EMPTYSTRING, QLPROMPT, QSPROMPT } from '../src/d_englsh.js';
import {
  M_ApplySaveEditKey, M_BeginSaveEdit, M_FormatSavePrompt,
  M_NormalizeSaveSlots, M_QuickLoadRoute, M_QuickSaveRoute,
  QUICK_SAVE_NONE, QUICK_SAVE_PICKING, SAVE_STRING_PIXEL_LIMIT,
  SAVE_STRING_SIZE,
} from '../src/m_menu_save_logic.js';

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('save list normalization preserves six numeric slot statuses', () => {
  const slots = M_NormalizeSaveSlots([
    null,
    { slot: 1, description: 'ONE' },
    { slot: 5, description: '' },
    { slot: 99, description: 'OUT' },
  ]);
  assertEquals(slots.length, 6, 'slot count');
  assertEquals(slots[0], { description: EMPTYSTRING, occupied: false }, 'empty slot');
  assertEquals(slots[1], { description: 'ONE', occupied: true }, 'occupied slot');
  assertEquals(slots[5], { description: '', occupied: true }, 'existence controls status');
  assertEquals(M_NormalizeSaveSlots(null)[3].occupied, false, 'invalid listing');
});

Deno.test('save editor clears empty, uppercases glyphs, deletes, and restores on Escape', () => {
  assertEquals(M_BeginSaveEdit(EMPTYSTRING), { oldText: EMPTYSTRING, text: '' }, 'empty begin');
  const begin = M_BeginSaveEdit('OLD');
  assertEquals(begin, { oldText: 'OLD', text: 'OLD' }, 'occupied begin');

  const width = (text) => text.length * 8;
  let edit = M_ApplySaveEditKey('', EMPTYSTRING, 'a'.charCodeAt(0), width);
  assertEquals(edit, { kind: 'editing', text: 'A' }, 'ASCII uppercase');
  edit = M_ApplySaveEditKey(edit.text, EMPTYSTRING, 0x20, width);
  assertEquals(edit.text, 'A ', 'space accepted');
  edit = M_ApplySaveEditKey(edit.text, EMPTYSTRING, 0x60, width);
  assertEquals(edit.text, 'A ', 'non-HU glyph rejected');
  edit = M_ApplySaveEditKey(edit.text, EMPTYSTRING, KEY_BACKSPACE, width);
  assertEquals(edit.text, 'A', 'backspace');
  assertEquals(
    M_ApplySaveEditKey(edit.text, 'OLD', KEY_ESCAPE, width),
    { kind: 'cancel', text: 'OLD' },
    'Escape restore',
  );
});

Deno.test('save editor applies exact character and pre-append pixel limits', () => {
  const width = (text) => text.length === 22 ? SAVE_STRING_PIXEL_LIMIT - 1 : text.length * 8;
  const twentyTwo = 'A'.repeat(SAVE_STRING_SIZE - 2);
  const final = M_ApplySaveEditKey(twentyTwo, '', 'b'.charCodeAt(0), width);
  assertEquals(final.text, `${twentyTwo}B`, '23rd character accepted from width 175');
  assertEquals(
    M_ApplySaveEditKey(final.text, '', 'c'.charCodeAt(0), () => 0).text,
    final.text,
    '24th character rejected',
  );
  assertEquals(
    M_ApplySaveEditKey('WIDE', '', 'd'.charCodeAt(0), () => SAVE_STRING_PIXEL_LIMIT).text,
    'WIDE',
    'width 176 rejected',
  );
});

Deno.test('save editor commits only nonempty names', () => {
  assertEquals(
    M_ApplySaveEditKey('', EMPTYSTRING, KEY_ENTER, () => 0),
    { kind: 'finish', text: '', save: false },
    'empty Enter',
  );
  assertEquals(
    M_ApplySaveEditKey('GAME', EMPTYSTRING, KEY_ENTER, () => 0),
    { kind: 'finish', text: 'GAME', save: true },
    'named Enter',
  );
});

Deno.test('quick-slot routes preserve -1/-2/slot and guard precedence', () => {
  assertEquals(M_QuickSaveRoute(false, gamestate_t.GS_LEVEL, 2), 'inactive', 'inactive save');
  assertEquals(M_QuickSaveRoute(true, gamestate_t.GS_FINALE, 2), 'nonlevel', 'nonlevel save');
  assertEquals(M_QuickSaveRoute(true, gamestate_t.GS_LEVEL, QUICK_SAVE_NONE), 'pick', 'new quick slot');
  assertEquals(M_QuickSaveRoute(true, gamestate_t.GS_LEVEL, QUICK_SAVE_PICKING), 'pick', 'cancelled pick');
  assertEquals(M_QuickSaveRoute(true, gamestate_t.GS_LEVEL, 0), 'confirm', 'known quick slot');
  assertEquals(M_QuickLoadRoute(true, 0), 'netgame', 'netgame load precedence');
  assertEquals(M_QuickLoadRoute(false, QUICK_SAVE_NONE), 'no-slot', 'missing quick slot');
  assertEquals(M_QuickLoadRoute(false, 5), 'confirm', 'known quick load');
});

Deno.test('quick prompts substitute the native placeholder once', () => {
  assertEquals(
    M_FormatSavePrompt(QSPROMPT, 'E1M1'),
    "quicksave over your game named\n\n'E1M1'?\n\npress y or n.",
    'quicksave prompt',
  );
  assertEquals(
    M_FormatSavePrompt(QLPROMPT, 'E1M1'),
    "do you want to quickload the game named\n\n'E1M1'?\n\npress y or n.",
    'quickload prompt',
  );
  assertEquals(
    M_FormatSavePrompt('slot <%s>', '$&'),
    'slot <$&>',
    'replacement metacharacters stay literal',
  );
});
