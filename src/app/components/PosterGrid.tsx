/**
 * PosterGrid — shared vertical (wrap-down) 2-column poster grid with a title
 * filter and per-poster status badge. Used by both the Sonarr and Radarr
 * libraries; each caller computes the badge for its item type.
 */

import { useMemo, useState } from 'react';
import { Search as SearchIcon, RefreshCw } from 'lucide-react';
import { Card, Spinner } from './ui.tsx';
import { AppHeader } from './AppHeader.tsx';
import { Poster, Skeleton } from './visuals.tsx';

export type BadgeTone = 'green' | 'amber' | 'muted';

export interface PosterItem {
  id: number;
  title: string;
  posterUrl?: string;
  badge: { label: string; tone: BadgeTone } | null;
}

export function PosterGrid({
  title,
  items,
  loading,
  error,
  refreshing,
  onBack,
  onRefresh,
  onOpen,
}: {
  title: string;
  items: PosterItem[] | null;
  loading: boolean;
  error: string | null;
  refreshing: boolean;
  onBack: () => void;
  onRefresh: () => void;
  onOpen: (id: number) => void;
}) {
  const [filter, setFilter] = useState('');
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (items ?? []).filter((s) => (q ? s.title.toLowerCase().includes(q) : true));
  }, [items, filter]);

  return (
    <div className="ad-col-full" style={{ paddingTop: 16, paddingBottom: 20 }}>
      <AppHeader
        showBack
        onBack={onBack}
        title={title}
        actions={
          <IconBtn onClick={onRefresh} aria="Refresh">
            <RefreshCw size={16} style={refreshing ? { animation: 'arrdeck-spin 900ms linear infinite' } : undefined} />
          </IconBtn>
        }
      />

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 13px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          marginBottom: 16,
        }}
      >
        <SearchIcon size={16} color="var(--text-3)" />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter…"
          autoCapitalize="none"
          style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14 }}
        />
        {items && <span style={{ fontSize: 12, color: 'var(--muted)' }}>{filtered.length}</span>}
      </div>

      {error ? (
        <Card recessed>
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>{error}</div>
        </Card>
      ) : items == null ? (
        <div className="arrdeck-poster-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} height={230} radius={10} />
          ))}
        </div>
      ) : (
        <div className="arrdeck-poster-grid">
          {filtered.map((s) => (
            <PosterTile key={s.id} item={s} onClick={() => onOpen(s.id)} />
          ))}
        </div>
      )}

      {refreshing && items && (
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <Spinner />
        </div>
      )}
      {loading && !items && null}
    </div>
  );
}

function PosterTile({ item, onClick }: { item: PosterItem; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'transparent', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', minWidth: 0 }}
    >
      <div style={{ position: 'relative' }}>
        <Poster url={item.posterUrl} width={undefined as unknown as number} style={{ width: '100%', height: 'auto', aspectRatio: '2 / 3' }} />
        {item.badge && <StatusBadge label={item.badge.label} tone={item.badge.tone} />}
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {item.title}
      </span>
    </button>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: BadgeTone }) {
  const color = tone === 'green' ? 'var(--green)' : tone === 'amber' ? 'var(--amber)' : 'var(--muted)';
  return (
    <span
      style={{
        position: 'absolute',
        left: 6,
        bottom: 6,
        fontSize: 10,
        fontWeight: 500,
        color,
        background: `color-mix(in srgb, ${color} 18%, #0a0a0c)`,
        border: `1px solid color-mix(in srgb, ${color} 40%, transparent)`,
        borderRadius: 6,
        padding: '2px 6px',
        backdropFilter: 'blur(2px)',
      }}
    >
      {label}
    </span>
  );
}

function IconBtn({ children, onClick, aria }: { children: React.ReactNode; onClick: () => void; aria: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-2)', padding: 8, cursor: 'pointer', display: 'inline-flex' }}
    >
      {children}
    </button>
  );
}
