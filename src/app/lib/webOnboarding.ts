/**
 * webOnboarding.ts — WEB-ONLY add-service helpers.
 *
 * Extracted so the web onboarding flow (AddServiceScreenWeb) is unit-testable
 * without a DOM. The NATIVE AddServiceScreen / connect.ts / engine never import
 * this file — the native path stays byte-identical.
 *
 * It reuses the engine's pure URL helpers (read-only; no engine change) so the
 * web form and the native form build addresses the same way.
 */

import { buildBaseUrl, splitHostPort, type ServiceKind } from '../../engine/index.js';
import { SERVICE_META } from './serviceMeta.js';

/**
 * The field state to apply when the user switches the selected kind: a FRESH API
 * key (an *arr key is per-service, so the previous one must not linger), the new
 * kind's default port, and a cleared secondary address. The caller keeps `host`
 * (usually the same server across services).
 */
export function freshKindState(kind: ServiceKind): {
  port: string;
  apiKey: string;
  addr2: string;
} {
  return { port: String(SERVICE_META[kind].port), apiKey: '', addr2: '' };
}

/**
 * Normalize a free-form address entry to a base URL. Accepts:
 *   - a full URL     ("http://sonarr:8989")           → used as-is (trailing / trimmed)
 *   - host:port      ("192.168.1.50:8989" / "sonarr:8989") → http://host:port
 *   - a bare host    ("sonarr" / "192.168.1.50")      → http://host:<defaultPort>
 * Returns null for empty/invalid input.
 */
export function normalizeAddress(entry: string, defaultPort: number): string | null {
  const s = entry.trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s.replace(/\/+$/, '');
  const { host, port } = splitHostPort(s);
  if (!host) return null;
  return buildBaseUrl(host, port ?? defaultPort);
}

/**
 * Build the address list from the required primary (host + port) plus an optional
 * secondary entry (a container name and/or a LAN IP). The engine races them
 * (happy-eyeballs) and uses whichever answers. Duplicates are dropped; the
 * primary is always first.
 */
export function buildAddresses(
  host: string,
  port: string,
  extra: string,
  defaultPort: number,
): string[] {
  const primary = buildBaseUrl(host.trim(), port.trim() || defaultPort);
  const out = [primary];
  const ex = normalizeAddress(extra, defaultPort);
  if (ex && ex !== primary) out.push(ex);
  return out;
}

export type VerifyFn = (
  kind: ServiceKind,
  candidate: { addresses?: string[]; apiKey?: string },
) => Promise<{ ok: boolean; error?: string }>;

export type PutFn = (
  kind: ServiceKind,
  body: { addresses: string[]; apiKey: string },
) => Promise<unknown>;

/**
 * Verify-then-save — mirrors the native `connectService` contract: verify the
 * candidate FIRST and only persist if it answered. Returns `{ ok }`; the caller
 * navigates away (onDone) ONLY when ok is true. On failure nothing is persisted
 * and the reason is returned so the form can show it and stay put.
 */
export async function verifyThenSave(
  kind: ServiceKind,
  addresses: string[],
  apiKey: string,
  verify: VerifyFn,
  put: PutFn,
): Promise<{ ok: boolean; error?: string }> {
  const r = await verify(kind, { addresses, apiKey });
  if (!r.ok) return { ok: false, error: r.error ?? 'no address answered' };
  await put(kind, { addresses, apiKey });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// First-run guided wizard (WEB-only). The native onboarding is a scan flow and
// is untouched.
// ---------------------------------------------------------------------------

/** The fixed order the first-run web wizard steps through. */
export const WIZARD_ORDER: ServiceKind[] = ['sonarr', 'radarr', 'sabnzbd', 'prowlarr'];

export interface WizardState {
  step: number;
  done: boolean;
}
export type WizardAction = { type: 'saved' } | { type: 'skip' } | { type: 'finish' };

/**
 * First-run (guided wizard) vs "add another" (single form). App.tsx renders the
 * add flow with NO `onCancel` on a true first run (zero services), and WITH an
 * `onCancel` when adding another service (services already exist). So the
 * absence of onCancel is the first-run signal — no change to App.tsx or the
 * native screen needed.
 */
export function isFirstRunWeb(onCancel?: () => void): boolean {
  return onCancel === undefined;
}

/**
 * Wizard step machine. `saved` (successful verify+save) and `skip` both ADVANCE
 * to the next service; advancing past the last step marks `done` (auto-exit).
 * `finish` ends immediately from any step — everything saved so far is already
 * persisted per-step, so it's kept.
 */
export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  if (action.type === 'finish') return { step: state.step, done: true };
  const next = state.step + 1;
  if (next >= WIZARD_ORDER.length) return { step: WIZARD_ORDER.length, done: true };
  return { step: next, done: false };
}
