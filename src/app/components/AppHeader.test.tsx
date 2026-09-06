/**
 * AppHeader / SponsorHeart / SupportSheet tests — render to static markup (no
 * DOM needed) and assert the donate heart is present on every AppHeader screen,
 * that the back button is preserved on back-button screens, and that the support
 * sheet carries the real, baked-in addresses.
 *
 * The address assertions are the point of the file. If a rail value in
 * lib/sponsor.ts is ever changed, these tests fail loudly rather than letting a
 * silently swapped payment address ship in a release APK. The literals below are
 * duplicated on purpose — a test that imports the constant it is checking proves
 * nothing.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppHeader } from './AppHeader.tsx';
import { SponsorHeart } from './SponsorHeart.tsx';
import { SupportSheet } from './SupportSheet.tsx';
import {
  BTC_ADDRESS,
  DONATE_URL,
  LN_ADDRESS,
  SPONSOR_URL,
  X_URL,
} from '../lib/sponsor.js';

describe('donation constants', () => {
  it('are the audited values, byte for byte', () => {
    expect(BTC_ADDRESS).toBe('bc1q9c2jx7ve0s2g7pg4fp3wkg7sqyk0zueyqj9jp5');
    expect(LN_ADDRESS).toBe('wwbd@strike.me');
    expect(X_URL).toBe('https://x.com/WWBD01_Freedom');
    expect(SPONSOR_URL).toBe('https://github.com/sponsors/OdinKara');
    expect(DONATE_URL).toBe('https://donate.grimnirworks.com');
  });
});

describe('SponsorHeart', () => {
  it('renders a dismissible-sheet trigger, not a bare outbound link', () => {
    const html = renderToStaticMarkup(<SponsorHeart />);
    expect(html).toContain('aria-label="Support ArrDeck"');
    expect(html).toContain('aria-haspopup="dialog"');
  });

  it('shows nothing until it is tapped — no sheet in the initial markup', () => {
    const html = renderToStaticMarkup(<SponsorHeart />);
    expect(html).not.toContain(BTC_ADDRESS);
    expect(html).not.toContain('role="dialog"');
  });
});

describe('SupportSheet', () => {
  const html = renderToStaticMarkup(<SupportSheet onClose={() => {}} />);

  it('shows every rail with the baked-in values', () => {
    expect(html).toContain(BTC_ADDRESS);
    expect(html).toContain(LN_ADDRESS);
    expect(html).toContain('X Money');
    expect(html).toContain('GitHub Sponsors');
    expect(html).toContain('donate.grimnirworks.com');
  });

  it('renders QR codes locally as inline SVG, never from an external service', () => {
    // Two <svg> QRs, and no request to anywhere for an image.
    expect(html.match(/<svg[^>]*viewBox/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).not.toMatch(/<img[^>]+src="https?:/);
    expect(html).not.toContain('api.qrserver.com');
    expect(html).not.toContain('chart.googleapis.com');
  });

  it('is a dismissible dialog with a close control', () => {
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-label="Close"');
  });

  it('says Sponsors may be unavailable rather than showing a dead link silently', () => {
    expect(html).toContain('Pending approval');
  });
});

describe('AppHeader', () => {
  it('always renders the donate heart', () => {
    const html = renderToStaticMarkup(<AppHeader title="Deck" />);
    expect(html).toContain('aria-label="Support ArrDeck"');
  });

  it('keeps a back button when showBack is set — and still shows the heart', () => {
    const html = renderToStaticMarkup(<AppHeader title="Indexers" showBack onBack={() => {}} />);
    expect(html).toContain('aria-label="Back"');
    expect(html).toContain('aria-label="Support ArrDeck"');
  });

  it('omits the back button when showBack is not set', () => {
    const html = renderToStaticMarkup(<AppHeader title="Deck" />);
    expect(html).not.toContain('aria-label="Back"');
  });

  it('does not nag — the heart is the only donate entry point in the header', () => {
    const html = renderToStaticMarkup(<AppHeader title="Deck" />);
    expect(html.match(/aria-label="Support ArrDeck"/g)?.length).toBe(1);
    expect(html).not.toContain('role="dialog"');
  });
});
