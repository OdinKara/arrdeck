/**
 * MovieLibraryGridScreen — Radarr library via the shared PosterGrid.
 * Badge: downloaded=green(complete) / released-but-missing=amber / unmonitored
 * or unreleased=muted.
 */

import { useEffect, useState } from 'react';
import type { RadarrMovie, ServiceConfig } from '../../engine/index.js';
import { resolveRadarr } from '../lib/clients.js';
import { PosterGrid, type PosterItem } from '../components/PosterGrid.tsx';

function movieBadge(m: RadarrMovie): PosterItem['badge'] {
  if (m.hasFile) return { label: 'downloaded', tone: 'green' };
  if (!m.monitored) return { label: 'unmonitored', tone: 'muted' };
  // Monitored + no file: amber "missing" (Radarr's movie list doesn't carry
  // release status here, so this reads as wanted).
  return { label: 'missing', tone: 'amber' };
}

export function MovieLibraryGridScreen({
  services,
  onBack,
  onOpenMovie,
}: {
  services: ServiceConfig[];
  onBack: () => void;
  onOpenMovie: (movieId: number) => void;
}) {
  const [items, setItems] = useState<PosterItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    const r = await resolveRadarr(services);
    if (!r) {
      setError('Radarr offline');
      setRefreshing(false);
      return;
    }
    try {
      const list = await r.client.getMovies();
      list.sort((a, b) => a.title.localeCompare(b.title));
      setItems(list.map((m) => ({ id: m.id, title: m.title, posterUrl: m.posterUrl, badge: movieBadge(m) })));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  return (
    <PosterGrid
      title="Movies"
      items={items}
      loading={items == null}
      error={error}
      refreshing={refreshing}
      onBack={onBack}
      onRefresh={() => load(true)}
      onOpen={onOpenMovie}
    />
  );
}
