/**
 * visuals.tsx — dashboard visual primitives (progress bar, poster, skeleton,
 * kind badge). All colors come from token vars.
 */

import { useState, type CSSProperties } from 'react';
import { ImageOff } from 'lucide-react';

/** Amber download progress bar (0..100). */
export function ProgressBar({ percent }: { percent: number }) {
  const pct = Math.max(0, Math.min(100, percent));
  return (
    <div
      style={{
        height: 6,
        borderRadius: 999,
        background: 'var(--surface-recessed)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          background: 'var(--amber)',
          borderRadius: 999,
          transition: 'width 400ms ease',
        }}
      />
    </div>
  );
}

/** Movie(blue) / Show(purple) badge. */
export function KindBadge({ kind }: { kind: 'movie' | 'show' }) {
  const color = kind === 'movie' ? 'var(--blue)' : 'var(--purple)';
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color,
        border: `1px solid color-mix(in srgb, ${color} 45%, transparent)`,
        borderRadius: 5,
        padding: '1px 5px',
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {kind}
    </span>
  );
}

/**
 * Poster image with graceful fallback. Loads the (usually TMDB/TVDB https)
 * remote URL directly — <img> isn't subject to the CORS/cleartext limits that
 * the engine's API calls route around via CapacitorHttp. On error or missing
 * URL it renders a placeholder tile so the strip never shows a broken image.
 */
export function Poster({
  url,
  width = 92,
  ratio = 1.5,
  style,
}: {
  url?: string;
  width?: number;
  ratio?: number;
  style?: CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const height = Math.round(width * ratio);
  const base: CSSProperties = {
    width,
    height,
    borderRadius: 8,
    flexShrink: 0,
    background: 'var(--surface-recessed)',
    border: '1px solid var(--border)',
    ...style,
  };
  if (!url || failed) {
    return (
      <div
        style={{
          ...base,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--muted)',
        }}
      >
        <ImageOff size={18} />
      </div>
    );
  }
  return (
    <img
      src={url}
      loading="lazy"
      onError={() => setFailed(true)}
      style={{ ...base, objectFit: 'cover' }}
    />
  );
}

/** Charcoal shimmer skeleton block. */
export function Skeleton({
  height = 16,
  width = '100%',
  radius = 8,
  style,
}: {
  height?: number | string;
  width?: number | string;
  radius?: number;
  style?: CSSProperties;
}) {
  return (
    <div
      style={{
        height,
        width,
        borderRadius: radius,
        background:
          'linear-gradient(90deg, var(--surface-recessed) 25%, var(--surface) 50%, var(--surface-recessed) 75%)',
        backgroundSize: '200% 100%',
        animation: 'arrdeck-shimmer 1.3s ease-in-out infinite',
        ...style,
      }}
    />
  );
}
