/**
 * AddServiceScreenWeb — WEB-ONLY add-a-service form (rendered by
 * AddServiceScreen when Capacitor.isNativePlatform() === false).
 *
 * The native scan probes LAN ports from the device; a browser can't do that
 * (CORS/cleartext), so the web flow is an explicit manual add: pick the kind,
 * enter host + port, paste the API key, TEST against the BFF, then SAVE. All
 * network goes through the BFF (server holds the key + runs the engine).
 *
 * Brand-new code — the native AddServiceScreen body is untouched.
 */

import { useState } from 'react';
import { Check, Loader2, KeyRound, ExternalLink, Zap } from 'lucide-react';
import { buildBaseUrl, type ServiceKind } from '../../engine/index.js';
import { SERVICE_META } from '../lib/serviceMeta.js';
import { apiKeySettingsUrl, apiKeyHint } from '../lib/keyHelp.js';
import { notifyDataChanged } from '../lib/dataEvents.js';
import * as webApi from '../platform/webApi.js';
import { Button, Card, Spinner, TextInput } from '../components/ui.tsx';
import { SelectChips } from '../components/form.tsx';
import { AppHeader } from '../components/AppHeader.tsx';

const spin = { animation: 'arrdeck-spin 900ms linear infinite' } as const;

type TestState = { status: 'idle' | 'testing' | 'done'; ok?: boolean; latencyMs?: number; error?: string };

export function AddServiceScreenWeb({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [kind, setKind] = useState<ServiceKind>('sonarr');
  const [host, setHost] = useState('');
  const [port, setPort] = useState(String(SERVICE_META.sonarr.port));
  const [apiKey, setApiKey] = useState('');
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const meta = SERVICE_META[kind];
  const buildUrl = () => buildBaseUrl(host.trim(), port.trim() || meta.port);
  const settingsUrl = apiKeySettingsUrl(kind, buildUrl());
  const canSubmit = host.trim().length > 0 && apiKey.trim().length > 0;

  function pickKind(k: ServiceKind) {
    setKind(k);
    setPort(String(SERVICE_META[k].port));
    setTest({ status: 'idle' });
  }

  async function runTest() {
    if (!host.trim()) return;
    setTest({ status: 'testing' });
    try {
      const r = await webApi.verify(kind, {
        addresses: [buildUrl()],
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setTest({ status: 'done', ok: r.ok, latencyMs: r.latencyMs, error: r.error });
    } catch (e) {
      setTest({ status: 'done', ok: false, error: (e as Error).message });
    }
  }

  async function save() {
    if (!canSubmit) return;
    setSaving(true);
    setSaveError(null);
    try {
      await webApi.putService(kind, { addresses: [buildUrl()], apiKey: apiKey.trim() });
      notifyDataChanged();
      onDone();
    } catch (e) {
      setSaveError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="ad-col" style={{ padding: 18 }}>
      <AppHeader showBack={!!onCancel} onBack={onCancel} title="ArrDeck" titleSize={22} marginBottom={18} />

      <div className="micro-label" style={{ margin: '4px 4px 10px' }}>Add a service</div>

      <Card>
        <div className="micro-label" style={{ marginBottom: 10 }}>Service</div>
        <SelectChips
          options={[
            { value: 'sonarr', label: 'Sonarr' },
            { value: 'radarr', label: 'Radarr' },
            { value: 'sabnzbd', label: 'SABnzbd' },
            { value: 'prowlarr', label: 'Prowlarr' },
          ]}
          value={kind}
          onChange={pickKind}
        />
        <div style={{ height: 12 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{ flex: 2 }}>
            <TextInput value={host} onChange={setHost} placeholder="host / IP (e.g. 192.168.1.100)" mono />
          </div>
          <div style={{ width: 96 }}>
            <TextInput value={port} onChange={setPort} placeholder="port" mono />
          </div>
        </div>

        <div style={{ height: 14 }} />
        <a href={settingsUrl} target="_blank" rel="noreferrer" style={linkBtn}>
          <KeyRound size={15} /> Get your API key <ExternalLink size={13} />
        </a>
        <div style={{ color: 'var(--muted)', fontSize: 11, margin: '4px 2px 10px' }}>{apiKeyHint(kind)}</div>
        <TextInput value={apiKey} onChange={setApiKey} placeholder="Paste API key" mono />

        <div style={{ height: 12 }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={runTest} disabled={!host.trim() || test.status === 'testing'}>
            {test.status === 'testing' ? <Loader2 size={16} style={spin} /> : <Zap size={16} />} Test
          </Button>
          <Button onClick={save} disabled={!canSubmit || saving}>
            {saving ? <Spinner /> : <Check size={16} />} {saving ? 'Saving…' : 'Save service'}
          </Button>
        </div>

        {test.status === 'done' && (
          <div style={{ marginTop: 10, fontSize: 13, color: test.ok ? 'var(--green)' : 'var(--red)' }}>
            {test.ok ? `Connected — ${test.latencyMs}ms` : `Test failed — ${test.error ?? 'no address answered'}`}
          </div>
        )}
        {saveError && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 13 }}>{saveError}</div>}
      </Card>
    </div>
  );
}

const linkBtn = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 7,
  background: 'transparent',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  color: 'var(--amber)',
  padding: '8px 11px',
  fontSize: 13,
  fontWeight: 500,
  cursor: 'pointer',
  textDecoration: 'none',
} as const;
