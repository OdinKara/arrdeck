/**
 * probe-stack.ts — live CLI test harness for the ArrDeck engine.
 *
 * Proves, against the REAL stack, that:
 *   (1) auto-discovery finds services on their default ports,
 *   (2) the happy-eyeballs race connects to ALL four services,
 *   (3) each client pulls the data the UI needs, and
 *   (4) unified search routes movie->Radarr / show->Sonarr into one list.
 *
 * SECRETS: every API key is read from the environment (or a gitignored .env).
 * Keys are NEVER hardcoded, NEVER printed, and NEVER committed.
 *
 * Config (env or .env at repo root):
 *   SONARR_URL / SONARR_API_KEY
 *   RADARR_URL / RADARR_API_KEY
 *   SAB_URL / SAB_API_KEY
 *   PROWLARR_URL / PROWLARR_API_KEY
 *   SONARR_URL_REMOTE (optional 2nd candidate to exercise the race)
 *   SCAN_HOST (optional; defaults to SONARR_URL host)
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { scanHost } from '../src/engine/discovery.js';
import { resolveService } from '../src/engine/race.js';
import { type ServiceConfig, type ServiceKind } from '../src/engine/types.js';
import { SonarrClient } from '../src/engine/clients/sonarr.js';
import { RadarrClient } from '../src/engine/clients/radarr.js';
import { SabClient } from '../src/engine/clients/sabnzbd.js';
import { ProwlarrClient } from '../src/engine/clients/prowlarr.js';
import { unifiedSearch, type SearchResult } from '../src/engine/search.js';

// --- tiny .env loader (no dependency) --------------------------------------

function loadDotEnv(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, '..', '.env');
  let text: string;
  try {
    text = readFileSync(envPath, 'utf8');
  } catch {
    return; // no .env; rely on real env vars
  }
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = val;
  }
}

// --- helpers ---------------------------------------------------------------

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const AMBER = '\x1b[33m';
const BLUE = '\x1b[34m';
const PURPLE = '\x1b[35m';
const DIM = '\x1b[2m';
const RESET = '\x1b[0m';

function fmtBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

const checks: Array<{ name: string; pass: boolean; detail: string }> = [];
function record(name: string, pass: boolean, detail = ''): void {
  checks.push({ name, pass, detail });
  const tag = pass ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`;
  console.log(`  [${tag}] ${name}${detail ? ` ${DIM}— ${detail}${RESET}` : ''}`);
}

interface SvcEnv {
  kind: ServiceKind;
  url: string | undefined;
  apiKey: string | undefined;
}

/** Race a service's address(es) and return the winning base URL, or null. */
async function connect(svc: SvcEnv, extraAddresses: string[] = []): Promise<string | null> {
  if (!svc.url || !svc.apiKey) {
    record(`${svc.kind}: config present`, false, 'missing URL or API key in .env');
    return null;
  }
  const addresses = [svc.url, ...extraAddresses];
  const config: ServiceConfig = { kind: svc.kind, addresses, apiKey: svc.apiKey };
  const conn = await resolveService(config);
  if (!conn) {
    record(`${svc.kind}: race connected`, false, 'no address answered');
    return null;
  }
  record(`${svc.kind}: race connected`, true, `${conn.address} @ ${conn.latencyMs}ms`);
  return conn.address;
}

// --- main ------------------------------------------------------------------

