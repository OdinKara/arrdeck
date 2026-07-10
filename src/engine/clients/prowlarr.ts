/**
 * prowlarr.ts — ProwlarrClient (Prowlarr v1 API).
 *
 * Base path: `{url}/api/v1`, auth header `X-Api-Key`. We surface just enough to
 * show "5/5 indexers healthy". Headless & reusable.
 */

import { normalizeBaseUrl } from '../types.js';
import { type Probe, timedProbe } from '../probe.js';

// --- Typed responses (only the fields we consume) --------------------------

export interface ProwlarrSystemStatus {
  appName: string;
  version: string;
  osName: string;
}

export interface ProwlarrIndexer {
  id: number;
  name: string;
  enable: boolean;
  protocol: string;
}

/**
 * A row of /indexerstatus. Prowlarr only returns rows for indexers that are
 * CURRENTLY failing; `disabledTill` in the future means it is backing off.
 */
export interface ProwlarrIndexerStatus {
  indexerId: number;
  /** ISO timestamp until which the indexer is disabled, if any. */
  disabledTill: string | null;
  mostRecentFailure: string | null;
}

/** Rolled-up health for the dashboard "X/Y indexers" figure. */
export interface ProwlarrHealth {
  total: number;
  enabled: number;
  healthy: number;
  /** Names of indexers currently failing/backing off. */
  unhealthy: string[];
}

/** Per-indexer health row for the Indexers detail screen. */
export interface ProwlarrIndexerHealth {
  id: number;
  name: string;
  protocol: string;
  enabled: boolean;
  /** True when enabled and not currently backing off. */
  healthy: boolean;
  /** ISO time the indexer is disabled until (backing off), or null. */
  disabledTill: string | null;
  /** ISO time of the most recent failure, or null. */
  mostRecentFailure: string | null;
}

/**
 * Combine indexers + their status rows into per-indexer health (pure, testable).
 * An enabled indexer with a `disabledTill` in the future is unhealthy; a disabled
 * indexer is neither healthy nor failing (just off).
 */
export function deriveIndexerHealth(
  indexers: ProwlarrIndexer[],
  statuses: ProwlarrIndexerStatus[],
  nowMs: number,
): ProwlarrIndexerHealth[] {
  const byId = new Map(statuses.map((s) => [s.indexerId, s]));
  return indexers.map((i) => {
    const st = byId.get(i.id);
    const backingOff = !!st?.disabledTill && Date.parse(st.disabledTill) > nowMs;
    return {
      id: i.id,
      name: i.name,
      protocol: i.protocol,
      enabled: i.enable,
      healthy: i.enable && !backingOff,
      disabledTill: st?.disabledTill ?? null,
      mostRecentFailure: st?.mostRecentFailure ?? null,
    };
  });
}

// --- Client ----------------------------------------------------------------

const API_PREFIX = '/api/v1';

export class ProwlarrClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.base = normalizeBaseUrl(baseUrl);
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.base}${API_PREFIX}${path}`, {
      headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
      signal,
    });
    if (!res.ok) {
      throw new Error(`Prowlarr ${path} -> HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  /** GET /system/status — also used as the race health probe. */
  getSystemStatus(signal?: AbortSignal): Promise<ProwlarrSystemStatus> {
    return this.get<ProwlarrSystemStatus>('/system/status', signal);
  }

  /** GET /indexer — all configured indexers. */
  async getIndexers(signal?: AbortSignal): Promise<ProwlarrIndexer[]> {
    const raw = await this.get<Array<Record<string, unknown>>>('/indexer', signal);
    return raw.map((i) => ({
      id: Number(i.id),
      name: String(i.name ?? ''),
      enable: Boolean(i.enable),
      protocol: String(i.protocol ?? ''),
    }));
  }

  /** GET /indexerstatus — only lists indexers currently failing/backing off. */
  async getIndexerStatus(signal?: AbortSignal): Promise<ProwlarrIndexerStatus[]> {
    const raw = await this.get<Array<Record<string, unknown>>>('/indexerstatus', signal);
    return raw.map((s) => ({
      indexerId: Number(s.indexerId),
      disabledTill: s.disabledTill ? String(s.disabledTill) : null,
      mostRecentFailure: s.mostRecentFailure ? String(s.mostRecentFailure) : null,
    }));
  }

  /**
   * Roll indexers + status into the dashboard health figure. An enabled
   * indexer is "unhealthy" if it appears in /indexerstatus with a `disabledTill`
   * in the future (Prowlarr is backing off from it).
   *
   * @param nowMs  Injectable clock (tests); defaults to Date.now().
   */
  async getHealth(signal?: AbortSignal, nowMs: number = Date.now()): Promise<ProwlarrHealth> {
    const [indexers, statuses] = await Promise.all([
      this.getIndexers(signal),
      this.getIndexerStatus(signal),
    ]);
    const disabledIds = new Set(
      statuses
        .filter((s) => s.disabledTill !== null && Date.parse(s.disabledTill) > nowMs)
        .map((s) => s.indexerId),
    );
    const enabled = indexers.filter((i) => i.enable);
    const unhealthy = enabled.filter((i) => disabledIds.has(i.id));
    return {
      total: indexers.length,
      enabled: enabled.length,
      healthy: enabled.length - unhealthy.length,
      unhealthy: unhealthy.map((i) => i.name),
    };
  }
}

/**
 * Build a race probe for Prowlarr: healthy iff `/system/status` returns 200
 * with a matching API key.
 */
export function prowlarrPingProbeFor(apiKey: string, timeoutMs?: number): Probe {
  return timedProbe(async (url, signal) => {
    const res = await fetch(`${normalizeBaseUrl(url)}${API_PREFIX}/system/status`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal,
    });
    return res.ok;
  }, timeoutMs);
}
