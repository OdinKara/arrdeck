/**
 * http.ts — the thin platform HTTP note.
 *
 * The engine (src/engine) calls the global `fetch` directly and knows nothing
 * about Capacitor. The actual platform routing is configured declaratively:
 *
 *   capacitor.config.ts -> plugins.CapacitorHttp.enabled = true
 *
 * On ANDROID that flag makes the CapacitorHttp plugin patch `window.fetch` so
 * every engine request is performed by the NATIVE HTTP stack. This bypasses the
 * webview's two blockers for LAN calls to plain-HTTP services:
 *   1. CORS (the *arr apps don't send permissive CORS headers), and
 *   2. cleartext-HTTP restrictions.
 *
 * On WEB / DOCKER the plugin is inert, so `fetch` is the browser/Node fetch and
 * requests go out normally (there, CORS is handled by same-origin: the Docker
 * surface proxies through its own Node server — a later phase).
 *
 * There is intentionally no code here to import — routing is zero-cost and
 * automatic. This file documents the contract so the mechanism isn't invisible.
 */

import { isNative } from './env.js';

/** Describe how engine HTTP is currently routed (for the debug/status UI). */
export function httpMode(): string {
  return isNative()
    ? 'native (CapacitorHttp — bypasses webview CORS/cleartext)'
    : // On web the browser only talks same-origin to the ArrDeck BFF; the engine
      // (and thus every service call) runs server-side, next to the stack.
      'server-side (ArrDeck BFF)';
}
