import { describe, expect, it } from 'vitest';
import { buildRadarrAddPayload, buildSonarrAddPayload } from './add.js';

describe('buildRadarrAddPayload', () => {
  const raw = {
    id: 0,
    title: 'Dune: Part Two',
    year: 2024,
    tmdbId: 693134,
    titleSlug: 'dune-part-two-693134',
    images: [{ coverType: 'poster', remoteUrl: 'https://cdn/x.jpg' }],
  };

  it('carries raw fields and applies the selected options', () => {
    const payload = buildRadarrAddPayload(raw, {
      qualityProfileId: 4,
      rootFolderPath: '/movies',
      monitored: true,
      searchForMovie: true,
    });
    expect(payload).toMatchObject({
      title: 'Dune: Part Two',
      tmdbId: 693134,
      titleSlug: 'dune-part-two-693134',
      qualityProfileId: 4,
      rootFolderPath: '/movies',
      monitored: true,
      minimumAvailability: 'released',
      addOptions: { searchForMovie: true },
    });
    // raw images survive (needed by the service).
    expect(Array.isArray(payload.images)).toBe(true);
  });

  it('strips the lookup id so the POST is treated as an ADD, not an update', () => {
    const payload = buildRadarrAddPayload({ ...raw, id: 55 }, {
      qualityProfileId: 1,
      rootFolderPath: '/movies',
      monitored: true,
      searchForMovie: false,
    });
    expect('id' in payload).toBe(false);
    expect(payload.addOptions).toEqual({ searchForMovie: false });
  });

  it('honors an explicit minimumAvailability override', () => {
    const payload = buildRadarrAddPayload(raw, {
      qualityProfileId: 1,
      rootFolderPath: '/movies',
      monitored: true,
      searchForMovie: false,
      minimumAvailability: 'announced',
    });
    expect(payload.minimumAvailability).toBe('announced');
  });
});

describe('buildSonarrAddPayload', () => {
  const raw = {
    id: 0,
    title: 'Severance',
    tvdbId: 371980,
    titleSlug: 'severance',
    seasons: [{ seasonNumber: 1, monitored: true }],
  };

  it('carries raw fields, sets seasonFolder + monitor + search option', () => {
    const payload = buildSonarrAddPayload(raw, {
      qualityProfileId: 6,
      rootFolderPath: '/tv',
      monitored: true,
      searchForMissingEpisodes: true,
    });
    expect(payload).toMatchObject({
      title: 'Severance',
      tvdbId: 371980,
      qualityProfileId: 6,
      rootFolderPath: '/tv',
      monitored: true,
      seasonFolder: true,
      addOptions: {
        monitor: 'all',
        searchForMissingEpisodes: true,
        searchForCutoffUnmetEpisodes: false,
      },
    });
    expect(Array.isArray(payload.seasons)).toBe(true);
    expect('id' in payload).toBe(false);
  });

  it('respects a non-default monitor selection', () => {
    const payload = buildSonarrAddPayload(raw, {
      qualityProfileId: 6,
      rootFolderPath: '/tv',
      monitored: true,
      searchForMissingEpisodes: false,
      monitor: 'future',
    });
    expect((payload.addOptions as { monitor: string }).monitor).toBe('future');
  });
});
