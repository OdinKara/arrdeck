/**
 * commands.ts — pure builders for Sonarr edit (PUT) payloads and search
 * (POST /command) bodies. Framework-free and unit-tested; the client just
 * transports what these produce.
 */

/** The subset of a series a user can edit in the app. */
export interface SeriesEdits {
  monitored?: boolean;
  /** Sonarr accepts 'all' | 'none' for new-season monitoring. */
  monitorNewItems?: 'all' | 'none';
  seasonFolder?: boolean;
  qualityProfileId?: number;
  seriesType?: 'standard' | 'daily' | 'anime';
  path?: string;
  /** Root folder for the series; set together with `path` when the root changes. */
  rootFolderPath?: string;
  /** Tag ids. */
  tags?: number[];
  /** Per-season monitored overrides, keyed by seasonNumber. */
  seasonMonitored?: Record<number, boolean>;
}

/**
 * Merge user edits onto the RAW series object (the one fetched via
 * getSeriesRaw), preserving every other field Sonarr expects on a PUT. Only
 * provided fields are changed. `seasonMonitored` patches the matching entries
 * in the existing `seasons[]`.
 */
export function buildSeriesUpdatePayload(
  raw: Record<string, unknown>,
  edits: SeriesEdits,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };

  if (edits.monitored !== undefined) next.monitored = edits.monitored;
  if (edits.monitorNewItems !== undefined) next.monitorNewItems = edits.monitorNewItems;
  if (edits.seasonFolder !== undefined) next.seasonFolder = edits.seasonFolder;
  if (edits.qualityProfileId !== undefined) next.qualityProfileId = edits.qualityProfileId;
  if (edits.seriesType !== undefined) next.seriesType = edits.seriesType;
  if (edits.path !== undefined) next.path = edits.path;
  if (edits.rootFolderPath !== undefined) next.rootFolderPath = edits.rootFolderPath;
  if (edits.tags !== undefined) next.tags = [...edits.tags];

  if (edits.seasonMonitored) {
    const seasons = Array.isArray(raw.seasons)
      ? (raw.seasons as Array<Record<string, unknown>>)
      : [];
    next.seasons = seasons.map((s) => {
      const n = Number(s.seasonNumber);
      return n in edits.seasonMonitored!
        ? { ...s, monitored: edits.seasonMonitored![n] }
        : s;
    });
  }

  return next;
}

// --- Search commands -------------------------------------------------------

/** POST /command body: search every monitored+missing episode of a series. */
export function seriesSearchCommand(seriesId: number): Record<string, unknown> {
  return { name: 'SeriesSearch', seriesId };
}

/** POST /command body: search a single season. */
export function seasonSearchCommand(
  seriesId: number,
  seasonNumber: number,
): Record<string, unknown> {
  return { name: 'SeasonSearch', seriesId, seasonNumber };
}

/** POST /command body: search specific episodes by id. */
export function episodeSearchCommand(episodeIds: number[]): Record<string, unknown> {
  return { name: 'EpisodeSearch', episodeIds: [...episodeIds] };
}

// --- Radarr edit + search --------------------------------------------------

/** The subset of a movie a user can edit in the app. */
export interface MovieEdits {
  monitored?: boolean;
  /** 'announced' | 'inCinemas' | 'released' */
  minimumAvailability?: 'announced' | 'inCinemas' | 'released';
  qualityProfileId?: number;
  path?: string;
  rootFolderPath?: string;
  tags?: number[];
}

/**
 * Merge user edits onto the RAW movie object (from getMovieRaw), preserving
 * every other field Radarr expects on a PUT. Only provided fields change; never
 * mutates the input.
 */
export function buildMovieUpdatePayload(
  raw: Record<string, unknown>,
  edits: MovieEdits,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...raw };
  if (edits.monitored !== undefined) next.monitored = edits.monitored;
  if (edits.minimumAvailability !== undefined) next.minimumAvailability = edits.minimumAvailability;
  if (edits.qualityProfileId !== undefined) next.qualityProfileId = edits.qualityProfileId;
  if (edits.path !== undefined) next.path = edits.path;
  if (edits.rootFolderPath !== undefined) next.rootFolderPath = edits.rootFolderPath;
  if (edits.tags !== undefined) next.tags = [...edits.tags];
  return next;
}

/** POST /command body: search specific movies by id (Radarr's "MoviesSearch"). */
export function moviesSearchCommand(movieIds: number[]): Record<string, unknown> {
  return { name: 'MoviesSearch', movieIds: [...movieIds] };
}
