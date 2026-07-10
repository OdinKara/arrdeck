/**
 * AddServiceScreenWeb — WEB-ONLY add-service flow (rendered by AddServiceScreen
 * when Capacitor.isNativePlatform() === false). The native AddServiceScreen body
 * is untouched.
 *
 * Two modes, chosen by whether this is a true first run:
 *   - FIRST RUN (zero services → App.tsx passes no onCancel): a guided WIZARD
 *     that steps Sonarr → Radarr → SABnzbd → Prowlarr. Save-&-continue advances,
 *     Skip advances without adding, "I'm done" exits keeping what's saved.
 *   - ADD ANOTHER (services exist → onCancel provided): the single form with a
 *     kind picker (add one service, Save, done).
 *
 * Both modes share <ServiceForm>, which carries every v1.0.5 fix (Docker
 * container-name hint, optional 2nd address / happy-eyeballs, empty-host guard,
 * and verify-BEFORE-save so a failed/unreachable add never navigates away).
 */

import { useEffect, useReducer, useState } from 'react';
import { Check, Loader2, KeyRound, ExternalLink, Zap } from 'lucide-react';
import { buildBaseUrl, type ServiceKind } from '../../engine/index.js';
import { SERVICE_META } from '../lib/serviceMeta.js';
import { apiKeySettingsUrl, apiKeyHint } from '../lib/keyHelp.js';
import { notifyDataChanged } from '../lib/dataEvents.js';
import * as webApi from '../platform/webApi.js';
import { Button, Card, Spinner, TextInput } from '../components/ui.tsx';
import { SelectChips } from '../components/form.tsx';
import { AppHeader } from '../components/AppHeader.tsx';
import {
  freshKindState,
  buildAddresses,
  verifyThenSave,
  isFirstRunWeb,
  wizardReducer,
  WIZARD_ORDER,
} from '../lib/webOnboarding.js';

const spin = { animation: 'arrdeck-spin 900ms linear infinite' } as const;

type TestState = { status: 'idle' | 'testing' | 'done'; ok?: boolean; latencyMs?: number; error?: string };

