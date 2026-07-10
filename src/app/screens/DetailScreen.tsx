/**
 * DetailScreen — decision-support metadata + the grab.
 *
 * Real quality profiles and root folders are pulled from the matching service;
 * the grab builds the add payload from the raw lookup object and POSTs it
 * (addMovie / addSeries) with monitored + search-on-add. Already-owned titles
 * show an "In library" state instead of a grab button.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, Check, Star, Clock, Folder, HardDrive, Loader2 } from 'lucide-react';
import {
  buildRadarrAddPayload,
  buildSonarrAddPayload,
  type RadarrClient,
  type SonarrClient,
  type SearchResult,
} from '../../engine/index.js';
import { fmtBytes } from '../lib/format.js';
import { notifyDataChanged } from '../lib/dataEvents.js';
import { Button, Card } from '../components/ui.tsx';
import { KindBadge, Poster, Skeleton } from '../components/visuals.tsx';

interface Profile {
  id: number;
  name: string;
}
interface Root {
  id: number;
  path: string;
  freeSpace: number;
}

type GrabState = 'idle' | 'grabbing' | 'success' | 'error';

export function DetailScreen({
  result,
  radarr,
  sonarr,
  onBack,
  onGrabbed,
}: {
  result: SearchResult;
  radarr?: RadarrClient;
  sonarr?: SonarrClient;
  onBack: () => void;
  onGrabbed: () => void;
}) {
  const isMovie = result.kind === 'movie';
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [roots, setRoots] = useState<Root[] | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [searchOnAdd, setSearchOnAdd] = useState(true);
  const [grab, setGrab] = useState<GrabState>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const client = isMovie ? radarr : sonarr;
      if (!client) return;
      const [ps, rs] = await Promise.all([
        client.getQualityProfiles().catch(() => []),
        client.getRootFolders().catch(() => []),
      ]);
      if (cancelled) return;
      setProfiles(ps);
      setRoots(rs);
      if (ps[0]) setProfileId(ps[0].id);
      // Default to the largest root folder (no rating-based auto-routing — that
      // is the opt-in setting for later).
      const biggest = [...rs].sort((a, b) => b.freeSpace - a.freeSpace)[0];
      if (biggest) setRootPath(biggest.path);
    })();
    return () => {
      cancelled = true;
    };
  }, [isMovie, radarr, sonarr]);

  async function doGrab() {
    if (profileId == null || rootPath == null) return;
    setGrab('grabbing');
    setError(null);
    try {
      if (isMovie) {
        if (!radarr) throw new Error('Radarr not available');
        const payload = buildRadarrAddPayload(result.raw, {
          qualityProfileId: profileId,
          rootFolderPath: rootPath,
          monitored: true,
          searchForMovie: searchOnAdd,
        });
        await radarr.addMovie(payload);
      } else {
        if (!sonarr) throw new Error('Sonarr not available');
        const payload = buildSonarrAddPayload(result.raw, {
          qualityProfileId: profileId,
          rootFolderPath: rootPath,
          monitored: true,
          searchForMissingEpisodes: searchOnAdd,
        });
        await sonarr.addSeries(payload);
      }
      setGrab('success');
      // Announce the write so the Deck refetches immediately (queue 0 -> 1)
      // and re-races addresses on next fetch.
      notifyDataChanged();
      setTimeout(onGrabbed, 1100);
    } catch (err) {
      setGrab('error');
      setError((err as Error).message);
    }
  }

  const accent = isMovie ? 'var(--blue)' : 'var(--purple)';

  return (
    <div className="ad-col" style={{ paddingBottom: 20 }}>
      {/* Backdrop header */}
      <div style={{ position: 'relative' }}>
        {result.posterUrl && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: `url(${result.posterUrl})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center 20%',
              filter: 'blur(28px) saturate(1.1)',
              opacity: 0.35,
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, transparent 20%, var(--bg) 96%)',
          }}
        />
        <div style={{ position: 'relative', padding: 16 }}>
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
          <div style={{ display: 'flex', gap: 14, marginTop: 14 }}>
            <Poster url={result.posterUrl} width={104} />
            <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
                <KindBadge kind={result.kind} />
                {result.certification && <CertBadge cert={result.certification} />}
              </div>
              <div style={{ fontSize: 19, fontWeight: 500, lineHeight: 1.2 }}>{result.title}</div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginTop: 8,
                  color: 'var(--text-3)',
                  fontSize: 13,
                }}
              >
                {result.year > 0 && <span>{result.year}</span>}
                {result.runtimeOrEpisodes && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Clock size={13} /> {result.runtimeOrEpisodes}
                  </span>
                )}
                {result.rating > 0 && (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <Star size={13} color="var(--amber)" /> {result.rating.toFixed(1)}
                  </span>
                )}
              </div>
              {result.genres.length > 0 && (
                <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
                  {result.genres.slice(0, 3).join(' · ')}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '4px 16px 0' }}>
        {result.overview && (
          <p style={{ color: 'var(--text-2)', fontSize: 14, lineHeight: 1.55, margin: '10px 0 20px' }}>
            {result.overview}
          </p>
        )}

        {result.inLibrary ? (
          <Card style={{ display: 'flex', alignItems: 'center', gap: 10, borderColor: 'var(--green)' }}>
            <Check size={18} color="var(--green)" />
            <span style={{ color: 'var(--green)', fontWeight: 500 }}>Already in your library</span>
          </Card>
        ) : (
          <>
            {/* Quality profile */}
            <div className="micro-label" style={{ margin: '2px 2px 9px' }}>
              Quality profile
            </div>
            {profiles == null ? (
              <Skeleton height={36} style={{ marginBottom: 20 }} />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                {profiles.map((p) => {
                  const sel = p.id === profileId;
                  return (
                    <Chip key={p.id} selected={sel} onClick={() => setProfileId(p.id)}>
                      {p.name}
                    </Chip>
                  );
                })}
              </div>
            )}

            {/* Root folder */}
            <div className="micro-label" style={{ margin: '2px 2px 9px' }}>
              Root folder
            </div>
            {roots == null ? (
              <Skeleton height={54} style={{ marginBottom: 20 }} />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                {roots.map((r) => {
                  const sel = r.path === rootPath;
                  return (
                    <button
                      key={r.id}
                      onClick={() => setRootPath(r.path)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 11,
                        padding: '11px 13px',
                        borderRadius: 'var(--radius-sm)',
                        border: `1px solid ${sel ? 'var(--amber)' : 'var(--border)'}`,
                        background: sel ? 'color-mix(in srgb, var(--amber) 8%, var(--surface))' : 'var(--surface)',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span
                        style={{
                          width: 18,
                          height: 18,
                          borderRadius: '50%',
                          border: `2px solid ${sel ? 'var(--amber)' : 'var(--muted)'}`,
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {sel && (
                          <span
                            style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }}
                          />
                        )}
                      </span>
                      <Folder size={15} color="var(--text-3)" />
                      <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontFamily: 'ui-monospace, monospace' }}>
                        {r.path}
                      </span>
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          fontSize: 12,
                          color: 'var(--muted)',
                        }}
                      >
                        <HardDrive size={12} /> {fmtBytes(r.freeSpace)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Monitor / search-on-add */}
            <div className="micro-label" style={{ margin: '2px 2px 9px' }}>
              On add
            </div>
            <button
              onClick={() => setSearchOnAdd((v) => !v)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '11px 13px',
                borderRadius: 'var(--radius-sm)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                cursor: 'pointer',
                marginBottom: 20,
              }}
            >
              <Toggle on={searchOnAdd} />
              <span style={{ flex: 1, textAlign: 'left', fontSize: 14, color: 'var(--text)' }}>
                {isMovie ? 'Search for the movie now' : 'Search for missing episodes now'}
              </span>
            </button>

            {/* Grab */}
            {grab === 'success' ? (
              <Card style={{ display: 'flex', alignItems: 'center', gap: 10, borderColor: 'var(--green)' }}>
                <Check size={18} color="var(--green)" />
                <span style={{ color: 'var(--green)', fontWeight: 500 }}>
                  Added — {searchOnAdd ? 'searching now' : 'monitored'}
                </span>
              </Card>
            ) : (
              <Button
                onClick={doGrab}
                disabled={grab === 'grabbing' || profileId == null || rootPath == null}
                style={{ borderLeft: `4px solid ${accent}` }}
              >
                {grab === 'grabbing' ? (
                  <Loader2 size={17} style={{ animation: 'arrdeck-spin 900ms linear infinite' }} />
                ) : (
                  <Check size={17} />
                )}
                {grab === 'grabbing'
                  ? 'Adding…'
                  : `Add to ${rootPath ?? '…'} · Grab now`}
              </Button>
            )}
            {grab === 'error' && error && (
              <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{error}</div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Chip({
  children,
  selected,
  onClick,
}: {
  children: React.ReactNode;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '8px 13px',
        borderRadius: 999,
        border: `1px solid ${selected ? 'var(--amber)' : 'var(--border)'}`,
        background: selected ? 'var(--amber)' : 'var(--surface)',
        color: selected ? '#1a1205' : 'var(--text-2)',
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );
}

function Toggle({ on }: { on: boolean }) {
  return (
    <span
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        background: on ? 'var(--amber)' : 'var(--surface-recessed)',
        border: `1px solid ${on ? 'var(--amber)' : 'var(--border)'}`,
        position: 'relative',
        flexShrink: 0,
        transition: 'background 140ms ease',
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 18 : 2,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: on ? '#1a1205' : 'var(--muted)',
          transition: 'left 140ms ease',
        }}
      />
    </span>
  );
}

function CertBadge({ cert }: { cert: string }) {
  return (
    <span
      style={{
        fontSize: 10,
        fontWeight: 500,
        letterSpacing: '0.04em',
        color: 'var(--red)',
        border: '1px solid color-mix(in srgb, var(--red) 45%, transparent)',
        background: 'var(--red-bg)',
        borderRadius: 5,
        padding: '1px 6px',
      }}
    >
      {cert}
    </span>
  );
}
