/**
 * ServiceKeyEntry — the shared "get your API key → paste → verify" block.
 *
 * Used by both the scanned-service cards and the manual-add form so the
 * deep-link helper, hint, paste field, and Verify button aren't copy-pasted.
 * Presentational only: the parent owns the apiKey/verifying/result state and
 * supplies the verify handler (which routes through lib/connect).
 */

import { KeyRound, Check, ExternalLink } from 'lucide-react';
import type { ServiceKind } from '../../engine/index.js';
import { apiKeySettingsUrl, apiKeyHint } from '../lib/keyHelp.js';
import type { VerifyResult } from '../lib/verify.js';
import { openExternal } from '../platform/browser.js';
import { Button, Spinner, TextInput } from './ui.tsx';

export function ServiceKeyEntry({
  kind,
  url,
  apiKey,
  onApiKeyChange,
  onVerify,
  verifying,
  result,
  verifyDisabled,
}: {
  kind: ServiceKind;
  /** Base URL used for the settings deep-link (built from host:port). */
  url: string;
  apiKey: string;
  onApiKeyChange: (v: string) => void;
  onVerify: () => void;
  verifying: boolean;
  result?: VerifyResult;
  /** Extra gate from the parent (e.g. manual form requires a host too). */
  verifyDisabled?: boolean;
}) {
  const settingsUrl = apiKeySettingsUrl(kind, url);
  return (
    <>
      <button
        onClick={() => openExternal(settingsUrl)}
        style={{
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
          marginBottom: 4,
        }}
      >
        <KeyRound size={15} /> Get your API key <ExternalLink size={13} />
      </button>
      <div style={{ color: 'var(--muted)', fontSize: 11, margin: '4px 2px 10px' }}>
        {apiKeyHint(kind)}
      </div>

      <TextInput value={apiKey} onChange={onApiKeyChange} placeholder="Paste API key" mono />
      <div style={{ height: 10 }} />
      <Button onClick={onVerify} disabled={verifying || !apiKey.trim() || verifyDisabled}>
        {verifying ? <Spinner /> : <Check size={16} />}
        {verifying ? 'Verifying…' : 'Verify & connect'}
      </Button>
      {result && !result.ok && (
        <div style={{ color: 'var(--red)', fontSize: 13, marginTop: 10 }}>
          {result.error ?? 'Verification failed'}
        </div>
      )}
    </>
  );
}