export function AddServiceScreenWeb({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  // First run (no services yet) → guided wizard. Otherwise → single add form.
  if (isFirstRunWeb(onCancel)) return <OnboardingWizardWeb onDone={onDone} />;
  return <SingleAddServiceWeb onDone={onDone} onCancel={onCancel} />;
}

// ---------------------------------------------------------------------------
// ServiceForm — the shared per-service field block (fixed kind). Carries all the
// v1.0.5 fixes; verify-then-save lives here. `host` is lifted to the parent so
// the same server carries across wizard steps / kind switches. Remount via a
// `key={kind}` at the parent resets the per-kind fields (fresh API key, etc.).
// ---------------------------------------------------------------------------

function ServiceForm({
  kind,
  host,
  onHostChange,
  onSaved,
  saveLabel = 'Save service',
}: {
  kind: ServiceKind;
  host: string;
  onHostChange: (v: string) => void;
  onSaved: () => void;
  saveLabel?: string;
}) {
  const meta = SERVICE_META[kind];
  const init = freshKindState(kind);
  const [port, setPort] = useState(init.port);
  const [addr2, setAddr2] = useState(init.addr2);
  const [apiKey, setApiKey] = useState(init.apiKey);
  const [test, setTest] = useState<TestState>({ status: 'idle' });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const hostOk = host.trim().length > 0;
  const buildUrl = () => buildBaseUrl(host.trim(), port.trim() || meta.port);
  const addresses = () => buildAddresses(host, port, addr2, meta.port);
  const settingsUrl = hostOk ? apiKeySettingsUrl(kind, buildUrl()) : '';
  const canSubmit = hostOk && apiKey.trim().length > 0;

  async function runTest() {
    if (!hostOk) return;
    setTest({ status: 'testing' });
    try {
      const r = await webApi.verify(kind, {
        addresses: addresses(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
      });
      setTest({ status: 'done', ok: r.ok, latencyMs: r.latencyMs, error: r.error });
    } catch (e) {
      setTest({ status: 'done', ok: false, error: (e as Error).message });
    }
  }

  // VERIFY-BEFORE-SAVE: only persist + advance/exit if the service answered;
  // otherwise show the reason and STAY on this step.
  async function save() {
    if (!canSubmit) return;
    setSaving(true);
    setSaveError(null);
    try {
      const r = await verifyThenSave(kind, addresses(), apiKey.trim(), webApi.verify, webApi.putService);
      if (!r.ok) {
        setSaveError(`Couldn't connect — ${r.error ?? 'no address answered'}`);
        setSaving(false);
        return;
      }
      notifyDataChanged();
      onSaved();
    } catch (e) {
      setSaveError((e as Error).message);
      setSaving(false);
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: 8 }}>
        <div style={{ flex: 2 }}>
          <TextInput value={host} onChange={onHostChange} placeholder="host / IP (e.g. 192.168.1.100)" mono />
        </div>
        <div style={{ width: 96 }}>
          <TextInput value={port} onChange={setPort} placeholder="port" mono />
        </div>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 11, margin: '6px 2px 0', lineHeight: 1.5 }}>
        Running ArrDeck in Docker on the same network as your stack? Use the container name as the
        host — e.g.{' '}
        <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>sonarr</span>,{' '}
        <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>radarr</span>,{' '}
        <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>sabnzbd</span>,{' '}
        <span style={{ fontFamily: 'ui-monospace, monospace', color: 'var(--text-2)' }}>prowlarr</span>.
      </div>

      <div style={{ height: 8 }} />
      <TextInput
        value={addr2}
        onChange={setAddr2}
        placeholder="+ another address (optional) — e.g. sonarr, or a remote host"
        mono
      />
      <div style={{ color: 'var(--muted)', fontSize: 11, margin: '4px 2px 0', lineHeight: 1.5 }}>
        Optional. Add a second address (a container name <em>and</em> a LAN IP) — ArrDeck races them
        and uses whichever answers.
      </div>

      <div style={{ height: 14 }} />
      {hostOk ? (
        <a href={settingsUrl} target="_blank" rel="noreferrer" style={linkBtn}>
          <KeyRound size={15} /> Get your API key <ExternalLink size={13} />
        </a>
      ) : (
        <div style={{ ...linkBtn, opacity: 0.5, cursor: 'default' }} title="Enter your host first">
          <KeyRound size={15} /> Get your API key <ExternalLink size={13} />
        </div>
      )}
      <div style={{ color: 'var(--muted)', fontSize: 11, margin: '4px 2px 10px' }}>
        {hostOk ? apiKeyHint(kind) : 'Enter your host above first — then this opens the exact settings page.'}
      </div>
      <TextInput value={apiKey} onChange={setApiKey} placeholder="Paste API key" mono />

      <div style={{ height: 12 }} />
      <div style={{ display: 'flex', gap: 8 }}>
        <Button variant="ghost" onClick={runTest} disabled={!hostOk || test.status === 'testing'}>
          {test.status === 'testing' ? <Loader2 size={16} style={spin} /> : <Zap size={16} />} Test
        </Button>
        <Button onClick={save} disabled={!canSubmit || saving}>
          {saving ? <Spinner /> : <Check size={16} />} {saving ? 'Saving…' : saveLabel}
        </Button>
      </div>

      {test.status === 'done' && (
        <div style={{ marginTop: 10, fontSize: 13, color: test.ok ? 'var(--green)' : 'var(--red)' }}>
          {test.ok ? `Connected — ${test.latencyMs}ms` : `Test failed — ${test.error ?? 'no address answered'}`}
        </div>
      )}
      {saveError && <div style={{ marginTop: 10, color: 'var(--red)', fontSize: 13 }}>{saveError}</div>}
    </>
  );
}

