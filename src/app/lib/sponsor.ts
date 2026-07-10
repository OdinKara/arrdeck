/**
 * sponsor.ts — the single source of the donate/sponsor link.
 *
 * SPONSOR_URL and the open-in-browser behaviour live here so both the shared
 * AppHeader and the bespoke (poster-hero / edit-modal) screens use ONE code
 * path — web opens a new tab (noopener), native opens the system browser via
 * Capacitor Browser (see platform/browser.ts).
 */

import { openExternal } from '../platform/browser.js';

export const SPONSOR_URL = 'https://github.com/sponsors/OdinKara';

export function openSponsor(): Promise<void> {
  return openExternal(SPONSOR_URL);
}
