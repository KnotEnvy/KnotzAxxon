// Source-derived representatives, not invented public difficulty modes.
import { Level } from '../../../src/world/Level.js';
export const bands = [0, 1, 2, 3, 7, 30].map(loop => {
  const level = new Level(1, loop);
  return {
  loop, botEpisodes: loop === 30 ? 100 : 180, liveEpisodes: 10,
  fixture: 'seeded-loop-start',
  sectors: level.sectors.map(s => ({
    index: s.index, name: s.name, kind: s.kind, threat: s.threat,
    rawDifficulty: level.difficultyAt(s.zStart),
    combatDifficulty: Math.min(1, level.difficultyAt(s.zStart)),
    entryPace: level.paceAt(s.zStart),
  })),
}; });
export const boundaryLoops = [4, 6, 7, 9, 12, 13, 30];
if (process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href) {
  process.stdout.write(JSON.stringify({ bands, boundaryLoops }, null, 2) + '\n');
}