async function main(): Promise<void> {
  loadDotEnv();

  const env = {
    sonarr: { kind: 'sonarr' as const, url: process.env.SONARR_URL, apiKey: process.env.SONARR_API_KEY },
    radarr: { kind: 'radarr' as const, url: process.env.RADARR_URL, apiKey: process.env.RADARR_API_KEY },
    sab: { kind: 'sabnzbd' as const, url: process.env.SAB_URL, apiKey: process.env.SAB_API_KEY },
    prowlarr: { kind: 'prowlarr' as const, url: process.env.PROWLARR_URL, apiKey: process.env.PROWLARR_API_KEY },
  };

  console.log(`${AMBER}ArrDeck — Phase 2 live probe${RESET}`);
  console.log(
    `${DIM}Engine: race + discovery + Sonarr/Radarr/SAB/Prowlarr clients + unified search${RESET}\n`,
  );

  if (!env.sonarr.url || !env.sonarr.apiKey) {
    console.error(`${RED}Missing config.${RESET} Populate a gitignored .env (see .env.example).`);
    process.exit(2);
  }

  const scanTarget = process.env.SCAN_HOST ?? new URL(env.sonarr.url).hostname;

  // (1) Auto-discovery -------------------------------------------------------
  console.log(`${AMBER}[1] Auto-discovery${RESET} — scanning ${scanTarget} on known default ports`);
  try {
    const found = await scanHost(scanTarget);
    for (const s of found) {
      const dot = s.reachable ? `${GREEN}●${RESET}` : `${DIM}○${RESET}`;
      console.log(
        `    ${dot} ${s.kind.padEnd(9)} :${String(s.port).padEnd(6)} ${
          s.reachable ? `${GREEN}reachable${RESET}` : `${DIM}—${RESET}`
        }`,
      );
    }
    const nReach = found.filter((s) => s.reachable).length;
    record('discovery found all 4 *arr services', nReach >= 4, `${nReach}/5 default ports reachable`);
  } catch (err) {
    record('auto-discovery scan', false, (err as Error).message);
  }
  console.log();

  // (2) Race + connect all four ---------------------------------------------
  console.log(`${AMBER}[2] Connection race${RESET} — racing each service's address(es)`);
  const remote = process.env.SONARR_URL_REMOTE;
  const sonarrAddr = await connect(env.sonarr, remote ? [remote] : []);
  const radarrAddr = await connect(env.radarr);
  const sabAddr = await connect(env.sab);
  const prowlarrAddr = await connect(env.prowlarr);
  console.log();

  // (3) Real data per service ------------------------------------------------
  // Sonarr (Phase 1 surface — quick confirm it still works)
  console.log(`${AMBER}[3a] Sonarr${RESET}`);
  let sonarr: SonarrClient | undefined;
  if (sonarrAddr && env.sonarr.apiKey) {
    sonarr = new SonarrClient(sonarrAddr, env.sonarr.apiKey);
    try {
      const status = await sonarr.getSystemStatus();
      const series = await sonarr.getSeries();
      const profiles = await sonarr.getQualityProfiles();
      record('sonarr data', true, `v${status.version}, ${series.length} series, ${profiles.length} profiles`);
    } catch (err) {
      record('sonarr data', false, (err as Error).message);
    }
  }
  console.log();

  // Radarr
  console.log(`${AMBER}[3b] Radarr${RESET}`);
  let radarr: RadarrClient | undefined;
  if (radarrAddr && env.radarr.apiKey) {
    radarr = new RadarrClient(radarrAddr, env.radarr.apiKey);
    try {
      const status = await radarr.getSystemStatus();
      record('radarr system/status', true, `${status.appName} v${status.version} on ${status.osName}`);
    } catch (err) {
      record('radarr system/status', false, (err as Error).message);
    }
    try {
      const movies = await radarr.getMovies();
      const monitored = movies.filter((m) => m.monitored).length;
      record('radarr movies', true, `${movies.length} movies (${monitored} monitored)`);
    } catch (err) {
      record('radarr movies', false, (err as Error).message);
    }
    try {
      const roots = await radarr.getRootFolders();
      record('radarr root folders', true, `${roots.length} folder(s)`);
      for (const r of roots) {
        console.log(`    ${DIM}•${RESET} ${r.path}  ${DIM}(${fmtBytes(r.freeSpace)} free)${RESET}`);
      }
    } catch (err) {
      record('radarr root folders', false, (err as Error).message);
    }
    try {
      const profiles = await radarr.getQualityProfiles();
      record('radarr quality profiles', true, `${profiles.length}: ${profiles.map((p) => p.name).join(', ')}`);
    } catch (err) {
      record('radarr quality profiles', false, (err as Error).message);
    }
  }
  console.log();

  // SABnzbd
  console.log(`${AMBER}[3c] SABnzbd${RESET}`);
  if (sabAddr && env.sab.apiKey) {
    const sab = new SabClient(sabAddr, env.sab.apiKey);
    try {
      const version = await sab.getVersion();
      record('sab version', true, `v${version.version}`);
    } catch (err) {
      record('sab version', false, (err as Error).message);
    }
    try {
      const queue = await sab.getQueue();
      record('sab queue', true, `${queue.items.length} item(s), speed ${queue.speed || '0'}, ${queue.paused ? 'PAUSED' : 'active'}`);
    } catch (err) {
      record('sab queue', false, (err as Error).message);
    }
  }
  console.log();

  // Prowlarr
  console.log(`${AMBER}[3d] Prowlarr${RESET}`);
  if (prowlarrAddr && env.prowlarr.apiKey) {
    const prowlarr = new ProwlarrClient(prowlarrAddr, env.prowlarr.apiKey);
    try {
      const indexers = await prowlarr.getIndexers();
      const health = await prowlarr.getHealth();
      record(
        'prowlarr indexers',
        true,
        `${health.healthy}/${health.enabled} healthy (${indexers.length} configured)${
          health.unhealthy.length ? ` — down: ${health.unhealthy.join(', ')}` : ''
        }`,
      );
      for (const i of indexers) {
        const dot = i.enable ? `${GREEN}●${RESET}` : `${DIM}○${RESET}`;
        console.log(`    ${dot} ${i.name} ${DIM}(${i.protocol})${RESET}`);
      }
    } catch (err) {
      record('prowlarr indexers', false, (err as Error).message);
    }
  }
  console.log();

  // (4) Unified search -------------------------------------------------------
  console.log(`${AMBER}[4] Unified search${RESET} — one call, routes movie->Radarr / show->Sonarr`);

  function printResults(term: string, results: SearchResult[]): void {
    const top = results.slice(0, 6);
    for (const r of top) {
      const badge = r.kind === 'movie' ? `${BLUE}[MOVIE]${RESET}` : `${PURPLE}[SHOW]${RESET}`;
      const lib = r.inLibrary ? ` ${GREEN}✓ in library${RESET}` : '';
      const id = r.kind === 'movie' ? `tmdb:${r.tmdbId}` : `tvdb:${r.tvdbId}`;
      console.log(
        `    ${badge} ${r.title} ${DIM}(${r.year}) · ${r.runtimeOrEpisodes} · ★${r.rating} · ${
          r.certification || 'NR'
        } · ${id}${RESET}${lib}`,
      );
    }
    console.log(`    ${DIM}(${results.length} total for "${term}")${RESET}`);
  }

  if (radarr && sonarr) {
    // Movie example
    try {
      const dune = await unifiedSearch('dune', { radarr, sonarr });
      printResults('dune', dune);
      const topMovie = dune.find((r) => r.kind === 'movie');
      const hasDuneMovie = dune.some(
        (r) => r.kind === 'movie' && r.title.toLowerCase().includes('dune'),
      );
      record('unified "dune" returns a movie from Radarr', hasDuneMovie && !!topMovie, topMovie ? `top movie: ${topMovie.title} (${topMovie.year})` : '');
    } catch (err) {
      record('unified "dune"', false, (err as Error).message);
    }
    console.log();
    // TV example
    try {
      const sev = await unifiedSearch('severance', { radarr, sonarr });
      printResults('severance', sev);
      const hasShow = sev.some(
        (r) => r.kind === 'show' && r.title.toLowerCase().includes('severance'),
      );
      const topShow = sev.find((r) => r.kind === 'show');
      record('unified "severance" returns a show from Sonarr', hasShow && !!topShow, topShow ? `top show: ${topShow.title} (${topShow.year})` : '');
    } catch (err) {
      record('unified "severance"', false, (err as Error).message);
    }
  } else {
    record('unified search (needs Radarr + Sonarr)', false, 'one or both clients unavailable');
  }

  summarize();
}

function summarize(): void {
  const passed = checks.filter((c) => c.pass).length;
  const total = checks.length;
  const allPass = passed === total && total > 0;
  console.log();
  console.log(
    `${allPass ? GREEN : RED}══ SUMMARY: ${passed}/${total} checks passed — ${
      allPass ? 'PASS' : 'FAIL'
    } ══${RESET}`,
  );
  process.exit(allPass ? 0 : 1);
}

main().catch((err) => {
  console.error(`${RED}Unexpected error:${RESET}`, err);
  process.exit(1);
});
