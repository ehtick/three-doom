import {
  HU_AdvanceMessageState, HU_EmptyMessageState, HU_ForceNextMessage,
  HU_MSGTIMEOUT,
} from '../src/hu_message_logic.js';

function assertEquals(actual, expected, message) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

Deno.test('new HUD messages receive the complete 140-tic lifetime', () => {
  let result = HU_AdvanceMessageState(HU_EmptyMessageState(), 'PICKUP', true);
  assertEquals(result.consumed, true, 'new message consumed');
  assertEquals(result.state.counter, HU_MSGTIMEOUT, 'initial lifetime');

  for (let i = 0; i < HU_MSGTIMEOUT - 1; i++) {
    result = HU_AdvanceMessageState(result.state, '', true);
  }
  assertEquals(result.state.counter, 1, 'last visible tic');
  result = HU_AdvanceMessageState(result.state, '', true);
  assertEquals(result.state.counter, 0, 'first hidden tic');
});

Deno.test('forced HUD messages lock out ordinary overwrite until expiry', () => {
  let state = HU_ForceNextMessage(HU_EmptyMessageState());
  let result = HU_AdvanceMessageState(state, 'Messages ON', true);
  assertEquals(
    { consumed: result.consumed, text: result.state.text, counter: result.state.counter,
      locked: result.state.locked, forcePending: result.state.forcePending },
    { consumed: true, text: 'Messages ON', counter: HU_MSGTIMEOUT,
      locked: true, forcePending: false },
    'forced install',
  );

  result = HU_AdvanceMessageState(result.state, 'PICKUP', true);
  assertEquals(result.consumed, false, 'ordinary overwrite blocked');
  assertEquals(result.state.text, 'Messages ON', 'forced text retained');

  for (let i = 1; i < HU_MSGTIMEOUT; i++) {
    result = HU_AdvanceMessageState(result.state, 'PICKUP', true);
  }
  assertEquals(result.consumed, true, 'pending text consumed on expiry tic');
  assertEquals(result.state.text, 'PICKUP', 'pending text installed');
  assertEquals(result.state.counter, HU_MSGTIMEOUT, 'replacement gets full lifetime');
  assertEquals(result.state.locked, false, 'ordinary replacement is not locked');
});

Deno.test('forced messages bypass suppression and may replace another forced message', () => {
  let state = HU_ForceNextMessage(HU_EmptyMessageState());
  let result = HU_AdvanceMessageState(state, 'Messages OFF', false);
  assertEquals(result.consumed, true, 'forced message bypasses showMessages');
  assertEquals(result.state.locked, true, 'forced message locks');

  state = HU_ForceNextMessage(result.state);
  result = HU_AdvanceMessageState(state, 'Messages ON', true);
  assertEquals(result.consumed, true, 'new forced message replaces lock');
  assertEquals(result.state.text, 'Messages ON', 'new forced text');
  assertEquals(result.state.counter, HU_MSGTIMEOUT, 'forced replacement lifetime');

  result = HU_AdvanceMessageState(result.state, 'PICKUP', false);
  assertEquals(result.consumed, false, 'suppressed ordinary message retained');
  assertEquals(result.state.text, 'Messages ON', 'suppression keeps visible text');
});
