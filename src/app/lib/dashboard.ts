/**
 * dashboard.ts — the single dashboard data fan-out.
 *
 * For every configured service: race to its live address (engine
 * resolveService), then pull the bits the Deck needs. Every service is
 * failure-isolated (one down service never blanks the others), mirroring the
 * unifiedSearch discipline. Pure/async — the React hook wraps it.
 */

import {
  ProwlarrClient,
  RadarrClient,
  SabClient,
  SonarrClient,
  resolveService,
  type ProwlarrHealth,
  type SabQueue,
  type SabQueueItem,
  type ServiceConfig,
  type ServiceKind,
} from '../../engine/index.js';
import { SERVICE_ORDER } from './serviceMeta.js';
import { hostOf, isPrivateHost } from './net.js';
import { isNative } from '../platform/env.js';
import * as webApi from '../platform/webApi.js';

export interface ServiceConn {
  kind: ServiceKind;
  status: 'up' | 'down';
  address?: string;
  latencyMs?: number;
}

export interface RecentItem {
  key: string;
  kind: 'movie' | 'show';
  /** Radarr movieId (movie) / Sonarr seriesId (show) — opens the detail screen. */
  id: number;
  title: string;
  year: number;
  posterUrl?: string;
  added: string;
}

export interface DashboardData {
  connections: ServiceConn[];
  primary?: { host: string; latencyMs: number; isLocal: boolean };
  downloading: SabQueueItem[];
  speed: string;
  paused: boolean;
  queueDepth: number;
  disk?: { path: string; freeBytes: number };
  indexers?: ProwlarrHealth;
  recent: RecentItem[];
}

/** The fast-changing subset polled on a short interval while the Deck is live. */
export interface QueueSnapshot {
  downloading: SabQueueItem[];
  speed: string;
  paused: boolean;
  queueDepth: number;
}

/**
 * Fetch ONLY the SAB queue (downloading + speed + depth) — the data that moves
 * second-to-second. Reuses the cached winning address (no re-race) so a 5s poll
 * is cheap. Returns null if SAB isn't configured/reachable (caller keeps
 * last-known data).
 */
export async function loadQueueSnapshot(
  services: ServiceConfig[],
): Promise<QueueSnapshot | null> {
  if (!isNative()) {
    // WEB: pull the SAB queue via the BFF (same subset the native path returns).
    if (!services.some((s) => s.kind === 'sabnzbd')) return null;
    try {
      const q = (await webApi.rpc('sabnzbd', 'getQueue', [])) as SabQueue;
      return { downloading: q.items, speed: q.speed, paused: q.paused, queueDepth: q.items.length };
    } catch {
      return null;
    }
  }
  // ---- NATIVE (unchanged) ----
  const cfg = services.find((s) => s.kind === 'sabnzbd');
  if (!cfg) return null;
  const conn = await resolveService(cfg).catch(() => null);
  if (!conn) return null;
  const q = await new SabClient(conn.address, cfg.apiKey).getQueue().catch(() => null);
  if (!q) return null;
  return {
    downloading: q.items,
    speed: q.speed,
    paused: q.paused,
    queueDepth: q.items.length,
  };
}

interface Resolved {
  kind: ServiceKind;
  conn: ServiceConn;
  sonarr?: SonarrClient;
  radarr?: RadarrClient;
  sab?: SabClient;
  prowlarr?: ProwlarrClient;
}

/** Race one service and, if up, build its typed client. */
async function resolveOne(cfg: ServiceConfig, forceRerace: boolean): Promise<Resolved> {
  const result = await resolveService(cfg, { forceRerace }).catch(() => null);
  if (!result) {
    return { kind: cfg.kind, conn: { kind: cfg.kind, status: 'down' } };
  }
  const conn: ServiceConn = {
    kind: cfg.kind,
    status: 'up',
    address: result.address,
    latencyMs: result.latencyMs,
  };
  const r: Resolved = { kind: cfg.kind, conn };
  switch (cfg.kind) {
    case 'sonarr':
      r.sonarr = new SonarrClient(result.address, cfg.apiKey);
      break;
    case 'radarr':
      r.radarr = new RadarrClient(result.address, cfg.apiKey);
      break;
    case 'sabnzbd':
      r.sab = new SabClient(result.address, cfg.apiKey);
      break;
    case 'prowlarr':
      r.prowlarr = new ProwlarrClient(result.address, cfg.apiKey);
      break;
    case 'plex':
      break;
  }
  return r;
}

