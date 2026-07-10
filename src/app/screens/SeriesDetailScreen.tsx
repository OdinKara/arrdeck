/**
 * SeriesDetailScreen — Sonarr series detail with native edit + search writes.
 *
 * Header info chips + Edit button (opens the native EditSeriesForm). Collapsible
 * seasons each carry a monitored toggle + a SeasonSearch icon; aired episodes
 * carry an EpisodeSearch icon. All writes hit the real stack, then the detail
 * reloads and notifyDataChanged() refreshes the Deck (same discipline as 3d).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Pencil, ChevronDown, ChevronRight, Star, Clock, Search as SearchIcon, Loader2, ListChecks } from 'lucide-react';
import {
  buildSeriesUpdatePayload,
  deriveSeasons,
  episodeSearchCommand,
  seasonSearchCommand,
  type SonarrClient,
  type SonarrEpisodeFile,
  type SonarrSeriesDetail,
  type SeasonRollup,
  type ServiceConfig,
} from '../../engine/index.js';
import { resolveSonarr } from '../lib/clients.js';
import { notifyDataChanged } from '../lib/dataEvents.js';
import { Card, Spinner } from '../components/ui.tsx';
import { Toggle } from '../components/form.tsx';
import { SponsorHeart } from '../components/SponsorHeart.tsx';
import { Poster, Skeleton } from '../components/visuals.tsx';
import { EditSeriesForm } from './EditSeriesForm.tsx';
import { ReleaseListScreen } from './ReleaseListScreen.tsx';

/** Which interactive-search target is open (episode or whole season). */
type Interactive =
  | { kind: 'episode'; episodeId: number; title: string }
  | { kind: 'season'; seasonNumber: number; title: string }
  | null;

interface Loaded {
  detail: SonarrSeriesDetail;
  seasons: SeasonRollup[];
  profileName: string;
  qualityByFileId: Map<number, string>;
  episodeFileIdByKey: Map<string, number>;
  episodeIdByKey: Map<string, number>;
}

