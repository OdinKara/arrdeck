/**
 * server/seed-from-env.ts — DEV-ONLY: seed config/services.json from the same
 * gitignored .env that scripts/probe-stack.ts already uses. Reuses that exact
 * credential mechanism (no new secret path). Never prints keys.
 *
 * Addresses default to the LAN-published NAS host ports; override via the
 * matching *_URL env var if set. Run once: `npm run server:seed`.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { ServiceConfig, ServiceKind } from '../src/engine/index.js';
import * as store from './config.js';

/** Same tiny .env loader as scripts/probe-stack.ts. */
function loadDotEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '..', '.env');
  let text: string;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

loadDotEnv();

const SEED: Array<{ kind: ServiceKind; urlEnv: string; keyEnv: string; lanDefault: string }> = [
  { kind: 'sonarr', urlEnv: 'SONARR_URL', keyEnv: 'SONARR_API_KEY', lanDefault: 'http://192.168.1.100:8989' },
  { kind: 'radarr', urlEnv: 'RADARR_URL', keyEnv: 'RADARR_API_KEY', lanDefault: 'http://192.168.1.100:7878' },
  { kind: 'sabnzbd', urlEnv: 'SAB_URL', keyEnv: 'SAB_API_KEY', lanDefault: 'http://192.168.1.100:8080' },
  { kind: 'prowlarr', urlEnv: 'PROWLARR_URL', keyEnv: 'PROWLARR_API_KEY', lanDefault: 'http://192.168.1.100:9696' },
];

let seeded = 0;
for (const s of SEED) {
  const apiKey = process.env[s.keyEnv];
  if (!apiKey) {
    console.log(`  skip ${s.kind}: no ${s.keyEnv} in env`);
    continue;
  }
  const address = process.env[s.urlEnv] || s.lanDefault;
  const cfg: ServiceConfig = { kind: s.kind, addresses: [address], apiKey };
  store.upsert(cfg);
  seeded += 1;
  console.log(`  seeded ${s.kind} @ ${address} (key: ${apiKey.length} chars, not shown)`);
}

console.log(`Seeded ${seeded} service(s) → ${store.CONFIG_PATH}`);
