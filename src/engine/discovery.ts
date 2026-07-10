/**
 * discovery.ts — AUTO-DISCOVERY onboarding.
 *
 * The user enters ONE host IP and we probe ONLY the known *arr/media default
 * ports (fast, parallel, non-alarming — this is NOT a port-range sweep). For
 * each port we do a lightweight reachability check that also tries to confirm
 * the response *looks* like that service, so we don't report a random web
 * server on :8080 as SABnzbd.
 */

import {
  DEFAULT_PORTS,
  type DiscoveredService,
  type ServiceKind,
} from './types.js';

/** Short per-port timeout — discovery must feel snappy. */
export const DISCOVERY_TIMEOUT_MS = 1500;

/**
 * A per-kind "does this look like the service?" fingerprint. We don't have an
 * API key at discovery time, so we rely on unauthenticated tells:
 *  - sonarr/radarr/prowlarr: public `/ping` returns {"status":"OK"}, and the
 *    base redirects (302) / identifies the app in headers or markup.
 *  - sabnzbd: `/api?mode=version` answers without a key.
 *  - plex: `/identity` returns an `X-Plex-*` header / machineIdentifier.
 * Any of these confirms "something of this kind is here" without credentials.
 *
 * `f` is the (possibly mocked) fetch, passed in explicitly so parallel probes
 * never share mutable global state.
 */
type Fingerprint = (url: string, signal: AbortSignal, f: typeof fetch) => Promise<boolean>;

const FINGERPRINTS: Record<ServiceKind, Fingerprint> = {
  sonarr: (url, signal, f) => arrFingerprint(url, 'sonarr', signal, f),
  radarr: (url, signal, f) => arrFingerprint(url, 'radarr', signal, f),
  prowlarr: (url, signal, f) => arrFingerprint(url, 'prowlarr', signal, f),
  sabnzbd: async (url, signal, f) => {
    const res = await f(`${url}/api?mode=version&output=json`, { signal });
    if (!res.ok) return false;
    const body = (await res.text()).toLowerCase();
    return body.includes('version');
  },
  plex: async (url, signal, f) => {
    const res = await f(`${url}/identity`, { signal });
    const header =
      res.headers.get('x-plex-protocol') ??
      res.headers.get('x-plex-version') ??
      '';
    if (header) return true;
    const body = (await res.text().catch(() => '')).toLowerCase();
    return body.includes('machineidentifier') || body.includes('plex');
  },
};

/** Shared fingerprint for the Servarr trio (Sonarr/Radarr/Prowlarr). */
async function arrFingerprint(
  url: string,
  name: ServiceKind,
  signal: AbortSignal,
  f: typeof fetch,
): Promise<boolean> {
  // `/ping` is public and cheap; returns 200 {"status":"OK"} on modern Servarr.
  const res = await f(`${url}/ping`, { signal, redirect: 'manual' });
  if (res.ok) {
    const body = (await res.text()).toLowerCase();
    if (body.includes('ok') || body.includes('status')) return true;
  }
  // Fallback: the base URL exists and identifies the app in its headers/markup.
  const base = await f(`${url}/`, { signal, redirect: 'manual' });
  if (base.status === 0) return false;
  const server = (base.headers.get('server') ?? '').toLowerCase();
  if (server.includes(name)) return true;
  if (base.status === 302 || base.ok) {
    const body = (await base.text().catch(() => '')).toLowerCase();
    return body.includes(name);
  }
  return false;
}

/**
 * Probe one kind/port on a host. Returns a DiscoveredService with `reachable`
 * reflecting whether the fingerprint matched. Never throws — a failed probe is
 * simply `reachable: false`.
 */
async function probeKind(
  hostIp: string,
  kind: ServiceKind,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<DiscoveredService> {
  const port = DEFAULT_PORTS[kind];
  const url = `http://${hostIp}:${port}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  let reachable = false;
  try {
    reachable = await FINGERPRINTS[kind](url, ac.signal, fetchImpl);
  } catch {
    reachable = false;
  } finally {
    clearTimeout(timer);
  }
  return { kind, port, url, reachable };
}

/**
 * Scan a single host for known media services on their DEFAULT ports only.
 * Runs all probes in parallel and returns one entry per known kind (so callers
 * can show "found / not found" for each). Filter to `reachable` for the hits.
 *
 * @param hostIp     The host to scan (e.g. "192.168.1.100").
 * @param opts.timeoutMs   Per-port timeout (default 1500ms).
 * @param opts.fetchImpl   Injectable fetch (tests mock this).
 */
export async function scanHost(
  hostIp: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<DiscoveredService[]> {
  const timeoutMs = opts.timeoutMs ?? DISCOVERY_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const kinds = Object.keys(DEFAULT_PORTS) as ServiceKind[];
  // Tolerate a pasted host:port — scan the BARE host on default ports.
  const { host } = splitHostPort(hostIp);
  return Promise.all(kinds.map((kind) => probeKind(host, kind, timeoutMs, fetchImpl)));
}

/**
 * Split a user-entered address into a bare host and an OPTIONAL explicit port.
 * Tolerates a scheme and/or path the user might paste like a URL:
 *   "192.168.0.100:8085"        -> { host: "192.168.0.100", port: 8085 }
 *   "http://nas.local:8080/sab" -> { host: "nas.local",     port: 8080 }
 *   "192.168.0.100"             -> { host: "192.168.0.100", port: null }
 * (IPv4 / hostnames only — consistent with the rest of the engine.)
 */
export function splitHostPort(input: string): { host: string; port: number | null } {
  const cleaned = input
    .trim()
    .replace(/^https?:\/\//i, '') // drop any scheme
    .replace(/\/.*$/, ''); // drop any path
  const m = /^(.+):(\d{1,5})$/.exec(cleaned);
  if (m) return { host: m[1]!, port: Number(m[2]) };
  return { host: cleaned, port: null };
}

/**
 * Probe an EXACT host:port for ANY known service kind. Unlike scanHost (which
 * only hits each kind's DEFAULT port), this fingerprints the one address the
 * user pasted — so a service on a CUSTOM port (e.g. SAB on 8085) is still found.
 *
 * Runs every kind's fingerprint in parallel and returns a reachable
 * DiscoveredService for the first kind (in DEFAULT_PORTS order) that answers,
 * or null if nothing there looks like a known service. Returns null if the
 * input has no explicit port (nothing custom to probe — use scanHost instead).
 */
export async function probeAddress(
  hostPort: string,
  opts: { timeoutMs?: number; fetchImpl?: typeof fetch } = {},
): Promise<DiscoveredService | null> {
  const timeoutMs = opts.timeoutMs ?? DISCOVERY_TIMEOUT_MS;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const { host, port } = splitHostPort(hostPort);
  if (port === null) return null;
  const url = `http://${host}:${port}`;
  const kinds = Object.keys(DEFAULT_PORTS) as ServiceKind[];

  const flags = await Promise.all(
    kinds.map(async (kind) => {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), timeoutMs);
      try {
        return await FINGERPRINTS[kind](url, ac.signal, fetchImpl);
      } catch {
        return false;
      } finally {
        clearTimeout(timer);
      }
    }),
  );

  const idx = flags.findIndex(Boolean);
  return idx >= 0 ? { kind: kinds[idx]!, port, url, reachable: true } : null;
}
