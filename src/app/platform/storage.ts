/**
 * storage.ts — on-device persistence for service configs (incl. API keys).
 *
 * Uses Capacitor Preferences (Android: backed by the app's private
 * SharedPreferences, sandboxed to this app — NOT world-readable, NOT the
 * plaintext-localStorage the DEV.md security note warns against). On web it
 * falls back to Preferences' localStorage shim for dev only.
 *
 * NOTE (Phase 3a): Preferences is private per-app storage, adequate for the
 * device test. Hardening to the Android Keystore / EncryptedSharedPreferences
 * for the API keys is a tracked follow-up before public release.
 */

import { Preferences } from '@capacitor/preferences';
import type { ServiceConfig } from '../../engine/index.js';
import { isNative } from './env.js';
import * as webApi from './webApi.js';

const SERVICES_KEY = 'arrdeck.services.v1';

/** Load all configured services (empty array if none). */
export async function loadServices(): Promise<ServiceConfig[]> {
  if (!isNative()) {
    // WEB: read from the BFF. The apiKey never leaves the server, so the
    // client-side ServiceConfig carries an empty key placeholder (proxies route
    // real calls through the server, which holds the key).
    const svcs = await webApi.getServices();
    return svcs.map((s) => ({
      kind: s.kind,
      addresses: s.addresses,
      ...(s.addressLabels ? { addressLabels: s.addressLabels } : {}),
      apiKey: '',
    }));
  }
  // ---- NATIVE (unchanged) ----
  const { value } = await Preferences.get({ key: SERVICES_KEY });
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as ServiceConfig[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Persist the full services list. */
export async function saveServices(services: ServiceConfig[]): Promise<void> {
  if (!isNative()) {
    // WEB: PUT each service. An empty apiKey is treated by the BFF as "keep the
    // stored key", so a config loaded on web never wipes the server-side key.
    await Promise.all(
      services.map((s) =>
        webApi.putService(s.kind, {
          addresses: s.addresses,
          ...(s.addressLabels ? { addressLabels: s.addressLabels } : {}),
          ...(s.apiKey ? { apiKey: s.apiKey } : {}),
        }),
      ),
    );
    return;
  }
  // ---- NATIVE (unchanged) ----
  await Preferences.set({ key: SERVICES_KEY, value: JSON.stringify(services) });
}

/**
 * Add or replace a service (keyed by kind — one instance per kind for now).
 * Returns the updated list.
 */
export async function upsertService(config: ServiceConfig): Promise<ServiceConfig[]> {
  if (!isNative()) {
    // WEB: PUT this service; only send apiKey when the caller actually supplied
    // one (empty → the BFF keeps the stored key).
    await webApi.putService(config.kind, {
      addresses: config.addresses,
      ...(config.addressLabels ? { addressLabels: config.addressLabels } : {}),
      ...(config.apiKey ? { apiKey: config.apiKey } : {}),
    });
    return loadServices();
  }
  // ---- NATIVE (unchanged) ----
  const services = await loadServices();
  const idx = services.findIndex((s) => s.kind === config.kind);
  if (idx >= 0) services[idx] = config;
  else services.push(config);
  await saveServices(services);
  return services;
}

/** Remove a service by kind. Returns the updated list. */
export async function removeService(kind: ServiceConfig['kind']): Promise<ServiceConfig[]> {
  if (!isNative()) {
    // WEB: DELETE via the BFF.
    await webApi.deleteService(kind);
    return loadServices();
  }
  // ---- NATIVE (unchanged) ----
  const services = (await loadServices()).filter((s) => s.kind !== kind);
  await saveServices(services);
  return services;
}
