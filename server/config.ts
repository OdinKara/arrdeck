/**
 * server/config.ts — file-backed config store for the ArrDeck BFF.
 *
 * This is the SERVER-SIDE replacement for the phone's @capacitor/preferences
 * storage (src/app/platform/storage.ts). Same on-disk SHAPE as the app's
 * `arrdeck.services.v1` value: a JSON array of the engine's ServiceConfig
 * (kind | addresses[] | addressLabels? | apiKey).
 *
 * Location: `${ARRDECK_CONFIG_DIR || './config'}/services.json`. The dir holds
 * API keys, so it is gitignored and created on demand.
 *
 * Imports ONLY the engine's type — never src/app/*.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ServiceConfig, ServiceKind } from '../src/engine/index.js';

const CONFIG_DIR = process.env.ARRDECK_CONFIG_DIR || './config';
export const CONFIG_PATH = resolve(CONFIG_DIR, 'services.json');

function ensureDir(): void {
  if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
}

/** Read all configured services (empty array if the file is missing/invalid). */
export function load(): ServiceConfig[] {
  try {
    const parsed = JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as ServiceConfig[]) : [];
  } catch {
    return [];
  }
}

/** Persist the full services list (pretty-printed for hand-inspection). */
export function save(list: ServiceConfig[]): void {
  ensureDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(list, null, 2), 'utf8');
}

/** The stored config for one kind, or undefined. */
export function get(kind: ServiceKind): ServiceConfig | undefined {
  return load().find((s) => s.kind === kind);
}

/** Add or replace a service (keyed by kind — one instance per kind). */
export function upsert(config: ServiceConfig): ServiceConfig[] {
  const list = load();
  const i = list.findIndex((s) => s.kind === config.kind);
  if (i >= 0) list[i] = config;
  else list.push(config);
  save(list);
  return list;
}

/** Remove a service by kind. */
export function remove(kind: ServiceKind): ServiceConfig[] {
  const list = load().filter((s) => s.kind !== kind);
  save(list);
  return list;
}
