/**
 * SponsorHeart — the ONE donate heart, shared by AppHeader (bar screens) and the
 * bespoke poster-hero / edit-modal screens. Single source of the heart visual +
 * link behaviour; never duplicate this elsewhere.
 *
 * `variant`:
 *   'bar'  — bordered transparent button, sits with refresh/settings actions.
 *   'hero' — a dark translucent scrim (like the floating BackBtn on detail
 *            screens) so the red heart stays legible over BOTH light and dark
 *            poster backdrops.
 */

import { Heart } from 'lucide-react';
import { SPONSOR_URL, openSponsor } from '../lib/sponsor.js';

/**
 * Donate red — a vivid crimson that stays legible on the #16181d charcoal.
 * Deliberately brighter/warmer than the muted failure red (--red #f09595) so a
 * filled heart doesn't read as an error state.
 */
export const SPONSOR_RED = '#e5484d';

export function SponsorHeart({
  size = 16,
  variant = 'bar',
}: {
  size?: number;
  variant?: 'bar' | 'hero';
}) {
  const base: React.CSSProperties = {
    borderRadius: 'var(--radius-sm)',
    padding: 8,
    cursor: 'pointer',
    display: 'inline-flex',
    color: SPONSOR_RED,
  };
  const skin: React.CSSProperties =
    variant === 'hero'
      ? {
          // Match the floating BackBtn scrim so it reads over any poster.
          background: 'color-mix(in srgb, var(--bg) 60%, transparent)',
          border: '1px solid var(--border)',
        }
      : {
          background: 'transparent',
          border: '1px solid var(--border)',
        };
  return (
    <button
      onClick={() => void openSponsor()}
      aria-label="Sponsor ArrDeck"
      title="Sponsor ArrDeck"
      data-sponsor-url={SPONSOR_URL}
      style={{ ...base, ...skin }}
    >
      <Heart size={size} fill={SPONSOR_RED} stroke={SPONSOR_RED} />
    </button>
  );
}
