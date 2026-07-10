/**
 * QueueScreen — the Downloads screen (bottom-nav Queue tab AND the SAB tile
 * both route here). Live SAB queue with per-item pause/resume/delete + global
 * pause/resume, plus read-only history. Visibility-gated ~5s polling (stops when
 * the tab is hidden or the app is backgrounded).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { App } from '@capacitor/app';
import { Pause, Play, Trash2, Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import {
  SabClient,
  type SabHistoryItem,
  type SabQueue,
  type ServiceConfig,
} from '../../engine/index.js';
import { resolveSab } from '../lib/clients.js';
import { fmtMB, fmtSabSpeed } from '../lib/format.js';
import { notifyDataChanged } from '../lib/dataEvents.js';
import { Button, Card, Spinner, StatusDot } from '../components/ui.tsx';
import { ProgressBar } from '../components/visuals.tsx';

const POLL_MS = 5000;

export function QueueScreen({ services }: { services: ServiceConfig[] }) {
  const [client, setClient] = useState<SabClient | null>(null);
  const [queue, setQueue] = useState<SabQueue | null>(null);
  const [history, setHistory] = useState<SabHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ nzoId: string; name: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const inFlight = useRef(false);

  const loadQueue = useCallback(async (c: SabClient) => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const q = await c.getQueue();
      setQueue(q);
    } catch {
      // keep last-known
    } finally {
      inFlight.current = false;
    }
  }, []);

  const loadAll = useCallback(
    async (c: SabClient) => {
      const [q, h] = await Promise.all([
        c.getQueue().catch(() => null),
        c.getHistory(20).catch(() => [] as SabHistoryItem[]),
      ]);
      if (q) setQueue(q);
      setHistory(h);
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const c = await resolveSab(services);
      if (!c) {
        if (!cancelled) {
          setError('SABnzbd offline or not configured');
          setLoading(false);
        }
        return;
      }
      setClient(c);
      await loadAll(c);
    })();
    return () => {
      cancelled = true;
    };
  }, [services, loadAll]);

  // Visibility-gated polling: only while foregrounded (unmount handles tab-hide).
  const [foreground, setForeground] = useState(true);
  useEffect(() => {
    const onVis = () => setForeground(!document.hidden);
    document.addEventListener('visibilitychange', onVis);
    const h = App.addListener('appStateChange', ({ isActive }) => setForeground(isActive));
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      void h.then((x) => x.remove());
    };
  }, []);

  useEffect(() => {
    if (!client || !foreground) return;
    const t = setInterval(() => void loadQueue(client), POLL_MS);
    return () => clearInterval(t);
  }, [client, foreground, loadQueue]);

  async function act(fn: () => Promise<unknown>, key: string) {
    if (!client) return;
    setBusy(key);
    try {
      await fn();
      await loadAll(client);
      notifyDataChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const items = queue?.items ?? [];

  return (
    <div className="ad-col" style={{ padding: '16px 16px 8px' }}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
        <span style={{ fontSize: 22, fontWeight: 500, color: 'var(--amber)', flex: 1 }}>Downloads</span>
        {queue && items.length > 0 && (
          <span style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 500 }}>{fmtSabSpeed(queue.speed)}</span>
        )}
        {client && (
          <button
            onClick={() => void loadAll(client)}
            aria-label="Refresh"
            style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-2)', padding: 7, cursor: 'pointer', display: 'inline-flex' }}
          >
            <RefreshCw size={15} />
          </button>
        )}
      </header>

      {loading ? (
        <Card recessed>
          <Spinner /> <span style={{ marginLeft: 8, color: 'var(--text-3)' }}>Loading…</span>
        </Card>
      ) : error ? (
        <Card recessed>
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>{error}</div>
        </Card>
      ) : (
        <>
          {/* Global pause/resume */}
          {queue && (
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <Button
                variant="ghost"
                onClick={() => act(() => (queue.paused ? resumeAllFallback(client!) : pauseAllFallback(client!)), 'global')}
                disabled={busy === 'global'}
              >
                {busy === 'global' ? <Loader2 size={15} style={{ animation: 'arrdeck-spin 900ms linear infinite' }} /> : queue.paused ? <Play size={15} /> : <Pause size={15} />}
                {queue.paused ? 'Resume all' : 'Pause all'}
              </Button>
            </div>
          )}

          <div className="micro-label" style={{ margin: '4px 2px 10px' }}>
            Active
          </div>
          {items.length === 0 ? (
            <Card recessed style={{ textAlign: 'center', padding: 20 }}>
              <div style={{ color: 'var(--text-2)', fontSize: 14 }}>Queue is empty</div>
            </Card>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {items.map((d) => {
                const isPaused = d.status.toLowerCase() === 'paused';
                return (
                  <Card key={d.nzoId}>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                      <div style={{ flex: 1, fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</div>
                      <span style={{ fontSize: 13, color: 'var(--amber)', fontWeight: 500 }}>{Math.round(d.percent)}%</span>
                    </div>
                    <ProgressBar percent={d.percent} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 9 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)', flex: 1 }}>
                        {fmtMB(d.sizeMB)} · {d.status}
                        {d.etaText ? ` · ETA ${d.etaText}` : ''}
                      </span>
                      <ItemBtn onClick={() => act(() => (isPaused ? client!.resumeItem(d.nzoId) : client!.pauseItem(d.nzoId)), d.nzoId)} busy={busy === d.nzoId} aria={isPaused ? 'Resume' : 'Pause'}>
                        {isPaused ? <Play size={15} /> : <Pause size={15} />}
                      </ItemBtn>
                      <ItemBtn onClick={() => setConfirmDel({ nzoId: d.nzoId, name: d.name })} aria="Delete" danger>
                        <Trash2 size={15} />
                      </ItemBtn>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {history.length > 0 && (
            <>
              <div className="micro-label" style={{ margin: '22px 2px 10px' }}>
                Recent history
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {history.map((h, i) => {
                  const failed = h.status.toLowerCase() === 'failed';
                  return (
                    <Card key={i} recessed style={{ padding: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                        <StatusDot state={failed ? 'fail' : 'ok'} size={8} />
                        <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.name}</div>
                        <span style={{ fontSize: 11, color: failed ? 'var(--red)' : 'var(--muted)' }}>
                          {h.status}
                          {h.sizeBytes > 0 ? ` · ${fmtMB(h.sizeBytes / 1024 / 1024)}` : ''}
                        </span>
                      </div>
                      {failed && h.failMessage && <div style={{ fontSize: 11, color: 'var(--red)', marginTop: 5 }}>{h.failMessage}</div>}
                    </Card>
                  );
                })}
              </div>
            </>
          )}
        </>
      )}

      {confirmDel && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, var(--bg) 75%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, maxWidth: 360, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <AlertTriangle size={18} color="var(--red)" />
              <span style={{ fontSize: 15, fontWeight: 500 }}>Remove from queue?</span>
            </div>
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '0 0 16px', overflow: 'hidden', textOverflow: 'ellipsis' }}>{confirmDel.name}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button
                onClick={() => {
                  const nzo = confirmDel.nzoId;
                  setConfirmDel(null);
                  void act(() => client!.deleteItem(nzo), nzo);
                }}
                style={{ background: 'var(--red)', color: '#1a0808' }}
              >
                <Trash2 size={15} /> Delete
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDel(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// SabClient has no resume/pause-all; pause/resume each item as a fallback.
async function pauseAllFallback(c: SabClient) {
  const q = await c.getQueue();
  await Promise.all(q.items.map((i) => c.pauseItem(i.nzoId).catch(() => false)));
}
async function resumeAllFallback(c: SabClient) {
  const q = await c.getQueue();
  await Promise.all(q.items.map((i) => c.resumeItem(i.nzoId).catch(() => false)));
}

function ItemBtn({
  children,
  onClick,
  busy,
  aria,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy?: boolean;
  aria: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={aria}
      disabled={busy}
      style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: danger ? 'var(--red)' : 'var(--amber)', padding: 7, cursor: busy ? 'default' : 'pointer', display: 'inline-flex', flexShrink: 0 }}
    >
      {busy ? <Loader2 size={14} style={{ animation: 'arrdeck-spin 900ms linear infinite' }} /> : children}
    </button>
  );
}
