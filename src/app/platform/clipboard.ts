/**
 * clipboard.ts — copy text to the clipboard on BOTH of ArrDeck's surfaces.
 *
 * These two surfaces do not agree on what is available, and the difference is
 * not about Capacitor vs. browser — it is about SECURE CONTEXT:
 *
 *   Android (Capacitor webview)  the page is served from http://localhost, and
 *                                localhost is always a secure context, so
 *                                `navigator.clipboard` IS available. No native
 *                                plugin is required.
 *
 *   Docker web UI                normally reached at http://192.168.x.x:PORT —
 *                                plain HTTP on a non-loopback host, which is
 *                                NOT a secure context. `navigator.clipboard` is
 *                                `undefined` there. This is the common case for
 *                                a self-hosted LAN service and it is exactly
 *                                where a naive `navigator.clipboard.writeText`
 *                                throws a TypeError.
 *
 * So: try the async Clipboard API, fall back to the legacy
 * `document.execCommand('copy')` on a hidden textarea, and if BOTH fail return
 * false so the caller can tell the user to copy manually instead of flashing a
 * "Copied!" that did not happen. Silently claiming success is the one outcome
 * that must not occur — a user who thinks they copied an address will paste
 * whatever was in the clipboard before.
 *
 * UI-agnostic: no React, no DOM assumptions beyond `document`.
 */

/** Copy `text`. Resolves true only if the text really reached the clipboard. */
export async function copyText(text: string): Promise<boolean> {
  // Preferred path: async Clipboard API (Android webview, HTTPS web UI).
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Permission denied, or a webview that advertises the API but refuses.
      // Fall through rather than reporting a failure we can still recover from.
    }
  }

  // Fallback: hidden textarea + execCommand. Deprecated, but it is what works
  // on a plain-HTTP LAN origin, which is how most people run the Docker UI.
  if (typeof document === 'undefined') return false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    // Keep it off-screen but focusable; `display:none` would break selection.
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
