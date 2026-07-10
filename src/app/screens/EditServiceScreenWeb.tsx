/**
 * EditServiceScreenWeb — WEB-ONLY edit form (rendered by EditServiceScreen when
 * Capacitor.isNativePlatform() === false).
 *
 * On web the client never holds the API key, so the key field is driven off
 * `hasKey` from the BFF: a stored key shows as a masked placeholder; the user
 * types only to REPLACE it, and leaving it untouched keeps the stored key.
 * Addresses are edited in local form state and saved via PUT; "test" routes
 * through the BFF's /api/verify candidate path (never the native inline
 * resolveService/addAddress). Brand-new code — native EditServiceScreen untouched.
 */

import { useEffect, useState } from 'react';
import { ArrowLeft, Plus, Trash2, Check, KeyRound, ExternalLink, Loader2, Zap, AlertTriangle, Globe } from 'lucide-react';
import { buildBaseUrl, type ServiceKind } from '../../engine/index.js';
import { SERVICE_META } from '../lib/serviceMeta.js';
import { apiKeySettingsUrl, apiKeyHint } from '../lib/keyHelp.js';
import { notifyDataChanged } from '../lib/dataEvents.js';
import * as webApi from '../platform/webApi.js';
import { Button, Card, Spinner } from '../components/ui.tsx';
import { TextField } from '../components/form.tsx';

const spin = { animation: 'arrdeck-spin 900ms linear infinite' } as const;

type TestState = { status: 'idle' | 'testing' | 'done'; ok?: boolean; latencyMs?: number; error?: string };

