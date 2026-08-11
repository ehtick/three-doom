Deno.test('Escape closes while Backspace alone follows the previous-menu link', async () => {
  const source = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const responderStart = source.indexOf('export function M_Responder(');
  const responderEnd = source.indexOf('// Touch/pointer tap handling', responderStart);
  const responder = source.slice(responderStart, responderEnd);
  const escapeStart = responder.indexOf('if (key === KEY_ESCAPE)');
  const escapeEnd = responder.indexOf('if (menuactive !== true) return false;', escapeStart);
  const backspaceStart = responder.indexOf('if (key === KEY_BACKSPACE)');
  const backspaceEnd = responder.indexOf('return true;', backspaceStart);
  const escape = responder.slice(escapeStart, escapeEnd);
  const backspace = responder.slice(backspaceStart, backspaceEnd);
  if (!escape.includes('M_ClearMenus();') ||
      !escape.includes('S_StartSound(null, sfx_swtchx);') ||
      escape.includes('M_Back()')) {
    throw new Error('active Escape does not directly close the menu');
  }
  if (!backspace.includes('M_Back();')) {
    throw new Error('Backspace no longer follows the previous-menu link');
  }
});
