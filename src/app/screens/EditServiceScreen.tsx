/**
 * EditServiceScreen — edit a configured service: manage its candidate addresses
 * (add a Local/Remote second address to activate the happy-eyeballs race),
 * rotate the API key (verify-first), test the whole connection, or delete it.
 *
 * All changes persist to the same on-device storage as onboarding, and
 * invalidate the winner cache (via notifyDataChanged) so the next call re-races.
 */

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Check, KeyRound, ExternalLink, Loader2, Wifi, Globe, AlertTriangle, Zap } from 'lucide-react';
import {
  WinnerCache,
  addAddress,
  buildBaseUrl,
  hostOf,
  labelAt,
  maskKey,
  portOf,
  removeAddressAt,
  resolveService,
  setApiKey,
  type AddressLabel,
  type ServiceConfig,
  type ServiceKind,
} from '../../engine/index.js';
import { SERVICE_META } from '../lib/serviceMeta.js';
import { apiKeySettingsUrl, apiKeyHint } from '../lib/keyHelp.js';
import { verifyService, type VerifyResult } from '../lib/verify.js';
import { loadServices, removeService, upsertService } from '../platform/storage.js';
import { openExternal } from '../platform/browser.js';
import { notifyDataChanged } from '../lib/dataEvents.js';
import { Button, Card, Spinner } from '../components/ui.tsx';
import { Field, SelectChips, TextField } from '../components/form.tsx';
import { isNative } from '../platform/env.js';
import { EditServiceScreenWeb } from './EditServiceScreenWeb.tsx';

type AddrTest = { status: 'idle' | 'testing' | 'up' | 'down'; latencyMs?: number };

