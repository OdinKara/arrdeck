/**
 * proxyClients.ts — WEB-ONLY stand-ins for the engine service clients.
 *
 * Each proxy presents the SAME public method surface as the real engine client,
 * but every method delegates to the BFF via rpc(service, method, args) instead
 * of calling the *arr API directly (the server holds the API keys and runs the
 * engine). They are typed against the real engine client types (Pick over its
 * public keys), so screens type-check with NO changes and the engine is not
 * edited to extract interfaces.
 *
 * Only reached on the WEB path. The native/phone path uses the real clients.
 *
 * NOTE on the cast: the engine clients have PRIVATE members, which makes them
 * nominally typed — a structurally-identical object is not assignable to them.
 * So each factory casts its Pick<Client, methods> proxy through `unknown` to the
 * client type. This is the single, localized cast; consumers keep the exact
 * public method signatures (params + return types) via the Pick.
 */

import type {
  ProwlarrClient,
  RadarrClient,
  SabClient,
  SonarrClient,
} from '../../engine/index.js';
import { rpc } from './webApi.js';

/** Build an object with the given methods, each delegating to rpc(). */
function makeProxy<C, K extends keyof C>(service: string, methods: readonly K[]): Pick<C, K> {
  const obj: Record<string, unknown> = {};
  for (const m of methods) {
    obj[m as string] = (...args: unknown[]) => rpc(service, m as string, args);
  }
  return obj as Pick<C, K>;
}

// The method lists MUST match the server's /api/rpc allow-list. `satisfies`
// proves at compile time that every name is a real PUBLIC method of the client
// (keyof excludes private members) — a typo or private/removed method fails tsc.
const SONARR_METHODS = [
  'getSystemStatus', 'getSeries', 'getSeriesById', 'getEpisodes', 'getEpisodeFiles',
  'getQueue', 'getRootFolders', 'getQualityProfiles', 'getTags', 'getSeriesRaw',
  'lookup', 'addSeries', 'updateSeries', 'runCommand', 'deleteSeries',
  'getEpisodeReleases', 'getSeasonReleases', 'grabRelease',
] as const satisfies readonly (keyof SonarrClient)[];

const RADARR_METHODS = [
  'getSystemStatus', 'getMovies', 'getMovieById', 'getMovieRaw', 'getQueue',
  'getRootFolders', 'getQualityProfiles', 'getTags', 'lookup', 'addMovie',
  'updateMovie', 'runCommand', 'deleteMovie', 'getReleases', 'grabRelease',
] as const satisfies readonly (keyof RadarrClient)[];

const SAB_METHODS = [
  'getVersion', 'getQueue', 'getHistory', 'pauseItem', 'resumeItem', 'deleteItem',
] as const satisfies readonly (keyof SabClient)[];

const PROWLARR_METHODS = [
  'getSystemStatus', 'getIndexers', 'getIndexerStatus', 'getHealth',
] as const satisfies readonly (keyof ProwlarrClient)[];

/** WEB Sonarr client: same surface as SonarrClient, delegates to the BFF. */
export function sonarrProxy(): SonarrClient {
  return makeProxy<SonarrClient, (typeof SONARR_METHODS)[number]>('sonarr', SONARR_METHODS) as unknown as SonarrClient;
}

export function radarrProxy(): RadarrClient {
  return makeProxy<RadarrClient, (typeof RADARR_METHODS)[number]>('radarr', RADARR_METHODS) as unknown as RadarrClient;
}

export function sabProxy(): SabClient {
  return makeProxy<SabClient, (typeof SAB_METHODS)[number]>('sabnzbd', SAB_METHODS) as unknown as SabClient;
}

export function prowlarrProxy(): ProwlarrClient {
  return makeProxy<ProwlarrClient, (typeof PROWLARR_METHODS)[number]>('prowlarr', PROWLARR_METHODS) as unknown as ProwlarrClient;
}
