/**
 * net.ts — tiny address helpers for the connection indicator.
 */

/** Extract the host (no scheme/port) from a base URL. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url.replace(/^https?:\/\//, '').replace(/[:/].*$/, '');
  }
}

/** True if the host is an RFC1918 / loopback private address (i.e. "local"). */
export function isPrivateHost(host: string): boolean {
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  const m = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(host);
  if (!m) return false; // a hostname/domain => treat as remote
  const a = Number(m[1]);
  const b = Number(m[2]);
  if (a === 10) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  return false;
}
