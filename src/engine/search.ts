/**
 * search.ts — UNIFIED SEARCH (the headline "you just search, we route" logic).
 *
 * One call fans out to Radarr AND Sonarr in parallel, normalizes both into a
 * single SearchResult shape, tags each as movie vs show, marks what's already
 * in the library, and returns one relevance-sorted list. The user never picks
 * "Radarr or Sonarr" — the app knows.
 *
 * Headless: depends only on the typed clients, no UI, no globals.
 */

import { type RadarrClient } from './clients/radarr.js';
import { type SonarrClient } from './clients/sonarr.js';

/** The unified, kind-tagged result the UI renders in one list. */
export interface SearchResult {
  kind: 'movie' | 'show';
  title: string;
  year: number;
  /** Set for movies. */
  tmdbId?: number;
  /** Set for shows. */
  tvdbId?: number;
  overview: string;
  posterUrl?: string;
  /** 0..10 aggregate rating. */
  rating: number;
  /** Human "155 min" (movie) or "3 seasons" (show). */
  runtimeOrEpisodes: string;
  genres: string[];
  /** True if this title already exists in the corresponding library. */
  inLibrary: boolean;
  certification: string;
  /** Popularity signal (vote count) — used by rankSearchResults. */
  popularity: number;
  /** The raw service lookup object, for building an add payload at grab time. */
  raw: Record<string, unknown>;
}

export interface UnifiedSearchClients {
  radarr?: RadarrClient;
  sonarr?: SonarrClient;
}

/** Title-match tier: 3 exact, 2 starts-with, 1 contains, 0 otherwise. */
function matchTier(title: string, term: string): number {
  const t = title.toLowerCase().trim();
  const q = term.toLowerCase().trim();
  if (t === q) return 3;
  if (t.startsWith(q)) return 2;
  if (t.includes(q)) return 1;
  return 0;
}

/**
 * Composite relevance score (higher = better). Layered so each factor only
 * breaks ties within the one above it:
 *   tier (exact/startsWith/contains)  ── dominant
 *   inLibrary                          ── owned titles surface first
 *   popularity (vote count)            ── THE Phase-2 tuning: the marquee
 *                                         "Severance (2022)" beats identically
 *                                         named short films that tie on tier
 *   rating                             ── final tiebreak
 */
export function relevanceScore(result: SearchResult, term: string): number {
  const tier = matchTier(result.title, term);
  const lib = result.inLibrary ? 1 : 0;
  // log-compress popularity so a viral title can't overpower the tier layer,
  // but still decisively orders same-tier results.
  const pop = Math.log10(1 + Math.max(0, result.popularity));
  return tier * 1e6 + lib * 1e5 + pop * 1000 + result.rating;
}

/**
 * Rank (and stably sort) unified results with the tuned relevance above.
 * Exposed and unit-tested because it's the UI-facing ranking contract.
 */
export function rankSearchResults(results: SearchResult[], term: string): SearchResult[] {
  return [...results].sort((a, b) => relevanceScore(b, term) - relevanceScore(a, term));
}

/**
 * Run a unified search across Radarr (movies) and Sonarr (shows).
 *
 * Both `lookup` calls AND both library reads fire in parallel; a service that
 * errors or is absent simply contributes nothing (the other still returns).
 * `inLibrary` is computed by matching each hit's tmdbId/tvdbId against the
 * real library (getMovies / getSeries), falling back to the lookup hit's own
 * in-library flag.
 */
export async function unifiedSearch(
  term: string,
  clients: UnifiedSearchClients,
  signal?: AbortSignal,
): Promise<SearchResult[]> {
  const { radarr, sonarr } = clients;

  const [movieHits, showHits, movieLib, showLib] = await Promise.all([
    radarr ? radarr.lookup(term, signal).catch(() => []) : Promise.resolve([]),
    sonarr ? sonarr.lookup(term, signal).catch(() => []) : Promise.resolve([]),
    radarr ? radarr.getMovies(signal).catch(() => []) : Promise.resolve([]),
    sonarr ? sonarr.getSeries(signal).catch(() => []) : Promise.resolve([]),
  ]);

  // Library identity sets for the inLibrary match.
  const ownedTmdb = new Set(movieLib.map((m) => m.tmdbId).filter((id) => id > 0));
  // Sonarr's getSeries (Phase 1) doesn't expose tvdbId, so we fall back to the
  // lookup hit's own inLibrary flag for shows; movies match precisely by tmdbId.
  const results: SearchResult[] = [];

  for (const m of movieHits) {
    results.push({
      kind: 'movie',
      title: m.title,
      year: m.year,
      tmdbId: m.tmdbId,
      overview: m.overview,
      posterUrl: m.posterUrl,
      rating: m.rating,
      runtimeOrEpisodes: m.runtime > 0 ? `${m.runtime} min` : '',
      genres: m.genres,
      inLibrary: (m.tmdbId > 0 && ownedTmdb.has(m.tmdbId)) || m.inLibrary,
      certification: m.certification,
      popularity: m.popularity,
      raw: m.raw,
    });
  }

  for (const s of showHits) {
    const seasons = s.seasonCount;
    results.push({
      kind: 'show',
      title: s.title,
      year: s.year,
      tvdbId: s.tvdbId,
      overview: s.overview,
      posterUrl: s.posterUrl,
      rating: s.rating,
      runtimeOrEpisodes: seasons > 0 ? `${seasons} season${seasons === 1 ? '' : 's'}` : '',
      genres: s.genres,
      inLibrary: s.inLibrary,
      certification: s.certification,
      popularity: s.popularity,
      raw: s.raw,
    });
  }

  return rankSearchResults(results, term);
}
