/**
 * keyHelp.ts — the deep-link "Get your API key" helper.
 *
 * API keys are secrets the services deliberately don't expose over their API,
 * so the user must copy each one once. Instead of making them hunt, we deep-link
 * straight to the exact settings page where the key lives (a copy field).
 */

import type { ServiceKind } from '../../engine/index.js';

/** The settings page URL where each service shows its API key. */
export function apiKeySettingsUrl(kind: ServiceKind, baseUrl: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  switch (kind) {
    case 'sonarr':
    case 'radarr':
    case 'prowlarr':
      return `${base}/settings/general`;
    case 'sabnzbd':
      return `${base}/config/general/`;
    case 'plex':
      // Plex uses account tokens, not a settings-page key; handled later.
      return `${base}/web`;
  }
}

/** Short hint telling the user what to look for on that page. */
export function apiKeyHint(kind: ServiceKind): string {
  switch (kind) {
    case 'sonarr':
    case 'radarr':
    case 'prowlarr':
      return 'Settings → General → Security → API Key (copy it)';
    case 'sabnzbd':
      return 'Config → General → API Key (copy it)';
    case 'plex':
      return 'Plex uses an account token (supported later)';
  }
}
