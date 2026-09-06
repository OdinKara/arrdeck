/**
 * sponsor.ts — the ONE place every donation value in ArrDeck is written down.
 *
 * These values are BAKED INTO THE BUILD on purpose. The support sheet does not
 * fetch donate.grimnirworks.com, or anything else, to find out where to send
 * money:
 *
 *   1. ArrDeck is offline/LAN-first. A device running it may never have a route
 *      to the public internet, and the sheet still has to work there.
 *   2. A released APK cannot be patched. If the sheet fetched its addresses and
 *      that fetch broke — DNS, a moved path, a captive portal, a hijacked
 *      response — every installed copy would show nothing, or worse, something
 *      an attacker chose.
 *
 * A baked-in address can go stale. A fetched address can go WRONG. Stale is the
 * failure we accept.
 *
 * Changing anything here changes what users are asked to send money to, so it is
 * a deliberate, reviewable edit — matched character-for-character against
 * https://github.com/OdinKara/donate, which is the public audit trail for the
 * same values.
 */

import { openExternal } from '../platform/browser.js';

/** The donation landing page — the canonical, always-current list of rails. */
export const DONATE_URL = 'https://donate.grimnirworks.com';

/** GitHub Sponsors. May 404 until the account is approved; see SPONSORS_PENDING. */
export const SPONSOR_URL = 'https://github.com/sponsors/OdinKara';

/**
 * GitHub Sponsors is not approved yet, so the link can 404. The sheet says so
 * rather than letting a user hit a dead page and assume ArrDeck is broken.
 * Flip to false once the account is live.
 */
export const SPONSORS_PENDING = true;

/** X Money. */
export const X_URL = 'https://x.com/WWBD01_Freedom';
export const X_HANDLE = '@WWBD01_Freedom';

/** Bitcoin, on-chain. Native SegWit (bech32), mainnet. */
export const BTC_ADDRESS = 'bc1q9c2jx7ve0s2g7pg4fp3wkg7sqyk0zueyqj9jp5';

/** Lightning address. */
export const LN_ADDRESS = 'wwbd@strike.me';

/**
 * The two scannable rails, in display order. The QR encodes EXACTLY the string
 * shown as text beside it — no `bitcoin:` URI wrapper, no amount, no label — so
 * what a user scans and what they can read are the same bytes.
 */
export const CRYPTO_RAILS = [
  {
    id: 'btc',
    label: 'Bitcoin',
    hint: 'on-chain · bech32 · mainnet only',
    value: BTC_ADDRESS,
  },
  {
    id: 'ln',
    label: 'Lightning',
    hint: 'Lightning address',
    value: LN_ADDRESS,
  },
] as const;

export type CryptoRail = (typeof CRYPTO_RAILS)[number];

/** Open the donate landing page (system browser on native, new tab on web). */
export function openDonatePage(): Promise<void> {
  return openExternal(DONATE_URL);
}

export function openSponsor(): Promise<void> {
  return openExternal(SPONSOR_URL);
}

export function openX(): Promise<void> {
  return openExternal(X_URL);
}
