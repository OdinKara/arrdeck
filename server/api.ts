/**
 * server/api.ts — the ArrDeck BFF routes.
 *
 * Every handler imports from src/engine ONLY and sources config from
 * server/config.ts. It deliberately does NOT import src/app/lib/* or
 * platform/storage.ts (those funnel through @capacitor/preferences). The
 * /dashboard fan-out and the client-construction dance mirror
 * src/app/lib/dashboard.ts + scripts/probe-stack.ts, re-implemented against the
 * file-backed store.
 */

import express, { type Request, type Response } from 'express';
import {
  ProwlarrClient,
  RadarrClient,
  SabClient,
  SonarrClient,
  resolveService,
  type ProwlarrHealth,
  type SabQueueItem,
  type ServiceConfig,
  type ServiceKind,
} from '../src/engine/index.js';
import * as store from './config.js';

export const api = express.Router();

// --- small local helpers (replicated, NOT imported from src/app) -----------

/** Stable display order — mirrors src/app/lib/serviceMeta.ts SERVICE_ORDER. */
const SERVICE_ORDER: ServiceKind[] = ['sonarr', 'radarr', 'sabnzbd', 'prowlarr', 'plex'];

/** hostOf — mirrors src/app/lib/net.ts. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
  }
}

/** isPrivateHost — mirrors src/app/lib/net.ts (RFC1918 / loopback = "local"). */
function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}

/** Strip the apiKey from a stored config for safe transport to the client. */
function maskConfig(c: ServiceConfig) {
  return {
    kind: c.kind,
    addresses: c.addresses,
    addressLabels: c.addressLabels,
    hasKey: typeof c.apiKey === 'string' && c.apiKey.length > 0,
  };
}

/** Construct the real engine client for a kind at a resolved address. */
type AnyClient = SonarrClient | RadarrClient | SabClient | ProwlarrClient;
function makeClient(kind: ServiceKind, address: string, apiKey: string): AnyClient | null {
  switch (kind) {
    case 'sonarr':
      return new SonarrClient(address, apiKey);
    case 'radarr':
      return new RadarrClient(address, apiKey);
    case 'sabnzbd':
      return new SabClient(address, apiKey);
    case 'prowlarr':
      return new ProwlarrClient(address, apiKey);
    default:
      return null; // plex — no client
  }
}

/**
 * RPC allow-list: only these methods may be invoked via POST /api/rpc, per
 * service. This is the exact set the UI (src/app) calls on each client. Nothing
 * off this list is reflected onto a server object.
 */
const RPC_ALLOW: Record<'sonarr' | 'radarr' | 'sabnzbd' | 'prowlarr', readonly string[]> = {
  sonarr: [
    'getSystemStatus', 'getSeries', 'getSeriesById', 'getEpisodes', 'getEpisodeFiles',
    'getQueue', 'getRootFolders', 'getQualityProfiles', 'getTags', 'getSeriesRaw',
    'lookup', 'addSeries', 'updateSeries', 'runCommand', 'deleteSeries',
    'getEpisodeReleases', 'getSeasonReleases', 'grabRelease',
  ],
  radarr: [
    'getSystemStatus', 'getMovies', 'getMovieById', 'getMovieRaw', 'getQueue',
    'getRootFolders', 'getQualityProfiles', 'getTags', 'lookup', 'addMovie',
    'updateMovie', 'runCommand', 'deleteMovie', 'getReleases', 'grabRelease',
  ],
  sabnzbd: ['getVersion', 'getQueue', 'getHistory', 'pauseItem', 'resumeItem', 'deleteItem'],
  prowlarr: ['getSystemStatus', 'getIndexers', 'getIndexerStatus', 'getHealth'],
};

const RPC_SERVICES = new Set(Object.keys(RPC_ALLOW));

/** Resolve a stored service to a live client (races its addresses). */
async function connectClient(kind: ServiceKind): Promise<AnyClient | null> {
  const cfg = store.get(kind);
  if (!cfg) return null;
  const conn = await resolveService(cfg).catch(() => null);
  if (!conn) return null;
  return makeClient(kind, conn.address, cfg.apiKey);
}

// --- routes ----------------------------------------------------------------

