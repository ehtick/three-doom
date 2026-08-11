const keyboard = await Deno.readTextFile(new URL('../src/d_keyboard.js', import.meta.url));
const video = await Deno.readTextFile(new URL('../src/i_video.js', import.meta.url));

Deno.test('demo input interception is state-independent and precedes gameplay capture', () => {
  const handler = keyboard.slice(
    keyboard.indexOf('async function onKeyDown'),
    keyboard.indexOf('function onKeyUp'),
  );
  const demo = handler.indexOf('doomstat.demoplayback === true');
  const capture = handler.indexOf('keys.add(e.code)');
  if (demo < 0 || capture <= demo || handler.includes('GS_LEVEL*/ && doomstat.demoplayback')) {
    throw new Error('keyboard demo interception remains level-only or follows keys.add');
  }
  const mouse = keyboard.slice(
    keyboard.indexOf('function onMouseDown'),
    keyboard.indexOf('function onMouseUp'),
  );
  if (mouse.indexOf('doomstat.demoplayback === true') > mouse.indexOf('mouseButtons |=')) {
    throw new Error('demo mouse button reaches gameplay state before interception');
  }
  const click = video.slice(
    video.indexOf('function onRendererClick'),
    video.indexOf('function onDoomQuit'),
  );
  if (!click.includes('_doomstat.demoplayback === true') ||
      click.indexOf('_doomstat.demoplayback === true') > click.indexOf('GS_INTERMISSION')) {
    throw new Error('renderer click handles non-level state before demo interception');
  }
});
