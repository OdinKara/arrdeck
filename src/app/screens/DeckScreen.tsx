/**
 * DeckScreen — the dashboard / home tab. Live data from the configured stack:
 * connection indicator, service status row, SAB "Downloading" cards (+ empty
 * state), stat tiles (queue / disk / indexers), recently-added strip.
 */

import { useEffect, useRef, useState } from 'react';
import { Mic, RefreshCw, Search as SearchIcon, Settings, HardDrive, ListVideo, Radar, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ServiceConfig } from '../../engine/index.js';
import { useDashboard } from '../hooks/useDashboard.js';
import { useIsDesktop } from '../hooks/useIsDesktop.js';
import { SERVICE_META } from '../lib/serviceMeta.js';
import { fmtBytes, fmtMB, fmtSabSpeed } from '../lib/format.js';
import { Card, StatusDot } from '../components/ui.tsx';
import { KindBadge, Poster, ProgressBar, Skeleton } from '../components/visuals.tsx';
import type { Tab } from '../components/BottomNav.tsx';
import type { ServiceConn, RecentItem } from '../lib/dashboard.js';
import type { SabQueueItem } from '../../engine/index.js';

function deriveQuality(name: string): string | undefined {
  const m = /(2160p|4k|1080p|720p|480p)/i.exec(name);
  return m?.[1]?.toUpperCase();
}

export function DeckScreen({
  services,
  onGoTab,
  onOpenTile,
  onOpenItem,
  active,
}: {
  services: ServiceConfig[];
  onGoTab: (t: Tab) => void;
  onOpenTile: (kind: ServiceConn['kind']) => void;
  onOpenItem: (kind: 'movie' | 'show', id: number) => void;
  active: boolean;
}) {
  const { data, loading, refreshing, refresh } = useDashboard(services, active);

  return (
    <div className="ad-col" style={{ padding: '16px 16px 8px' }}>
      {/* Header */}
      <header style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 500, color: 'var(--amber)', lineHeight: 1 }}>
            ArrDeck
          </div>
          <ConnectionIndicator data={data} loading={loading} />
        </div>
        <IconBtn onClick={refresh} aria={refreshing ? 'Refreshing' : 'Refresh'}>
          <RefreshCw
            size={17}
            style={refreshing ? { animation: 'arrdeck-spin 900ms linear infinite' } : undefined}
          />
        </IconBtn>
        <div style={{ width: 8 }} />
        <IconBtn onClick={() => onGoTab('services')} aria="Settings">
          <Settings size={17} />
        </IconBtn>
      </header>

      {/* Search bar (navigates to Search tab; mic is a placeholder) */}
      <button
        onClick={() => onGoTab('search')}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '11px 13px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          color: 'var(--text-3)',
          cursor: 'pointer',
          marginBottom: 18,
        }}
      >
        <SearchIcon size={17} />
        <span style={{ flex: 1, textAlign: 'left', fontSize: 14 }}>Search movies & shows…</span>
        <Mic size={18} color="var(--amber)" />
      </button>

      {/* Service status row */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
        {loading && !data
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} height={64} radius={12} />)
          : (data?.connections ?? []).map((c) => (
              <ServiceTile key={c.kind} conn={c} onClick={() => onOpenTile(c.kind)} />
            ))}
      </div>

      {/* Downloading */}
      <SectionHeader
        label="Downloading"
        right={
          data && data.downloading.length > 0
            ? `${fmtSabSpeed(data.speed)}${data.paused ? ' · paused' : ''}`
            : undefined
        }
      />
      {loading && !data ? (
        <Skeleton height={72} radius={12} style={{ marginBottom: 22 }} />
      ) : data && data.downloading.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22 }}>
          {data.downloading.map((d) => (
            <DownloadCard key={d.nzoId} item={d} />
          ))}
        </div>
      ) : (
        <Card recessed style={{ marginBottom: 22, textAlign: 'center', padding: 22 }}>
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Nothing downloading</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
            Your queue is clear.
          </div>
        </Card>
      )}

      {/* Stat tiles */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 22 }}>
        {loading && !data ? (
          [0, 1, 2].map((i) => <Skeleton key={i} height={78} radius={12} />)
        ) : (
          <>
            <StatTile icon={<ListVideo size={16} />} label="Queue" value={String(data?.queueDepth ?? 0)} />
            <StatTile
              icon={<HardDrive size={16} />}
              label="Disk free"
              value={data?.disk ? fmtBytes(data.disk.freeBytes) : '—'}
              sub={data?.disk?.path}
            />
            <StatTile
              icon={<Radar size={16} />}
              label="Indexers"
              value={data?.indexers ? `${data.indexers.healthy}/${data.indexers.enabled}` : '—'}
              healthy={data?.indexers ? data.indexers.healthy === data.indexers.enabled : undefined}
            />
          </>
        )}
      </div>

      {/* Recently added */}
      {data && data.recent.length > 0 && (
        <>
          <SectionHeader label="Recently added" />
          <RecentRail items={data.recent} onOpen={onOpenItem} />
        </>
      )}
    </div>
  );
}

