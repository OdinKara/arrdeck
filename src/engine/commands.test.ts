import { describe, expect, it } from 'vitest';
import {
  buildSeriesUpdatePayload,
  seriesSearchCommand,
  seasonSearchCommand,
  episodeSearchCommand,
  buildMovieUpdatePayload,
  moviesSearchCommand,
} from './commands.js';

const raw = {
  id: 150,
  title: 'Contraband: Seized at the Border',
  monitored: true,
  monitorNewItems: 'all',
  seasonFolder: true,
  qualityProfileId: 6,
  seriesType: 'standard',
  path: '/tv/Contraband - Seized at the Border',
  tags: [5, 1, 6],
  languageProfileId: 1,
  seasons: [
    { seasonNumber: 1, monitored: false },
    { seasonNumber: 9, monitored: true },
  ],
};

describe('buildSeriesUpdatePayload', () => {
  it('applies only the provided fields and preserves the rest', () => {
    const out = buildSeriesUpdatePayload(raw, { monitored: false, qualityProfileId: 4 });
    expect(out.monitored).toBe(false);
    expect(out.qualityProfileId).toBe(4);
    // untouched fields preserved (crucial — a PUT must carry the whole object)
    expect(out.title).toBe('Contraband: Seized at the Border');
    expect(out.path).toBe('/tv/Contraband - Seized at the Border');
    expect(out.languageProfileId).toBe(1);
    expect(out.seriesType).toBe('standard');
  });

  it('does not mutate the original raw object', () => {
    buildSeriesUpdatePayload(raw, { monitored: false, tags: [1] });
    expect(raw.monitored).toBe(true);
    expect(raw.tags).toEqual([5, 1, 6]);
  });

  it('replaces tags and edits path / seriesType / monitorNewItems', () => {
    const out = buildSeriesUpdatePayload(raw, {
      tags: [1, 4],
      path: '/tv/New Path',
      seriesType: 'anime',
      monitorNewItems: 'none',
      seasonFolder: false,
    });
    expect(out.tags).toEqual([1, 4]);
    expect(out.path).toBe('/tv/New Path');
    expect(out.seriesType).toBe('anime');
    expect(out.monitorNewItems).toBe('none');
    expect(out.seasonFolder).toBe(false);
  });

  it('sets rootFolderPath and path together (root change)', () => {
    const out = buildSeriesUpdatePayload(raw, {
      rootFolderPath: '/tv',
      path: '/tv/Contraband - Seized at the Border',
    });
    expect(out.rootFolderPath).toBe('/tv');
    expect(out.path).toBe('/tv/Contraband - Seized at the Border');
  });

  it('patches per-season monitored without touching other seasons', () => {
    const out = buildSeriesUpdatePayload(raw, { seasonMonitored: { 1: true } });
    const seasons = out.seasons as Array<{ seasonNumber: number; monitored: boolean }>;
    expect(seasons.find((s) => s.seasonNumber === 1)?.monitored).toBe(true);
    expect(seasons.find((s) => s.seasonNumber === 9)?.monitored).toBe(true); // unchanged
    // original untouched
    expect((raw.seasons[0] as { monitored: boolean }).monitored).toBe(false);
  });
});

describe('search command builders', () => {
  it('SeriesSearch carries the series id', () => {
    expect(seriesSearchCommand(150)).toEqual({ name: 'SeriesSearch', seriesId: 150 });
  });
  it('SeasonSearch carries series id + season number', () => {
    expect(seasonSearchCommand(150, 9)).toEqual({
      name: 'SeasonSearch',
      seriesId: 150,
      seasonNumber: 9,
    });
  });
  it('EpisodeSearch carries the episode id list', () => {
    expect(episodeSearchCommand([19544])).toEqual({
      name: 'EpisodeSearch',
      episodeIds: [19544],
    });
  });
});

describe('buildMovieUpdatePayload', () => {
  const rawMovie = {
    id: 73,
    title: 'Spider-Man: Brand New Day',
    year: 2026,
    monitored: true,
    minimumAvailability: 'released',
    qualityProfileId: 6,
    path: '/movies/Spider-Man - Brand New Day (2026)',
    rootFolderPath: '/movies',
    tags: [1],
    tmdbId: 12345,
  };

  it('applies only provided fields, preserves the rest, no mutation', () => {
    const out = buildMovieUpdatePayload(rawMovie, {
      monitored: false,
      minimumAvailability: 'announced',
      tags: [1, 4],
    });
    expect(out).toMatchObject({
      monitored: false,
      minimumAvailability: 'announced',
      tags: [1, 4],
      title: 'Spider-Man: Brand New Day',
      tmdbId: 12345,
      qualityProfileId: 6,
    });
    expect(rawMovie.monitored).toBe(true); // original untouched
    expect(rawMovie.tags).toEqual([1]);
  });

  it('sets rootFolderPath and path together for a root change', () => {
    const out = buildMovieUpdatePayload(rawMovie, {
      rootFolderPath: '/kids_movies',
      path: '/kids_movies/Spider-Man - Brand New Day (2026)',
    });
    expect(out.rootFolderPath).toBe('/kids_movies');
    expect(out.path).toBe('/kids_movies/Spider-Man - Brand New Day (2026)');
  });
});

describe('moviesSearchCommand', () => {
  it('uses Radarr\'s MoviesSearch name + movieIds', () => {
    expect(moviesSearchCommand([73])).toEqual({ name: 'MoviesSearch', movieIds: [73] });
  });
});