// ---------------------------------------------------------------------------
// SingleAddServiceWeb — "add another service" (services already exist). Kind
// picker + one ServiceForm. Picking a different kind remounts the form (key),
// clearing the API key for the new kind (v1.0.5 A1) while keeping the host.
// ---------------------------------------------------------------------------

function SingleAddServiceWeb({ onDone, onCancel }: { onDone: () => void; onCancel?: () => void }) {
  const [kind, setKind] = useState<ServiceKind>('sonarr');
  const [host, setHost] = useState('');

  return (
    <div className="ad-col" style={{ padding: 18 }}>
      <AppHeader showBack={!!onCancel} onBack={onCancel} title="ArrDeck" titleSize={22} marginBottom={18} />

      <div className="micro-label" style={{ margin: '4px 4px 10px' }}>Add a service</div>

      <Card>
        <div className="micro-label" style={{ marginBottom: 10 }}>Service</div>
        <SelectChips
          options={KIND_OPTIONS}
          value={kind}
          onChange={setKind}
        />
        <div style={{ height: 12 }} />
        <ServiceForm key={kind} kind={kind} host={host} onHostChange={setHost} onSaved={onDone} />
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OnboardingWizardWeb — first-run guided wizard: Sonarr → Radarr → SABnzbd →
// Prowlarr, fixed order. Save-&-continue advances; Skip advances without adding;
// "I'm done" exits keeping what's saved; auto-exit after the last step.
// ---------------------------------------------------------------------------

function OnboardingWizardWeb({ onDone }: { onDone: () => void }) {
  const [host, setHost] = useState(''); // shared across steps — usually the same server
  const [state, dispatch] = useReducer(wizardReducer, { step: 0, done: false });

  useEffect(() => {
    if (state.done) onDone();
  }, [state.done, onDone]);

  const kind = WIZARD_ORDER[state.step];
  if (state.done || !kind) return null; // done (or out of range) → about to exit

  const meta = SERVICE_META[kind];
  const Icon = meta.icon;

  return (
    <div className="ad-col" style={{ padding: 18 }}>
      <AppHeader title="ArrDeck" titleSize={22} marginBottom={12} />

      <div className="micro-label" style={{ margin: '2px 4px 8px' }}>
        Set up your services — {meta.label} · Step {state.step + 1} of {WIZARD_ORDER.length}
      </div>
      <StepperDots total={WIZARD_ORDER.length} current={state.step} />

      <Card>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <Icon size={22} color="var(--text)" strokeWidth={1.75} />
          <div style={{ fontSize: 16, fontWeight: 500 }}>{meta.label}</div>
        </div>
        <ServiceForm
          key={kind}
          kind={kind}
          host={host}
          onHostChange={setHost}
          onSaved={() => dispatch({ type: 'saved' })}
          saveLabel="Save & continue"
        />
      </Card>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'space-between' }}>
        <Button variant="ghost" onClick={() => dispatch({ type: 'skip' })}>
          Skip {meta.label}
        </Button>
        <Button variant="ghost" onClick={() => dispatch({ type: 'finish' })}>
          <Check size={15} /> I&apos;m done
        </Button>
      </div>
    </div>
  );
}

function StepperDots({ total, current }: { total: number; current: number }) {
  return (
    <div style={{ display: 'flex', gap: 7, margin: '0 4px 14px' }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background: i <= current ? 'var(--amber)' : 'var(--surface-recessed)',
            border: '1px solid ' + (i <= current ? 'transparent' : 'var(--border)'),
            transition: 'background 0.2s',
          }}
        />
      ))}
    </div>
  );
}

const KIND_OPTIONS = [
  { value: 'sonarr' as const, label: 'Sonarr' },
  { value: 'radarr' as const, label: 'Radarr' },
  { value: 'sabnzbd' as const, label: 'SABnzbd' },
  { value: 'prowlarr' as const, label: 'Prowlarr' },
];

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
