import { describe, expect, it } from 'vitest';
import {
  addAddress,
  buildBaseUrl,
  hostOf,
  labelAt,
  maskKey,
  portOf,
  removeAddressAt,
  setApiKey,
} from './services.js';
import { WinnerCache, raceAddresses, resolveService } from './race.js';
import type { Probe, ServiceConfig } from './types.js';

const base: ServiceConfig = { kind: 'sonarr', addresses: ['http://192.168.1.100:8989'], apiKey: 'k' };

describe('buildBaseUrl', () => {
  it('assembles http://host:port', () => {
    expect(buildBaseUrl('192.168.1.100', 8989)).toBe('http://192.168.1.100:8989');
    expect(buildBaseUrl('sonarr.example.com', '8989')).toBe('http://sonarr.example.com:8989');
  });
  it('strips scheme, path, and any port typed into the host', () => {
    expect(buildBaseUrl('https://100.64.0.1:1234/foo', 8989)).toBe('http://100.64.0.1:8989');
  });
});

describe('portOf / hostOf', () => {
  it('extracts port and host, with fallback', () => {
    expect(portOf('http://192.168.1.100:8989', 7878)).toBe(8989);
    expect(portOf('http://192.168.1.100', 7878)).toBe(7878);
    expect(hostOf('http://192.168.1.100:8989')).toBe('192.168.1.100');
  });
});

describe('addAddress', () => {
  it('appends a base URL with its label, no mutation', () => {
    const next = addAddress(base, '100.64.0.1', 8989, 'remote');
    expect(next.addresses).toEqual(['http://192.168.1.100:8989', 'http://100.64.0.1:8989']);
    expect(next.addressLabels).toEqual([null, 'remote']);
    expect(labelAt(next, 1)).toBe('remote');
    expect(base.addresses).toHaveLength(1); // original untouched
  });
  it('ignores exact-duplicate URLs', () => {
    const next = addAddress(base, '192.168.1.100', 8989, 'local');
    expect(next.addresses).toHaveLength(1);
  });
});

describe('removeAddressAt', () => {
  it('removes an address + its label', () => {
    const two = addAddress(base, '100.64.0.1', 8989, 'remote');
    const back = removeAddressAt(two, 1);
    expect(back.addresses).toEqual(['http://192.168.1.100:8989']);
    expect(back.addressLabels).toEqual([null]);
  });
  it('CANNOT remove the last address (no-op)', () => {
    expect(removeAddressAt(base, 0)).toBe(base);
  });
});

describe('setApiKey / maskKey', () => {
  it('replaces the key immutably', () => {
    const next = setApiKey(base, 'newkey');
    expect(next.apiKey).toBe('newkey');
    expect(base.apiKey).toBe('k');
  });
  it('masks all but the last 4 chars', () => {
    expect(maskKey('FAKEKEYFAKEKEYFAKEKEYFAKEKEY5778')).toBe('••••••••5778');
    expect(maskKey('ab')).toBe('••');
  });
});

// The moat: a two-address config must connect via whichever answers.
describe('multi-address race (failover)', () => {
  const good = 'http://good';
  const bad = 'http://bad';
  const probe: Probe = (url) =>
    new Promise((r) => setTimeout(() => r(url === good), url === good ? 5 : 50));

  it('connects via the reachable address when the OTHER is bogus (either order)', async () => {
    expect(await raceAddresses([bad, good], probe, 500)).toBe(good);
    expect(await raceAddresses([good, bad], probe, 500)).toBe(good);
  });

  it('resolveService returns the reachable winner from a 2-address config', async () => {
    const cfg: ServiceConfig = { kind: 'sonarr', addresses: [bad, good], apiKey: 'k' };
    const cache = new WinnerCache();
    const res = await resolveService(cfg, { probe, cache });
    expect(res?.address).toBe(good);
  });
});

describe('cache invalidation on config change', () => {
  const cfgA: ServiceConfig = { kind: 'sonarr', addresses: ['http://a'], apiKey: 'k' };
  it('a changed address set does not hit the old cached winner, and invalidate clears it', () => {
    const cache = new WinnerCache();
    cache.set(cfgA, { address: 'http://a', latencyMs: 3 });
    expect(cache.get(cfgA)?.address).toBe('http://a');
    // Adding an address changes the cache key → old winner not served.
    const cfgB = addAddress(cfgA, 'b', 8989, 'remote');
    expect(cache.get(cfgB)).toBeNull();
    // Explicit invalidation clears the original entry too.
    cache.invalidate(cfgA);
    expect(cache.get(cfgA)).toBeNull();
  });
});
