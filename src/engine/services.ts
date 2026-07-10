/**
 * services.ts — pure helpers for editing a ServiceConfig's addresses + key.
 * Framework-free and unit-tested; the Edit Service UI transports what these
 * produce. Labels are cosmetic and never affect the race.
 */

import type { AddressLabel, ServiceConfig } from './types.js';

/** Build a base URL from a host (or host:port / URL) + a port. */
export function buildBaseUrl(host: string, port: number | string): string {
  const cleaned = host
    .trim()
    .replace(/^https?:\/\//i, '') // drop any scheme
    .replace(/\/.*$/, '') // drop any path
    .replace(/:\d+$/, ''); // drop any port the user typed in the host
  return `http://${cleaned}:${port}`;
}

/** Extract the port from a base URL, falling back to `fallback`. */
export function portOf(baseUrl: string, fallback: number): number {
  try {
    const u = new URL(baseUrl);
    return u.port ? Number(u.port) : fallback;
  } catch {
    const m = /:(\d+)(?:\/|$)/.exec(baseUrl);
    return m ? Number(m[1]) : fallback;
  }
}

/** Extract the host from a base URL (no scheme/port). */
export function hostOf(baseUrl: string): string {
  try {
    return new URL(baseUrl).hostname;
  } catch {
    return baseUrl.replace(/^https?:\/\//i, '').replace(/[:/].*$/, '');
  }
}

/** Normalize `addressLabels` to exactly match `addresses.length` (padding null). */
export function normalizedLabels(config: ServiceConfig): AddressLabel[] {
  const labels = config.addressLabels ?? [];
  return config.addresses.map((_, i) => labels[i] ?? null);
}

/** The label for the address at `index` (null if unset). */
export function labelAt(config: ServiceConfig, index: number): AddressLabel {
  return config.addressLabels?.[index] ?? null;
}

/**
 * Append a candidate address (built from host+port) with a display label.
 * Returns a NEW config; never mutates the input. Skips exact duplicate URLs.
 */
export function addAddress(
  config: ServiceConfig,
  host: string,
  port: number | string,
  label: AddressLabel,
): ServiceConfig {
  const url = buildBaseUrl(host, port);
  if (config.addresses.includes(url)) return config;
  return {
    ...config,
    addresses: [...config.addresses, url],
    addressLabels: [...normalizedLabels(config), label],
  };
}

/**
 * Remove the address at `index`. A service must keep at least ONE address, so
 * removing the last one is a no-op (returns the config unchanged).
 */
export function removeAddressAt(config: ServiceConfig, index: number): ServiceConfig {
  if (config.addresses.length <= 1) return config;
  const labels = normalizedLabels(config);
  return {
    ...config,
    addresses: config.addresses.filter((_, i) => i !== index),
    addressLabels: labels.filter((_, i) => i !== index),
  };
}

/** Replace the API key. Returns a NEW config. */
export function setApiKey(config: ServiceConfig, apiKey: string): ServiceConfig {
  return { ...config, apiKey };
}

/** Mask a key for display: bullets + last 4 chars (e.g. "••••••••5778"). */
export function maskKey(key: string): string {
  if (!key) return '';
  if (key.length <= 4) return '•'.repeat(key.length);
  return '•'.repeat(8) + key.slice(-4);
}
