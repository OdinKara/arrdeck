/**
 * releases.ts — types + PURE helpers for interactive release selection
 * (the manual "pick which release to grab" flow). Radarr AND Sonarr return the
 * identical `/release` shape, so this module is shared by both: the clients map
 * raw JSON via `mapRelease` and transport the grab body this builds.
 */

/** The quality tell shown on a release row. */
export interface ReleaseQuality {
  /** e.g. "Bluray-1080p", "WEBDL-720p", "Unknown". */
  name: string;
  /** Vertical resolution (0 when unknown). */
  resolution: number;
}

/** One candidate release from GET /release (fields the UI shows/needs). */
export interface Release {
  title: string;
  indexer: string;
  indexerId: number;
  /** The stable id used to grab THIS specific release. */
  guid: string;
  /** Size in bytes. */
  size: number;
  quality: ReleaseQuality;
  /** Radarr's own numeric quality ranking (higher = better) — the sort key. */
  qualityWeight: number;
  /** Language display names (e.g. ["English"]). */
  languages: string[];
  /** Custom-format score (can be negative). */
  customFormatScore: number;
  /** Torrent seeders/leechers; null for usenet. */
  seeders: number | null;
  leechers: number | null;
  /** Age of the release in hours (fractional) and whole days. */
  ageHours: number;
  age: number;
  publishDate: string;
  /** True when Radarr rejected the release (still grabbable as a manual override). */
  rejected: boolean;
  /** Human-readable rejection reasons. */
  rejections: string[];
  /** "usenet" | "torrent". */
  protocol: string;
  releaseGroup: string | null;
}

/**
 * Map a raw `/release` object (Radarr or Sonarr — same shape) into a typed
 * Release. Pure; used by both clients so the mapping is never forked.
 */
export function mapRelease(r: Record<string, unknown>): Release {
  const q = (r.quality as Record<string, unknown> | undefined)?.quality as
    | Record<string, unknown>
    | undefined;
  const langs = Array.isArray(r.languages) ? (r.languages as Array<Record<string, unknown>>) : [];
  return {
    title: String(r.title ?? ''),
    indexer: String(r.indexer ?? ''),
    indexerId: Number(r.indexerId ?? 0),
    guid: String(r.guid ?? ''),
    size: Number(r.size ?? 0),
    quality: {
      name: String(q?.name ?? 'Unknown'),
      resolution: Number(q?.resolution ?? 0),
    },
    qualityWeight: Number(r.qualityWeight ?? 0),
    languages: langs.map((l) => String(l.name ?? '')).filter(Boolean),
    customFormatScore: Number(r.customFormatScore ?? 0),
    seeders: r.seeders == null ? null : Number(r.seeders),
    leechers: r.leechers == null ? null : Number(r.leechers),
    ageHours: Number(r.ageHours ?? 0),
    age: Number(r.age ?? 0),
    publishDate: String(r.publishDate ?? ''),
    rejected: Boolean(r.rejected),
    rejections: Array.isArray(r.rejections) ? (r.rejections as unknown[]).map(String) : [],
    protocol: String(r.protocol ?? ''),
    releaseGroup: r.releaseGroup == null ? null : String(r.releaseGroup),
  };
}

/** The sort dimensions offered in the interactive picker. */
export type ReleaseSortKey = 'quality' | 'size' | 'seeders' | 'cfScore';

/** Seeders as a sortable number (usenet/null sinks to the bottom). */
function seedersOf(r: Release): number {
  return typeof r.seeders === 'number' ? r.seeders : -1;
}

/**
 * Sort releases DESCENDING by the chosen key. Pure — returns a new array.
 *   quality → qualityWeight, tiebreak customFormatScore then size
 *   size    → size, tiebreak qualityWeight
 *   seeders → seeders (null last), tiebreak qualityWeight
 *   cfScore → customFormatScore, tiebreak qualityWeight then size
 */
export function sortReleases(list: Release[], key: ReleaseSortKey): Release[] {
  const desc = (a: number, b: number) => b - a;
  const byQuality = (a: Release, b: Release) =>
    desc(a.qualityWeight, b.qualityWeight) ||
    desc(a.customFormatScore, b.customFormatScore) ||
    desc(a.size, b.size);
  const cmp: Record<ReleaseSortKey, (a: Release, b: Release) => number> = {
    quality: byQuality,
    size: (a, b) => desc(a.size, b.size) || desc(a.qualityWeight, b.qualityWeight),
    seeders: (a, b) => desc(seedersOf(a), seedersOf(b)) || desc(a.qualityWeight, b.qualityWeight),
    cfScore: (a, b) =>
      desc(a.customFormatScore, b.customFormatScore) ||
      desc(a.qualityWeight, b.qualityWeight) ||
      desc(a.size, b.size),
  };
  return [...list].sort(cmp[key]);
}

/** Drop rejected releases (for the "Hide rejected" toggle). Pure. */
export function filterOutRejected(list: Release[]): Release[] {
  return list.filter((r) => !r.rejected);
}

/** The POST /release body that grabs one specific release. */
export function grabReleaseBody(guid: string, indexerId: number): { guid: string; indexerId: number } {
  return { guid, indexerId };
}
