/**
 * radarr.ts — RadarrClient (Radarr v3 API).
 *
 * Base path: `{url}/api/v3`, auth header `X-Api-Key`. Mirrors the proven Sonarr
 * client; only the fields the UI needs are typed. Headless & reusable.
 */

import { normalizeBaseUrl } from '../types.js';
import { type Probe, timedProbe } from '../probe.js';
import { pickPosterUrl, pickRating, pickVotes, toGenres } from './servarr-shared.js';
import { grabReleaseBody, mapRelease, type Release } from '../releases.js';

// --- Typed responses (only the fields we consume) --------------------------

export interface RadarrSystemStatus {
  appName: string;
  version: string;
  osName: string;
}

export interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  tmdbId: number;
  monitored: boolean;
  hasFile: boolean;
  /** ISO timestamp the movie was added (for "recently added"). */
  added: string;
  /** Best poster URL (prefers the absolute TMDB remoteUrl). */
  posterUrl?: string;
}

export interface RadarrQueueItem {
  id: number;
  title: string;
  /** 0..100, computed from size vs sizeleft. */
  progress: number;
  status: string;
}

export interface RadarrRootFolder {
  id: number;
  path: string;
  freeSpace: number;
}

export interface RadarrQualityProfile {
  id: number;
  name: string;
}

export interface RadarrTag {
  id: number;
  label: string;
}

/** Full movie detail (GET /movie/{id}). */
export interface RadarrMovieDetail {
  id: number;
  title: string;
  year: number;
  /** "announced" | "inCinemas" | "released" | "deleted" */
  status: string;
  runtime: number;
  overview: string;
  genres: string[];
  certification: string;
  monitored: boolean;
  hasFile: boolean;
  path: string;
  rootFolderPath: string;
  qualityProfileId: number;
  minimumAvailability: string;
  rating: number;
  posterUrl?: string;
  tmdbId: number;
}

/** A normalized search hit from /movie/lookup (the fields the UI needs). */
export interface RadarrLookupResult {
  title: string;
  year: number;
  /** TMDB id — the stable identity Radarr uses to add + match library items. */
  tmdbId: number;
  overview: string;
  posterUrl?: string;
  genres: string[];
  /** 0..10 aggregate rating. */
  rating: number;
  /** Runtime in minutes. */
  runtime: number;
  certification: string;
  monitored: boolean;
  /** True when this movie already exists in the library (has a file or Radarr id). */
  inLibrary: boolean;
  /** Popularity signal (vote count) for ranking. */
  popularity: number;
  /** The raw Radarr lookup object, passed through for building an add payload. */
  raw: Record<string, unknown>;
}

// --- Client ----------------------------------------------------------------

const API_PREFIX = '/api/v3';

