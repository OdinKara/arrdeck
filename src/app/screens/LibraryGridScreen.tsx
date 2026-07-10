/**
 * LibraryGridScreen — Sonarr library via the shared PosterGrid. Computes the
 * complete/missing/unmonitored badge from series statistics.
 */

import { useEffect, useState } from 'react';
import type { ServiceConfig, SonarrSeries } from '../../engine/index.js';
import { resolveSonarr } from '../lib/clients.js';
import { PosterGrid, type PosterItem } from '../components/PosterGrid.tsx';

function seriesBadge(s: SonarrSeries): PosterItem['badge'] {
  if (!s.monitored) return { label: 'unmonitored', tone: 'muted' };
  const missing = Math.max(0, s.episodeCount - s.episodeFileCount);
  if (missing > 0) return { label: `missing ${missing}`, tone: 'amber' };
  if (s.episodeFileCount > 0) return { label: 'complete', tone: 'green' };
  return null;
}

export function LibraryGridScreen({
  services,
  onBack,
  onOpenSeries,
}: {
  services: ServiceConfig[];
  onBack: () => void;
  onOpenSeries: (seriesId: number) => void;
}) {
  const [items, setItems] = useState<PosterItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    const r = await resolveSonarr(services);
    if (!r) {
      setError('Sonarr offline');
      setRefreshing(false);
      return;
    }
    try {
      const list = await r.client.getSeries();
      list.sort((a, b) => a.title.localeCompare(b.title));
      setItems(list.map((s) => ({ id: s.id, title: s.title, posterUrl: s.posterUrl, badge: seriesBadge(s) })));
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
      title="Library"
      items={items}
      loading={items == null}
      error={error}
      refreshing={refreshing}
      onBack={onBack}
      onRefresh={() => load(true)}
      onOpen={onOpenSeries}
    />
  );
}
