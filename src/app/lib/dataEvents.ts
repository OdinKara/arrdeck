/**
 * dataEvents.ts — a tiny app-wide "the stack changed" signal.
 *
 * A mutating action (grab, and later queue pause/resume/delete) calls
 * notifyDataChanged() after it succeeds; any live view (the Deck) subscribes and
 * refetches immediately, so a write shows up without the user navigating away.
 */

import { defaultWinnerCache } from '../../engine/index.js';

type Listener = () => void;
const listeners = new Set<Listener>();

/** Subscribe to data-change notifications. Returns an unsubscribe fn. */
export function onDataChanged(cb: Listener): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/**
 * Announce that a write succeeded. We also invalidate the engine winner cache
 * so the next fetch re-races the address (belt-and-suspenders freshness), then
 * notify subscribers to refetch.
 */
export function notifyDataChanged(): void {
  defaultWinnerCache.invalidateAll();
  for (const cb of listeners) cb();
}
