/**
 * sonarr.ts — the first real service client (Sonarr v3 API).
 *
 * Base path: `{url}/api/v3`, auth header `X-Api-Key`. Only the fields the UI
 * actually needs are typed; the raw API returns much more. Headless & reusable.
 */

import { normalizeBaseUrl } from '../types.js';
import { type Probe, timedProbe } from '../probe.js';
import { pickPosterUrl, pickRating, pickVotes, toGenres } from './servarr-shared.js';
import { grabReleaseBody, mapRelease, type Release } from '../releases.js';

// --- Typed responses (only the fields we consume) --------------------------

export interface SonarrSystemStatus {
  appName: string;
  version: string;
  osName: string;
}

export interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  monitored: boolean;
  /** ISO timestamp the series was added (for "recently added"). */
  added: string;
  /** Best poster URL (prefers the absolute TVDB/TMDB remoteUrl). */
  posterUrl?: string;
  /** Rolled-up library counts (from series.statistics) for the grid badge. */
  episodeCount: number;
  episodeFileCount: number;
}

/** A single episode (read-only detail). */
export interface SonarrEpisode {
  id: number;
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  /** Local air date "YYYY-MM-DD", or '' if TBA. */
  airDate: string;
  hasFile: boolean;
  monitored: boolean;
  episodeFileId: number;
}

/** A downloaded episode file's quality/size (for optional per-episode tags). */
export interface SonarrEpisodeFile {
  id: number;
  seasonNumber: number;
  quality: string;
  size: number;
}

/** Per-season statistics as Sonarr reports them on the series detail. */
export interface SonarrSeasonInfo {
  seasonNumber: number;
  monitored: boolean;
  episodeFileCount: number;
  episodeCount: number;
  totalEpisodeCount: number;
  percentOfEpisodes: number;
}

/** Full series detail (GET /series/{id}). */
export interface SonarrSeriesDetail {
  id: number;
  title: string;
  year: number;
  /** "continuing" | "ended" | ... */
  status: string;
  network: string;
  runtime: number;
  overview: string;
  genres: string[];
  certification: string;
  monitored: boolean;
  path: string;
  qualityProfileId: number;
  rating: number;
  posterUrl?: string;
  titleSlug: string;
  seasons: SonarrSeasonInfo[];
}

export interface SonarrQueueItem {
  id: number;
  title: string;
  /** 0..100, computed from size vs sizeleft. */
  progress: number;
  status: string;
}

export interface SonarrRootFolder {
  id: number;
  path: string;
  /** Free space in bytes (may be absent if the path is offline). */
  freeSpace: number;
}

export interface SonarrTag {
  id: number;
  label: string;
}

export interface SonarrQualityProfile {
  id: number;
  name: string;
}

/** A normalized search hit from /series/lookup (the fields the UI needs). */
export interface SonarrLookupResult {
  title: string;
  year: number;
  /** TVDB id — the stable identity Sonarr uses to add + match library items. */
  tvdbId: number;
  overview: string;
  network: string;
  posterUrl?: string;
  genres: string[];
  /** 0..10 aggregate rating. */
  rating: number;
  /** Number of seasons (from `seasons[]`), for a quick "N seasons" figure. */
  seasonCount: number;
  certification: string;
  monitored: boolean;
  /** True when this series already exists in the library (has a Sonarr id). */
  inLibrary: boolean;
  /** Popularity signal (vote count) for ranking. */
  popularity: number;
  /** The raw Sonarr lookup object, passed through for building an add payload. */
  raw: Record<string, unknown>;
}

// --- Client ----------------------------------------------------------------

const API_PREFIX = '/api/v3';

export class SonarrClient {
  private readonly base: string;

  constructor(
    baseUrl: string,
    private readonly apiKey: string,
  ) {
    this.base = normalizeBaseUrl(baseUrl);
  }

