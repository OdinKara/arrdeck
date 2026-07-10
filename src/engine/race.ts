/**
 * race.ts — THE MOAT.
 *
 * "Happy-eyeballs" address racing: given several candidate base URLs for the
 * same service, probe ALL of them simultaneously and use whichever answers
 * first. A dead LAN address (you're away from home) times out fast and the
 * remote/tunnel address wins instead — the user never toggles anything.
 *
 * Pure and headless: no DOM, no browser globals, `fetch` is Node 18+ native.
 */

import {
  type ConnectionResult,
  type Probe,
  type ServiceConfig,
  type ServiceKind,
  normalizeBaseUrl,
} from './types.js';
import { DEFAULT_TIMEOUT_MS, timedProbe } from './probe.js';
import { pingProbeFor } from './clients/sonarr.js';
import { radarrPingProbeFor } from './clients/radarr.js';
import { sabPingProbeFor } from './clients/sabnzbd.js';
import { prowlarrPingProbeFor } from './clients/prowlarr.js';

export { DEFAULT_TIMEOUT_MS };

/** How long a race winner is cached before we re-race. */
export const DEFAULT_CACHE_TTL_MS = 30_000;

/**
 * Race a set of candidate addresses with a probe; resolve the FIRST that
 * succeeds. Losing/hanging probes are abandoned (their AbortController is
 * fired) and ignored. Resolves `null` if every candidate fails or times out.
 *
 * @param addresses  Candidate base URLs (order is not a priority; all fire at once).
 * @param probe      Health check; receives a base URL, resolves true if healthy.
 *                   Receives an AbortSignal via the 2nd arg convention below.
 * @param timeoutMs  Per-address deadline; a slow loser can't stall the winner.
 */
export async function raceAddresses(
  addresses: string[],
  probe: Probe,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<string | null> {
  const candidates = addresses.map(normalizeBaseUrl);
  if (candidates.length === 0) return null;

  return new Promise<string | null>((resolve) => {
    let settled = false;
    let remaining = candidates.length;

    const finish = (winner: string | null) => {
      if (settled) return;
      settled = true;
      resolve(winner);
    };

    for (const url of candidates) {
      // Each candidate gets its own hard timeout so no single address can hang
      // the race past `timeoutMs`.
      const timer = setTimeout(() => {
        if (--remaining === 0) finish(null);
      }, timeoutMs);

      // We intentionally do not await here — all probes run concurrently.
      void (async () => {
        let ok = false;
        try {
          ok = await probe(url);
        } catch {
          ok = false;
        }
        clearTimeout(timer);
        if (ok) {
          finish(url); // first success wins; later successes are ignored by `settled`
        } else if (--remaining === 0) {
          finish(null); // last one to fail closes out the race
        }
      })();
    }
  });
}

/** Map a service kind to its health probe (used as the race's default probe). */
export function probeForKind(kind: ServiceKind, apiKey: string): Probe {
  switch (kind) {
    case 'sonarr':
      return pingProbeFor(apiKey);
    case 'radarr':
      return radarrPingProbeFor(apiKey);
    case 'sabnzbd':
      return sabPingProbeFor(apiKey);
    case 'prowlarr':
      return prowlarrPingProbeFor(apiKey);
    default:
      // Plex client lands here until Phase "Later". We still give it a generic
      // reachability probe so discovery/race work.
      return timedProbe(async (url, signal) => {
        const res = await fetch(url, { signal, redirect: 'manual' });
        // Any HTTP answer (even 401/302) means something is listening.
        return res.status > 0;
      });
  }
}

// ---------------------------------------------------------------------------
// Winner cache
// ---------------------------------------------------------------------------

interface CacheEntry {
  result: ConnectionResult;
  expiresAt: number;
}

/**
 * In-memory cache of the winning address per service, so not every API call
 * re-races. Entries live for `ttlMs` (default 30s). Invalidate on a network
 * change (wifi <-> cellular) to force a fresh race.
 *
 * The cache is deliberately in-memory only (no persistence): a winner is only
 * valid for the current network, and losing it on restart is harmless — we
 * just re-race. Keyed by service kind + a stable hash of its addresses so two
 * services of the same kind don't collide.
 */
export class WinnerCache {
  private readonly store = new Map<string, CacheEntry>();
  private readonly now: () => number;

  /** `nowFn` is injectable so tests can control time without real clocks. */
  constructor(private readonly ttlMs: number = DEFAULT_CACHE_TTL_MS, nowFn?: () => number) {
    this.now = nowFn ?? (() => Date.now());
  }

  private keyFor(config: ServiceConfig): string {
    return `${config.kind}::${config.addresses.map(normalizeBaseUrl).join(',')}`;
  }

  get(config: ServiceConfig): ConnectionResult | null {
    const entry = this.store.get(this.keyFor(config));
    if (!entry) return null;
    if (this.now() >= entry.expiresAt) {
      this.store.delete(this.keyFor(config));
      return null;
    }
    return entry.result;
  }

  set(config: ServiceConfig, result: ConnectionResult): void {
    this.store.set(this.keyFor(config), {
      result,
      expiresAt: this.now() + this.ttlMs,
    });
  }

  /** Invalidate one service's cached winner. */
  invalidate(config: ServiceConfig): void {
    this.store.delete(this.keyFor(config));
  }

  /** Invalidate ALL cached winners — call this on a network change. */
  invalidateAll(): void {
    this.store.clear();
  }
}

/** A process-wide default cache. Callers may also construct their own. */
export const defaultWinnerCache = new WinnerCache();

/**
 * Resolve a service to its live address: return the cached winner if fresh,
 * otherwise race all candidate addresses with a kind-appropriate probe, cache
 * the winner, and return it. Returns `null` if nothing answered.
 *
 * @param config    The service (candidate addresses + kind + apiKey).
 * @param opts.probe        Override the probe (tests inject a fake here).
 * @param opts.timeoutMs    Per-address race timeout.
 * @param opts.cache        Winner cache to use (defaults to the process cache).
 * @param opts.forceRerace  Skip the cache and race fresh (e.g. after a failure).
 * @param opts.nowFn        Injectable clock for latency measurement (tests).
 */
export async function resolveService(
  config: ServiceConfig,
  opts: {
    probe?: Probe;
    timeoutMs?: number;
    cache?: WinnerCache;
    forceRerace?: boolean;
    nowFn?: () => number;
  } = {},
): Promise<ConnectionResult | null> {
  const cache = opts.cache ?? defaultWinnerCache;
  const now = opts.nowFn ?? (() => Date.now());

  if (!opts.forceRerace) {
    const cached = cache.get(config);
    if (cached) return cached;
  }

  const probe = opts.probe ?? probeForKind(config.kind, config.apiKey);
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const start = now();
  const winner = await raceAddresses(config.addresses, probe, timeoutMs);
  if (winner === null) {
    // Nothing answered — make sure a stale winner isn't left cached.
    cache.invalidate(config);
    return null;
  }

  const result: ConnectionResult = { address: winner, latencyMs: now() - start };
  cache.set(config, result);
  return result;
}
