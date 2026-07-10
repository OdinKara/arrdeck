/**
 * App — tabbed shell. No services → onboarding. Otherwise a persistent
 * bottom-nav shell (Deck / Search / Queue / Services) plus full-screen overlays
 * for the library grids, series/movie detail, and the Prowlarr indexer view.
 */

import { useCallback, useEffect, useState } from 'react';
import { AddServiceScreen } from './screens/AddServiceScreen.tsx';
import { ServicesScreen } from './screens/ServicesScreen.tsx';
import { DeckScreen } from './screens/DeckScreen.tsx';
import { QueueScreen } from './screens/QueueScreen.tsx';
import { SearchScreen } from './screens/SearchScreen.tsx';
import { LibraryGridScreen } from './screens/LibraryGridScreen.tsx';
import { SeriesDetailScreen } from './screens/SeriesDetailScreen.tsx';
import { MovieLibraryGridScreen } from './screens/MovieLibraryGridScreen.tsx';
import { MovieDetailScreen } from './screens/MovieDetailScreen.tsx';
import { IndexersScreen } from './screens/IndexersScreen.tsx';
import { EditServiceScreen } from './screens/EditServiceScreen.tsx';
import { BottomNav, type Tab } from './components/BottomNav.tsx';
import { SideNav } from './components/SideNav.tsx';
import { loadServices } from './platform/storage.js';
import { useIsDesktop } from './hooks/useIsDesktop.js';
import { Spinner } from './components/ui.tsx';
import type { ServiceConfig, ServiceKind } from '../engine/index.js';

/** Full-screen overlay state above the tab shell. */
type Overlay =
  | { type: 'seriesLib' }
  | { type: 'series'; id: number; from?: 'deck' }
  | { type: 'movieLib' }
  | { type: 'movie'; id: number; from?: 'deck' }
  | { type: 'indexers' }
  | { type: 'editService'; kind: ServiceKind }
  | null;

export function App() {
  const [services, setServices] = useState<ServiceConfig[] | null>(null);
  const [tab, setTab] = useState<Tab>('deck');
  const [adding, setAdding] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>(null);
  const desktop = useIsDesktop();

  const reload = useCallback(async () => {
    setServices(await loadServices());
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (services === null) {
    return (
      <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}>
        <Spinner size={22} />
      </div>
    );
  }

  if (adding || services.length === 0) {
    return (
      <AddServiceScreen
        onDone={async () => {
          await reload();
          setAdding(false);
          setTab('deck');
        }}
        // Back/cancel only when adding ANOTHER service (services already exist).
        // True first-run (no services) has nowhere to go back to, so no control.
        onCancel={
          adding
            ? async () => {
                await reload(); // pick up any services connected before cancelling
                setAdding(false);
              }
            : undefined
        }
      />
    );
  }

  // Route a Deck service tile to its screen.
  function onOpenTile(kind: ServiceKind) {
    if (kind === 'sonarr') setOverlay({ type: 'seriesLib' });
    else if (kind === 'radarr') setOverlay({ type: 'movieLib' });
    else if (kind === 'sabnzbd') setTab('queue');
    else if (kind === 'prowlarr') setOverlay({ type: 'indexers' });
    else setTab('services');
  }

  // Open a Recently-Added item's detail from the Deck (back returns to the Deck).
  function onOpenItem(kind: 'movie' | 'show', id: number) {
    setOverlay(kind === 'movie' ? { type: 'movie', id, from: 'deck' } : { type: 'series', id, from: 'deck' });
  }

  // Overlays sit above the tab shell with their own back navigation.
  if (overlay?.type === 'series') {
    const back = overlay.from === 'deck' ? null : ({ type: 'seriesLib' } as const);
    return <SeriesDetailScreen services={services} seriesId={overlay.id} onBack={() => setOverlay(back)} />;
  }
  if (overlay?.type === 'seriesLib') {
    return <LibraryGridScreen services={services} onBack={() => setOverlay(null)} onOpenSeries={(id) => setOverlay({ type: 'series', id })} />;
  }
  if (overlay?.type === 'movie') {
    const back = overlay.from === 'deck' ? null : ({ type: 'movieLib' } as const);
    return <MovieDetailScreen services={services} movieId={overlay.id} onBack={() => setOverlay(back)} />;
  }
  if (overlay?.type === 'movieLib') {
    return <MovieLibraryGridScreen services={services} onBack={() => setOverlay(null)} onOpenMovie={(id) => setOverlay({ type: 'movie', id })} />;
  }
  if (overlay?.type === 'indexers') {
    return <IndexersScreen services={services} onBack={() => setOverlay(null)} />;
  }
  if (overlay?.type === 'editService') {
    return (
      <EditServiceScreen
        kind={overlay.kind}
        onBack={async () => {
          await reload(); // pick up address/key edits
          setOverlay(null);
        }}
        onDeleted={async () => {
          await reload();
          setOverlay(null);
        }}
      />
    );
  }

  // DESKTOP (>=900px): a left sidebar beside the scroll region (flex row).
  // MOBILE (<900px): the existing bottom bar under the scroll region (flex column).
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: desktop ? 'row' : 'column' }}>
      {desktop && <SideNav active={tab} onChange={setTab} />}
      <div style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', ...(desktop ? { minWidth: 0 } : {}) }}>
        {/* Deck stays MOUNTED (hidden when inactive) so its visibility-gated
            polling starts/stops on tab switches without a remount. */}
        <div style={{ display: tab === 'deck' ? 'block' : 'none' }}>
          <DeckScreen
            services={services}
            onGoTab={setTab}
            onOpenTile={onOpenTile}
            onOpenItem={onOpenItem}
            active={tab === 'deck' && overlay == null}
          />
        </div>
        {tab === 'search' && <SearchScreen services={services} onGrabbed={() => setTab('deck')} />}
        {tab === 'queue' && <QueueScreen services={services} />}
        {tab === 'services' && (
          <ServicesScreen
            onAddMore={() => setAdding(true)}
            onEditService={(kind) => setOverlay({ type: 'editService', kind })}
          />
        )}
      </div>
      {!desktop && <BottomNav active={tab} onChange={setTab} />}
    </div>
  );
}
