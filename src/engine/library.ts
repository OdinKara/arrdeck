/**
 * library.ts — pure per-season / per-episode rollup logic (the have/missing/
 * "0/0" math from the Sonarr UI). Framework-free and unit-tested.
 */

import type { SonarrEpisode, SonarrSeasonInfo } from './clients/sonarr.js';

export interface EpisodeStatus {
  n: number;
  title: string;
  airDate: string;
  hasFile: boolean;
  monitored: boolean;
  /** True if the episode has aired (air date in the past) OR a file exists. */
  aired: boolean;
}

export interface SeasonRollup {
  seasonNumber: number;
  monitored: boolean;
  /** Episodes with a downloaded file. */
  haveCount: number;
  /** Aired/available episodes (the denominator in "have/total"). */
  totalCount: number;
  /** Aired + monitored + no file (the amber "missing" count). */
  missingCount: number;
  episodes: EpisodeStatus[];
}

/** Has this episode aired by `nowMs`? A missing/absent air date = TBA = not aired. */
export function isAired(airDate: string | null | undefined, nowMs: number): boolean {
  if (!airDate) return false;
  const t = Date.parse(airDate);
  if (Number.isNaN(t)) return false;
  return t <= nowMs;
}

/**
 * Roll episodes up into per-season status. Seasons are ordered newest-first with
 * Specials (season 0) last, matching Sonarr. An episode counts as "aired" if its
 * air date is in the past OR it already has a file (so a file can't exceed the
 * total). Missing = aired && monitored && !hasFile. TBA episodes (no air date)
 * are neither aired nor missing — they show as "unaired".
 *
 * @param seasons  Per-season meta (monitored flag), matched by seasonNumber.
 * @param episodes All episodes for the series.
 * @param nowMs    Clock (injectable for tests).
 */
export function deriveSeasons(
  seasons: Pick<SonarrSeasonInfo, 'seasonNumber' | 'monitored'>[],
  episodes: SonarrEpisode[],
  nowMs: number = Date.now(),
): SeasonRollup[] {
  const seasonMonitored = new Map(seasons.map((s) => [s.seasonNumber, s.monitored]));

  const bySeason = new Map<number, SonarrEpisode[]>();
  for (const e of episodes) {
    const list = bySeason.get(e.seasonNumber) ?? [];
    list.push(e);
    bySeason.set(e.seasonNumber, list);
  }

  const rollups: SeasonRollup[] = [];
  for (const [seasonNumber, eps] of bySeason) {
    const ordered = [...eps].sort((a, b) => a.episodeNumber - b.episodeNumber);
    const episodeStatuses: EpisodeStatus[] = ordered.map((e) => ({
      n: e.episodeNumber,
      title: e.title,
      airDate: e.airDate,
      hasFile: e.hasFile,
      monitored: e.monitored,
      aired: isAired(e.airDate, nowMs) || e.hasFile,
    }));
    const haveCount = episodeStatuses.filter((e) => e.hasFile).length;
    const totalCount = episodeStatuses.filter((e) => e.aired).length;
    const missingCount = episodeStatuses.filter(
      (e) => e.aired && e.monitored && !e.hasFile,
    ).length;
    rollups.push({
      seasonNumber,
      monitored: seasonMonitored.get(seasonNumber) ?? false,
      haveCount,
      totalCount,
      missingCount,
      episodes: episodeStatuses,
    });
  }

  rollups.sort((a, b) => {
    if (a.seasonNumber === 0) return 1; // Specials last
    if (b.seasonNumber === 0) return -1;
    return b.seasonNumber - a.seasonNumber; // newest season first
  });
  return rollups;
}
