import { describe, expect, it } from 'vitest';
import { folderNameFrom, joinPath, matchRoot } from './paths.js';

const ROOTS = ['/tv', '/kids_tv', '/adult', '/anime_tv', '/christmas_tv', '/instructional_tv'];

describe('matchRoot', () => {
  it('matches the containing root of a series path', () => {
    expect(matchRoot('/anime_tv/Berserk of Gluttony', ROOTS)).toBe('/anime_tv');
    expect(matchRoot('/tv/Road Wars (2022)', ROOTS)).toBe('/tv');
  });

  it('matches on a path boundary, not a bare string prefix', () => {
    // "/tv" must NOT match "/tvshows/..." — only "/tvshows" would.
    expect(matchRoot('/tvshows/Foo', ROOTS)).toBeNull();
    expect(matchRoot('/anime_tv2/Foo', ROOTS)).toBeNull();
  });

  it('picks the LONGEST (most specific) root when several are prefixes', () => {
    const roots = ['/media', '/media/tv'];
    expect(matchRoot('/media/tv/Show', roots)).toBe('/media/tv');
  });

  it('handles the path equal to the root and trailing slashes', () => {
    expect(matchRoot('/tv', ROOTS)).toBe('/tv');
    expect(matchRoot('/tv/Show/', ROOTS)).toBe('/tv');
  });

  it('returns null when nothing matches (edge case → caller keeps full path)', () => {
    expect(matchRoot('/somewhere/else/Show', ROOTS)).toBeNull();
  });
});

describe('folderNameFrom', () => {
  it('extracts the folder name under the root', () => {
    expect(folderNameFrom('/anime_tv/Berserk of Gluttony', '/anime_tv')).toBe('Berserk of Gluttony');
    expect(folderNameFrom('/tv/Road Wars (2022)', '/tv')).toBe('Road Wars (2022)');
  });

  it('returns empty when the root is not a prefix', () => {
    expect(folderNameFrom('/tv/Show', '/anime_tv')).toBe('');
  });

  it('handles nested folder names and trailing slashes', () => {
    expect(folderNameFrom('/media/tv/Kids/Bluey/', '/media/tv')).toBe('Kids/Bluey');
  });
});

describe('joinPath', () => {
  it('assembles root + folder into a full path', () => {
    expect(joinPath('/kids_tv', 'Bluey')).toBe('/kids_tv/Bluey');
  });

  it('normalizes stray slashes and blank folder names', () => {
    expect(joinPath('/tv/', '/Show/')).toBe('/tv/Show');
    expect(joinPath('/tv', '')).toBe('/tv');
  });

  it('round-trips a real move: /anime_tv → /tv keeps the folder name', () => {
    const path = '/anime_tv/Berserk of Gluttony';
    const name = folderNameFrom(path, matchRoot(path, ROOTS)!);
    expect(joinPath('/tv', name)).toBe('/tv/Berserk of Gluttony');
  });
});
