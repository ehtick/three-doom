Deno.test('episode and skill menu title patches use the reference coordinates', async () => {
  const source = await Deno.readTextFile(new URL('../src/m_menu.js', import.meta.url));
  const episodeStart = source.indexOf('EPISODE_MENU.draw =');
  const episodeEnd = source.indexOf('function _openEpisodeMenu', episodeStart);
  const skillStart = source.indexOf('SKILL_MENU.draw =');
  const skillEnd = source.indexOf('// m_menu.c:339-372', skillStart);
  const episode = source.slice(episodeStart, episodeEnd);
  const skill = source.slice(skillStart, skillEnd);
  if (!episode.includes("_drawPatchDoom(ctx, 'M_EPISOD', 54, 38") ||
      !skill.includes("_drawPatchDoom(ctx, 'M_NEWG', 96, 14") ||
      !skill.includes("_drawPatchDoom(ctx, 'M_SKILL', 54, 38")) {
    throw new Error('New Game menu headings differ from M_DrawEpisode/M_DrawNewGame');
  }
  if (!source.includes("const EPISODE_MENU = { name: 'Episode', x: 48, y: 63") ||
      !source.includes("const SKILL_MENU = { name: 'Skill', x: 48, y: 63")) {
    throw new Error('title restoration changed the reference item geometry');
  }
});
