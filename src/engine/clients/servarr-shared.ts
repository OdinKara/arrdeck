/**
 * servarr-shared.ts — parsing helpers common to the Servarr apps
 * (Sonarr / Radarr / Prowlarr all share the *arr response idioms:
 * `images[]`, nested `ratings`, `genres[]`, `certification`).
 *
 * Keeping these in one place means the Sonarr and Radarr clients normalize
 * posters, ratings, and genres identically — and search.ts can trust the shape.
 */

/** One image entry as Servarr returns it. */
export interface ServarrImage {
  coverType?: string;
  url?: string;
  remoteUrl?: string;
}

/**
 * Pick the best poster URL from an images array. Prefer the absolute
 * `remoteUrl` (TMDB/TVDB CDN, works off-LAN) over the app-relative `url`.
 */
export function pickPosterUrl(images: unknown): string | undefined {
  if (!Array.isArray(images)) return undefined;
  const imgs = images as ServarrImage[];
  const poster = imgs.find((i) => i.coverType === 'poster') ?? imgs[0];
  if (!poster) return undefined;
  return poster.remoteUrl || poster.url || undefined;
}

/**
 * Collapse Servarr's `ratings` into a single 0..10 number for display.
 *
 * Two shapes exist in the wild:
 *   - Radarr (nested by source): { imdb:{value,votes}, tmdb:{value,votes}, ... }
 *   - Sonarr (flat):             { value, votes }
 * Prefer the flat value, then IMDb, then TMDB, then any nested value.
 */
export function pickRating(ratings: unknown): number {
  if (!ratings || typeof ratings !== 'object') return 0;
  const r = ratings as Record<string, unknown>;
  // Flat shape (Sonarr): a top-level numeric `value`.
  if (typeof r.value === 'number' && r.value > 0) return r.value;
  // Nested shape (Radarr): pick by source priority.
  for (const key of ['imdb', 'tmdb', 'trakt']) {
    const v = (r[key] as { value?: number } | undefined)?.value;
    if (typeof v === 'number' && v > 0) return v;
  }
  // Fall back to the first numeric nested `.value` we can find.
  for (const entry of Object.values(r)) {
    const v = (entry as { value?: number } | undefined)?.value;
    if (typeof v === 'number' && v > 0) return v;
  }
  return 0;
}

/**
 * Extract a vote count from `ratings` as a popularity signal for ranking.
 * Flat (Sonarr): top-level `votes`. Nested (Radarr): the max votes across
 * sources (IMDb dominates for well-known titles).
 */
export function pickVotes(ratings: unknown): number {
  if (!ratings || typeof ratings !== 'object') return 0;
  const r = ratings as Record<string, unknown>;
  if (typeof r.votes === 'number') return r.votes; // flat (Sonarr)
  let max = 0;
  for (const entry of Object.values(r)) {
    const v = (entry as { votes?: number } | undefined)?.votes;
    if (typeof v === 'number' && v > max) max = v;
  }
  return max;
}

/** Normalize a genres field to a clean string array. */
export function toGenres(genres: unknown): string[] {
  if (!Array.isArray(genres)) return [];
  return genres.map((g) => String(g)).filter(Boolean);
}
