/**
 * IndexersScreen — Prowlarr indexer health detail (read-only). Makes the Deck's
 * red "X/Y" actionable: shows which indexer is failing, since when, and until
 * when it's backing off.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import {
  deriveIndexerHealth,
  type ProwlarrIndexerHealth,
  type ServiceConfig,
} from '../../engine/index.js';
import { resolveProwlarr } from '../lib/clients.js';
import { Card, Spinner, StatusDot } from '../components/ui.tsx';

function fmtTime(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso;
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function IndexersScreen({ services, onBack }: { services: ServiceConfig[]; onBack: () => void }) {
  const [rows, setRows] = useState<ProwlarrIndexerHealth[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load(refresh = false) {
    if (refresh) setRefreshing(true);
    const c = await resolveProwlarr(services);
    if (!c) {
      setError('Prowlarr offline');
      setRefreshing(false);
      return;
    }
    try {
      const [indexers, statuses] = await Promise.all([c.getIndexers(), c.getIndexerStatus()]);
      const derived = deriveIndexerHealth(indexers, statuses, Date.now()).sort((a, b) => a.name.localeCompare(b.name));
      setRows(derived);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [services]);

  const healthy = rows?.filter((r) => r.healthy).length ?? 0;
  const enabled = rows?.filter((r) => r.enabled).length ?? 0;

  return (
    <div className="ad-col" style={{ padding: '16px 16px 20px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <button onClick={onBack} aria-label="Back" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-2)', padding: 8, cursor: 'pointer', display: 'inline-flex' }}>
          <ArrowLeft size={18} />
        </button>
        <span style={{ fontSize: 20, fontWeight: 500, color: 'var(--amber)', flex: 1 }}>Indexers</span>
        {rows && (
          <span style={{ fontSize: 13, fontWeight: 500, color: healthy === enabled ? 'var(--green)' : 'var(--red)', fontFamily: 'ui-monospace, monospace' }}>
            {healthy}/{enabled}
          </span>
        )}
        <button onClick={() => load(true)} aria-label="Refresh" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-2)', padding: 8, cursor: 'pointer', display: 'inline-flex' }}>
          <RefreshCw size={15} style={refreshing ? { animation: 'arrdeck-spin 900ms linear infinite' } : undefined} />
        </button>
      </header>

      {error ? (
        <Card recessed>
          <div style={{ color: 'var(--text-2)' }}>{error}</div>
        </Card>
      ) : rows == null ? (
        <Card recessed>
          <Spinner /> <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>Loading…</span>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((r) => {
            const dot = !r.enabled ? 'idle' : r.healthy ? 'ok' : 'fail';
            const stateLabel = !r.enabled ? 'disabled' : r.healthy ? 'healthy' : 'failing';
            const stateColor = !r.enabled ? 'var(--muted)' : r.healthy ? 'var(--green)' : 'var(--red)';
            return (
              <Card key={r.id}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                  <StatusDot state={dot} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 500 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{r.protocol}</div>
                  </div>
                  <span style={{ fontSize: 12, color: stateColor, fontWeight: 500 }}>{stateLabel}</span>
                </div>
                {!r.healthy && r.enabled && (r.mostRecentFailure || r.disabledTill) && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--divider)', fontSize: 12, color: 'var(--text-3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {r.mostRecentFailure && (
                      <div>
                        Last failure: <span style={{ color: 'var(--red)' }}>{fmtTime(r.mostRecentFailure)}</span>
                      </div>
                    )}
                    {r.disabledTill && (
                      <div>
                        Backing off until: <span style={{ color: 'var(--amber)' }}>{fmtTime(r.disabledTill)}</span>
                      </div>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
