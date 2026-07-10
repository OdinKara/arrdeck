/**
 * AddServiceScreen — the onboarding / connection flow.
 *
 * (1) enter host IP → (2) Scan (engine scanHost) → (3) per found service, a
 * deep-link "Get your API key" helper + paste field → (4) Verify with a live
 * engine call (shows version + green check) → (5) save the ServiceConfig
 * on-device. Proves connect+store+status through real UI.
 */

import { useState } from 'react';
import { ScanSearch, Check, ArrowLeft, Plus } from 'lucide-react';
import {
  scanHost,
  probeAddress,
  splitHostPort,
  buildBaseUrl,
  type DiscoveredService,
  type ServiceKind,
} from '../../engine/index.js';
import { SERVICE_META } from '../lib/serviceMeta.js';
import { type VerifyResult } from '../lib/verify.js';
import { connectService } from '../lib/connect.js';
import { Button, Card, Spinner, StatusDot, TextInput } from '../components/ui.tsx';
import { ServiceKeyEntry } from '../components/ServiceKeyEntry.tsx';
import { SelectChips } from '../components/form.tsx';
import { isNative } from '../platform/env.js';
import { AddServiceScreenWeb } from './AddServiceScreenWeb.tsx';

interface Draft {
  apiKey: string;
  verifying: boolean;
  result?: VerifyResult;
  saved: boolean;
  /** The base URL this service was saved at (manual adds carry a custom port). */
  url?: string;
}

const KEYABLE: ServiceKind[] = ['sonarr', 'radarr', 'sabnzbd', 'prowlarr'];

