/** Formatting helpers for the dashboard. */

export function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function fmtMB(mb: number): string {
  return fmtBytes(mb * 1024 * 1024);
}

/**
 * Normalize SABnzbd's speed string (e.g. "3.2 M", "512 K", "0") to "3.2 MB/s".
 */
export function fmtSabSpeed(speed: string): string {
  const s = (speed ?? '').trim();
  if (!s || s === '0') return '0 B/s';
  const m = /^([\d.]+)\s*([KMGT]?)/i.exec(s);
  if (!m) return `${s}/s`;
  const unit = (m[2] ?? '').toUpperCase();
  const suffix = unit ? `${unit}B/s` : 'B/s';
  return `${m[1]} ${suffix}`;
}
