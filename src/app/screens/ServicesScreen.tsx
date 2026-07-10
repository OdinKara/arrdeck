/**
 * ServicesScreen — configured services with LIVE connection status.
 *
 * For each stored service it runs the engine's happy-eyeballs race
 * (resolveService) and shows a green dot + which address won + latency — the
 * moat, made visible. (The full dashboard is Phase 3b.)
 */

import { useEffect, useState } from 'react';
import { Plus, RefreshCw, ChevronRight } from 'lucide-react';
import {
  resolveService,
  type ServiceConfig,
} from '../../engine/index.js';
import { SERVICE_META, SERVICE_ORDER } from '../lib/serviceMeta.js';
import { loadServices } from '../platform/storage.js';
import { httpMode } from '../platform/http.js';
import { isNative } from '../platform/env.js';
import * as webApi from '../platform/webApi.js';
import { getAppVersion } from '../platform/appInfo.js';
import { Button, Card, Spinner, StatusDot } from '../components/ui.tsx';

// Only the two fields the row renders — so the NATIVE (resolveService) and WEB
// (BFF /api/verify) branches can feed the same shape.
type ConnState =
  | { status: 'connecting' }
  | { status: 'up'; address: string; latencyMs: number }
  | { status: 'down' };

export function ServicesScreen({
  onAddMore,
  onEditService,
}: {
  onAddMore: () => void;
  onEditService: (kind: ServiceConfig['kind']) => void;
}) {
  const [services, setServices] = useState<ServiceConfig[]>([]);
  const [conns, setConns] = useState<Record<string, ConnState>>({});
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    const list = await loadServices();
    // Stable display order.
    list.sort((a, b) => SERVICE_ORDER.indexOf(a.kind) - SERVICE_ORDER.indexOf(b.kind));
    setServices(list);
    setLoading(false);

    // Check each service's reachability.
    //  - WEB: go through the BFF (POST /api/verify). The browser can't reach
    //    container-name addresses like http://sonarr:8989 over media_net — only
    //    the server can — so the status check MUST run server-side, like the
    //    rest of the web app (dashboard/rpc).
    //  - NATIVE: run the engine's happy-eyeballs race on-device (unchanged).
    const web = !isNative();
    for (const svc of list) {
      setConns((c) => ({ ...c, [svc.kind]: { status: 'connecting' } }));
      const check: Promise<ConnState> = web
        ? webApi.verify(svc.kind).then((r) =>
            r.ok
              ? { status: 'up', address: r.address ?? '', latencyMs: r.latencyMs ?? 0 }
              : { status: 'down' },
          )
        : // force a fresh race so a manual refresh really re-checks
          resolveService(svc, { forceRerace: true }).then((result) =>
            result
              ? { status: 'up', address: result.address, latencyMs: result.latencyMs }
              : { status: 'down' },
          );
      check
        .then((state) => setConns((c) => ({ ...c, [svc.kind]: state })))
        .catch(() => setConns((c) => ({ ...c, [svc.kind]: { status: 'down' } })));
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    getAppVersion().then((v) => {
      if (!cancelled) setVersion(v.version);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="ad-col" style={{ padding: 18 }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
        }}
      >
        <span style={{ fontSize: 22, fontWeight: 500, color: 'var(--amber)' }}>ArrDeck</span>
        <button
          onClick={refresh}
          aria-label="Refresh"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-2)',
            padding: 8,
            cursor: 'pointer',
            display: 'inline-flex',
          }}
        >
          <RefreshCw size={16} />
        </button>
      </header>

      <div className="micro-label" style={{ margin: '4px 4px 10px' }}>
        Services
      </div>

      {loading && services.length === 0 ? (
        <Card recessed>
          <Spinner /> <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>Loading…</span>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {services.map((svc) => {
            const meta = SERVICE_META[svc.kind];
            const Icon = meta.icon;
            const conn = conns[svc.kind] ?? { status: 'connecting' as const };
            const dot =
              conn.status === 'up' ? 'ok' : conn.status === 'down' ? 'fail' : 'busy';
            const nAddr = svc.addresses.length;
            return (
              <Card key={svc.kind} style={{ padding: 0 }}>
                <button
                  onClick={() => onEditService(svc.kind)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: 14,
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <Icon size={22} color="var(--text)" strokeWidth={1.75} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 500 }}>
                      {meta.label}
                      {nAddr > 1 && (
                        <span style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 400 }}> · {nAddr} addresses</span>
                      )}
                    </div>
                    <div style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'ui-monospace, monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {conn.status === 'up'
                        ? `${conn.address.replace(/^https?:\/\//, '')} · ${conn.latencyMs}ms`
                        : conn.status === 'down'
                          ? 'no address answered'
                          : 'connecting…'}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <StatusDot state={dot} />
                    <span
                      style={{
                        fontSize: 12,
                        color:
                          conn.status === 'up' ? 'var(--green)' : conn.status === 'down' ? 'var(--red)' : 'var(--text-3)',
                      }}
                    >
                      {conn.status === 'up' ? 'online' : conn.status === 'down' ? 'offline' : '…'}
                    </span>
                    <ChevronRight size={16} color="var(--muted)" />
                  </div>
                </button>
              </Card>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 20 }}>
        <Button variant="ghost" onClick={onAddMore}>
          <Plus size={16} /> Add another service
        </Button>
      </div>

      <div style={{ marginTop: 16, textAlign: 'center', color: 'var(--muted)', fontSize: 11 }}>
        {version && <>ArrDeck v{version} · </>}HTTP: {httpMode()}
      </div>
    </div>
  );
}
