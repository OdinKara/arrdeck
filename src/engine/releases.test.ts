import { describe, expect, it } from 'vitest';
import {
  sortReleases,
  filterOutRejected,
  grabReleaseBody,
  type Release,
} from './releases.js';

/** Minimal release factory — override only what a test cares about. */
function rel(over: Partial<Release>): Release {
  return {
    title: 'X',
    indexer: 'NZBgeek',
    indexerId: 1,
    guid: 'g',
    size: 1_000,
    quality: { name: 'Unknown', resolution: 0 },
    qualityWeight: 0,
    languages: ['English'],
    customFormatScore: 0,
    seeders: null,
    leechers: null,
    ageHours: 0,
    age: 0,
    publishDate: '',
    rejected: false,
    rejections: [],
    protocol: 'usenet',
    releaseGroup: null,
    ...over,
  };
}

describe('sortReleases', () => {
  it('quality: qualityWeight desc, tiebreak cfScore then size', () => {
    const a = rel({ guid: 'a', qualityWeight: 10, customFormatScore: 0, size: 5 });
    const b = rel({ guid: 'b', qualityWeight: 20, customFormatScore: 0, size: 1 });
    const c = rel({ guid: 'c', qualityWeight: 20, customFormatScore: 5, size: 1 }); // higher CF than b
    const d = rel({ guid: 'd', qualityWeight: 20, customFormatScore: 5, size: 9 }); // same as c but bigger
    const out = sortReleases([a, b, c, d], 'quality').map((r) => r.guid);
    expect(out).toEqual(['d', 'c', 'b', 'a']);
  });

  it('size: largest first', () => {
    const out = sortReleases(
      [rel({ guid: 's1', size: 100 }), rel({ guid: 's2', size: 900 }), rel({ guid: 's3', size: 400 })],
      'size',
    ).map((r) => r.guid);
    expect(out).toEqual(['s2', 's3', 's1']);
  });

  it('seeders: most seeders first, null (usenet) sinks to the bottom', () => {
    const out = sortReleases(
      [rel({ guid: 'u', seeders: null }), rel({ guid: 't5', seeders: 5 }), rel({ guid: 't50', seeders: 50 })],
      'seeders',
    ).map((r) => r.guid);
    expect(out).toEqual(['t50', 't5', 'u']);
  });

  it('cfScore: highest custom-format score first (handles negatives)', () => {
    const out = sortReleases(
      [rel({ guid: 'neg', customFormatScore: -10 }), rel({ guid: 'hi', customFormatScore: 30 }), rel({ guid: 'mid', customFormatScore: 0 })],
      'cfScore',
    ).map((r) => r.guid);
    expect(out).toEqual(['hi', 'mid', 'neg']);
  });

  it('is pure — does not mutate the input array', () => {
    const input = [rel({ guid: 'a', qualityWeight: 1 }), rel({ guid: 'b', qualityWeight: 2 })];
    const before = input.map((r) => r.guid);
    sortReleases(input, 'quality');
    expect(input.map((r) => r.guid)).toEqual(before);
  });
});

describe('filterOutRejected', () => {
  it('drops rejected releases, keeps the rest', () => {
    const out = filterOutRejected([
      rel({ guid: 'ok1', rejected: false }),
      rel({ guid: 'bad', rejected: true }),
      rel({ guid: 'ok2', rejected: false }),
    ]).map((r) => r.guid);
    expect(out).toEqual(['ok1', 'ok2']);
  });
});

describe('grabReleaseBody', () => {
  it('builds exactly { guid, indexerId } for POST /release', () => {
    expect(grabReleaseBody('https://nzbgeek.info/x?guid=abc', 1)).toEqual({
      guid: 'https://nzbgeek.info/x?guid=abc',
      indexerId: 1,
    });
  });
});
