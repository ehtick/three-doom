function assertOrdered(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  if (firstIndex < 0 || secondIndex <= firstIndex) throw new Error(message);
}

Deno.test('I_Quit teardown awaits sound and music before graphics resources', async () => {
  const video = await Deno.readTextFile(new URL('../src/i_video.js', import.meta.url));
  assertOrdered(
    video,
    '() => iSound.I_ShutdownSound()',
    '() => iSound.I_ShutdownMusic()',
    'sound/music shutdown order differs from i_system.c',
  );
  assertOrdered(
    video,
    '() => iSound.I_ShutdownMusic()',
    '() => dMain.D_ShutdownDoomLoop()',
    'graphics teardown begins before sound/music shutdown',
  );
  if (!video.includes('try { await cleanup(); }')) {
    throw new Error('async sound shutdown is not awaited by the teardown loop');
  }
  if (!video.includes("I_ShutdownGraphics().catch((error) =>")) {
    throw new Error('event-driven I_Quit teardown can reject without a handler');
  }
});

Deno.test('Web Audio shutdown claims resources once and prevents recreation', async () => {
  const sound = await Deno.readTextFile(new URL('../src/i_sound.js', import.meta.url));
  if (!sound.includes('if (_soundShutdownPromise !== null) return _soundShutdownPromise;') ||
      !sound.includes('_soundShutdownStarted = true;') ||
      !sound.includes('if (_soundShutdownStarted === true) return null;')) {
    throw new Error('I_ShutdownSound is not terminal and idempotent');
  }
  assertOrdered(
    sound,
    'const ownedContext = _ctx;\n  _ctx = null;',
    'await ownedContext.close();',
    'AudioContext ownership is not cleared before asynchronous close',
  );
});
