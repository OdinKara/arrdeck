/**
 * connect.ts — the shared "verify a service, then persist it" step.
 *
 * Used by BOTH onboarding paths (the scanned-service cards and the explicit
 * manual-add form) so the verify→save logic lives in exactly one place. On
 * success the config is upserted on-device (keyed by kind, so a second add for
 * the same kind REPLACES rather than duplicating).
 */

import { verifyService, type VerifyResult } from './verify.js';
import { upsertService } from '../platform/storage.js';
import type { ServiceKind } from '../../engine/index.js';

/**
 * Live-verify `url` + `apiKey` for `kind`; on success persist the ServiceConfig.
 * Returns the VerifyResult either way (never throws — verify captures errors).
 */
export async function connectService(
  kind: ServiceKind,
  url: string,
  apiKey: string,
): Promise<VerifyResult> {
  const result = await verifyService(kind, url, apiKey);
  if (result.ok) {
    await upsertService({ kind, addresses: [url], apiKey });
  }
  return result;
}