function ConnectionIndicator({
  data,
  loading,
}: {
  data: ReturnType<typeof useDashboard>['data'];
  loading: boolean;
}) {
  if (loading && !data) {
    return <div style={{ marginTop: 6 }}><Skeleton height={12} width={150} /></div>;
  }
  const p = data?.primary;
  if (!p) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
        <StatusDot state="fail" size={7} />
        <span style={{ fontSize: 12, color: 'var(--red)' }}>offline</span>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5 }}>
      <StatusDot state="ok" size={7} />
      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>
        {p.isLocal ? 'local' : 'remote'} ·{' '}
        <span style={{ fontFamily: 'ui-monospace, monospace' }}>{p.host}</span> · {p.latencyMs}ms
      </span>
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  aria,
}: {
  children: React.ReactNode;
  onClick: () => void;
  aria: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-2)',
        padding: 8,
        cursor: 'pointer',
        display: 'inline-flex',
      }}
    >
      {children}
    </button>
  );
}

function SectionHeader({ label, right }: { label: string; right?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        margin: '2px 2px 10px',
      }}
    >
      <span className="micro-label">{label}</span>
      {right && <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 500 }}>{right}</span>}
    </div>
  );
}

function ServiceTile({ conn, onClick }: { conn: ServiceConn; onClick: () => void }) {
  const meta = SERVICE_META[conn.kind];
  const Icon = meta.icon;
  const up = conn.status === 'up';
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        padding: '12px 4px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
      }}
    >
      <Icon size={22} color={up ? 'var(--green)' : 'var(--red)'} strokeWidth={1.9} />
      <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{meta.label}</span>
    </button>
  );
}

function DownloadCard({ item }: { item: SabQueueItem }) {
  const quality = deriveQuality(item.name);
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 9 }}>
        <div
          style={{
            flex: 1,
            fontSize: 14,
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.name}
        </div>
        <div style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 500 }}>
          {Math.round(item.percent)}%
        </div>
      </div>
      <ProgressBar percent={item.percent} />
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 8,
          fontSize: 12,
          color: 'var(--muted)',
        }}
      >
        <span>{fmtMB(item.sizeMB)}</span>
        {quality && <span>· {quality}</span>}
        <span style={{ flex: 1 }} />
        {item.etaText && <span>ETA {item.etaText}</span>}
      </div>
    </Card>
  );
}

