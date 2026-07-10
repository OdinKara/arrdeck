/**
 * useDashboard — live dashboard data with visibility-gated polling.
 *
 * Cadence:
 *   - FAST (queue + download progress) every FAST_POLL_MS while live,
 *   - SLOW (full refetch: health/disk/indexers/recent) every SLOW_POLL_MS,
 *   - immediate full refetch on mount, on becoming visible, and after any write.
 *
 * "Live" = the Deck tab is active AND the app is foregrounded. When either is
 * false, all polling stops (no battery drain); when it flips back to true we do
 * an immediate refetch and resume. Requests are failure-isolated (last-known
 * data is kept) and never stack (an in-flight fetch is not duplicated).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import type { ServiceConfig } from '../../engine/index.js';
import { loadDashboard, loadQueueSnapshot, type DashboardData } from '../lib/dashboard.js';
import { onDataChanged } from '../lib/dataEvents.js';

/** Fast tick: SAB queue + progress. Tunable. */
export const FAST_POLL_MS = 5000;
/** Slow tick: full refetch (service health, disk, indexers, recently-added). */
export const SLOW_POLL_MS = 30000;

export interface UseDashboard {
  data: DashboardData | null;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
}

export function useDashboard(services: ServiceConfig[], active: boolean): UseDashboard {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // In-flight guards so a slow request never stacks with the next tick.
  const fullInFlight = useRef(false);
  const fastInFlight = useRef(false);

  const fullLoad = useCallback(
    async (force: boolean) => {
      if (fullInFlight.current) return;
      fullInFlight.current = true;
      if (force) setRefreshing(true);
      try {
        const next = await loadDashboard(services, { forceRerace: force });
        setData(next);
      } catch {
        // keep last-known data; a transient hiccup must not blank the Deck
      } finally {
        fullInFlight.current = false;
        setLoading(false);
        setRefreshing(false);
      }
    },
    [services],
  );

  const fastLoad = useCallback(async () => {
    if (fastInFlight.current) return;
    fastInFlight.current = true;
    try {
      const snap = await loadQueueSnapshot(services);
      if (snap) {
        setData((prev) => (prev ? { ...prev, ...snap } : prev));
      }
    } catch {
      // ignore — keep showing last-known queue
    } finally {
      fastInFlight.current = false;
    }
  }, [services]);

  const refresh = useCallback(() => void fullLoad(true), [fullLoad]);

  // Mount: first load.
  useEffect(() => {
    void fullLoad(false);
  }, [fullLoad]);

  // Refetch immediately whenever a write announces a change.
  useEffect(() => onDataChanged(() => void fullLoad(true)), [fullLoad]);

  // App foreground/background + tab-visibility tracking.
  const [appForeground, setAppForeground] = useState(true);
  useEffect(() => {
    const onVis = () => setAppForeground(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    const handle = App.addListener('appStateChange', ({ isActive }) =>
      setAppForeground(isActive),
    );
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void handle.then((h) => h.remove());
    };
  }, []);

  const live = active && appForeground;

  // Polling loop — only runs while live. Cleared on unmount / when not live.
  useEffect(() => {
    if (!live) return;
    // Becoming live (mount, tab switch back, or app resume) → immediate refetch.
    void fullLoad(false);
    const fast = setInterval(() => void fastLoad(), FAST_POLL_MS);
    const slow = setInterval(() => void fullLoad(false), SLOW_POLL_MS);
    return () => {
      clearInterval(fast);
      clearInterval(slow);
    };
  }, [live, fastLoad, fullLoad]);

  return { data, loading, refreshing, refresh };
}
