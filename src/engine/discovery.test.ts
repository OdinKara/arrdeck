import { describe, expect, it } from 'vitest';
import { scanHost, probeAddress, splitHostPort } from './discovery.js';
import { DEFAULT_PORTS } from './types.js';

/** Build a minimal Response-like object for a mocked fetch. */
function mockResponse(opts: {
  status?: number;
  ok?: boolean;
  body?: string;
  headers?: Record<string, string>;
}): Response {
  const headers = new Headers(opts.headers ?? {});
  const status = opts.status ?? (opts.ok ? 200 : 404);
  return {
    status,
    ok: opts.ok ?? (status >= 200 && status < 300),
    headers,
    text: async () => opts.body ?? '',
    json: async () => JSON.parse(opts.body ?? '{}'),
  } as unknown as Response;
}

describe('scanHost (auto-discovery)', () => {
  it('probes ONLY the known default ports — one result per known kind', async () => {
    const seen: number[] = [];
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      const port = Number(new URL(url).port);
      seen.push(port);
      return mockResponse({ status: 404 });
    }) as typeof fetch;

    const results = await scanHost('10.0.0.5', { fetchImpl });

    // Exactly the 5 known kinds, each on its documented default port.
    expect(results.map((r) => r.kind).sort()).toEqual(
      ['plex', 'prowlarr', 'radarr', 'sabnzbd', 'sonarr'],
    );
    for (const r of results) {
      expect(r.port).toBe(DEFAULT_PORTS[r.kind]);
      expect(r.url).toBe(`http://10.0.0.5:${DEFAULT_PORTS[r.kind]}`);
    }
    // Only default ports were ever touched — no range sweep.
    const uniquePorts = [...new Set(seen)].sort((a, b) => a - b);
    for (const p of uniquePorts) {
      expect(Object.values(DEFAULT_PORTS)).toContain(p);
    }
  });

  it('marks Sonarr reachable when /ping returns {"status":"OK"}', async () => {
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes(`:${DEFAULT_PORTS.sonarr}`) && url.endsWith('/ping')) {
        return mockResponse({ ok: true, body: '{"status":"OK"}' });
      }
      return mockResponse({ status: 404 });
    }) as typeof fetch;

    const results = await scanHost('10.0.0.5', { fetchImpl });
    const sonarr = results.find((r) => r.kind === 'sonarr')!;
    expect(sonarr.reachable).toBe(true);
    // A port with nothing behind it stays unreachable.
    expect(results.find((r) => r.kind === 'radarr')!.reachable).toBe(false);
  });

  it('identifies Plex via its X-Plex header on a 401', async () => {
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes(`:${DEFAULT_PORTS.plex}`)) {
        return mockResponse({ status: 401, headers: { 'X-Plex-Protocol': '1.0' } });
      }
      return mockResponse({ status: 404 });
    }) as typeof fetch;

    const results = await scanHost('10.0.0.5', { fetchImpl });
    expect(results.find((r) => r.kind === 'plex')!.reachable).toBe(true);
  });

  it('identifies SABnzbd via its version endpoint', async () => {
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (url.includes(`:${DEFAULT_PORTS.sabnzbd}`) && url.includes('mode=version')) {
        return mockResponse({ ok: true, body: '{"version":"4.3.0"}' });
      }
      return mockResponse({ status: 404 });
    }) as typeof fetch;

    const results = await scanHost('10.0.0.5', { fetchImpl });
    expect(results.find((r) => r.kind === 'sabnzbd')!.reachable).toBe(true);
  });

  it('treats a network error as unreachable, not a crash', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNREFUSED');
    }) as typeof fetch;
    const results = await scanHost('10.0.0.5', { fetchImpl });
    expect(results.every((r) => r.reachable === false)).toBe(true);
  });

  it('scans the BARE host when a host:port is pasted (ignores the pasted port)', async () => {
    const seen: string[] = [];
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      seen.push(new URL(url).host);
      return mockResponse({ status: 404 });
    }) as typeof fetch;

    await scanHost('192.168.0.100:8085', { fetchImpl });
    // Every probe hit 192.168.0.100 on a DEFAULT port — never 192.168.0.100:8085.
    for (const host of seen) {
      const port = Number(host.split(':')[1]);
      expect(host.startsWith('192.168.0.100:')).toBe(true);
      expect(Object.values(DEFAULT_PORTS)).toContain(port);
    }
    expect(seen.some((h) => h.endsWith(':8085'))).toBe(false);
  });
});

describe('splitHostPort', () => {
  it('detects an explicit :port', () => {
    expect(splitHostPort('192.168.0.100:8085')).toEqual({ host: '192.168.0.100', port: 8085 });
  });
  it('returns port null for a bare host', () => {
    expect(splitHostPort('192.168.0.100')).toEqual({ host: '192.168.0.100', port: null });
  });
  it('strips a scheme and path, keeping host+port', () => {
    expect(splitHostPort('http://nas.local:8080/sabnzbd')).toEqual({ host: 'nas.local', port: 8080 });
  });
  it('trims whitespace', () => {
    expect(splitHostPort('  10.0.0.5:9999  ')).toEqual({ host: '10.0.0.5', port: 9999 });
  });
});

describe('probeAddress (exact custom-port probe)', () => {
  it('identifies SABnzbd answering on a CUSTOM port', async () => {
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      // SAB answers its version endpoint only at the exact custom address.
      if (url.startsWith('http://192.168.0.100:8085') && url.includes('mode=version')) {
        return mockResponse({ ok: true, body: '{"version":"4.3.0"}' });
      }
      return mockResponse({ status: 404 });
    }) as typeof fetch;

    const svc = await probeAddress('192.168.0.100:8085', { fetchImpl });
    expect(svc).not.toBeNull();
    expect(svc!.kind).toBe('sabnzbd');
    expect(svc!.port).toBe(8085);
    expect(svc!.url).toBe('http://192.168.0.100:8085');
    expect(svc!.reachable).toBe(true);
  });

  it('identifies Sonarr answering on a custom port via /ping', async () => {
    const fetchImpl = (async (input: string | URL) => {
      const url = String(input);
      if (url.startsWith('http://10.0.0.5:9111') && url.endsWith('/ping')) {
        return mockResponse({ ok: true, body: '{"status":"OK"}' });
      }
      return mockResponse({ status: 404 });
    }) as typeof fetch;

    const svc = await probeAddress('10.0.0.5:9111', { fetchImpl });
    expect(svc?.kind).toBe('sonarr');
    expect(svc?.url).toBe('http://10.0.0.5:9111');
  });

  it('returns null when nothing known answers on the pasted port', async () => {
    const fetchImpl = (async () => mockResponse({ status: 404 })) as typeof fetch;
    expect(await probeAddress('192.168.0.100:8085', { fetchImpl })).toBeNull();
  });

  it('returns null when no explicit port is given (nothing custom to probe)', async () => {
    let called = false;
    const fetchImpl = (async () => {
      called = true;
      return mockResponse({ ok: true, body: '{"version":"x"}' });
    }) as typeof fetch;
    expect(await probeAddress('192.168.0.100', { fetchImpl })).toBeNull();
    expect(called).toBe(false); // short-circuits without any network call
  });
});
