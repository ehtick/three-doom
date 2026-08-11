const source = await Deno.readTextFile(new URL('../src/d_keyboard.js', import.meta.url));

Deno.test('cast responder precedes gameplay key capture and Pause latching', () => {
  const handler = source.slice(
    source.indexOf('async function onKeyDown'),
    source.indexOf('function onKeyUp'),
  );
  const responder = handler.indexOf('finale.F_Responder');
  const capture = handler.indexOf('keys.add(e.code)');
  const pause = handler.indexOf("if (e.code === 'Pause')");
  if (responder < 0 || capture <= responder || pause <= responder) {
    throw new Error('F_Responder does not precede key capture and KEY_PAUSE');
  }
});
