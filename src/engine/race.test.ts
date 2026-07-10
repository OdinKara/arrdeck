import { describe, expect, it, vi } from 'vitest';
import {
  raceAddresses,
  resolveService,
  WinnerCache,
} from './race.js';
import { type Probe, type ServiceConfig } from './types.js';

/** A probe that succeeds for a given URL after `delayMs`, else fails after its own delay. */
function scriptedProbe(script: Record<string, { ok: boolean; delayMs: number }>): Probe {
  return (url: string) =>
    new Promise((resolve) => {
      const entry = script[url] ?? { ok: false, delayMs: 0 };
      setTimeout(() => resolve(entry.ok), entry.delayMs);
    });
}

describe('raceAddresses (happy-eyeballs)', () => {
  it('resolves with the FASTEST successful address, ignoring slower winners', async () => {
    const probe = scriptedProbe({
      'http://lan': { ok: true, delayMs: 5 },
      'http://remote': { ok: true, delayMs: 100 },
    });
    const winner = await raceAddresses(['http://remote', 'http://lan'], probe, 1000);
    expect(winner).toBe('http://lan');
  });

  it('picks the reachable address even when a faster candidate FAILS', async () => {
    // LAN answers fast but fails (you're away from home); remote wins.
    const probe = scriptedProbe({
      'http://lan': { ok: false, delayMs: 5 },
      'http://remote': { ok: true, delayMs: 40 },
    });
    const winner = await raceAddresses(['http://lan', 'http://remote'], probe, 1000);
    expect(winner).toBe('http://remote');
  });

  it('returns null when ALL candidates fail', async () => {
    const probe = scriptedProbe({
      'http://a': { ok: false, delayMs: 5 },
      'http://b': { ok: false, delayMs: 10 },
    });
    const winner = await raceAddresses(['http://a', 'http://b'], probe, 1000);
    expect(winner).toBeNull();
  });

  it('returns null for an empty address list', async () => {
    const probe = scriptedProbe({});
    expect(await raceAddresses([], probe, 1000)).toBeNull();
  });

  it('RESPECTS the timeout: a hanging probe does not stall past timeoutMs', async () => {
    vi.useFakeTimers();
    try {
      // Never resolves — only the timeout can end this race.
      const hanging: Probe = () => new Promise<boolean>(() => {});
      const p = raceAddresses(['http://dead'], hanging, 2000);
      let settled = false;
      void p.then(() => (settled = true));

      await vi.advanceTimersByTimeAsync(1999);
      expect(settled).toBe(false); // still waiting just before the deadline
      await vi.advanceTimersByTimeAsync(2);
      expect(await p).toBeNull(); // timed out -> null
    } finally {
      vi.useRealTimers();
    }
  });

  it('a hung fast candidate does not block a slower healthy one within timeout', async () => {
    const probe: Probe = (url) =>
      url === 'http://hang'
        ? new Promise<boolean>(() => {}) // never resolves
        : new Promise<boolean>((r) => setTimeout(() => r(true), 30));
    const winner = await raceAddresses(['http://hang', 'http://ok'], probe, 2000);
    expect(winner).toBe('http://ok');
  });
});

describe('WinnerCache', () => {
  const config: ServiceConfig = {
    kind: 'sonarr',
    addresses: ['http://lan'],
    apiKey: 'k',
  };

  it('returns a cached winner until the TTL expires', () => {
    let now = 1000;
    const cache = new WinnerCache(30_000, () => now);
    cache.set(config, { address: 'http://lan', latencyMs: 5 });
    expect(cache.get(config)?.address).toBe('http://lan');
    now += 29_999;
    expect(cache.get(config)?.address).toBe('http://lan'); // still fresh
    now += 2;
    expect(cache.get(config)).toBeNull(); // expired
  });

  it('invalidate() and invalidateAll() drop entries (network-change re-race)', () => {
    const cache = new WinnerCache();
    cache.set(config, { address: 'http://lan', latencyMs: 5 });
    cache.invalidate(config);
    expect(cache.get(config)).toBeNull();

    cache.set(config, { address: 'http://lan', latencyMs: 5 });
    cache.invalidateAll();
    expect(cache.get(config)).toBeNull();
  });
});

describe('resolveService', () => {
  const config: ServiceConfig = {
    kind: 'sonarr',
    addresses: ['http://lan', 'http://remote'],
    apiKey: 'k',
  };

  it('races, caches the winner, and serves the cache on the next call', async () => {
    const cache = new WinnerCache();
    const probe = vi.fn(scriptedProbe({ 'http://lan': { ok: true, delayMs: 1 } }));

    const first = await resolveService(config, { probe, cache });
    expect(first?.address).toBe('http://lan');
    expect(probe).toHaveBeenCalled();

    probe.mockClear();
    const second = await resolveService(config, { probe, cache });
    expect(second?.address).toBe('http://lan');
    expect(probe).not.toHaveBeenCalled(); // served from cache, no re-race
  });

  it('forceRerace bypasses the cache', async () => {
    const cache = new WinnerCache();
    const probe = vi.fn(scriptedProbe({ 'http://lan': { ok: true, delayMs: 1 } }));
    await resolveService(config, { probe, cache });
    probe.mockClear();
    await resolveService(config, { probe, cache, forceRerace: true });
    expect(probe).toHaveBeenCalled();
  });

  it('returns null and leaves nothing cached when nothing answers', async () => {
    const cache = new WinnerCache();
    const probe = scriptedProbe({}); // everything fails
    const result = await resolveService(config, { probe, cache });
    expect(result).toBeNull();
    expect(cache.get(config)).toBeNull();
  });
});
