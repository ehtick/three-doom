import {
  P_CountActiveSkulls,
  P_PainSkullCoordinate,
} from '../src/p_enemy_spawn_logic.js';

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function cFixedCoordinate(origin, prestep, fineComponent) {
  const product = (BigInt(prestep) * BigInt(fineComponent)) >> 16n;
  return (origin + Number(product)) | 0;
}

Deno.test('Pain Elemental skull placement retains negative FixedMul rounding', () => {
  const prestep = 4882432;
  assertEquals(P_PainSkullCoordinate(0, prestep, -25), -1863, 'known negative product');

  for (let fineComponent = -65536; fineComponent <= 65536; fineComponent += 257) {
    const origin = (fineComponent * 8191) | 0;
    assertEquals(
      P_PainSkullCoordinate(origin, prestep, fineComponent),
      cFixedCoordinate(origin, prestep, fineComponent),
      `fine component ${fineComponent}`,
    );
  }
});

function makeThinkerCap(entries) {
  const cap = {};
  let previous = cap;
  for (const entry of entries) {
    previous.next = entry;
    previous = entry;
  }
  previous.next = cap;
  return cap;
}

Deno.test('Pain Elemental cap excludes Lost Souls pending lazy removal', () => {
  const mobjThinker = () => {};
  const removedThinker = () => {};
  const active = Array.from({ length: 20 }, () => ({
    function: mobjThinker,
    __mobj: { type: 18 },
  }));
  const pendingRemoval = { function: removedThinker, __mobj: { type: 18 } };
  const unrelated = { function: mobjThinker, __mobj: { type: 17 } };

  assertEquals(
    P_CountActiveSkulls(makeThinkerCap([...active, pendingRemoval, unrelated]), mobjThinker, 18),
    20,
    'pending removal and other mobj types excluded',
  );
  assertEquals(
    P_CountActiveSkulls(
      makeThinkerCap([...active, { function: mobjThinker, __mobj: { type: 18 } }]),
      mobjThinker,
      18,
    ),
    21,
    'twenty-one active skull thinkers counted',
  );
});
