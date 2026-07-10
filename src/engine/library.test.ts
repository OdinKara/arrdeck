import { describe, expect, it } from 'vitest';
import { deriveSeasons, isAired } from './library.js';
import type { SonarrEpisode } from './clients/sonarr.js';

const NOW = Date.parse('2026-07-07T00:00:00Z');

function ep(p: Partial<SonarrEpisode>): SonarrEpisode {
  return {
    id: Math.round(Math.random() * 1e9),
    seriesId: 1,
    seasonNumber: 1,
    episodeNumber: 1,
    title: '',
    airDate: '',
    hasFile: false,
    monitored: true,
    episodeFileId: 0,
    ...p,
  };
}

describe('isAired', () => {
  it('past air date is aired, future is not, TBA (empty) is not', () => {
    expect(isAired('2020-01-01', NOW)).toBe(true);
    expect(isAired('2099-01-01', NOW)).toBe(false);
    expect(isAired('', NOW)).toBe(false);
    expect(isAired(null, NOW)).toBe(false);
    expect(isAired('not-a-date', NOW)).toBe(false);
  });
});

describe('deriveSeasons', () => {
  it('computes have / total / missing with aired + monitored logic', () => {
    const episodes = [
      ep({ seasonNumber: 1, episodeNumber: 1, airDate: '2026-01-01', hasFile: true }), // have (aired)
      ep({ seasonNumber: 1, episodeNumber: 2, airDate: '2026-02-01', hasFile: false, monitored: true }), // MISSING (aired, monitored, no file)
      ep({ seasonNumber: 1, episodeNumber: 3, airDate: '2026-02-08', hasFile: false, monitored: false }), // aired but unmonitored -> not missing
      ep({ seasonNumber: 1, episodeNumber: 4, airDate: '2099-01-01', hasFile: false, monitored: true }), // future -> unaired, not missing/total
      ep({ seasonNumber: 1, episodeNumber: 5, airDate: '', hasFile: false, monitored: true }), // TBA -> unaired
    ];
    const [s1] = deriveSeasons([{ seasonNumber: 1, monitored: true }], episodes, NOW);
    expect(s1?.haveCount).toBe(1);
    expect(s1?.totalCount).toBe(3); // ep1,2,3 aired; ep4 future, ep5 TBA excluded
    expect(s1?.missingCount).toBe(1); // only ep2
    expect(s1?.episodes).toHaveLength(5);
    expect(s1?.episodes[3]?.aired).toBe(false); // future
    expect(s1?.episodes[4]?.aired).toBe(false); // TBA
  });

  it('a file on a not-yet-aired episode still counts as available (have <= total)', () => {
    const episodes = [
      ep({ seasonNumber: 2, episodeNumber: 1, airDate: '2099-01-01', hasFile: true }), // future but downloaded
    ];
    const [s2] = deriveSeasons([{ seasonNumber: 2, monitored: true }], episodes, NOW);
    expect(s2?.haveCount).toBe(1);
    expect(s2?.totalCount).toBe(1); // counted as aired because it has a file
    expect(s2?.missingCount).toBe(0);
  });

  it('orders seasons newest-first with Specials (season 0) LAST', () => {
    const episodes = [
      ep({ seasonNumber: 0, episodeNumber: 1, airDate: '2026-01-01' }),
      ep({ seasonNumber: 1, episodeNumber: 1, airDate: '2026-01-01' }),
      ep({ seasonNumber: 3, episodeNumber: 1, airDate: '2026-01-01' }),
      ep({ seasonNumber: 2, episodeNumber: 1, airDate: '2026-01-01' }),
    ];
    const rollups = deriveSeasons(
      [0, 1, 2, 3].map((n) => ({ seasonNumber: n, monitored: true })),
      episodes,
      NOW,
    );
    expect(rollups.map((r) => r.seasonNumber)).toEqual([3, 2, 1, 0]);
  });

  it('carries per-season monitored flag (Specials often unmonitored)', () => {
    const episodes = [ep({ seasonNumber: 0, episodeNumber: 1, airDate: '2026-01-01' })];
    const [special] = deriveSeasons([{ seasonNumber: 0, monitored: false }], episodes, NOW);
    expect(special?.monitored).toBe(false);
  });

  it('handles an empty episode list', () => {
    expect(deriveSeasons([{ seasonNumber: 1, monitored: true }], [], NOW)).toEqual([]);
  });
});
