/**
 * sabnzbd.ts — SabClient (SABnzbd JSON API).
 *
 * Base: `{url}/api`, auth via `?apikey=`, always `output=json`. Each call is a
 * `mode=`. Only the fields the UI shows are typed. Headless & reusable.
 */

import { normalizeBaseUrl } from '../types.js';
import { type Probe, timedProbe } from '../probe.js';

// --- Typed responses (only the fields we consume) --------------------------

export interface SabVersion {
  version: string;
}

export interface SabQueueItem {
  /** SABnzbd's stable per-item id — needed for pause/resume/delete. */
  nzoId: string;
  name: string;
  /** 0..100. */
  percent: number;
  sizeMB: number;
  /** Human ETA, e.g. "0:04:12" or "" when paused. */
  etaText: string;
  status: string;
}

export interface SabQueue {
  /** Whether the whole queue is paused. */
  paused: boolean;
  /** Current speed, human string e.g. "3.2 M". */
  speed: string;
  /** Free space on the download disk, human string e.g. "1.2 T". */
  diskFree: string;
  items: SabQueueItem[];
}

export interface SabHistoryItem {
  name: string;
  status: string;
  /** Failure reason / fail message when status is "Failed". */
  failMessage: string;
  sizeBytes: number;
}

// --- Client ----------------------------------------------------------------

const API_PREFIX = '/api';

export class SabClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.base = normalizeBaseUrl(baseUrl);
  }

  /** Build an API URL for a given mode + extra params. */
  private url(mode: string, extra: Record<string, string> = {}): string {
    const params = new URLSearchParams({
      mode,
      output: 'json',
      apikey: this.apiKey,
      ...extra,
    });
    return `${this.base}${API_PREFIX}?${params.toString()}`;
  }

  private async call<T>(
    mode: string,
    extra: Record<string, string> = {},
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await fetch(this.url(mode, extra), {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) {
      throw new Error(`SABnzbd mode=${mode} -> HTTP ${res.status} ${res.statusText}`);
    }
    const data = (await res.json()) as T & { status?: boolean; error?: string };
    // SABnzbd signals auth/other failures with { status:false, error:"..." }.
    if (data && typeof data === 'object' && data.status === false && data.error) {
      throw new Error(`SABnzbd mode=${mode} -> ${data.error}`);
    }
    return data as T;
  }

  /** mode=version — also used as the race health probe. */
  getVersion(signal?: AbortSignal): Promise<SabVersion> {
    return this.call<SabVersion>('version', {}, signal);
  }

  /** mode=queue — the active download queue. */
  async getQueue(signal?: AbortSignal): Promise<SabQueue> {
    const raw = await this.call<{ queue?: Record<string, unknown> }>('queue', {}, signal);
    const q = raw.queue ?? {};
    const slots = Array.isArray(q.slots) ? (q.slots as Array<Record<string, unknown>>) : [];
    return {
      paused: Boolean(q.paused),
      speed: String(q.speed ?? ''),
      diskFree: String(q.diskspace1_norm ?? ''),
      items: slots.map((s) => ({
        nzoId: String(s.nzo_id ?? ''),
        name: String(s.filename ?? s.name ?? ''),
        percent: Number(s.percentage ?? 0),
        sizeMB: Number(s.mb ?? 0),
        etaText: String(s.timeleft ?? ''),
        status: String(s.status ?? ''),
      })),
    };
  }

  /** mode=history — recently completed / failed grabs. */
  async getHistory(limit = 20, signal?: AbortSignal): Promise<SabHistoryItem[]> {
    const raw = await this.call<{ history?: { slots?: Array<Record<string, unknown>> } }>(
      'history',
      { limit: String(limit) },
      signal,
    );
    const slots = raw.history?.slots ?? [];
    return slots.map((s) => ({
      name: String(s.name ?? ''),
      status: String(s.status ?? ''),
      failMessage: String(s.fail_message ?? ''),
      sizeBytes: Number(s.bytes ?? 0),
    }));
  }

  /** Pause one queued item by its nzo_id. Returns SAB's status boolean. */
  async pauseItem(nzoId: string, signal?: AbortSignal): Promise<boolean> {
    const r = await this.call<{ status?: boolean }>(
      'queue',
      { name: 'pause', value: nzoId },
      signal,
    );
    return Boolean(r.status);
  }

  /** Resume one paused item by its nzo_id. */
  async resumeItem(nzoId: string, signal?: AbortSignal): Promise<boolean> {
    const r = await this.call<{ status?: boolean }>(
      'queue',
      { name: 'resume', value: nzoId },
      signal,
    );
    return Boolean(r.status);
  }

  /** Delete one item from the queue by its nzo_id (also removes files). */
  async deleteItem(nzoId: string, signal?: AbortSignal): Promise<boolean> {
    const r = await this.call<{ status?: boolean }>(
      'queue',
      { name: 'delete', value: nzoId, del_files: '1' },
      signal,
    );
    return Boolean(r.status);
  }
}

/**
 * Build a race probe for SABnzbd: healthy iff `mode=version` answers with a
 * version string (which also validates the API key).
 */
export function sabPingProbeFor(apiKey: string, timeoutMs?: number): Probe {
  return timedProbe(async (url, signal) => {
    const params = new URLSearchParams({ mode: 'version', output: 'json', apikey: apiKey });
    const res = await fetch(`${normalizeBaseUrl(url)}${API_PREFIX}?${params.toString()}`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { version?: string };
    return typeof data.version === 'string' && data.version.length > 0;
  }, timeoutMs);
}
