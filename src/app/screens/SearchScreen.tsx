/**
 * SearchScreen — unified search → result rows → detail. One bar fans out to
 * Radarr + Sonarr (engine unifiedSearch, ranked), filter chips narrow the
 * merged list, and tapping a not-owned result opens the DetailScreen grab flow.
 */

import { useEffect, useState } from 'react';
import { Search as SearchIcon, Mic, Star, Check } from 'lucide-react';
import {
  unifiedSearch,
  type RadarrClient,
  type SearchResult,
  type ServiceConfig,
  type SonarrClient,
} from '../../engine/index.js';
import { resolveArrClients } from '../lib/clients.js';
import { Card } from '../components/ui.tsx';
import { AppHeader } from '../components/AppHeader.tsx';
import { KindBadge, Poster, Skeleton } from '../components/visuals.tsx';
import { DetailScreen } from './DetailScreen.tsx';

type Filter = 'all' | 'movie' | 'show';

export function SearchScreen({
  services,
  onGrabbed,
}: {
  services: ServiceConfig[];
  onGrabbed: () => void;
}) {
  const [clients, setClients] = useState<{ radarr?: RadarrClient; sonarr?: SonarrClient }>({});
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filter, setFilter] = useState<Filter>('all');
  const [selected, setSelected] = useState<SearchResult | null>(null);

  useEffect(() => {
    void resolveArrClients(services).then(setClients);
  }, [services]);

  async function runSearch() {
    const q = term.trim();
    if (!q) return;
    setLoading(true);
    setSearched(true);
    try {
      const res = await unifiedSearch(q, clients);
      setResults(res);
    } finally {
      setLoading(false);
    }
  }

  if (selected) {
    return (
      <DetailScreen
        result={selected}
        radarr={clients.radarr}
        sonarr={clients.sonarr}
        onBack={() => setSelected(null)}
        onGrabbed={onGrabbed}
      />
    );
  }

  const filtered = results.filter((r) =>
    filter === 'all' ? true : filter === 'movie' ? r.kind === 'movie' : r.kind === 'show',
  );

  return (
    <div className="ad-col" style={{ padding: '16px 16px 8px' }}>
      <AppHeader title="Search" titleSize={22} marginBottom={12} />

      {/* Search bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 13px',
          borderRadius: 'var(--radius)',
          border: '1px solid var(--border)',
          background: 'var(--surface)',
          marginBottom: 14,
        }}
      >
        <SearchIcon size={17} color="var(--text-3)" />
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && runSearch()}
          placeholder="Search movies & shows…"
          autoCapitalize="none"
          autoCorrect="off"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text)',
            fontSize: 15,
          }}
        />
        <Mic size={18} color="var(--amber)" />
      </div>

      {/* Filter chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
        {(['all', 'movie', 'show'] as Filter[]).map((f) => {
          const sel = f === filter;
          return (
            <button
              key={f}
              onClick={() => setFilter(f)}
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                border: `1px solid ${sel ? 'var(--amber)' : 'var(--border)'}`,
                background: sel ? 'var(--amber)' : 'var(--surface)',
                color: sel ? '#1a1205' : 'var(--text-2)',
                fontSize: 13,
                fontWeight: 500,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {f === 'all' ? 'All' : f === 'movie' ? 'Movies' : 'Shows'}
            </button>
          );
        })}
      </div>

      {/* Results */}
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={92} radius={12} />
          ))}
        </div>
      ) : !searched ? (
        <Card recessed style={{ textAlign: 'center', padding: 26 }}>
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Search your whole stack at once</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 6 }}>
            Movies route to Radarr, shows to Sonarr — automatically.
          </div>
        </Card>
      ) : filtered.length === 0 ? (
        <Card recessed style={{ textAlign: 'center', padding: 26 }}>
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>No results for “{term}”</div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {filtered.map((r) => (
            <ResultRow
              key={`${r.kind}:${r.tmdbId ?? r.tvdbId}:${r.year}`}
              result={r}
              onOpen={() => setSelected(r)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({ result, onOpen }: { result: SearchResult; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex',
        gap: 12,
        padding: 10,
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        cursor: 'pointer',
        textAlign: 'left',
        alignItems: 'stretch',
      }}
    >
      <Poster url={result.posterUrl} width={54} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
          <KindBadge kind={result.kind} />
          {result.year > 0 && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{result.year}</span>}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {result.title}
        </div>
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginTop: 'auto',
            fontSize: 12,
            color: 'var(--muted)',
            alignItems: 'center',
          }}
        >
          {result.rating > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
              <Star size={11} color="var(--amber)" /> {result.rating.toFixed(1)}
            </span>
          )}
          {result.runtimeOrEpisodes && <span>{result.runtimeOrEpisodes}</span>}
          {result.genres[0] && (
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {result.genres[0]}
            </span>
          )}
        </div>
      </div>
      {result.inLibrary && (
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: 4 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--green)', fontSize: 12 }}>
            <Check size={14} /> In library
          </span>
        </div>
      )}
    </button>
  );
}
