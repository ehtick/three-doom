const keyboard = await Deno.readTextFile(new URL('../src/d_keyboard.js', import.meta.url));
const video = await Deno.readTextFile(new URL('../src/i_video.js', import.meta.url));

Deno.test('demo input interception is state-independent and precedes gameplay capture', () => {
  const handler = keyboard.slice(
    keyboard.indexOf('async function onKeyDown'),
    keyboard.indexOf('function onKeyUp'),
  );
  const demo = handler.indexOf('demoInputIsIntercepted()');
  const capture = handler.indexOf('keys.add(e.code)');
  if (demo < 0 || capture <= demo) {
    throw new Error('keyboard demo interception remains level-only or follows keys.add');
  }
  const mouse = keyboard.slice(
    keyboard.indexOf('function onMouseDown'),
    keyboard.indexOf('function onMouseUp'),
  );
  const mouseGuard = mouse.indexOf('demoInputIsIntercepted()');
  if (mouseGuard < 0 || mouseGuard > mouse.indexOf('mouseButtons |=')) {
    throw new Error('demo mouse button reaches gameplay state before interception');
  }
  const move = keyboard.slice(
    keyboard.indexOf('function onMouseMove'),
    keyboard.indexOf('function resetLevelInput'),
  );
  if (!move.includes('(e.buttons | 0) !== 0')) {
    throw new Error('demo interception still swallows zero-button mouse motion');
  }
  const videoMouse = video.slice(
    video.indexOf('function onMouseDown'),
    video.indexOf('function onMouseUp'),
  );
  if (!videoMouse.includes('M_StartControlPanel()') ||
      videoMouse.indexOf('M_StartControlPanel()') > videoMouse.indexOf('return;')) {
    throw new Error('demo mouse button does not open the menu on mousedown');
  }
  const click = video.slice(
    video.indexOf('function onRendererClick'),
    video.indexOf('function onDoomQuit'),
  );
  if (!click.includes('demoInputIsIntercepted()') ||
      click.indexOf('demoInputIsIntercepted()') > click.indexOf('GS_INTERMISSION')) {
    throw new Error('renderer click handles non-level state before demo interception');
  }
  if (!click.includes('_suppressRendererClick')) {
    throw new Error('the primary opening click can act on the new menu twice');
  }
});
