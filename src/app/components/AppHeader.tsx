/**
 * AppHeader — the shared top bar for ArrDeck's "bar" screens (Deck, Search,
 * Queue, Services, Indexers, library grids, ReleaseList, Add/Edit service).
 *
 * It's a thin, configurable wrapper that reproduces each screen's existing
 * header via props — it does NOT flatten their differences:
 *   - showBack/onBack   → the standard bordered back button (overlay screens)
 *   - leading           → an element before the title (e.g. a service icon)
 *   - title             → a string (amber, sized) OR a node (two-line titles)
 *   - subtitle          → a node under the title (e.g. the connection indicator)
 *   - actions           → the screen's own trailing controls (refresh/settings/…)
 *   - titleSize/marginBottom → preserve each screen's exact sizing/spacing
 *
 * The donate SponsorHeart is ALWAYS the last item in the trailing cluster, so it
 * appears on every screen that uses AppHeader. The poster-hero detail screens and
 * the edit modals don't use this bar; they import SponsorHeart directly.
 */

import { ArrowLeft } from 'lucide-react';
import { SponsorHeart } from './SponsorHeart.tsx';

export function AppHeader({
  title,
  subtitle,
  showBack = false,
  onBack,
  leading,
  actions,
  titleSize = 20,
  marginBottom = 14,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  showBack?: boolean;
  onBack?: () => void;
  leading?: React.ReactNode;
  actions?: React.ReactNode;
  titleSize?: number;
  marginBottom?: number;
}) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom }}>
      {showBack && (
        <button
          onClick={onBack}
          aria-label="Back"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-2)',
            padding: 8,
            cursor: 'pointer',
            display: 'inline-flex',
          }}
        >
          <ArrowLeft size={18} />
        </button>
      )}
      {leading}
      <div style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? (
          <div
            style={{
              fontSize: titleSize,
              fontWeight: 500,
              color: 'var(--amber)',
              lineHeight: subtitle ? 1 : undefined,
            }}
          >
            {title}
          </div>
        ) : (
          title
        )}
        {subtitle}
      </div>
      {actions}
      <SponsorHeart />
    </header>
  );
}
