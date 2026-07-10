import { describe, expect, it } from 'vitest';
import { rankSearchResults, unifiedSearch, type SearchResult } from './search.js';
import { type RadarrClient, type RadarrLookupResult, type RadarrMovie } from './clients/radarr.js';
import { type SonarrClient, type SonarrLookupResult, type SonarrSeries } from './clients/sonarr.js';

// --- fake clients (only the methods unifiedSearch calls) -------------------

function fakeRadarr(
  hits: Partial<RadarrLookupResult>[],
  lib: Partial<RadarrMovie>[] = [],
): RadarrClient {
  return {
    lookup: async () =>
      hits.map((h) => ({
        title: '',
        year: 0,
        tmdbId: 0,
        overview: '',
        genres: [],
        rating: 0,
        runtime: 0,
        certification: '',
        monitored: false,
        inLibrary: false,
        popularity: 0,
        raw: {},
        ...h,
      })) as RadarrLookupResult[],
    getMovies: async () =>
      lib.map((m) => ({
        id: 1,
        title: '',
        year: 0,
        tmdbId: 0,
        monitored: false,
        hasFile: false,
        added: '',
        ...m,
      })) as RadarrMovie[],
  } as unknown as RadarrClient;
}

function fakeSonarr(
  hits: Partial<SonarrLookupResult>[],
  lib: Partial<SonarrSeries>[] = [],
): SonarrClient {
  return {
    lookup: async () =>
      hits.map((h) => ({
        title: '',
        year: 0,
        tvdbId: 0,
        overview: '',
        network: '',
        genres: [],
        rating: 0,
        seasonCount: 0,
        certification: '',
        monitored: false,
        inLibrary: false,
        popularity: 0,
        raw: {},
        ...h,
      })) as SonarrLookupResult[],
    getSeries: async () =>
      lib.map((s) => ({
        id: 1,
        title: '',
        year: 0,
        monitored: false,
        added: '',
        episodeCount: 0,
        episodeFileCount: 0,
        ...s,
      })) as SonarrSeries[],
  } as unknown as SonarrClient;
}

describe('unifiedSearch', () => {
  it('routes movie hits to kind=movie and show hits to kind=show', async () => {
    const radarr = fakeRadarr([{ title: 'Dune', year: 2021, tmdbId: 438631, runtime: 155 }]);
    const sonarr = fakeSonarr([{ title: 'Dune: The Sisterhood', year: 2024, tvdbId: 999, seasonCount: 1 }]);

    const results = await unifiedSearch('dune', { radarr, sonarr });
    const movie = results.find((r) => r.tmdbId === 438631)!;
    const show = results.find((r) => r.tvdbId === 999)!;

    expect(movie.kind).toBe('movie');
    expect(movie.runtimeOrEpisodes).toBe('155 min');
    expect(show.kind).toBe('show');
    expect(show.runtimeOrEpisodes).toBe('1 season');
  });

  it('pluralizes multi-season shows', async () => {
    const sonarr = fakeSonarr([{ title: 'Severance', year: 2022, tvdbId: 371980, seasonCount: 2 }]);
    const [r] = await unifiedSearch('severance', { sonarr });
    expect(r?.runtimeOrEpisodes).toBe('2 seasons');
  });

  it('marks a movie inLibrary when its tmdbId matches getMovies', async () => {
    const radarr = fakeRadarr(
      [{ title: 'Dune', year: 2021, tmdbId: 438631, inLibrary: false }],
      [{ tmdbId: 438631, hasFile: true }], // owned in the library
    );
    const [r] = await unifiedSearch('dune', { radarr });
    expect(r?.inLibrary).toBe(true);
  });

  it('does NOT mark inLibrary when tmdbId is absent from the library', async () => {
    const radarr = fakeRadarr(
      [{ title: 'Dune: Part Two', year: 2024, tmdbId: 693134, inLibrary: false }],
      [{ tmdbId: 438631 }], // a different movie is owned
    );
    const [r] = await unifiedSearch('dune part two', { radarr });
    expect(r?.inLibrary).toBe(false);
  });

  it('falls back to the show lookup inLibrary flag (Sonarr getSeries has no tvdbId)', async () => {
    const sonarr = fakeSonarr([
      { title: 'Severance', year: 2022, tvdbId: 371980, inLibrary: true },
    ]);
    const [r] = await unifiedSearch('severance', { sonarr });
    expect(r?.inLibrary).toBe(true);
  });

  it('sorts an EXACT title match ahead of a higher-rated partial match', async () => {
    const radarr = fakeRadarr([
      { title: 'Dune: Part Two', year: 2024, tmdbId: 2, rating: 9 }, // partial, higher rating
      { title: 'Dune', year: 2021, tmdbId: 1, rating: 8 }, // exact match, lower rating
    ]);
    const results = await unifiedSearch('dune', { radarr });
    expect(results[0]?.tmdbId).toBe(1); // exact wins despite lower rating
  });

  it('still returns Radarr results if Sonarr lookup throws (resilient fan-out)', async () => {
    const radarr = fakeRadarr([{ title: 'Dune', tmdbId: 1 }]);
    const sonarr = {
      lookup: async () => {
        throw new Error('sonarr down');
      },
      getSeries: async () => [],
    } as unknown as SonarrClient;
    const results = await unifiedSearch('dune', { radarr, sonarr });
    expect(results).toHaveLength(1);
    expect(results[0]?.kind).toBe('movie');
  });

  it('returns [] when no clients are provided', async () => {
    expect(await unifiedSearch('anything', {})).toEqual([]);
  });
});

