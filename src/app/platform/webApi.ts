/**
 * webApi.ts — WEB-ONLY transport to the ArrDeck BFF (server/).
 *
 * Same-origin `fetch` to relative `/api/...` (no CORS, no base URL — the browser
 * talks to the container that served it; the engine runs server-side there).
 * Throws on non-2xx so existing screen error-handling fires.
 *
 * This file is only reached on the WEB code path (Capacitor.isNativePlatform()
 * === false). The native/phone path never imports or runs any of this.
 */

import type { AddressLabel, ServiceKind } from '../../engine/index.js';
import type { DashboardData } from '../lib/dashboard.js';

/** A service as the BFF exposes it — API key replaced by `hasKey` (never leaked). */
export interface MaskedService {
  kind: ServiceKind;
  addresses: string[];
  addressLabels?: AddressLabel[];
  hasKey: boolean;
}

export interface WebVerifyResult {
  ok: boolean;
  address?: string;
  latencyMs?: number;
  error?: string;
}

/** Core same-origin request helper. Throws Error on non-2xx. */
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    let message = `${init?.method ?? 'GET'} ${path} -> HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      /* non-JSON error body */
    }
    throw new Error(message);
  }
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** GET /api/services — kinds + hasKey (no secrets). */
export function getServices(): Promise<MaskedService[]> {
  return request<MaskedService[]>('/api/services');
}

/** PUT /api/services/:kind — upsert. Omit apiKey to keep the stored one. */
export function putService(
  kind: ServiceKind,
  body: { addresses: string[]; addressLabels?: AddressLabel[]; apiKey?: string },
): Promise<MaskedService> {
  return request<MaskedService>(`/api/services/${kind}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** DELETE /api/services/:kind. */
export function deleteService(kind: ServiceKind): Promise<{ ok: boolean; removed: string }> {
  return request(`/api/services/${kind}`, { method: 'DELETE' });
}

/**
 * POST /api/verify — race a service's addresses.
 * With no `candidate`, the BFF verifies the STORED config. With a candidate
 * ({ addresses?, apiKey? }), it tests that (merged over stored, omitted apiKey
 * → stored key) WITHOUT persisting.
 */
export function verify(
  kind: ServiceKind,
  candidate?: { addresses?: string[]; apiKey?: string },
): Promise<WebVerifyResult> {
  return request<WebVerifyResult>('/api/verify', {
    method: 'POST',
    body: JSON.stringify({ kind, ...(candidate ?? {}) }),
  });
}


/** GET /api/dashboard — the server-assembled deck (same shape as loadDashboard). */
export function dashboard(): Promise<DashboardData> {
  return request<DashboardData>('/api/dashboard');
}

/** POST /api/rpc — invoke one allow-listed engine-client method server-side. */
export async function rpc(service: string, method: string, args: unknown[]): Promise<unknown> {
  const res = await request<{ ok: boolean; result?: unknown; error?: string }>('/api/rpc', {
    method: 'POST',
    body: JSON.stringify({ service, method, args }),
  });
  return res.result;
}
