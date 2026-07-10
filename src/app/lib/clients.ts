/**
 * clients.ts — resolve configured services to live, ready-to-use engine
 * clients (races to the winning address via the winner cache, then constructs
 * the typed client). Used by search + detail.
 */

import {
  ProwlarrClient,
  RadarrClient,
  SabClient,
  SonarrClient,
  resolveService,
  type ServiceConfig,
} from '../../engine/index.js';
import { isNative } from '../platform/env.js';
import { prowlarrProxy, radarrProxy, sabProxy, sonarrProxy } from '../platform/proxyClients.js';

/** WEB: first candidate address for a kind (for deep links), or ''. */
function firstAddr(services: ServiceConfig[], kind: ServiceConfig['kind']): string {
  return services.find((s) => s.kind === kind)?.addresses[0] ?? '';
}

async function addressFor(
  services: ServiceConfig[],
  kind: ServiceConfig['kind'],
): Promise<{ cfg: ServiceConfig; address: string } | null> {
  const cfg = services.find((s) => s.kind === kind);
  if (!cfg) return null;
  const conn = await resolveService(cfg).catch(() => null);
  return conn ? { cfg, address: conn.address } : null;
}

/** Resolve the Radarr + Sonarr clients (either may be absent/offline → undefined). */
export async function resolveArrClients(
  services: ServiceConfig[],
): Promise<{ radarr?: RadarrClient; sonarr?: SonarrClient }> {
  if (!isNative()) {
    // WEB: proxy clients for whichever kinds are configured (calls hit the BFF).
    return {
      radarr: services.some((s) => s.kind === 'radarr') ? radarrProxy() : undefined,
      sonarr: services.some((s) => s.kind === 'sonarr') ? sonarrProxy() : undefined,
    };
  }
  // ---- NATIVE (unchanged) ----
  const [r, s] = await Promise.all([
    addressFor(services, 'radarr'),
    addressFor(services, 'sonarr'),
  ]);
  return {
    radarr: r ? new RadarrClient(r.address, r.cfg.apiKey) : undefined,
    sonarr: s ? new SonarrClient(s.address, s.cfg.apiKey) : undefined,
  };
}

/**
 * Resolve the Sonarr client AND its winning base URL (the URL is needed for the
 * "Open in Sonarr" deep link). Returns null if Sonarr is absent/offline.
 */
export async function resolveSonarr(
  services: ServiceConfig[],
): Promise<{ client: SonarrClient; baseUrl: string } | null> {
  if (!isNative()) {
    return services.some((s) => s.kind === 'sonarr')
      ? { client: sonarrProxy(), baseUrl: firstAddr(services, 'sonarr') }
      : null;
  }
  // ---- NATIVE (unchanged) ----
  const s = await addressFor(services, 'sonarr');
  if (!s) return null;
  return { client: new SonarrClient(s.address, s.cfg.apiKey), baseUrl: s.address };
}

/** Resolve the Radarr client + winning base URL, or null if absent/offline. */
export async function resolveRadarr(
  services: ServiceConfig[],
): Promise<{ client: RadarrClient; baseUrl: string } | null> {
  if (!isNative()) {
    return services.some((s) => s.kind === 'radarr')
      ? { client: radarrProxy(), baseUrl: firstAddr(services, 'radarr') }
      : null;
  }
  // ---- NATIVE (unchanged) ----
  const r = await addressFor(services, 'radarr');
  if (!r) return null;
  return { client: new RadarrClient(r.address, r.cfg.apiKey), baseUrl: r.address };
}

/** Resolve the SABnzbd client, or null if absent/offline. */
export async function resolveSab(services: ServiceConfig[]): Promise<SabClient | null> {
  if (!isNative()) {
    return services.some((s) => s.kind === 'sabnzbd') ? sabProxy() : null;
  }
  // ---- NATIVE (unchanged) ----
  const s = await addressFor(services, 'sabnzbd');
  return s ? new SabClient(s.address, s.cfg.apiKey) : null;
}

/** Resolve the Prowlarr client, or null if absent/offline. */
export async function resolveProwlarr(services: ServiceConfig[]): Promise<ProwlarrClient | null> {
  if (!isNative()) {
    return services.some((s) => s.kind === 'prowlarr') ? prowlarrProxy() : null;
  }
  // ---- NATIVE (unchanged) ----
  const p = await addressFor(services, 'prowlarr');
  return p ? new ProwlarrClient(p.address, p.cfg.apiKey) : null;
}
