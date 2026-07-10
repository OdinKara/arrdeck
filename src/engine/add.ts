/**
 * add.ts — pure builders for the Radarr/Sonarr "add" (grab) POST bodies.
 *
 * The UI collects a few choices (quality profile, root folder, monitor, whether
 * to search now); these functions merge those onto the RAW lookup object so the
 * add carries every field the service expects (title, tmdbId/tvdbId, titleSlug,
 * images, seasons, …). Kept pure and framework-free so they're unit-testable.
 */

export interface RadarrAddOptions {
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  /** Kick off a search immediately after adding. */
  searchForMovie: boolean;
  /** Radarr availability gate; defaults to 'released'. */
  minimumAvailability?: string;
}

export interface SonarrAddOptions {
  qualityProfileId: number;
  rootFolderPath: string;
  monitored: boolean;
  /** Search for missing episodes immediately after adding. */
  searchForMissingEpisodes: boolean;
  /** Which episodes to monitor; defaults to 'all'. */
  monitor?: 'all' | 'future' | 'none';
}

/** Fields we must never carry over from a lookup result into an add. */
function stripAddArtifacts(raw: Record<string, unknown>): Record<string, unknown> {
  const clone = { ...raw };
  // A lookup hit for a not-yet-added title has id 0; a stale non-zero id from a
  // cached object would make the POST look like an update. Always drop it.
  delete clone.id;
  return clone;
}

export function buildRadarrAddPayload(
  raw: Record<string, unknown>,
  opts: RadarrAddOptions,
): Record<string, unknown> {
  return {
    ...stripAddArtifacts(raw),
    qualityProfileId: opts.qualityProfileId,
    rootFolderPath: opts.rootFolderPath,
    monitored: opts.monitored,
    minimumAvailability: opts.minimumAvailability ?? 'released',
    addOptions: { searchForMovie: opts.searchForMovie },
  };
}

export function buildSonarrAddPayload(
  raw: Record<string, unknown>,
  opts: SonarrAddOptions,
): Record<string, unknown> {
  return {
    ...stripAddArtifacts(raw),
    qualityProfileId: opts.qualityProfileId,
    rootFolderPath: opts.rootFolderPath,
    monitored: opts.monitored,
    seasonFolder: true,
    addOptions: {
      monitor: opts.monitor ?? 'all',
      searchForMissingEpisodes: opts.searchForMissingEpisodes,
      searchForCutoffUnmetEpisodes: false,
    },
  };
}
