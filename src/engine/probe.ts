/**
 * probe.ts — shared probe primitives.
 *
 * Lives apart from race.ts so service clients (sonarr.ts) can build probes
 * without importing race.ts, which itself imports the clients. This breaks the
 * otherwise-circular dependency.
 */

import { type Probe } from './types.js';

export { type Probe };

/** Default per-address probe timeout. Short so a losing address feels instant. */
export const DEFAULT_TIMEOUT_MS = 2000;

/**
 * Wrap a fetch-based check into a Probe that aborts on timeout and never
 * throws (a thrown/aborted probe simply counts as "not healthy here").
 */
export function timedProbe(
  doFetch: (url: string, signal: AbortSignal) => Promise<boolean>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Probe {
  return async (url: string) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);
    try {
      return await doFetch(url, ac.signal);
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  };
}
