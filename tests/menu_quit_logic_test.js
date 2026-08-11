import {
  M_ConfirmQuit,
  QUIT_CONFIRM_KEY,
  QUIT_LINK,
} from '../src/m_menu_quit_logic.js';

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('quit confirmation opens the requested tab before shutdown', () => {
  const calls = [];
  const state = { linkOpened: false };
  const confirmed = M_ConfirmQuit(
    QUIT_CONFIRM_KEY,
    state,
    (...args) => { calls.push(['open', ...args]); },
    () => { calls.push(['quit']); },
  );
  assertEquals(confirmed, true, 'confirmation result');
  assertEquals(calls, [
    ['open', QUIT_LINK, '_blank', 'noopener,noreferrer'],
    ['quit'],
  ], 'open and shutdown order');
  assertEquals(state, { linkOpened: true }, 'open guard state');
});

Deno.test('non-Y responses neither open the link nor quit', () => {
  const calls = [];
  const confirmed = M_ConfirmQuit(
    0x6e /*n*/,
    { linkOpened: false },
    () => { calls.push('open'); },
    () => { calls.push('quit'); },
  );
  assertEquals(confirmed, false, 'decline result');
  assertEquals(calls, [], 'decline side effects');
});

Deno.test('popup failure cannot prevent shutdown', () => {
  const calls = [];
  const confirmed = M_ConfirmQuit(
    QUIT_CONFIRM_KEY,
    { linkOpened: false },
    () => { calls.push('open'); throw new Error('blocked'); },
    () => { calls.push('quit'); },
  );
  assertEquals(confirmed, true, 'blocked-popup confirmation result');
  assertEquals(calls, ['open', 'quit'], 'blocked-popup shutdown');
});

Deno.test('repeated confirmation opens one tab while retaining idempotent quit calls', () => {
  const calls = [];
  const state = { linkOpened: false };
  const open = () => { calls.push('open'); };
  const quit = () => { calls.push('quit'); };
  M_ConfirmQuit(QUIT_CONFIRM_KEY, state, open, quit);
  M_ConfirmQuit(QUIT_CONFIRM_KEY, state, open, quit);
  assertEquals(calls, ['open', 'quit', 'quit'], 'repeated confirmation');
});
