/**
 * SponsorHeart — the ONE donate heart, shared by AppHeader (bar screens) and the
 * bespoke poster-hero / edit-modal screens. Single source of the heart visual +
 * link behaviour; never duplicate this elsewhere.
 *
 * Tapping it used to jump straight out to GitHub Sponsors. It now opens the
 * SupportSheet instead, which shows every rail (Bitcoin, Lightning, X Money,
 * Sponsors) — the heart is still the ONLY donate entry point in the app, and
 * still does nothing until it is deliberately tapped.
 *
 * `variant`:
 *   'bar'  — bordered transparent button, sits with refresh/settings actions.
 *   'hero' — a dark translucent scrim (like the floating BackBtn on detail
 *            screens) so the red heart stays legible over BOTH light and dark
 *            poster backdrops.
 */

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { SupportSheet } from './SupportSheet.tsx';

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
  const [open, setOpen] = useState(false);

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
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Support ArrDeck"
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Support ArrDeck"
        style={{ ...base, ...skin }}
      >
        <Heart size={size} fill={SPONSOR_RED} stroke={SPONSOR_RED} />
      </button>
      {open && <SupportSheet onClose={() => setOpen(false)} />}
    </>
  );
}