export function SeriesDetailScreen({
  services,
  seriesId,
  onBack,
}: {
  services: ServiceConfig[];
  seriesId: number;
  onBack: () => void;
}) {
  const [client, setClient] = useState<SonarrClient | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState(false);
  const [interactive, setInteractive] = useState<Interactive>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [busySeason, setBusySeason] = useState<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  }, []);

  const load = useCallback(
    async (c: SonarrClient, keepExpanded = false) => {
      const [detail, episodes, profiles, files] = await Promise.all([
        c.getSeriesById(seriesId),
        c.getEpisodes(seriesId),
        c.getQualityProfiles().catch(() => []),
        c.getEpisodeFiles(seriesId).catch(() => [] as SonarrEpisodeFile[]),
      ]);
      const seasons = deriveSeasons(detail.seasons, episodes, Date.now());
      const profileName = profiles.find((p) => p.id === detail.qualityProfileId)?.name ?? '';
      const qualityByFileId = new Map(files.map((f) => [f.id, f.quality]));
      const episodeFileIdByKey = new Map(
        episodes.filter((e) => e.episodeFileId > 0).map((e) => [`${e.seasonNumber}x${e.episodeNumber}`, e.episodeFileId]),
      );
      const episodeIdByKey = new Map(episodes.map((e) => [`${e.seasonNumber}x${e.episodeNumber}`, e.id]));
      if (!keepExpanded) {
        const firstReal = seasons.find((s) => s.seasonNumber !== 0) ?? seasons[0];
        setExpanded(new Set(firstReal ? [firstReal.seasonNumber] : []));
      }
      setLoaded({ detail, seasons, profileName, qualityByFileId, episodeFileIdByKey, episodeIdByKey });
    },
    [seriesId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await resolveSonarr(services);
      if (!r) {
        if (!cancelled) setError('Sonarr offline');
        return;
      }
      setClient(r.client);
      try {
        await load(r.client);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [services, load]);

  function toggle(n: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  async function searchEpisode(seasonNumber: number, n: number) {
    if (!client || !loaded) return;
    const id = loaded.episodeIdByKey.get(`${seasonNumber}x${n}`);
    if (!id) return;
    try {
      await client.runCommand(episodeSearchCommand([id]));
      showToast(`Searching ${seasonNumber}x${String(n).padStart(2, '0')}…`);
      notifyDataChanged();
    } catch (e) {
      showToast((e as Error).message);
    }
  }

  async function searchSeason(seasonNumber: number) {
    if (!client || !loaded) return;
    setBusySeason(seasonNumber);
    try {
      await client.runCommand(seasonSearchCommand(loaded.detail.id, seasonNumber));
      showToast(seasonNumber === 0 ? 'Searching Specials…' : `Searching Season ${seasonNumber}…`);
      notifyDataChanged();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusySeason(null);
    }
  }

  /** Open the shared interactive picker for one episode. */
  function interactiveEpisode(seasonNumber: number, n: number) {
    if (!loaded) return;
    const id = loaded.episodeIdByKey.get(`${seasonNumber}x${n}`);
    if (!id) return;
    const code = `S${String(seasonNumber).padStart(2, '0')}E${String(n).padStart(2, '0')}`;
    const epTitle = loaded.seasons
      .find((s) => s.seasonNumber === seasonNumber)
      ?.episodes.find((e) => e.n === n)?.title;
    setInteractive({ kind: 'episode', episodeId: id, title: epTitle ? `${code} · ${epTitle}` : code });
  }

  /** Open the shared interactive picker for a whole season. */
  function interactiveSeason(seasonNumber: number) {
    setInteractive({
      kind: 'season',
      seasonNumber,
      title: seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`,
    });
  }

  async function toggleSeasonMonitored(seasonNumber: number, current: boolean) {
    if (!client) return;
    setBusySeason(seasonNumber);
    try {
      const raw = await client.getSeriesRaw(loaded!.detail.id);
      const payload = buildSeriesUpdatePayload(raw, { seasonMonitored: { [seasonNumber]: !current } });
      await client.updateSeries(payload);
      await load(client, true);
      notifyDataChanged();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusySeason(null);
    }
  }

  if (interactive && client && loaded) {
    const seriesId = loaded.detail.id;
    return (
      <ReleaseListScreen
        title={interactive.title}
        fetchReleases={() =>
          interactive.kind === 'episode'
            ? client.getEpisodeReleases(interactive.episodeId)
            : client.getSeasonReleases(seriesId, interactive.seasonNumber)
        }
        grabRelease={(guid, indexerId) => client.grabRelease(guid, indexerId)}
        onBack={() => setInteractive(null)}
      />
    );
  }

  if (editing && client && loaded) {
    return (
      <EditSeriesForm
        client={client}
        seriesId={seriesId}
        seriesTitle={loaded.detail.title}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          if (client) await load(client, true);
          notifyDataChanged();
          showToast('Saved');
        }}
        onDeleted={() => {
          notifyDataChanged();
          onBack();
        }}
      />
    );
  }

  if (error) {
    return (
      <div className="ad-col-wide" style={{ padding: 18 }}>
        <BackBtn onBack={onBack} />
        <Card recessed style={{ marginTop: 14 }}>
          <div style={{ color: 'var(--text-2)' }}>{error}</div>
        </Card>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="ad-col-wide" style={{ padding: 18 }}>
        <BackBtn onBack={onBack} />
        <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
          <Skeleton height={150} width={100} radius={8} />
          <div style={{ flex: 1 }}>
            <Skeleton height={22} width="70%" />
            <div style={{ height: 10 }} />
            <Skeleton height={14} width="50%" />
          </div>
        </div>
        <div style={{ marginTop: 20 }}>
          <Spinner />
        </div>
      </div>
    );
  }

  const { detail, seasons, profileName } = loaded;
  const statusLabel =
    detail.status.toLowerCase() === 'continuing'
      ? 'Continuing'
      : detail.status.toLowerCase() === 'ended'
        ? 'Ended'
        : detail.status || '—';

  return (
    <div className="ad-col-wide" style={{ paddingBottom: 24 }}>
      {/* Header */}
      <div style={{ position: 'relative' }}>
        {detail.posterUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${detail.posterUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center 20%',
              filter: 'blur(28px) saturate(1.1)',
              opacity: 0.32,
            }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 15%, var(--bg) 96%)' }} />
        <div style={{ position: 'relative', padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <BackBtn onBack={onBack} />
            <SponsorHeart variant="hero" />
          </div>
          <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
            <Poster url={detail.posterUrl} width={104} />
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div style={{ fontSize: 19, fontWeight: 500, lineHeight: 1.2 }}>{detail.title}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 8, color: 'var(--text-3)', fontSize: 13 }}>
                {detail.year > 0 && <span>{detail.year}</span>}
                {detail.network && <span>{detail.network}</span>}
                {detail.runtime > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={13} /> {detail.runtime}m
                  </span>
                )}
                {detail.rating > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Star size={13} color="var(--amber)" /> {detail.rating.toFixed(1)}
                  </span>
                )}
              </div>
              {detail.genres.length > 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
                  {detail.genres.slice(0, 3).join(' · ')}
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
            <InfoChip label={statusLabel} tone={detail.status.toLowerCase() === 'continuing' ? 'green' : 'muted'} />
            <InfoChip label={detail.monitored ? 'Monitored' : 'Unmonitored'} tone={detail.monitored ? 'amber' : 'muted'} />
            {profileName && <InfoChip label={profileName} />}
            {detail.path && <InfoChip label={detail.path} mono />}
          </div>

          <button
            onClick={() => setEditing(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              marginTop: 14,
              background: 'var(--amber)',
              border: 'none',
              borderRadius: 'var(--radius-sm)',
              color: '#1a1205',
              padding: '9px 16px',
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            <Pencil size={15} /> Edit
          </button>
        </div>
      </div>

      <div style={{ padding: '4px 14px 0' }}>
        {detail.overview && (
          <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55, margin: '8px 0 18px' }}>
            {detail.overview}
          </p>
        )}

        <div className="micro-label" style={{ margin: '2px 2px 10px' }}>
          Seasons
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {seasons.map((s) => (
            <SeasonSection
              key={s.seasonNumber}
              season={s}
              open={expanded.has(s.seasonNumber)}
              busy={busySeason === s.seasonNumber}
              onToggle={() => toggle(s.seasonNumber)}
              onToggleMonitored={() => toggleSeasonMonitored(s.seasonNumber, s.monitored)}
              onSearchSeason={() => searchSeason(s.seasonNumber)}
              onInteractiveSeason={() => interactiveSeason(s.seasonNumber)}
              onSearchEpisode={(n) => searchEpisode(s.seasonNumber, n)}
              onInteractiveEpisode={(n) => interactiveEpisode(s.seasonNumber, n)}
              qualityFor={(n) => {
                const fid = loaded.episodeFileIdByKey.get(`${s.seasonNumber}x${n}`);
                return fid ? loaded.qualityByFileId.get(fid) : undefined;
              }}
            />
          ))}
        </div>
      </div>

      {toast && (
        <div
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 24,
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 999,
            padding: '9px 16px',
            fontSize: 13,
            color: 'var(--text)',
            boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
            zIndex: 40,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}

function SeasonSection({
  season,
  open,
  busy,
  onToggle,
  onToggleMonitored,
  onSearchSeason,
  onInteractiveSeason,
  onSearchEpisode,
  onInteractiveEpisode,
  qualityFor,
}: {
  season: SeasonRollup;
  open: boolean;
  busy: boolean;
  onToggle: () => void;
  onToggleMonitored: () => void;
  onSearchSeason: () => void;
  onInteractiveSeason: () => void;
  onSearchEpisode: (n: number) => void;
  onInteractiveEpisode: (n: number) => void;
  qualityFor: (n: number) => string | undefined;
}) {
  const label = season.seasonNumber === 0 ? 'Specials' : `Season ${season.seasonNumber}`;
  const counterColor =
    season.totalCount === 0 ? 'var(--muted)' : season.missingCount > 0 ? 'var(--amber)' : 'var(--green)';
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '10px 12px' }}>
        <button
          onClick={onToggle}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flex: 1, background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', padding: '3px 0' }}
        >
          {open ? <ChevronDown size={17} color="var(--text-3)" /> : <ChevronRight size={17} color="var(--text-3)" />}
          <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text)' }}>{label}</span>
        </button>
        <span style={{ fontSize: 13, fontWeight: 500, color: counterColor, fontFamily: 'ui-monospace, monospace' }}>
          {season.haveCount}/{season.totalCount}
        </span>
        <IconAction onClick={onSearchSeason} busy={busy} aria="Auto-search season">
          <SearchIcon size={16} />
        </IconAction>
        <IconAction onClick={onInteractiveSeason} aria="Interactive season search">
          <ListChecks size={16} />
        </IconAction>
        <span title={season.monitored ? 'Monitored' : 'Unmonitored'}>
          <Toggle on={season.monitored} onToggle={onToggleMonitored} />
        </span>
      </div>

      {open && (
        <div style={{ borderTop: '1px solid var(--divider)' }}>
          {season.episodes.map((e) => {
            const state = e.hasFile ? 'have' : !e.aired ? 'unaired' : e.monitored ? 'missing' : 'skipped';
            const dot = state === 'have' ? 'var(--green)' : state === 'missing' ? 'var(--amber)' : 'var(--muted)';
            const quality = e.hasFile ? qualityFor(e.n) : undefined;
            return (
              <div key={e.n} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px 10px 36px', borderTop: '1px solid var(--divider)' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0 }} />
                <span style={{ fontSize: 12, color: 'var(--muted)', width: 34, fontFamily: 'ui-monospace, monospace' }}>
                  {season.seasonNumber}x{String(e.n).padStart(2, '0')}
                </span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {e.title || 'TBA'}
                </span>
                {quality && (
                  <span style={{ fontSize: 10, color: 'var(--green)', border: '1px solid color-mix(in srgb, var(--green) 40%, transparent)', borderRadius: 5, padding: '1px 5px' }}>
                    {quality}
                  </span>
                )}
                <span style={{ fontSize: 11, color: 'var(--muted)', minWidth: 62, textAlign: 'right' }}>
                  {e.airDate || (e.aired ? '' : 'TBA')}
                </span>
                {/* Auto-search: aired + missing. Interactive: any aired episode
                    (also lets you manually pick an upgrade for a downloaded one). */}
                <span style={{ display: 'inline-flex', gap: 6, flexShrink: 0 }}>
                  {e.aired && !e.hasFile && (
                    <IconAction onClick={() => onSearchEpisode(e.n)} aria="Auto-search episode">
                      <SearchIcon size={15} />
                    </IconAction>
                  )}
                  {e.aired ? (
                    <IconAction onClick={() => onInteractiveEpisode(e.n)} aria="Interactive episode search">
                      <ListChecks size={15} />
                    </IconAction>
                  ) : (
                    <span style={{ width: 30 }} />
                  )}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function IconAction({
  children,
  onClick,
  busy,
  aria,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  aria: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      disabled={busy}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--amber)',
        padding: 6,
        cursor: busy ? 'default' : 'pointer',
        display: 'inline-flex',
        flexShrink: 0,
      }}
    >
      {busy ? <Loader2 size={15} style={{ animation: 'arrdeck-spin 900ms linear infinite' }} /> : children}
    </button>
  );
}

function InfoChip({ label, tone, mono }: { label: string; tone?: 'green' | 'amber' | 'muted'; mono?: boolean }) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'var(--text-2)';
  return (
    <span
      style={{
        fontSize: 11,
        fontWeight: 500,
        color,
        background: 'var(--surface-recessed)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '3px 8px',
        fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
        maxWidth: 220,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button
      onClick={onBack}
      aria-label="Back"
      style={{
        background: 'color-mix(in srgb, var(--bg) 60%, transparent)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text)',
        padding: 8,
        cursor: 'pointer',
        display: 'inline-flex',
      }}
    >
      <ArrowLeft size={18} />
    </button>
  );
}
