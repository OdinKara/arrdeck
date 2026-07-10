/**
 * ReleaseListScreen — interactive search (manual release selection) for a
 * Radarr movie already in the library. Fetches candidate releases, lets the
 * user sort (quality/size/seeders/CF) and optionally hide rejected, and grab a
 * SPECIFIC release — including a rejected one (the manual override). Matches the
 * charcoal/amber command-center language.
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Flag, Loader2, Search as SearchIcon } from 'lucide-react';
import {
  sortReleases,
  filterOutRejected,
  type Release,
  type ReleaseSortKey,
} from '../../engine/index.js';
import { notifyDataChanged } from '../lib/dataEvents.js';
import { fmtBytes } from '../lib/format.js';
import { Card, Spinner } from '../components/ui.tsx';

const spin = 'arrdeck-spin 900ms linear infinite';

const SORT_OPTIONS: { value: ReleaseSortKey; label: string }[] = [
  { value: 'quality', label: 'Quality' },
  { value: 'size', label: 'Size' },
  { value: 'seeders', label: 'Seeders' },
  { value: 'cfScore', label: 'CF Score' },
];

/** Humanize a release age given in (fractional) hours. */
function fmtAge(ageHours: number): string {
  if (!Number.isFinite(ageHours) || ageHours <= 0) return '—';
  if (ageHours < 24) return `${Math.round(ageHours)}h`;
  const days = ageHours / 24;
  if (days < 365) return `${Math.round(days)}d`;
  return `${(days / 365).toFixed(1)}y`;
}