api.get('/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

/** All configured services, API keys replaced by { hasKey }. Never leaks a key. */
api.get('/services', (_req: Request, res: Response) => {
  res.json(store.load().map(maskConfig));
});

/**
 * Upsert a service. Body: { addresses, addressLabels?, apiKey? }. If apiKey is
 * omitted and one is already stored for this kind, the stored key is kept.
 */
api.put('/services/:kind', (req: Request, res: Response) => {
  const kind = req.params.kind as ServiceKind;
  if (!SERVICE_ORDER.includes(kind)) {
    return res.status(400).json({ error: `unknown kind '${kind}'` });
  }
  const body = (req.body ?? {}) as Partial<ServiceConfig>;
  if (!Array.isArray(body.addresses) || body.addresses.length === 0) {
    return res.status(400).json({ error: 'addresses[] required' });
  }
  const existing = store.get(kind);
  const apiKey =
    typeof body.apiKey === 'string' && body.apiKey.length > 0
      ? body.apiKey
      : existing?.apiKey ?? '';
  const next: ServiceConfig = {
    kind,
    addresses: body.addresses,
    ...(body.addressLabels ? { addressLabels: body.addressLabels } : {}),
    apiKey,
  };
  store.upsert(next);
  res.json(maskConfig(next));
});

api.delete('/services/:kind', (req: Request, res: Response) => {
  const kind = req.params.kind as ServiceKind;
  store.remove(kind);
  res.json({ ok: true, removed: kind });
});

/**
 * Verify a service by racing its addresses (returns ok + address/latency, never
 * a key). Body: { kind, addresses?, apiKey? }.
 *  - With a candidate (addresses and/or apiKey present): test that candidate
 *    WITHOUT persisting, merging it over the stored config so an omitted apiKey
 *    falls back to the stored key ("test without re-typing the key").
 *  - Without a candidate: verify the stored config (original behavior).
 */
api.post('/verify', async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as { kind?: string; addresses?: string[]; apiKey?: string };
  const kind = (body.kind ?? '') as ServiceKind;
  const stored = store.get(kind);
  const hasCandidate = Array.isArray(body.addresses) || typeof body.apiKey === 'string';

  let cfg: ServiceConfig | undefined;
  if (hasCandidate) {
    const addresses =
      Array.isArray(body.addresses) && body.addresses.length > 0 ? body.addresses : stored?.addresses;
    if (!addresses || addresses.length === 0) {
      return res.status(400).json({ error: 'addresses required to verify' });
    }
    const apiKey =
      typeof body.apiKey === 'string' && body.apiKey.length > 0 ? body.apiKey : stored?.apiKey ?? '';
    cfg = { kind, addresses, apiKey }; // transient — never store.upsert()'d
  } else {
    cfg = stored;
    if (!cfg) return res.status(404).json({ error: `no config for '${kind}'` });
  }

  const conn = await resolveService(cfg).catch(() => null);
  if (!conn) return res.json({ ok: false, error: 'no address answered' });
  res.json({ ok: true, ...conn }); // conn = { address, latencyMs } — no key
});

/**
 * Dashboard fan-out — replicates src/app/lib/dashboard.ts loadDashboard()
 * server-side. Sources config from the file store (NOT loadServices()).
 */