// --- ranking tweak (the Phase-2 tuning note) -------------------------------

function sr(p: Partial<SearchResult>): SearchResult {
  return {
    kind: 'movie',
    title: '',
    year: 0,
    overview: '',
    rating: 0,
    runtimeOrEpisodes: '',
    genres: [],
    inLibrary: false,
    certification: '',
    popularity: 0,
    raw: {},
    ...p,
  };
}

describe('rankSearchResults (relevance tuning)', () => {
  it('surfaces the popular marquee title over identically-named obscure ones', () => {
    // The real "Severance (2022)" (395k votes) must beat same-tier short films.
    const ranked = rankSearchResults(
      [
        sr({ title: 'Severance', year: 2015, popularity: 12, rating: 5 }),
        sr({ title: 'Severance', year: 2020, popularity: 3, rating: 0 }),
        sr({ title: 'Severance', year: 2022, kind: 'show', popularity: 395320, rating: 8.6 }),
        sr({ title: 'Severance', year: 2006, popularity: 40000, rating: 6.4 }),
      ],
      'severance',
    );
    expect(ranked[0]?.year).toBe(2022); // marquee show wins its exact-match tier
    expect(ranked[1]?.year).toBe(2006); // next most-voted exact match
  });

  it('keeps exact-title matches above mere partial matches regardless of popularity', () => {
    const ranked = rankSearchResults(
      [
        sr({ title: 'Dune: Part Two', tmdbId: 2, popularity: 999999 }), // partial, very popular
        sr({ title: 'Dune', tmdbId: 1, popularity: 10 }), // exact, unpopular
      ],
      'dune',
    );
    expect(ranked[0]?.tmdbId).toBe(1); // exact tier still dominates
  });

  it('boosts an in-library title above a same-tier, more-popular non-owned one', () => {
    const ranked = rankSearchResults(
      [
        sr({ title: 'Dune', tmdbId: 2, popularity: 500000, inLibrary: false }),
        sr({ title: 'Dune', tmdbId: 1, popularity: 1000, inLibrary: true }),
      ],
      'dune',
    );
    expect(ranked[0]?.tmdbId).toBe(1); // owned surfaces first within the tier
  });
});