export function EditServiceScreenWeb({
  kind,
  onBack,
  onDeleted,
}: {
  kind: ServiceKind;
  onBack: () => void;
  onDeleted: () => void;
}) {
  const meta = SERVICE_META[kind];
  const [loaded, setLoaded] = useState(false);
  const [addresses, setAddresses] = useState<string[]>([]);
  const [hasKey, setHasKey] = useState(false);

  // Key rotation: keyInput is a NEW key; "untouched" means keep the stored one.
  const [keyInput, setKeyInput] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);

  // Add-address form.
  const [newHost, setNewHost] = useState('');
  const [newPort, setNewPort] = useState(String(meta.port));

  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function refresh() {
    const svcs = await webApi.getServices();
    const s = svcs.find((x) => x.kind === kind);
    if (s) {
      setAddresses(s.addresses);
      setHasKey(s.hasKey);
    }
    setLoaded(true);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  const settingsUrl = apiKeySettingsUrl(kind, addresses[0] ?? '');
  // Omit the apiKey (→ BFF keeps the stored one) unless the user typed a new one.
  const keyOmitted = !keyTouched || keyInput.trim().length === 0;

  function addAddr() {
    if (!newHost.trim()) return;
    const url = buildBaseUrl(newHost.trim(), newPort.trim() || meta.port);
    if (!addresses.includes(url)) setAddresses([...addresses, url]);
    setNewHost('');
    setTest({ status: 'idle' });
  }

  function removeAddr(i: number) {
    if (addresses.length <= 1) return;
    setAddresses(addresses.filter((_, idx) => idx !== i));
    setTest({ status: 'idle' });
  }

  async function runTest() {
    if (addresses.length === 0) return;
    setTest({ status: 'testing' });
    try {
      const r = await webApi.verify(kind, { addresses, ...(keyOmitted ? {} : { apiKey: keyInput.trim() }) });
      setTest({ status: 'done', ok: r.ok, latencyMs: r.latencyMs, error: r.error });
    } catch (e) {
      setTest({ status: 'done', ok: false, error: (e as Error).message });
    }
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      await webApi.putService(kind, { addresses, ...(keyOmitted ? {} : { apiKey: keyInput.trim() }) });
      setKeyInput('');
      setKeyTouched(false);
      await refresh();
      notifyDataChanged();
      setMsg('Saved');
    } catch (e) {
      setMsg((e as Error).message);
    }
    setSaving(false);
  }

  async function doDelete() {
    setDeleting(true);
    await webApi.deleteService(kind);
    notifyDataChanged();
    onDeleted();
  }

  const Icon = meta.icon;

  if (!loaded) {
    return (
      <div className="ad-col" style={{ padding: 18 }}>
        <BackBtn onBack={onBack} />
        <div style={{ marginTop: 20 }}><Spinner /></div>
      </div>
    );
  }

  return (
    <div className="ad-col" style={{ padding: '16px 16px 24px' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
        <BackBtn onBack={onBack} />
        <Icon size={22} color="var(--text)" strokeWidth={1.75} />
        <span style={{ fontSize: 20, fontWeight: 500, flex: 1 }}>{meta.label}</span>
      </header>

      {/* Addresses */}
      <div className="micro-label" style={{ margin: '0 2px 10px' }}>Addresses</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
        {addresses.map((url, i) => (
          <Card key={url} style={{ padding: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Globe size={15} color="var(--text-3)" />
              <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontFamily: 'ui-monospace, monospace', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {url.replace(/^https?:\/\//, '')}
              </div>
              <button onClick={() => removeAddr(i)} aria-label="Remove" disabled={addresses.length <= 1} style={{ ...iconBtn, color: addresses.length <= 1 ? 'var(--muted)' : 'var(--red)', opacity: addresses.length <= 1 ? 0.5 : 1 }}>
                <Trash2 size={14} />
              </button>
            </div>
          </Card>
        ))}
      </div>

      {/* Add address */}
      <Card recessed style={{ marginBottom: 20 }}>
        <div className="micro-label" style={{ marginBottom: 10 }}>Add address</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 2 }}><TextField value={newHost} onChange={setNewHost} placeholder="host / IP (e.g. 100.64.0.1)" /></div>
          <div style={{ width: 92 }}><TextField value={newPort} onChange={setNewPort} placeholder="port" /></div>
        </div>
        <Button onClick={addAddr} disabled={!newHost.trim()}>
          <Plus size={16} /> Add address
        </Button>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
          The app races all addresses and uses whichever answers first. Save to apply.
        </div>
      </Card>

      {/* API key */}
      <div className="micro-label" style={{ margin: '0 2px 10px' }}>API key</div>
      <Card style={{ marginBottom: 20 }}>
        <a href={settingsUrl} target="_blank" rel="noreferrer" style={linkBtn}>
          <KeyRound size={14} /> Get your API key <ExternalLink size={12} />
        </a>
        <div style={{ fontSize: 11, color: 'var(--muted)', margin: '10px 0' }}>{apiKeyHint(kind)}</div>
        <TextField
          value={keyInput}
          onChange={(v) => { setKeyInput(v); setKeyTouched(true); }}
          placeholder={hasKey && !keyTouched ? '••••••••  (stored — leave blank to keep)' : 'Paste API key'}
        />
        {hasKey && (
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8 }}>
            A key is stored on the server. Leave blank to keep it, or type a new one to replace it.
          </div>
        )}
      </Card>

      {/* Test + Save */}
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" onClick={runTest} disabled={test.status === 'testing' || addresses.length === 0}>
          {test.status === 'testing' ? <Loader2 size={16} style={spin} /> : <Zap size={16} />} Test connection
        </Button>
        <Button onClick={save} disabled={saving}>
          {saving ? <Spinner /> : <Check size={16} />} {saving ? 'Saving…' : 'Save'}
        </Button>
      </div>
      {test.status === 'done' && (
        <Card recessed style={{ marginTop: 10 }}>
          <div style={{ fontSize: 13, color: test.ok ? 'var(--green)' : 'var(--red)' }}>
            {test.ok ? `Connected — ${test.latencyMs}ms` : `Test failed — ${test.error ?? 'no address answered'}`}
          </div>
        </Card>
      )}
      {msg && <div style={{ marginTop: 10, fontSize: 13, color: msg === 'Saved' ? 'var(--green)' : 'var(--red)' }}>{msg}</div>}

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
              <Button variant="ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>Cancel</Button>
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

const linkBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--amber)',
  padding: '7px 11px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  textDecoration: 'none',
} as const;

function BackBtn({ onBack }: { onBack: () => void }) {
  return (
    <button onClick={onBack} aria-label="Back" style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-2)', padding: 8, cursor: 'pointer', display: 'inline-flex' }}>
      <ArrowLeft size={18} />
    </button>
  );
}
