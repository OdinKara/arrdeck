/**
 * MovieDetailScreen — Radarr movie detail (read + edit + search). Header info
 * chips, synopsis, amber Edit button, and a Search button (MoviesSearch) shown
 * only when the movie is released and still missing. Writes refresh the detail
 * and notify the Deck.
 */

import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Pencil, Search as SearchIcon, Star, Clock, Loader2, Check, ListChecks } from 'lucide-react';
import {
  moviesSearchCommand,
  type RadarrClient,
  type RadarrMovieDetail,
  type ServiceConfig,
} from '../../engine/index.js';
import { resolveRadarr } from '../lib/clients.js';
import { notifyDataChanged } from '../lib/dataEvents.js';
import { Button, Card, Spinner } from '../components/ui.tsx';
import { Poster, Skeleton, KindBadge } from '../components/visuals.tsx';
import { EditMovieForm } from './EditMovieForm.tsx';
import { ReleaseListScreen } from './ReleaseListScreen.tsx';

export function MovieDetailScreen({
  services,
  movieId,
  onBack,
}: {
  services: ServiceConfig[];
  movieId: number;
  onBack: () => void;
}) {
  const [client, setClient] = useState<RadarrClient | null>(null);
  const [detail, setDetail] = useState<RadarrMovieDetail | null>(null);
  const [profileName, setProfileName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [interactive, setInteractive] = useState(false);
  const [searching, setSearching] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((m: string) => {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 2600);
  }, []);

  const load = useCallback(
    async (c: RadarrClient) => {
      const [d, profiles] = await Promise.all([
        c.getMovieById(movieId),
        c.getQualityProfiles().catch(() => []),
      ]);
      setDetail(d);
      setProfileName(profiles.find((p) => p.id === d.qualityProfileId)?.name ?? '');
    },
    [movieId],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await resolveRadarr(services);
      if (!r) {
        if (!cancelled) setError('Radarr offline');
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

  async function search() {
    if (!client || !detail) return;
    setSearching(true);
    try {
      await client.runCommand(moviesSearchCommand([detail.id]));
      showToast('Search started — check the queue');
      notifyDataChanged();
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setSearching(false);
    }
  }

  if (interactive && client && detail) {
    return (
      <ReleaseListScreen
        title={detail.title}
        fetchReleases={() => client.getReleases(movieId)}
        grabRelease={(guid, indexerId) => client.grabRelease(guid, indexerId)}
        onBack={() => setInteractive(false)}
      />
    );
  }

  if (editing && client && detail) {
    return (
      <EditMovieForm
        client={client}
        movieId={movieId}
        movieTitle={detail.title}
        onCancel={() => setEditing(false)}
        onSaved={async () => {
          setEditing(false);
          if (client) await load(client);
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

  if (!detail) {
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

  const released = detail.status.toLowerCase() === 'released';
  const statusLabel =
    detail.status.toLowerCase() === 'released'
      ? 'Released'
      : detail.status.toLowerCase() === 'announced'
        ? 'Announced'
        : detail.status.toLowerCase() === 'incinemas'
          ? 'In Cinemas'
          : detail.status || '—';

  return (
    <div className="ad-col-wide" style={{ paddingBottom: 24 }}>
      <div style={{ position: 'relative' }}>
        {detail.posterUrl && (
          <div style={{ position: 'absolute', inset: 0, backgroundImage: `url(${detail.posterUrl})`, backgroundSize: 'cover', backgroundPosition: 'center 20%', filter: 'blur(28px) saturate(1.1)', opacity: 0.32 }} />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, transparent 15%, var(--bg) 96%)' }} />
        <div style={{ position: 'relative', padding: 16 }}>
          <BackBtn onBack={onBack} />
          <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
            <Poster url={detail.posterUrl} width={104} />
            <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
                <KindBadge kind="movie" />
                {detail.certification && <CertBadge cert={detail.certification} />}
              </div>
              <div style={{ fontSize: 19, fontWeight: 500, lineHeight: 1.2 }}>{detail.title}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9, marginTop: 8, color: 'var(--text-3)', fontSize: 13 }}>
                {detail.year > 0 && <span>{detail.year}</span>}
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
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>{detail.genres.slice(0, 3).join(' · ')}</div>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 14 }}>
            <InfoChip label={statusLabel} tone={released ? 'green' : 'muted'} />
            <InfoChip label={detail.hasFile ? 'Downloaded' : 'Missing'} tone={detail.hasFile ? 'green' : detail.monitored ? 'amber' : 'muted'} />
            <InfoChip label={detail.monitored ? 'Monitored' : 'Unmonitored'} tone={detail.monitored ? 'amber' : 'muted'} />
            {profileName && <InfoChip label={profileName} />}
            {detail.path && <InfoChip label={detail.path} mono />}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 14 }}>
            <button
              onClick={() => setEditing(true)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--amber)', border: 'none', borderRadius: 'var(--radius-sm)', color: '#1a1205', padding: '9px 16px', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
            >
              <Pencil size={15} /> Edit
            </button>
            {/* Always-visible secondary Search button. Enabled when released
                (Radarr can search for an upgrade even if a file exists); disabled
                with a hint when the movie hasn't been released yet. */}
            <button
              onClick={search}
              disabled={!released || searching}
              title={!released ? 'Not released yet' : undefined}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--amber)',
                padding: '9px 16px',
                fontSize: 14,
                fontWeight: 500,
                cursor: released && !searching ? 'pointer' : 'default',
                opacity: released ? 1 : 0.5,
              }}
            >
              {searching ? (
                <Loader2 size={15} style={{ animation: 'arrdeck-spin 900ms linear infinite' }} />
              ) : (
                <SearchIcon size={15} />
              )}
              {searching ? 'Searching…' : detail.hasFile ? 'Search again' : 'Search'}
            </button>
            {/* Interactive search — manually pick which release to grab. */}
            <button
              onClick={() => setInteractive(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--amber)',
                padding: '9px 16px',
                fontSize: 14,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <ListChecks size={15} /> Interactive
            </button>
            {!released && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Not released yet</span>}
          </div>
        </div>
      </div>

      <div style={{ padding: '4px 14px 0' }}>
        {detail.hasFile && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--green)', fontSize: 13, marginBottom: 12 }}>
            <Check size={15} /> In library
          </div>
        )}
        {detail.overview && (
          <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55, margin: '4px 0 18px' }}>{detail.overview}</p>
        )}
      </div>

      {toast && (
        <div style={{ position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 999, padding: '9px 16px', fontSize: 13, color: 'var(--text)', boxShadow: '0 6px 20px rgba(0,0,0,0.4)', zIndex: 40 }}>
          {toast}
        </div>
      )}
    </div>
  );
}

function InfoChip({ label, tone, mono }: { label: string; tone?: 'green' | 'amber' | 'muted'; mono?: boolean }) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'var(--text-2)';
  return (
    <span style={{ fontSize: 11, fontWeight: 500, color, background: 'var(--surface-recessed)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 8px', fontFamily: mono ? 'ui-monospace, monospace' : 'inherit', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
      {label}
    </span>
  );
}

function CertBadge({ cert }: { cert: string }) {
  return (
    <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.04em', color: 'var(--red)', border: '1px solid color-mix(in srgb, var(--red) 45%, transparent)', background: 'var(--red-bg)', borderRadius: 5, padding: '1px 6px' }}>
      {cert}
    </span>
  );
}

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} aria-label="Back" style={{ background: 'color-mix(in srgb, var(--bg) 60%, transparent)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text)', padding: 8, cursor: 'pointer', display: 'inline-flex' }}>
      <ArrowLeft size={18} />
    </button>
  );
}