api.get('/dashboard', async (_req: Request, res: Response) => {
  const services = store.load();

  // 1) Race every configured service; build a client if it's up.
  const resolved = await Promise.all(
    services.map(async (cfg) => {
      const result = await resolveService(cfg).catch(() => null);
      if (!result) {
        return { kind: cfg.kind, conn: { kind: cfg.kind, status: 'down' as const }, client: null };
      }
      return {
        kind: cfg.kind,
        conn: { kind: cfg.kind, status: 'up' as const, address: result.address, latencyMs: result.latencyMs },
        client: makeClient(cfg.kind, result.address, cfg.apiKey),
      };
    }),
  );
  const byKind = new Map(resolved.map((r) => [r.kind, r]));

  const connections = SERVICE_ORDER.filter((k) => byKind.has(k)).map((k) => byKind.get(k)!.conn);

  // 2) Primary connection for the header indicator: Sonarr if up, else first up.
  const primaryConn =
    byKind.get('sonarr')?.conn.status === 'up'
      ? byKind.get('sonarr')!.conn
      : connections.find((c) => c.status === 'up');
  const primary =
    primaryConn && 'address' in primaryConn && primaryConn.address
      ? {
          host: hostOf(primaryConn.address),
          latencyMs: primaryConn.latencyMs ?? 0,
          isLocal: isPrivateHost(hostOf(primaryConn.address)),
        }
      : undefined;

  const sonarr = byKind.get('sonarr')?.client as SonarrClient | null | undefined;
  const radarr = byKind.get('radarr')?.client as RadarrClient | null | undefined;
  const sab = byKind.get('sabnzbd')?.client as SabClient | null | undefined;
  const prowlarr = byKind.get('prowlarr')?.client as ProwlarrClient | null | undefined;

  // 3) Fan out the data pulls, each failure-isolated.
  const [queue, radarrRoots, sonarrRoots, indexers, movies, series] = await Promise.all([
    sab ? sab.getQueue().catch(() => null) : Promise.resolve(null),
    radarr ? radarr.getRootFolders().catch(() => []) : Promise.resolve([]),
    sonarr ? sonarr.getRootFolders().catch(() => []) : Promise.resolve([]),
    prowlarr ? prowlarr.getHealth().catch(() => undefined) : Promise.resolve<ProwlarrHealth | undefined>(undefined),
    radarr ? radarr.getMovies().catch(() => []) : Promise.resolve([]),
    sonarr ? sonarr.getSeries().catch(() => []) : Promise.resolve([]),
  ]);

  // Disk: largest root folder across whichever *arr answered.
  const allRoots = [...radarrRoots, ...sonarrRoots];
  const disk = allRoots.reduce<{ path: string; freeBytes: number } | undefined>(
    (best, r) => (!best || r.freeSpace > best.freeBytes ? { path: r.path, freeBytes: r.freeSpace } : best),
    undefined,
  );

  // Recently added: merge movies + series, newest first (same as dashboard.ts).
  const recent = [
    ...movies.map((m) => ({ key: `m${m.id}`, kind: 'movie' as const, id: m.id, title: m.title, year: m.year, posterUrl: m.posterUrl, added: m.added })),
    ...series.map((s) => ({ key: `s${s.id}`, kind: 'show' as const, id: s.id, title: s.title, year: s.year, posterUrl: s.posterUrl, added: s.added })),
  ]
    .filter((x) => x.added)
    .sort((a, b) => (a.added < b.added ? 1 : -1))
    .slice(0, 12);

  const downloading: SabQueueItem[] = queue?.items ?? [];
  res.json({
    connections,
    primary,
    downloading,
    speed: queue?.speed ?? '0',
    paused: queue?.paused ?? false,
    queueDepth: queue?.items.length ?? 0,
    disk,
    indexers,
    recent,
  });
});

/**
 * Generic RPC — dispatch { service, method, args[] } to the real engine client.
 * Hard-whitelisted: service and method must both be on RPC_ALLOW or it's a 400.
 */
api.post('/rpc', async (req: Request, res: Response) => {
  const { service, method, args } = (req.body ?? {}) as {
    service?: string;
    method?: string;
    args?: unknown[];
  };

  if (!service || !RPC_SERVICES.has(service)) {
    return res.status(400).json({ error: `service must be one of ${[...RPC_SERVICES].join(', ')}` });
  }
  const allow = RPC_ALLOW[service as keyof typeof RPC_ALLOW];
  if (!method || !allow.includes(method)) {
    return res.status(400).json({ error: `method '${method}' not allowed for ${service}` });
  }

  const client = await connectClient(service as ServiceKind);
  if (!client) return res.status(502).json({ error: `${service} unreachable` });

  const fn = (client as unknown as Record<string, unknown>)[method];
  if (typeof fn !== 'function') {
    return res.status(400).json({ error: `method '${method}' not implemented` });
  }
  try {
    const result = await (fn as (...a: unknown[]) => Promise<unknown>).apply(
      client,
      Array.isArray(args) ? args : [],
    );
    res.json({ ok: true, result });
  } catch (err) {
    res.status(502).json({ ok: false, error: (err as Error).message });
  }
});