export class RadarrClient {
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
      throw new Error(`Radarr ${path} -> HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as T;
  }

  /** GET /system/status — also used as the race health probe. */
  getSystemStatus(signal?: AbortSignal): Promise<RadarrSystemStatus> {
    return this.get<RadarrSystemStatus>('/system/status', signal);
  }

  /** GET /movie — full library. */
  async getMovies(signal?: AbortSignal): Promise<RadarrMovie[]> {
    const raw = await this.get<Array<Record<string, unknown>>>('/movie', signal);
    return raw.map((m) => ({
      id: Number(m.id),
      title: String(m.title ?? ''),
      year: Number(m.year ?? 0),
      tmdbId: Number(m.tmdbId ?? 0),
      monitored: Boolean(m.monitored),
      hasFile: Boolean(m.hasFile),
      added: String(m.added ?? ''),
      posterUrl: pickPosterUrl(m.images),
    }));
  }

  /** GET /queue — active downloads/imports. The API paginates under `records`. */
  async getQueue(signal?: AbortSignal): Promise<RadarrQueueItem[]> {
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
  async getRootFolders(signal?: AbortSignal): Promise<RadarrRootFolder[]> {
    const raw = await this.get<Array<Record<string, unknown>>>('/rootfolder', signal);
    return raw.map((r) => ({
      id: Number(r.id),
      path: String(r.path ?? ''),
      freeSpace: Number(r.freeSpace ?? 0),
    }));
  }

  /** GET /qualityprofile — the user's REAL quality profiles (for the grab UI). */
  async getQualityProfiles(signal?: AbortSignal): Promise<RadarrQualityProfile[]> {
    const raw = await this.get<Array<Record<string, unknown>>>('/qualityprofile', signal);
    return raw.map((p) => ({ id: Number(p.id), name: String(p.name ?? '') }));
  }

  /** GET /movie/lookup?term= — search TMDB via Radarr for movies to add. */
  async lookup(term: string, signal?: AbortSignal): Promise<RadarrLookupResult[]> {
    const raw = await this.get<Array<Record<string, unknown>>>(
      `/movie/lookup?term=${encodeURIComponent(term)}`,
      signal,
    );
    return raw.map((m) => ({
      title: String(m.title ?? ''),
      year: Number(m.year ?? 0),
      tmdbId: Number(m.tmdbId ?? 0),
      overview: String(m.overview ?? ''),
      posterUrl: pickPosterUrl(m.images),
      genres: toGenres(m.genres),
      rating: pickRating(m.ratings),
      runtime: Number(m.runtime ?? 0),
      certification: String(m.certification ?? ''),
      monitored: Boolean(m.monitored),
      // In-library lookup hits carry a Radarr `id` (> 0) and usually hasFile.
      inLibrary: Number(m.id ?? 0) > 0 || Boolean(m.hasFile),
      popularity: pickVotes(m.ratings),
      raw: m,
    }));
  }

  /**
   * POST /movie — add a movie (the grab). `payload` should carry the lookup
   * result's fields plus qualityProfileId, rootFolderPath, and addOptions.
   * Kept as an opaque record so callers control the exact body.
   */
  async addMovie(
    payload: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    const res = await fetch(`${this.base}${API_PREFIX}/movie`, {
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
      throw new Error(`Radarr POST /movie -> HTTP ${res.status} ${res.statusText}`);
    }
    return (await res.json()) as Record<string, unknown>;
  }

  // --- R1 library/edit surface --------------------------------------------

  private async send<T>(
    method: 'PUT' | 'POST' | 'DELETE',
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
      throw new Error(`Radarr ${method} ${path} -> HTTP ${res.status} ${res.statusText}`);
    }
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  /** GET /movie/{id} — typed detail for the movie detail screen. */
  async getMovieById(id: number, signal?: AbortSignal): Promise<RadarrMovieDetail> {
    const m = await this.get<Record<string, unknown>>(`/movie/${id}`, signal);
    return {
      id: Number(m.id),
      title: String(m.title ?? ''),
      year: Number(m.year ?? 0),
      status: String(m.status ?? ''),
      runtime: Number(m.runtime ?? 0),
      overview: String(m.overview ?? ''),
      genres: toGenres(m.genres),
      certification: String(m.certification ?? ''),
      monitored: Boolean(m.monitored),
      hasFile: Boolean(m.hasFile),
      path: String(m.path ?? ''),
      rootFolderPath: String(m.rootFolderPath ?? ''),
      qualityProfileId: Number(m.qualityProfileId ?? 0),
      minimumAvailability: String(m.minimumAvailability ?? 'released'),
      rating: pickRating(m.ratings),
      posterUrl: pickPosterUrl(m.images),
      tmdbId: Number(m.tmdbId ?? 0),
    };
  }

  /** GET /movie/{id} as the RAW object — the baseline for an edit PUT. */
  getMovieRaw(id: number, signal?: AbortSignal): Promise<Record<string, unknown>> {
    return this.get<Record<string, unknown>>(`/movie/${id}`, signal);
  }

  /** GET /tag — all tags. */
  async getTags(signal?: AbortSignal): Promise<RadarrTag[]> {
    const raw = await this.get<Array<Record<string, unknown>>>('/tag', signal);
    return raw.map((t) => ({ id: Number(t.id), label: String(t.label ?? '') }));
  }

  /** PUT /movie/{id} — write back a full (edited) movie object. */
  updateMovie(
    movie: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.send<Record<string, unknown>>('PUT', `/movie/${Number(movie.id)}`, movie, signal);
  }

  /** POST /command — run a command (e.g. MoviesSearch). */
  runCommand(
    command: Record<string, unknown>,
    signal?: AbortSignal,
  ): Promise<Record<string, unknown>> {
    return this.send<Record<string, unknown>>('POST', '/command', command, signal);
  }

  /** DELETE /movie/{id}?deleteFiles= — remove a movie (optionally its files). */
  deleteMovie(id: number, deleteFiles: boolean, signal?: AbortSignal): Promise<void> {
    return this.send<void>(
      'DELETE',
      `/movie/${id}?deleteFiles=${deleteFiles ? 'true' : 'false'}&addImportExclusion=false`,
      undefined,
      signal,
    );
  }

  // --- Slice 1: interactive search (manual release selection) --------------

  /**
   * GET /release?movieId={id} — the candidate release list for a movie that
   * already exists in Radarr (interactive search). Slow (queries indexers).
   */
  async getReleases(movieId: number, signal?: AbortSignal): Promise<Release[]> {
    const raw = await this.get<Array<Record<string, unknown>>>(
      `/release?movieId=${movieId}`,
      signal,
    );
    return raw.map(mapRelease);
  }

  /**
   * POST /release — grab ONE specific release (the interactive override).
   * Body is just { guid, indexerId }; Radarr resolves the rest.
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
 * Build a race probe for Radarr: healthy iff `/system/status` returns 200 with
 * a matching API key.
 */
export function radarrPingProbeFor(apiKey: string, timeoutMs?: number): Probe {
  return timedProbe(async (url, signal) => {
    const res = await fetch(`${normalizeBaseUrl(url)}${API_PREFIX}/system/status`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal,
    });
    return res.ok;
  }, timeoutMs);
}