export function AddServiceScreen({
  onDone,
  onCancel,
}: {
  onDone: () => void;
  /** When provided (i.e. adding ANOTHER service, not first-run onboarding),
   *  renders a back control so the user can bail out instead of being trapped. */
  onCancel?: () => void;
}) {
  // WEB: manual add against the BFF; native scan/onboarding path below is unchanged.
  if (!isNative()) return <AddServiceScreenWeb onDone={onDone} onCancel={onCancel} />;
  // ---- NATIVE (unchanged) ----
  const [host, setHost] = useState('');
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [found, setFound] = useState<DiscoveredService[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [scanError, setScanError] = useState<string | null>(null);

  // Manual-add form (explicit kind + host + custom port).
  const [manualOpen, setManualOpen] = useState(false);
  const [manualKind, setManualKind] = useState<ServiceKind>('sonarr');
  const [manualHost, setManualHost] = useState('');
  const [manualPort, setManualPort] = useState(String(SERVICE_META.sonarr.port));
  const [manualDraft, setManualDraft] = useState<{ apiKey: string; verifying: boolean; result?: VerifyResult }>({
    apiKey: '',
    verifying: false,
  });

  const savedCount = Object.values(drafts).filter((d) => d.saved).length;

  function setDraft(kind: string, patch: Partial<Draft>) {
    setDrafts((d) => ({
      ...d,
      [kind]: { apiKey: '', verifying: false, saved: false, ...d[kind], ...patch },
    }));
  }

  async function runScan() {
    setScanning(true);
    setScanError(null);
    setScanned(false);
    try {
      const raw = host.trim();
      // Default-port scan on the bare host (100% intact for the normal case).
      const results = await scanHost(raw);
      // If the user pasted a host:port (e.g. SAB on a custom 8085), ALSO probe
      // that exact address and fold any match in alongside the default finds.
      const { port } = splitHostPort(raw);
      if (port !== null) {
        const custom = await probeAddress(raw);
        if (custom && !results.some((r) => r.url === custom.url)) {
          results.push(custom);
        }
      }
      setFound(results);
      setScanned(true);
    } catch (err) {
      setScanError((err as Error).message);
    } finally {
      setScanning(false);
    }
  }

  async function verify(kind: ServiceKind, url: string) {
    const key = drafts[kind]?.apiKey?.trim() ?? '';
    if (!key) return;
    setDraft(kind, { verifying: true, result: undefined });
    const result = await connectService(kind, url, key);
    setDraft(kind, { verifying: false, result, saved: result.ok, url: result.ok ? url : undefined });
  }

  /** Pick a service kind in the manual form; prefill its default port (editable). */
  function pickManualKind(kind: ServiceKind) {
    setManualKind(kind);
    setManualPort(String(SERVICE_META[kind].port));
    setManualDraft((d) => ({ ...d, result: undefined }));
  }

  async function verifyManual() {
    const key = manualDraft.apiKey.trim();
    if (!manualHost.trim() || !key) return;
    const url = buildBaseUrl(manualHost.trim(), manualPort.trim() || SERVICE_META[manualKind].port);
    setManualDraft((d) => ({ ...d, verifying: true, result: undefined }));
    const result = await connectService(manualKind, url, key);
    if (result.ok) {
      // Record under the same drafts map (keyed by kind) so it counts toward
      // "Done — N connected" and renders as connected. upsertService already
      // replaced any scanned config for this kind, so there's no duplicate.
      setDrafts((d) => ({ ...d, [manualKind]: { apiKey: key, verifying: false, result, saved: true, url } }));
      setManualHost('');
      setManualDraft({ apiKey: '', verifying: false });
      setManualOpen(false);
    } else {
      setManualDraft((d) => ({ ...d, verifying: false, result }));
    }
  }

  const reachable = found.filter((f) => f.reachable && KEYABLE.includes(f.kind));
  const notFound = scanned && reachable.length === 0;
  const reachableKinds = new Set(reachable.map((r) => r.kind));
  // Manually-added services for kinds the scan didn't surface — shown as their
  // own connected cards (scanned kinds already render via their scan card).
  const manualSaved = (Object.entries(drafts) as [ServiceKind, Draft][]).filter(
    ([kind, d]) => d.saved && d.url && !reachableKinds.has(kind),
  );

  return (
    <div style={{ padding: 18, maxWidth: 640, margin: '0 auto' }}>
      <header style={{ marginBottom: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {onCancel && (
            <button
              onClick={onCancel}
              aria-label="Back"
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-2)',
                padding: 8,
                cursor: 'pointer',
                display: 'inline-flex',
                flexShrink: 0,
              }}
            >
              <ArrowLeft size={18} />
            </button>
          )}
          <span style={{ fontSize: 22, fontWeight: 500, color: 'var(--amber)' }}>ArrDeck</span>
        </div>
        <p style={{ color: 'var(--text-3)', fontSize: 13, margin: '6px 0 0' }}>
          Enter your server's address and scan for services.
        </p>
      </header>

      <Card style={{ marginBottom: 16 }}>
        <div className="micro-label" style={{ marginBottom: 8 }}>
          Host address
        </div>
        <TextInput value={host} onChange={setHost} placeholder="your server's IP (e.g. 192.168.1.100)" mono />
        <div style={{ height: 12 }} />
        <Button onClick={runScan} disabled={scanning || !host.trim()}>
          {scanning ? <Spinner /> : <ScanSearch size={17} />}
          {scanning ? 'Scanning…' : 'Scan'}
        </Button>
        {scanError && (
          <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>{scanError}</div>
        )}
      </Card>

      {scanned && (
        <div className="micro-label" style={{ margin: '20px 4px 10px' }}>
          {reachable.length > 0 ? 'Found on your server' : 'Scan complete'}
        </div>
      )}

      {notFound && (
        <Card recessed>
          <div style={{ color: 'var(--text-2)', fontSize: 14 }}>
            No services found at{' '}
            <span style={{ fontFamily: 'ui-monospace, monospace' }}>{host}</span>.
            <div style={{ color: 'var(--text-3)', fontSize: 13, marginTop: 8 }}>
              Tip: enter just the server IP (no port) to auto-scan the standard ports.
              Services on custom ports can be added too — just make sure the address and
              port are correct, and that the service is running.
            </div>
          </div>
        </Card>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {reachable.map((svc) => {
          const meta = SERVICE_META[svc.kind];
          const Icon = meta.icon;
          const draft = drafts[svc.kind] ?? { apiKey: '', verifying: false, saved: false };
          const displayUrl = draft.url ?? svc.url;
          return (
            <Card key={svc.kind}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <Icon size={22} color="var(--text)" strokeWidth={1.75} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 16, fontWeight: 500 }}>{meta.label}</div>
                  <div style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>
                    {displayUrl}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <StatusDot state={draft.saved ? 'ok' : 'idle'} />
                  <span style={{ fontSize: 12, color: draft.saved ? 'var(--green)' : 'var(--text-3)' }}>
                    {draft.saved ? 'connected' : 'found'}
                  </span>
                </div>
              </div>

              {!draft.saved && (
                <ServiceKeyEntry
                  kind={svc.kind}
                  url={svc.url}
                  apiKey={draft.apiKey}
                  onApiKeyChange={(v) => setDraft(svc.kind, { apiKey: v })}
                  onVerify={() => verify(svc.kind, svc.url)}
                  verifying={draft.verifying}
                  result={draft.result}
                />
              )}

              {draft.saved && draft.result?.version && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    color: 'var(--green)',
                    fontSize: 13,
                  }}
                >
                  <Check size={16} /> Connected — {meta.label} v{draft.result.version}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {/* Manually-added services (kinds the scan didn't surface). */}
      {manualSaved.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
          {manualSaved.map(([kind, d]) => (
            <ConnectedCard key={kind} kind={kind} url={d.url!} version={d.result?.version} />
          ))}
        </div>
      )}

      {/* Explicit manual-add path — for custom ports or anything the scan misses. */}
      {scanned && (
        <div style={{ marginTop: 18 }}>
          {!manualOpen ? (
            <Button variant="ghost" onClick={() => setManualOpen(true)}>
              <Plus size={16} /> Add a service manually
            </Button>
          ) : (
            <Card>
              <div className="micro-label" style={{ marginBottom: 10 }}>
                Add a service manually
              </div>
              <SelectChips
                options={[
                  { value: 'sonarr', label: 'Sonarr' },
                  { value: 'radarr', label: 'Radarr' },
                  { value: 'sabnzbd', label: 'SABnzbd' },
                  { value: 'prowlarr', label: 'Prowlarr' },
                ]}
                value={manualKind}
                onChange={pickManualKind}
              />
              <div style={{ height: 12 }} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 2 }}>
                  <TextInput value={manualHost} onChange={setManualHost} placeholder="host / IP (e.g. 192.168.1.100)" mono />
                </div>
                <div style={{ width: 96 }}>
                  <TextInput value={manualPort} onChange={setManualPort} placeholder="port" mono />
                </div>
              </div>
              <div style={{ height: 12 }} />
              <ServiceKeyEntry
                kind={manualKind}
                url={buildBaseUrl(manualHost.trim(), manualPort.trim() || SERVICE_META[manualKind].port)}
                apiKey={manualDraft.apiKey}
                onApiKeyChange={(v) => setManualDraft((d) => ({ ...d, apiKey: v }))}
                onVerify={verifyManual}
                verifying={manualDraft.verifying}
                result={manualDraft.result}
                verifyDisabled={!manualHost.trim()}
              />
              <div style={{ height: 10 }} />
              <Button
                variant="ghost"
                onClick={() => {
                  setManualOpen(false);
                  setManualDraft({ apiKey: '', verifying: false });
                }}
              >
                Cancel
              </Button>
            </Card>
          )}
        </div>
      )}

      {savedCount > 0 && (
        <div style={{ marginTop: 22 }}>
          <Button onClick={onDone}>Done — {savedCount} connected</Button>
        </div>
      )}
    </div>
  );
}

/** A compact connected-service card (for manually-added services). */
function ConnectedCard({ kind, url, version }: { kind: ServiceKind; url: string; version?: string }) {
  const meta = SERVICE_META[kind];
  const Icon = meta.icon;
  return (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Icon size={22} color="var(--text)" strokeWidth={1.75} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{meta.label}</div>
          <div style={{ color: 'var(--muted)', fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>{url}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <StatusDot state="ok" />
          <span style={{ fontSize: 12, color: 'var(--green)' }}>connected</span>
        </div>
      </div>
      {version && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--green)', fontSize: 13, marginTop: 10 }}>
          <Check size={16} /> Connected — {meta.label} v{version}
        </div>
      )}
    </Card>
  );
}
