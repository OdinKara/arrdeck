/**
 * verify.ts — live verification of a service's URL + API key via the engine.
 *
 * Given a kind, base URL, and pasted key, make a real status/ping call and
 * report success + the service version (the green-check moment in onboarding).
 * All network goes through the engine's clients (and thus CapacitorHttp on
 * device).
 */

import {
  ProwlarrClient,
  RadarrClient,
  SabClient,
  SonarrClient,
  type ServiceKind,
} from '../../engine/index.js';
import { isNative } from '../platform/env.js';
import * as webApi from '../platform/webApi.js';

export interface VerifyResult {
  ok: boolean;
  version?: string;
  error?: string;
}

export async function verifyService(
  kind: ServiceKind,
  baseUrl: string,
  apiKey: string,
): Promise<VerifyResult> {
  if (!isNative()) {
    // WEB: the BFF races the stored config's addresses (server holds the key).
    // baseUrl/apiKey are the native-onboarding inputs; unused on web.
    const r = await webApi.verify(kind);
    return { ok: r.ok, error: r.error };
  }
  // ---- NATIVE (unchanged) ----
  try {
    switch (kind) {
      case 'sonarr': {
        const s = await new SonarrClient(baseUrl, apiKey).getSystemStatus();
        return { ok: true, version: s.version };
      }
      case 'radarr': {
        const s = await new RadarrClient(baseUrl, apiKey).getSystemStatus();
        return { ok: true, version: s.version };
      }
      case 'prowlarr': {
        const s = await new ProwlarrClient(baseUrl, apiKey).getSystemStatus();
        return { ok: true, version: s.version };
      }
      case 'sabnzbd': {
        const v = await new SabClient(baseUrl, apiKey).getVersion();
        return { ok: true, version: v.version };
      }
      case 'plex':
        return { ok: false, error: 'Plex is not supported yet' };
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
