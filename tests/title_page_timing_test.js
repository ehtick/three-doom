const source = await Deno.readTextFile(new URL('../src/d_main.js', import.meta.url));

Deno.test('attract loop keeps TITLEPIC for the reference duration', () => {
  const advanceDemo = source.slice(
    source.indexOf('function D_DoAdvanceDemo()'),
    source.indexOf('let _gPlayDemo'),
  );
  const titleCase = advanceDemo.slice(
    advanceDemo.indexOf('case 0:'),
    advanceDemo.indexOf('case 1:', advanceDemo.indexOf('case 0:')),
  );
  if (!titleCase.includes('pagetic = isCommercial ? (35 * 11) : 170;')) {
    throw new Error('TITLEPIC is not timed to 385 commercial / 170 noncommercial tics');
  }
});