  private async get<T>(path: string, signal?: AbortSignal): Promise<T> {
    const res = await fetch(`${this.base}${API_PREFIX}${path}`, {
      headers: { 'X-Api-Key': this.apiKey, Accept: 'application/json' },
      signal,
    });
    if (!res.ok) {
      throw new Error(`Sonarr ${path} -> HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  /** GET /system/status — also used as the race health probe. */
  getSystemStatus(signal?: AbortSignal): Promise<SonarrSystemStatus> {
    return this.get<SonarrSystemStatus>('/system/status', signal);
  }

  /** GET /series — full library. */
  async getSeries(signal?: AbortSignal): Promise<SonarrSeries[]> {
    const raw = await this.get<Array<Record<string, unknown>>>('/series', signal);
    return raw.map((s) => {
      const stats = (s.statistics ?? {}) as Record<string, unknown>;
      return {
        id: Number(s.id),
        title: String(s.title ?? ''),
        year: Number(s.year ?? 0),
        monitored: Boolean(s.monitored),
        added: String(s.added ?? ''),
        posterUrl: pickPosterUrl(s.images),
        episodeCount: Number(stats.episodeCount ?? 0),
        episodeFileCount: Number(stats.episodeFileCount ?? 0),
      };
    });
  }

  /** GET /series/{id} — full detail incl. seasons[] with per-season statistics. */
  async getSeriesById(id: number, signal?: AbortSignal): Promise<SonarrSeriesDetail> {
    const s = await this.get<Record<string, unknown>>(`/series/${id}`, signal);
    const seasons = Array.isArray(s.seasons) ? (s.seasons as Array<Record<string, unknown>>) : [];
    return {
      id: Number(s.id),
      title: String(s.title ?? ''),
      year: Number(s.year ?? 0),
      status: String(s.status ?? ''),
      network: String(s.network ?? ''),
      runtime: Number(s.runtime ?? 0),
      overview: String(s.overview ?? ''),
      genres: toGenres(s.genres),
      certification: String(s.certification ?? ''),
      monitored: Boolean(s.monitored),
      path: String(s.path ?? ''),
      qualityProfileId: Number(s.qualityProfileId ?? 0),
      rating: pickRating(s.ratings),
      posterUrl: pickPosterUrl(s.images),
      titleSlug: String(s.titleSlug ?? ''),
      seasons: seasons.map((sea) => {
        const st = (sea.statistics ?? {}) as Record<string, unknown>;
        return {
          seasonNumber: Number(sea.seasonNumber ?? 0),
          monitored: Boolean(sea.monitored),
          episodeFileCount: Number(st.episodeFileCount ?? 0),
          episodeCount: Number(st.episodeCount ?? 0),
          totalEpisodeCount: Number(st.totalEpisodeCount ?? 0),
          percentOfEpisodes: Number(st.percentOfEpisodes ?? 0),
        };
      }),
    };
  }

  /** GET /episode?seriesId= — all episodes for a series (read-only). */
  async getEpisodes(seriesId: number, signal?: AbortSignal): Promise<SonarrEpisode[]> {
    const raw = await this.get<Array<Record<string, unknown>>>(
      `/episode?seriesId=${seriesId}`,
      signal,
    );
    return raw.map((e) => ({
      id: Number(e.id),
      seriesId: Number(e.seriesId),
      seasonNumber: Number(e.seasonNumber ?? 0),
      episodeNumber: Number(e.episodeNumber ?? 0),
      title: String(e.title ?? ''),
      airDate: String(e.airDate ?? ''),
      hasFile: Boolean(e.hasFile),
      monitored: Boolean(e.monitored),
      episodeFileId: Number(e.episodeFileId ?? 0),
    }));
  }

  /** GET /episodefile?seriesId= — downloaded files' quality/size (optional tags). */
  async getEpisodeFiles(seriesId: number, signal?: AbortSignal): Promise<SonarrEpisodeFile[]> {
    const raw = await this.get<Array<Record<string, unknown>>>(
      `/episodefile?seriesId=${seriesId}`,
      signal,
    );
    return raw.map((f) => {
      const q = (f.quality ?? {}) as Record<string, unknown>;
      const qq = (q.quality ?? {}) as Record<string, unknown>;
      return {
        id: Number(f.id),
        seasonNumber: Number(f.seasonNumber ?? 0),
        quality: String(qq.name ?? ''),
        size: Number(f.size ?? 0),
      };
    });
  }

  /** GET /queue — active downloads/imports. The API paginates under `records`. */
  async getQueue(signal?: AbortSignal): Promise<SonarrQueueItem[]> {
    const raw = await this.get<{ records?: Array<Record<string, unknown>> }>(
      '/queue',
      signal,
    );
    const records = raw.records ?? [];
    return records.map((q) => {
      const size = Number(q.size ?? 0);
      const sizeleft = Number(q.sizeleft ?? 0);
      const progress = size > 0 ? ((size - sizeleft) / size) * 100 : 0;
      return {
        id: Number(q.id),
        title: String(q.title ?? ''),
        progress: Math.max(0, Math.min(100, progress)),
        status: String(q.status ?? ''),
      };
    });
  }

  /** GET /rootfolder — the user's real root folders + free space. */
  async getRootFolders(signal?: AbortSignal): Promise<SonarrRootFolder[]> {
    const raw = await this.get<Array<Record<string, unknown>>>('/rootfolder', signal);
    return raw.map((r) => ({
      id: Number(r.id),
      path: String(r.path ?? ''),
      freeSpace: Number(r.freeSpace ?? 0),
    }));
  }

  /** GET /qualityprofile — the user's REAL quality profiles (for the grab UI). */
  async getQualityProfiles(signal?: AbortSignal): Promise<SonarrQualityProfile[]> {
    const raw = await this.get<Array<Record<string, unknown>>>('/qualityprofile', signal);
    return raw.map((p) => ({ id: Number(p.id), name: String(p.name ?? '') }));
  }

  /** GET /series/lookup?term= — search TVDB via Sonarr for shows to add. */
  async lookup(term: string, signal?: AbortSignal): Promise<SonarrLookupResult[]> {
    const raw = await this.get<Array<Record<string, unknown>>>(
      `/series/lookup?term=${encodeURIComponent(term)}`,
      signal,
    );
    return raw.map((s) => {
      const seasons = Array.isArray(s.seasons) ? (s.seasons as unknown[]) : [];
      return {
        title: String(s.title ?? ''),
        year: Number(s.year ?? 0),
        tvdbId: Number(s.tvdbId ?? 0),
        overview: String(s.overview ?? ''),
        network: String(s.network ?? ''),
        posterUrl: pickPosterUrl(s.images),
        genres: toGenres(s.genres),
        rating: pickRating(s.ratings),
        // Count real seasons (exclude specials / season 0 when present).
        seasonCount: seasons.filter((x) => {
          const n = (x as { seasonNumber?: number }).seasonNumber;
          return typeof n !== 'number' || n > 0;
        }).length,
        certification: String(s.certification ?? ''),
        monitored: Boolean(s.monitored),
        // Lookup hits already in the library carry a Sonarr `id` (> 0).
        inLibrary: Number(s.id ?? 0) > 0,
        popularity: pickVotes(s.ratings),
        raw: s,
      };
    });
  }

  /**
   * POST /series — add a show (the grab). `payload` should already carry the
   * lookup result's fields plus qualityProfileId, rootFolderPath, and
   * addOptions. Kept as an opaque record so callers control the exact body.
   */
  async addSeries(
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}${API_PREFIX}/series`, {
      method: 'POST',
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Sonarr POST /series -> HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  // --- L1 write surface (edit / search / delete) --------------------------

  /** Generic JSON request for write verbs. */
  private async send<T>(
    method: 'POST' | 'PUT' | 'DELETE',
    path: string,
    body?: unknown,
    signal?: AbortSignal,
  ): Promise<T> {
    const res = await fetch(`${this.base}${API_PREFIX}${path}`, {
      method,
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
    if (!res.ok) {
      throw new Error(`Sonarr ${method} ${path} -> HTTP ${res.status} ${res.statusText}`);
    }
    // DELETE and some commands return empty bodies.
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** GET /series/{id} as the RAW object — the baseline for an edit PUT. */
  getSeriesRaw(id: number, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/series/${id}`, signal);
  }

  /** GET /tag — all tags (id + label) for the edit form. */
  async getTags(signal?: AbortSignal): Promise<SonarrTag[]> {
    const raw = await this.get<Array<Record<string, unknown>>>('/tag', signal);
    return raw.map((t) => ({ id: Number(t.id), label: String(t.label ?? '') }));
  }

  /**
   * PUT /series/{id} — write back a full (edited) series object. Follow the
   * Sonarr pattern: GET the raw series, mutate fields, PUT the whole object.
   */
  updateSeries(
    series: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const id = Number(series.id);
    return this.send<Record<string, unknown>>('PUT', `/series/${id}`, series, signal);
  }

  /** POST /command — run a command (search, refresh, …). */
  runCommand(
    command: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.send<Record<string, unknown>>('POST', '/command', command, signal);
  }

  /** DELETE /series/{id}?deleteFiles= — remove a series (optionally its files). */
  deleteSeries(id: number, deleteFiles: boolean, signal?: AbortSignal): Promise<void> {
    return this.send<void>(
      'DELETE',
      `/series/${id}?deleteFiles=${deleteFiles ? 'true' : 'false'}&addImportListExclusion=false`,
      undefined,
      signal,
    );
  }

  // --- Slice 2: interactive search (manual release selection) --------------

  /**
   * GET /release?episodeId={id} — candidate releases for ONE episode.
   * Same shape as Radarr; mapped via the shared `mapRelease`. Slow (indexers).
   */
  async getEpisodeReleases(episodeId: number, signal?: AbortSignal): Promise<Release[]> {
    const raw = await this.get<Array<Record<string, unknown>>>(
      `/release?episodeId=${episodeId}`,
      signal,
    );
    return raw.map(mapRelease);
  }

  /**
   * GET /release?seriesId={id}&seasonNumber={n} — candidate releases for a whole
   * season (season packs + per-episode releases).
   */
  async getSeasonReleases(
    seriesId: number,
    seasonNumber: number,
    signal?: AbortSignal,
  ): Promise<Release[]> {
    const raw = await this.get<Array<Record<string, unknown>>>(
      `/release?seriesId=${seriesId}&seasonNumber=${seasonNumber}`,
      signal,
    );
    return raw.map(mapRelease);
  }

  /**
   * POST /release — grab ONE specific release (interactive override). Body is
   * just { guid, indexerId }; identical to Radarr (shared `grabReleaseBody`).
   */
  grabRelease(
    guid: string,
    indexerId: number,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.send<Record<string, unknown>>('POST', '/release', grabReleaseBody(guid, indexerId), signal);
  }
}

/**
 * Build a race probe for Sonarr: healthy iff `/system/status` returns 200 with
 * a matching API key. Used by the engine's `probeForKind`.
 */
export function pingProbeFor(apiKey: string, timeoutMs?: number): Probe {
  return timedProbe(async (url, signal) => {
    const res = await fetch(`${normalizeBaseUrl(url)}${API_PREFIX}/system/status`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal,
    });
    return res.ok;
  }, timeoutMs);
}