export async function loadDashboard(
  services: ServiceConfig[],
  opts: { forceRerace?: boolean } = {},
): Promise<DashboardData> {
  if (!isNative()) {
    // WEB: the BFF already ran this exact fan-out server-side; just fetch it.
    return webApi.dashboard();
  }
  // ---- NATIVE (unchanged) ----
  const force = opts.forceRerace ?? false;

  // 1) Race every configured service in parallel.
  const resolved = await Promise.all(services.map((s) => resolveOne(s, force)));
  const byKind = new Map(resolved.map((r) => [r.kind, r]));

  const connections: ServiceConn[] = SERVICE_ORDER.filter((k) => byKind.has(k)).map(
    (k) => byKind.get(k)!.conn,
  );

  // 2) Primary connection for the header indicator: Sonarr if up, else first up.
  const primaryConn =
    byKind.get('sonarr')?.conn.status === 'up'
      ? byKind.get('sonarr')!.conn
      : connections.find((c) => c.status === 'up');
  const primary = primaryConn?.address
    ? {
        host: hostOf(primaryConn.address),
        latencyMs: primaryConn.latencyMs ?? 0,
        isLocal: isPrivateHost(hostOf(primaryConn.address)),
      }
    : undefined;

  const sab = resolved.find((r) => r.sab)?.sab;
  const radarr = resolved.find((r) => r.radarr)?.radarr;
  const sonarr = resolved.find((r) => r.sonarr)?.sonarr;
  const prowlarr = resolved.find((r) => r.prowlarr)?.prowlarr;

  // 3) Fan out the data pulls, each failure-isolated.
  const [queue, radarrRoots, sonarrRoots, indexers, movies, series] = await Promise.all([
    sab ? sab.getQueue().catch(() => null) : Promise.resolve(null),
    radarr ? radarr.getRootFolders().catch(() => []) : Promise.resolve([]),
    sonarr ? sonarr.getRootFolders().catch(() => []) : Promise.resolve([]),
    prowlarr ? prowlarr.getHealth().catch(() => undefined) : Promise.resolve(undefined),
    radarr ? radarr.getMovies().catch(() => []) : Promise.resolve([]),
    sonarr ? sonarr.getSeries().catch(() => []) : Promise.resolve([]),
  ]);

  // Disk: largest root folder across whichever *arr answered.
  const allRoots = [...radarrRoots, ...sonarrRoots];
  const biggest = allRoots.reduce<{ path: string; freeBytes: number } | undefined>(
    (best, r) => (!best || r.freeSpace > best.freeBytes ? { path: r.path, freeBytes: r.freeSpace } : best),
    undefined,
  );

  // Recently added: merge movies + series, newest first.
  const recent: RecentItem[] = [
    ...movies.map((m) => ({
      key: `m${m.id}`,
      kind: 'movie' as const,
      id: m.id,
      title: m.title,
      year: m.year,
      posterUrl: m.posterUrl,
      added: m.added,
    })),
    ...series.map((s) => ({
      key: `s${s.id}`,
      kind: 'show' as const,
      id: s.id,
      title: s.title,
      year: s.year,
      posterUrl: s.posterUrl,
      added: s.added,
    })),
  ]
    .filter((x) => x.added)
    .sort((a, b) => (a.added < b.added ? 1 : -1))
    .slice(0, 12);

  return {
    connections,
    primary,
    downloading: queue?.items ?? [],
    speed: queue?.speed ?? '0',
    paused: queue?.paused ?? false,
    queueDepth: queue?.items.length ?? 0,
    disk: biggest,
    indexers,
    recent,
  };
}