function StatTile({
  icon,
  label,
  value,
  sub,
  healthy,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  healthy?: boolean;
}) {
  const valueColor =
    healthy === undefined ? 'var(--text)' : healthy ? 'var(--green)' : 'var(--red)';
  return (
    <div
      style={{
        flex: 1,
        padding: '12px 12px',
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        minWidth: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--text-3)' }}>
        {icon}
        <span className="micro-label" style={{ color: 'var(--text-3)' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 500, marginTop: 8, color: valueColor }}>{value}</div>
      {sub && (
        <div
          style={{
            fontSize: 11,
            color: 'var(--muted)',
            fontFamily: 'ui-monospace, monospace',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

/**
 * RecentRail — the "Recently added" horizontal strip.
 * MOBILE (useIsDesktop() === false): rendered EXACTLY as before — a plain
 * touch-swipe overflow scroller, no arrows, no wrapper. DESKTOP: adds left/right
 * carousel chevrons overlaid on the rail (edge-aware), scrollbar hidden.
 */
function RecentRail({
  items,
  onOpen,
}: {
  items: RecentItem[];
  onOpen: (kind: 'movie' | 'show', id: number) => void;
}) {
  const desktop = useIsDesktop();
  const railRef = useRef<HTMLDivElement>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  function updateEdges() {
    const el = railRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 0);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2); // small tolerance
  }

  useEffect(() => {
    if (!desktop) return; // only track edges when the arrows exist
    updateEdges(); // initialize on mount (left hidden at 0, right hidden if no overflow)
    const el = railRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateEdges, { passive: true });
    window.addEventListener('resize', updateEdges);
    return () => {
      el.removeEventListener('scroll', updateEdges);
      window.removeEventListener('resize', updateEdges);
    };
  }, [desktop, items.length]);

  function page(dir: 1 | -1) {
    const el = railRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' });
  }

  // MOBILE: byte-identical to the original inline rail (no ref/class/arrows).
  if (!desktop) {
    return (
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 6 }}>
        {items.map((r) => (
          <RecentCard key={r.key} item={r} onOpen={onOpen} />
        ))}
      </div>
    );
  }

  // DESKTOP: same rail + overlaid, edge-aware chevron buttons.
  return (
    <div style={{ position: 'relative' }}>
      <div
        ref={railRef}
        className="ad-recent-rail"
        style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, marginBottom: 6 }}
      >
        {items.map((r) => (
          <RecentCard key={r.key} item={r} onOpen={onOpen} />
        ))}
      </div>
      {!atStart && <RailArrow dir="left" onClick={() => page(-1)} />}
      {!atEnd && <RailArrow dir="right" onClick={() => page(1)} />}
    </div>
  );
}

/** A single carousel chevron, vertically centered on the poster row. */
function RailArrow({ dir, onClick }: { dir: 'left' | 'right'; onClick: () => void }) {
  const Icon = dir === 'left' ? ChevronLeft : ChevronRight;
  return (
    <button
      onClick={onClick}
      aria-label={dir === 'left' ? 'Scroll back' : 'Scroll forward'}
      style={{
        position: 'absolute',
        [dir]: 4,
        top: 52, // centered on the ~138px-tall poster, clear of the titles below
        zIndex: 3,
        width: 34,
        height: 34,
        borderRadius: '50%',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'color-mix(in srgb, var(--surface) 86%, transparent)',
        border: '1px solid var(--border)',
        color: 'var(--text)',
        cursor: 'pointer',
        boxShadow: '0 2px 10px rgba(0,0,0,0.4)',
        backdropFilter: 'blur(4px)',
        transition: 'background 120ms ease, border-color 120ms ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.background = 'var(--surface)';
        e.currentTarget.style.borderColor = 'var(--amber)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = 'color-mix(in srgb, var(--surface) 86%, transparent)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      <Icon size={18} />
    </button>
  );
}

function RecentCard({
  item,
  onOpen,
}: {
  item: RecentItem;
  onOpen: (kind: 'movie' | 'show', id: number) => void;
}) {
  const [pressed, setPressed] = useState(false);
  // Only tappable if we have a resolvable id (Radarr movieId / Sonarr seriesId).
  const tappable = Number.isFinite(item.id) && item.id > 0;

  const body = (
    <>
      <Poster url={item.posterUrl} width={92} />
      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 5 }}>
        <KindBadge kind={item.kind} />
      </div>
      <div
        style={{
          fontSize: 12,
          marginTop: 4,
          color: 'var(--text-2)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {item.title}
      </div>
    </>
  );

  if (!tappable) {
    return <div style={{ width: 92, flexShrink: 0 }}>{body}</div>;
  }

  return (
    <button
      onClick={() => onOpen(item.kind, item.id)}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      aria-label={`Open ${item.title}`}
      style={{
        width: 92,
        flexShrink: 0,
        padding: 0,
        border: 'none',
        background: 'transparent',
        textAlign: 'left',
        cursor: 'pointer',
        transform: pressed ? 'scale(0.96)' : 'none',
        opacity: pressed ? 0.82 : 1,
        transition: 'transform 0.09s ease, opacity 0.09s ease',
      }}
    >
      {body}
    </button>
  );
}
