import { afterEach, describe, expect, it, vi } from 'vitest';
import { RadarrClient } from './radarr.js';
import { SabClient } from './sabnzbd.js';
import { ProwlarrClient, deriveIndexerHealth } from './prowlarr.js';
import { SonarrClient } from './sonarr.js';

/** Stub global fetch with a handler keyed off the requested URL. */
function stubFetch(handler: (url: string) => { status?: number; body: unknown }): void {
  vi.stubGlobal('fetch', async (input: string | URL) => {
    const url = String(input);
    const { status = 200, body } = handler(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      statusText: 'OK',
      headers: new Headers(),
      json: async () => body,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    } as unknown as Response;
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('RadarrClient parsing', () => {
  it('normalizes lookup: poster remoteUrl, nested ratings, runtime, certification', async () => {
    stubFetch(() => ({
      body: [
        {
          title: 'Dune',
          year: 2021,
          tmdbId: 438631,
          overview: 'Paul Atreides...',
          runtime: 155,
          certification: 'PG-13',
          genres: ['Science Fiction', 'Adventure'],
          images: [{ coverType: 'poster', url: '/rel.jpg', remoteUrl: 'https://cdn/x.jpg' }],
          ratings: { imdb: { value: 8 }, tmdb: { value: 7.8 } },
          id: 0,
        },
      ],
    }));
    const client = new RadarrClient('http://x:7878', 'k');
    const [r] = await client.lookup('dune');
    expect(r).toMatchObject({
      title: 'Dune',
      year: 2021,
      tmdbId: 438631,
      runtime: 155,
      certification: 'PG-13',
      rating: 8, // imdb preferred
      posterUrl: 'https://cdn/x.jpg', // remoteUrl preferred over relative url
      inLibrary: false,
    });
    expect(r?.genres).toEqual(['Science Fiction', 'Adventure']);
  });

  it('getMovies maps hasFile/monitored/tmdbId', async () => {
    stubFetch(() => ({
      body: [{ id: 5, title: 'Dune', year: 2021, tmdbId: 438631, monitored: true, hasFile: true }],
    }));
    const [m] = await new RadarrClient('http://x:7878', 'k').getMovies();
    expect(m).toMatchObject({ id: 5, title: 'Dune', year: 2021, tmdbId: 438631, monitored: true, hasFile: true });
  });

  it('getQueue computes progress from size/sizeleft under records[]', async () => {
    stubFetch(() => ({
      body: { records: [{ id: 1, title: 'X', size: 100, sizeleft: 25, status: 'downloading' }] },
    }));
    const [q] = await new RadarrClient('http://x:7878', 'k').getQueue();
    expect(q?.progress).toBe(75);
  });

  it('throws with a clear message on a non-OK response', async () => {
    stubFetch(() => ({ status: 401, body: 'unauthorized' }));
    await expect(new RadarrClient('http://x:7878', 'bad').getMovies()).rejects.toThrow(/Radarr .* HTTP 401/);
  });
});

describe('SabClient parsing', () => {
  it('parses queue slots into UI fields (nzoId/percent/eta)', async () => {
    stubFetch(() => ({
      body: {
        queue: {
          paused: false,
          speed: '3.2 M',
          diskspace1_norm: '1.2 T',
          slots: [
            { nzo_id: 'SABnzbd_nzo_x', filename: 'Some.Movie', percentage: '42', mb: '1500', timeleft: '0:04:12', status: 'Downloading' },
          ],
        },
      },
    }));
    const q = await new SabClient('http://x:8080', 'k').getQueue();
    expect(q.paused).toBe(false);
    expect(q.speed).toBe('3.2 M');
    expect(q.diskFree).toBe('1.2 T');
    expect(q.items[0]).toMatchObject({
      nzoId: 'SABnzbd_nzo_x',
      name: 'Some.Movie',
      percent: 42,
      sizeMB: 1500,
      etaText: '0:04:12',
      status: 'Downloading',
    });
  });

  it('getVersion reads the version string', async () => {
    stubFetch(() => ({ body: { version: '5.0.4' } }));
    expect((await new SabClient('http://x:8080', 'k').getVersion()).version).toBe('5.0.4');
  });

  it('surfaces SABnzbd {status:false,error} as a thrown error', async () => {
    stubFetch(() => ({ body: { status: false, error: 'API Key Incorrect' } }));
    await expect(new SabClient('http://x:8080', 'bad').getQueue()).rejects.toThrow(/API Key Incorrect/);
  });
});

describe('ProwlarrClient health', () => {
  it('reports X/Y healthy — all healthy when indexerstatus is empty', async () => {
    stubFetch((url) => {
      if (url.endsWith('/indexer')) {
        return {
          body: [
            { id: 1, name: 'NZBGeek', enable: true, protocol: 'usenet' },
            { id: 2, name: 'Nyaa', enable: true, protocol: 'torrent' },
          ],
        };
      }
      if (url.endsWith('/indexerstatus')) return { body: [] };
      return { body: {} };
    });
    const health = await new ProwlarrClient('http://x:9696', 'k').getHealth();
    expect(health).toMatchObject({ total: 2, enabled: 2, healthy: 2, unhealthy: [] });
  });

  it('counts a currently-disabled indexer as unhealthy', async () => {
    const future = '2999-01-01T00:00:00Z';
    stubFetch((url) => {
      if (url.endsWith('/indexer')) {
        return {
          body: [
            { id: 1, name: 'Good', enable: true, protocol: 'usenet' },
            { id: 2, name: 'Flaky', enable: true, protocol: 'usenet' },
          ],
        };
      }
      if (url.endsWith('/indexerstatus')) {
        return { body: [{ indexerId: 2, disabledTill: future, mostRecentFailure: '2026-01-01T00:00:00Z' }] };
      }
      return { body: {} };
    });
    const health = await new ProwlarrClient('http://x:9696', 'k').getHealth(undefined, Date.parse('2026-07-07T00:00:00Z'));
    expect(health).toMatchObject({ enabled: 2, healthy: 1, unhealthy: ['Flaky'] });
  });
});

describe('deriveIndexerHealth', () => {
  const NOW = Date.parse('2026-07-07T23:00:00Z');
  const indexers = [
    { id: 1, name: 'NZBgeek', enable: true, protocol: 'usenet' },
    { id: 10, name: 'AnimeTosho', enable: true, protocol: 'usenet' },
    { id: 9, name: 'IPTorrents', enable: false, protocol: 'torrent' },
  ];

  it('marks an enabled indexer backing off (future disabledTill) as unhealthy with failure info', () => {
    const rows = deriveIndexerHealth(
      indexers,
      [{ indexerId: 10, disabledTill: '2026-07-08T03:36:50Z', mostRecentFailure: '2026-07-07T21:36:50Z' }],
      NOW,
    );
    const geek = rows.find((r) => r.id === 1)!;
    const tosho = rows.find((r) => r.id === 10)!;
    const ipt = rows.find((r) => r.id === 9)!;
    expect(geek.healthy).toBe(true);
    expect(tosho.healthy).toBe(false);
    expect(tosho.disabledTill).toBe('2026-07-08T03:36:50Z');
    expect(tosho.mostRecentFailure).toBe('2026-07-07T21:36:50Z');
    expect(ipt.enabled).toBe(false);
    expect(ipt.healthy).toBe(false); // disabled -> not healthy
  });

  it('treats a past disabledTill as recovered (healthy)', () => {
    const rows = deriveIndexerHealth(
      indexers,
      [{ indexerId: 10, disabledTill: '2026-07-06T00:00:00Z', mostRecentFailure: '2026-07-06T00:00:00Z' }],
      NOW,
    );
    expect(rows.find((r) => r.id === 10)!.healthy).toBe(true);
  });
});

describe('SonarrClient library surface (Phase L1)', () => {
  it('getEpisodes parses season/episode/airDate/hasFile/monitored', async () => {
    stubFetch(() => ({
      body: [
        { id: 1, seriesId: 111, seasonNumber: 7, episodeNumber: 9, title: 'Ep', airDate: '2026-04-07', hasFile: false, monitored: true, episodeFileId: 0 },
        { id: 2, seriesId: 111, seasonNumber: 0, episodeNumber: 1, title: 'Special', airDate: '2023-05-02', hasFile: false, monitored: false, episodeFileId: 0 },
      ],
    }));
    const eps = await new SonarrClient('http://x:8989', 'k').getEpisodes(111);
    expect(eps).toHaveLength(2);
    expect(eps[0]).toMatchObject({ seasonNumber: 7, episodeNumber: 9, airDate: '2026-04-07', hasFile: false, monitored: true });
    expect(eps[1]?.seasonNumber).toBe(0);
  });

  it('getSeriesById parses header fields + seasons[] statistics', async () => {
    stubFetch(() => ({
      body: {
        id: 111,
        title: 'Road Wars',
        year: 2022,
        status: 'continuing',
        network: 'A&E',
        runtime: 22,
        qualityProfileId: 6,
        path: '/tv/Road Wars (2022)',
        monitored: true,
        titleSlug: 'road-wars-2022',
        ratings: { value: 7.1, votes: 100 },
        images: [{ coverType: 'poster', remoteUrl: 'https://cdn/p.jpg' }],
        seasons: [
          { seasonNumber: 0, monitored: false, statistics: { episodeFileCount: 0, episodeCount: 0, totalEpisodeCount: 15, percentOfEpisodes: 0 } },
          { seasonNumber: 7, monitored: true, statistics: { episodeFileCount: 8, episodeCount: 10, totalEpisodeCount: 10, percentOfEpisodes: 80 } },
        ],
      },
    }));
    const s = await new SonarrClient('http://x:8989', 'k').getSeriesById(111);
    expect(s).toMatchObject({ title: 'Road Wars', status: 'continuing', network: 'A&E', runtime: 22, path: '/tv/Road Wars (2022)', titleSlug: 'road-wars-2022', rating: 7.1 });
    expect(s.posterUrl).toBe('https://cdn/p.jpg');
    expect(s.seasons).toHaveLength(2);
    expect(s.seasons.find((x) => x.seasonNumber === 7)).toMatchObject({ episodeFileCount: 8, episodeCount: 10 });
  });

  it('getSeries includes statistics counts for the grid badge', async () => {
    stubFetch(() => ({
      body: [
        { id: 5, title: 'Show', year: 2022, monitored: true, added: '2026-01-01', statistics: { episodeCount: 20, episodeFileCount: 18 } },
      ],
    }));
    const [s] = await new SonarrClient('http://x:8989', 'k').getSeries();
    expect(s).toMatchObject({ episodeCount: 20, episodeFileCount: 18 });
  });
});

describe('SonarrClient interactive search (Slice 2)', () => {
  it('getEpisodeReleases hits /release?episodeId= and maps the shared shape', async () => {
    let seenUrl = '';
    stubFetch((url) => {
      seenUrl = url;
      return {
        body: [
          {
            title: 'Show.S02E05.1080p.WEB',
            indexer: 'NZBgeek (Prowlarr)',
            indexerId: 1,
            guid: 'https://nzbgeek.info/x?guid=abc',
            size: 1234567,
            quality: { quality: { name: 'WEBDL-1080p', resolution: 1080 } },
            qualityWeight: 700,
            languages: [{ id: 1, name: 'English' }],
            customFormatScore: 15,
            seeders: null,
            leechers: null,
            ageHours: 12.5,
            age: 0,
            publishDate: '2026-07-01T00:00:00Z',
            rejected: false,
            rejections: [],
            protocol: 'usenet',
            releaseGroup: 'NTb',
          },
        ],
      };
    });
    const [r] = await new SonarrClient('http://x:8989', 'k').getEpisodeReleases(42);
    expect(seenUrl).toBe('http://x:8989/api/v3/release?episodeId=42');
    expect(r).toMatchObject({
      title: 'Show.S02E05.1080p.WEB',
      indexerId: 1,
      guid: 'https://nzbgeek.info/x?guid=abc',
      size: 1234567,
      quality: { name: 'WEBDL-1080p', resolution: 1080 },
      qualityWeight: 700,
      languages: ['English'],
      customFormatScore: 15,
      seeders: null,
      rejected: false,
      protocol: 'usenet',
      releaseGroup: 'NTb',
    });
  });

  it('getSeasonReleases hits /release?seriesId=&seasonNumber=', async () => {
    let seenUrl = '';
    stubFetch((url) => {
      seenUrl = url;
      return { body: [] };
    });
    await new SonarrClient('http://x:8989', 'k').getSeasonReleases(111, 2);
    expect(seenUrl).toBe('http://x:8989/api/v3/release?seriesId=111&seasonNumber=2');
  });

  it('grabRelease POSTs { guid, indexerId } to /release', async () => {
    let seen: { url: string; method?: string; body?: string } = { url: '' };
    vi.stubGlobal('fetch', async (input: string | URL, init?: RequestInit) => {
      seen = { url: String(input), method: init?.method, body: init?.body as string };
      return {
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        json: async () => ({}),
        text: async () => '{}',
      } as unknown as Response;
    });
    await new SonarrClient('http://x:8989', 'k').grabRelease('https://nzbgeek.info/x?guid=abc', 1);
    expect(seen.url).toBe('http://x:8989/api/v3/release');
    expect(seen.method).toBe('POST');
    expect(JSON.parse(seen.body ?? '{}')).toEqual({ guid: 'https://nzbgeek.info/x?guid=abc', indexerId: 1 });
  });
});

describe('SonarrClient search surface (Phase 2 extension)', () => {
  it('lookup normalizes seasons->seasonCount, marks inLibrary by id>0', async () => {
    stubFetch(() => ({
      body: [
        {
          title: 'Severance',
          year: 2022,
          tvdbId: 371980,
          overview: 'Mark leads...',
          network: 'Apple TV+',
          certification: 'TV-MA',
          genres: ['Drama'],
          images: [{ coverType: 'poster', remoteUrl: 'https://cdn/s.jpg' }],
          ratings: { imdb: { value: 8.7 } },
          seasons: [{ seasonNumber: 0 }, { seasonNumber: 1 }, { seasonNumber: 2 }],
          id: 12, // already in library
          monitored: true,
        },
      ],
    }));
    const [r] = await new SonarrClient('http://x:8989', 'k').lookup('severance');
    expect(r).toMatchObject({
      title: 'Severance',
      tvdbId: 371980,
      network: 'Apple TV+',
      certification: 'TV-MA',
      rating: 8.7,
      seasonCount: 2, // season 0 (specials) excluded
      inLibrary: true,
    });
  });
});