export function EditServiceScreen({
  kind,
  onBack,
  onDeleted,
}: {
  kind: ServiceKind;
  onBack: () => void;
  onDeleted: () => void;
}) {
  // WEB: browser talks to the BFF; native path below is unchanged.
  if (!isNative()) return <EditServiceScreenWeb kind={kind} onBack={onBack} onDeleted={onDeleted} />;
  // ---- NATIVE (unchanged) ----
  const meta = SERVICE_META[kind];
  const [config, setConfig] = useState<ServiceConfig | null>(null);
  const [addrTests, setAddrTests] = useState<Record<string, AddrTest>>({});

  // Add-address form.
  const [host, setHost] = useState('');
  const [port, setPort] = useState(String(meta.port));
  const [label, setLabel] = useState<Exclude<AddressLabel, null>>('remote');

  // Key rotation.
  const [showKey, setShowKey] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [keyResult, setKeyResult] = useState<VerifyResult | null>(null);
  const [verifying, setVerifying] = useState(false);

  // Whole-connection test.
  const [testState, setTestState] = useState<{ status: 'idle' | 'testing' | 'done'; address?: string; latencyMs?: number; version?: string; error?: string }>({ status: 'idle' });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    (async () => {
      const list = await loadServices();
      const cfg = list.find((s) => s.kind === kind) ?? null;
      setConfig(cfg);
      if (cfg?.addresses[0]) setPort(String(portOf(cfg.addresses[0], meta.port)));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const settingsUrl = useMemo(
    () => (config?.addresses[0] ? apiKeySettingsUrl(kind, config.addresses[0]) : ''),
    [config, kind],
  );

  /** Persist a new config and invalidate caches so the next call re-races. */
  async function persist(next: ServiceConfig) {
    await upsertService(next);
    setConfig(next);
    notifyDataChanged(); // invalidates the winner cache + refreshes the Deck
  }

  /** Probe a single address (build a 1-address config, race it in a throwaway cache). */
  async function testAddress(url: string) {
    if (!config) return;
    setAddrTests((t) => ({ ...t, [url]: { status: 'testing' } }));
    const single: ServiceConfig = { kind, addresses: [url], apiKey: config.apiKey };
    const res = await resolveService(single, { forceRerace: true, cache: new WinnerCache() }).catch(() => null);
    setAddrTests((t) => ({ ...t, [url]: res ? { status: 'up', latencyMs: res.latencyMs } : { status: 'down' } }));
  }

  async function addAddr() {
    if (!config || !host.trim()) return;
    const next = addAddress(config, host.trim(), port.trim() || meta.port, label);
    await persist(next);
    setHost('');
    void testAddress(buildBaseUrl(host.trim(), port.trim() || meta.port));
  }

  async function removeAddr(index: number) {
    if (!config) return;
    await persist(removeAddressAt(config, index));
  }

  async function verifyKey() {
    if (!config || !newKey.trim()) return;
    setVerifying(true);
    setKeyResult(null);
    // Verify against a reachable address (race first), fall back to the first address.
    const conn = await resolveService(config, { forceRerace: true, cache: new WinnerCache() }).catch(() => null);
    const addr = conn?.address ?? config.addresses[0]!;
    const result = await verifyService(kind, addr, newKey.trim());
    setKeyResult(result);
    setVerifying(false);
    if (result.ok) {
      await persist(setApiKey(config, newKey.trim()));
      setNewKey('');
      setShowKey(false);
    }
  }

  async function testConnection() {
    if (!config) return;
    setTestState({ status: 'testing' });
    const conn = await resolveService(config, { forceRerace: true, cache: new WinnerCache() }).catch(() => null);
    if (!conn) {
      setTestState({ status: 'done', error: 'No address answered' });
      return;
    }
    const v = await verifyService(kind, conn.address, config.apiKey);
    setTestState({ status: 'done', address: conn.address, latencyMs: conn.latencyMs, version: v.version, error: v.ok ? undefined : v.error });
  }

  async function doDelete() {
    setDeleting(true);
    await removeService(kind);
    notifyDataChanged();
    onDeleted();
  }

  if (!config) {
    return (
      <div style={{ padding: 18, maxWidth: 640, margin: '0 auto' }}>
        <BackBtn onBack={onBack} />
        <div style={{ marginTop: 20 }}>
          <Spinner />
        </div>
      </div>
    );
  }

  const Icon = meta.icon;

  return (
    <div style={{ maxWidth: 640, margin: '0 auto', padding: '16px 16px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <BackBtn onBack={onBack} />
        <Icon size={22} color="var(--text)" strokeWidth={1.75} />
        <span style={{ fontSize: 20, fontWeight: 500, flex: 1 }}>{meta.label}</span>
      </header>

      {/* Addresses */}
      <div className="micro-label" style={{ margin: '0 2px 10px' }}>
        Addresses
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {config.addresses.map((url, i) => {
          const lbl = labelAt(config, i);
          const test = addrTests[url] ?? { status: 'idle' as const };
          return (
            <Card key={url} style={{ padding: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {lbl === 'local' ? <Wifi size={15} color="var(--text-3)" /> : lbl === 'remote' ? <Globe size={15} color="var(--text-3)" /> : <Globe size={15} color="var(--muted)" />}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontFamily: 'ui-monospace, monospace', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {url.replace(/^https?:\/\//, '')}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--muted)' }}>
                    {lbl ? lbl : 'unlabeled'}
                    {test.status === 'up' && <span style={{ color: 'var(--green)' }}> · reachable {test.latencyMs}ms</span>}
                    {test.status === 'down' && <span style={{ color: 'var(--red)' }}> · unreachable</span>}
                  </div>
                </div>
                <button onClick={() => testAddress(url)} aria-label="Test" style={iconBtn}>
                  {test.status === 'testing' ? <Loader2 size={14} style={spin} /> : <Zap size={14} />}
                </button>
                <button
                  onClick={() => removeAddr(i)}
                  aria-label="Remove"
                  disabled={config.addresses.length <= 1}
                  style={{ ...iconBtn, color: config.addresses.length <= 1 ? 'var(--muted)' : 'var(--red)', opacity: config.addresses.length <= 1 ? 0.5 : 1 }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Add address */}
      <Card recessed style={{ marginBottom: 20 }}>
        <div className="micro-label" style={{ marginBottom: 10 }}>
          Add address
        </div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 2 }}>
            <TextField value={host} onChange={setHost} placeholder="host / IP (e.g. 100.64.0.1)" />
          </div>
          <div style={{ width: 92 }}>
            <TextField value={port} onChange={setPort} placeholder="port" />
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <SelectChips
            options={[
              { value: 'local', label: 'Local' },
              { value: 'remote', label: 'Remote' },
            ]}
            value={label}
            onChange={(v) => setLabel(v)}
          />
        </div>
        <Button onClick={addAddr} disabled={!host.trim()}>
          <Plus size={16} /> Add address
        </Button>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          The app races all addresses and uses whichever answers first — labels are just for you.
        </div>
      </Card>

      {/* API key */}
      <div className="micro-label" style={{ margin: '0 2px 10px' }}>
        API key
      </div>
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <KeyRound size={16} color="var(--text-3)" />
          <span style={{ flex: 1, fontFamily: 'ui-monospace, monospace', fontSize: 14, color: 'var(--text-2)' }}>{maskKey(config.apiKey)}</span>
          {!showKey && (
            <Button variant="ghost" onClick={() => setShowKey(true)} style={{ width: 'auto', padding: '7px 12px' }}>
              Update
            </Button>
          )}
        </div>
        {showKey && (
          <div style={{ marginTop: 12 }}>
            <button onClick={() => openExternal(settingsUrl)} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--amber)', padding: '7px 11px', fontSize: 13, fontWeight: 500, cursor: 'pointer', marginBottom: 10 }}>
              <KeyRound size={14} /> Get your API key <ExternalLink size={12} />
            </button>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10 }}>{apiKeyHint(kind)}</div>
            <TextField value={newKey} onChange={setNewKey} placeholder="Paste new API key" />
            <div style={{ height: 10 }} />
            <Button onClick={verifyKey} disabled={verifying || !newKey.trim()}>
              {verifying ? <Loader2 size={16} style={spin} /> : <Check size={16} />}
              {verifying ? 'Verifying…' : 'Verify & save'}
            </Button>
            {keyResult && !keyResult.ok && <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{keyResult.error ?? 'Verification failed'}</div>}
          </div>
        )}
        {keyResult?.ok && !showKey && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--green)', fontSize: 13, marginTop: 10 }}>
            <Check size={15} /> Key updated — {meta.label} v{keyResult.version}
          </div>
        )}
      </Card>

      {/* Test connection */}
      <Button variant="ghost" onClick={testConnection} disabled={testState.status === 'testing'}>
        {testState.status === 'testing' ? <Loader2 size={16} style={spin} /> : <Zap size={16} />}
        Test connection
      </Button>
      {testState.status === 'done' && (
        <Card recessed style={{ marginTop: 10 }}>
          {testState.error ? (
            <div style={{ color: 'var(--red)', fontSize: 13 }}>{testState.error}</div>
          ) : (
            <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
              <span style={{ color: 'var(--green)' }}>Connected</span> via{' '}
              <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text)' }}>{hostOf(testState.address ?? '')}</span> · {testState.latencyMs}ms
              {testState.version && <> · {meta.label} v{testState.version}</>}
            </div>
          )}
        </Card>
      )}

      {/* Delete */}
      <div style={{ marginTop: 24 }}>
        <button onClick={() => setConfirmDelete(true)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: '1px solid color-mix(in srgb, var(--red) 45%, transparent)', borderRadius: 'var(--radius-sm)', color: 'var(--red)', padding: '10px 14px', fontSize: 14, cursor: 'pointer' }}>
          <Trash2 size={15} /> Delete {meta.label}
        </button>
      </div>

      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'color-mix(in srgb, var(--bg) 75%, transparent)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: 18, maxWidth: 360, width: '100%' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
              <AlertTriangle size={18} color="var(--red)" />
              <span style={{ fontSize: 15, fontWeight: 500 }}>Remove {meta.label}?</span>
            </div>
            <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '0 0 16px' }}>
              This removes the service (addresses + key) from ArrDeck. It does not touch the service itself.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button onClick={doDelete} disabled={deleting} style={{ background: 'var(--red)', color: '#1a0808' }}>
                {deleting ? <Loader2 size={16} style={spin} /> : <Trash2 size={16} />} Delete
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const iconBtn = {
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--amber)',
  padding: 7,
  cursor: 'pointer',
  display: 'inline-flex',
  flexShrink: 0,
} as const;

const spin = { animation: 'arrdeck-spin 900ms linear infinite' } as const;

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} aria-label="Back" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-2)', padding: 8, cursor: 'pointer', display: 'inline-flex' }}>
      <ArrowLeft size={18} />
    </button>
  );
}