export function ReleaseListScreen({
  title,
  fetchReleases,
  grabRelease,
  onBack,
}: {
  /** Context line under "Interactive Search" (movie title, "S02E05 · Title", "Season 2"). */
  title: string;
  /** Fetch the candidate releases (Radarr movie / Sonarr episode or season). */
  fetchReleases: () => Promise<Release[]>;
  /** Grab one specific release; the screen handles the toast + data refresh. */
  grabRelease: (guid: string, indexerId: number) => Promise<unknown>;
  onBack: () => void;
}) {
  const [releases, setReleases] = useState<Release[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ReleaseSortKey>('quality');
  const [hideRejected, setHideRejected] = useState(false);
  const [grabbing, setGrabbing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  function showToast(m: string) {
    setToast(m);
    setTimeout(() => setToast((t) => (t === m ? null : t)), 2600);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchReleases();
        if (!cancelled) setReleases(list);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shown = useMemo(() => {
    const base = releases ?? [];
    return sortReleases(hideRejected ? filterOutRejected(base) : base, sortKey);
  }, [releases, hideRejected, sortKey]);

  async function grab(r: Release) {
    if (grabbing) return;
    setGrabbing(r.guid);
    showToast('Sending…');
    try {
      await grabRelease(r.guid, r.indexerId);
      notifyDataChanged(); // Deck/Queue pick up the new grab
      showToast('Grabbed — check the queue');
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setGrabbing(null);
    }
  }

  const rejectedCount = (releases ?? []).filter((r) => r.rejected).length;

  return (
    <div className="ad-col-wide" style={{ padding: '16px 14px 28px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={onBack} aria-label="Back" style={backBtn}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ minWidth: 0 }}>
          <div className="micro-label" style={{ color: 'var(--amber)' }}>Interactive Search</div>
          <div style={{ fontSize: 17, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {title}
          </div>
        </div>
      </header>

      {/* Controls */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        {SORT_OPTIONS.map((o) => {
          const sel = o.value === sortKey;
          return (
            <button key={o.value} onClick={() => setSortKey(o.value)} style={chip(sel)}>
              {o.label}
            </button>
          );
        })}
        <div style={{ flex: 1 }} />
        <button
          onClick={() => setHideRejected((v) => !v)}
          style={chip(hideRejected)}
          title="Rejected releases are shown by default so you can override"
        >
          {hideRejected ? 'Rejected hidden' : `Hide rejected${rejectedCount ? ` (${rejectedCount})` : ''}`}
        </button>
      </div>

      {/* Loading */}
      {releases === null && !error && (
        <Card recessed>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: 'var(--text-2)', fontSize: 14 }}>
            <Spinner /> Searching indexers…
          </div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 8 }}>
            This can take several seconds — indexers are slow.
          </div>
        </Card>
      )}

      {error && (
        <Card recessed>
          <div style={{ color: 'var(--red)', fontSize: 14 }}>{error}</div>
        </Card>
      )}

      {/* Empty */}
      {releases !== null && releases.length === 0 && (
        <Card recessed>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--text-2)', fontSize: 14 }}>
            <SearchIcon size={15} /> No releases found — indexers returned nothing.
          </div>
        </Card>
      )}

      {/* All hidden by the toggle */}
      {releases !== null && releases.length > 0 && shown.length === 0 && (
        <Card recessed>
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>
            All {releases.length} releases were rejected — toggle “Hide rejected” off to grab one anyway.
          </div>
        </Card>
      )}

      {/* Rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {shown.map((r) => {
          const isTorrent = r.protocol === 'torrent';
          const isExpanded = expanded === r.guid;
          const isGrabbing = grabbing === r.guid;
          return (
            <Card key={r.guid} style={{ padding: 13, borderColor: r.rejected ? 'color-mix(in srgb, var(--red) 35%, var(--border))' : 'var(--border)' }}>
              {/* Line 1: quality · size · CF */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 7 }}>
                <span style={qualBadge}>{r.quality.name}</span>
                <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{fmtBytes(r.size)}</span>
                <span style={{ fontSize: 12, color: cfColor(r.customFormatScore) }}>CF {r.customFormatScore}</span>
                <div style={{ flex: 1 }} />
                <button onClick={() => grab(r)} disabled={isGrabbing} style={grabBtn(isGrabbing)}>
                  {isGrabbing ? <Loader2 size={14} style={{ animation: spin }} /> : <Download size={14} />}
                  {isGrabbing ? 'Grabbing…' : 'Grab'}
                </button>
              </div>

              {/* Line 2: title + release group */}
              <div
                onClick={() => setExpanded(isExpanded ? null : r.guid)}
                style={{
                  fontSize: 13,
                  color: 'var(--text-2)',
                  fontFamily: 'ui-monospace, monospace',
                  cursor: 'pointer',
                  ...(isExpanded
                    ? { wordBreak: 'break-all' }
                    : { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }),
                }}
              >
                {r.title}
                {r.releaseGroup ? <span style={{ color: 'var(--muted)' }}> · {r.releaseGroup}</span> : null}
              </div>

              {/* Line 3: indexer · languages · seeders/age */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 7, fontSize: 12, color: 'var(--muted)' }}>
                <span>{r.indexer}</span>
                {r.languages.length > 0 && <span>· {r.languages.join(', ')}</span>}
                {isTorrent && r.seeders != null ? (
                  <span style={{ color: r.seeders > 0 ? 'var(--green)' : 'var(--muted)' }}>
                    · {r.seeders} seed{r.seeders === 1 ? '' : 's'}
                  </span>
                ) : (
                  <span>· {fmtAge(r.ageHours)}</span>
                )}
                <span>· {isTorrent ? 'torrent' : 'usenet'}</span>
              </div>

              {/* Rejected reasons — still grabbable */}
              {r.rejected && (
                <div style={{ display: 'flex', gap: 7, marginTop: 9, color: 'var(--red)', fontSize: 12 }}>
                  <Flag size={13} style={{ flexShrink: 0, marginTop: 1 }} />
                  <span>{r.rejections.length > 0 ? r.rejections.join(' · ') : 'Rejected by Radarr'}</span>
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {toast && (
        <div style={toastStyle}>{toast}</div>
      )}
    </div>
  );
}

// --- styles ---------------------------------------------------------------

const backBtn = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--text-2)',
  padding: 8,
  cursor: 'pointer',
  display: 'inline-flex',
  flexShrink: 0,
} as const;

function chip(sel: boolean) {
  return {
    padding: '7px 12px',
    borderRadius: 999,
    border: `1px solid ${sel ? 'var(--amber)' : 'var(--border)'}`,
    background: sel ? 'var(--amber)' : 'var(--surface)',
    color: sel ? '#1a1205' : 'var(--text-2)',
    fontSize: 12.5,
    fontWeight: 500,
    cursor: 'pointer',
  } as const;
}

const qualBadge = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.02em',
  color: 'var(--text)',
  background: 'var(--surface-recessed)',
  border: '1px solid var(--border)',
  borderRadius: 5,
  padding: '2px 7px',
} as const;

function cfColor(score: number): string {
  if (score > 0) return 'var(--green)';
  if (score < 0) return 'var(--red)';
  return 'var(--muted)';
}

function grabBtn(disabled: boolean) {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'var(--amber)',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: '#1a1205',
    padding: '7px 13px',
    fontSize: 13,
    fontWeight: 600,
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.7 : 1,
    flexShrink: 0,
  } as const;
}

const toastStyle = {
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
} as const;
