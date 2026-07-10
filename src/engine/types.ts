/**
 * ArrDeck engine — core types.
 *
 * This module is intentionally free of any framework, DOM, or browser globals.
 * It is the shared vocabulary for both a future React app and a future MCP
 * server wrapper. Keep it pure data.
 */

/** The service kinds ArrDeck knows how to speak to. */
export type ServiceKind = 'sonarr' | 'radarr' | 'sabnzbd' | 'prowlarr' | 'plex';

/**
 * A single service the user has configured.
 *
 * `addresses` is an ORDERED list of candidate base URLs — e.g. a fast LAN IP
 * first, then a remote/tunnel address (Tailscale 100.x, or a hostname). The
 * engine races all of them and uses whichever answers first; the order is only
 * a mild hint for logging/preference, not a priority the engine enforces.
 *
 * A "base URL" here means the scheme+host+port root, WITHOUT the API path,
 * e.g. `http://192.168.1.100:8989` (the client appends `/api/v3/...`).
 */
/** Display-only label for a candidate address. Does NOT affect the race. */
export type AddressLabel = 'local' | 'remote' | null;

export interface ServiceConfig {
  kind: ServiceKind;
  /** Ordered candidate base URLs (no trailing slash needed; both are tolerated). */
  addresses: string[];
  /**
   * Optional per-address display labels (parallel to `addresses`). Purely
   * cosmetic — the race probes ALL addresses regardless of label. May be shorter
   * than `addresses` (missing entries read as null).
   */
  addressLabels?: AddressLabel[];
  /** API key / token for this service. NEVER log or serialize this to disk unencrypted. */
  apiKey: string;
}

/** The outcome of a successful address race: which candidate won, and how fast. */
export interface ConnectionResult {
  /** The winning base URL. */
  address: string;
  /** Round-trip latency of the winning probe, in milliseconds. */
  latencyMs: number;
}

/** One probed default port during auto-discovery. */
export interface DiscoveredService {
  kind: ServiceKind;
  port: number;
  url: string;
  /** True if something answering like that service responded on the port. */
  reachable: boolean;
}

/** A probe function: given a base URL, resolve true if the service is healthy there. */
export type Probe = (url: string) => Promise<boolean>;

/** Known default ports for the *arr / media stack — the ONLY ports discovery probes. */
export const DEFAULT_PORTS: Readonly<Record<ServiceKind, number>> = {
  sonarr: 8989,
  radarr: 7878,
  sabnzbd: 8080,
  prowlarr: 9696,
  plex: 32400,
} as const;

/** Normalize a base URL: strip any trailing slashes so path-joining is predictable. */
export function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}
