/**
 * AppHeader / SponsorHeart tests — render to static markup (no DOM needed) and
 * assert the donate heart is present and points at SPONSOR_URL, and that the
 * back button is preserved on back-button screens.
 */

import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AppHeader } from './AppHeader.tsx';
import { SponsorHeart } from './SponsorHeart.tsx';
import { SPONSOR_URL } from '../lib/sponsor.js';

describe('SponsorHeart', () => {
  it('renders a sponsor control linking SPONSOR_URL', () => {
    const html = renderToStaticMarkup(<SponsorHeart />);
    expect(html).toContain(SPONSOR_URL);
    expect(html).toContain('aria-label="Sponsor ArrDeck"');
  });

  it('exposes SPONSOR_URL as the real GitHub Sponsors link', () => {
    expect(SPONSOR_URL).toBe('https://github.com/sponsors/OdinKara');
  });
});

describe('AppHeader', () => {
  it('always renders the donate heart (SPONSOR_URL)', () => {
    const html = renderToStaticMarkup(<AppHeader title="Deck" />);
    expect(html).toContain(SPONSOR_URL);
    expect(html).toContain('aria-label="Sponsor ArrDeck"');
  });

  it('keeps a back button when showBack is set — and still shows the heart', () => {
    const html = renderToStaticMarkup(<AppHeader title="Indexers" showBack onBack={() => {}} />);
    expect(html).toContain('aria-label="Back"');
    expect(html).toContain(SPONSOR_URL);
  });

  it('omits the back button when showBack is not set', () => {
    const html = renderToStaticMarkup(<AppHeader title="Deck" />);
    expect(html).not.toContain('aria-label="Back"');
  });
});
