/**
 * SupportSheet — the low-key tip jar behind the donate heart.
 *
 * Deliberately unambitious. It is a bottom sheet that appears ONLY when someone
 * taps the heart, closes on backdrop / Escape / the X, and blocks nothing. There
 * is no launch prompt, no "maybe later", no timer, no counter, no interstitial,
 * and no second entry point anywhere in the app. The heart is it.
 *
 * Everything it displays comes from lib/sponsor.ts — baked into the build, never
 * fetched (see that file for why). QR codes render locally from qrcode.react as
 * inline SVG: no canvas, no data URL, no external QR service. Handing an address
 * to a third-party QR API would leak who is about to pay whom AND put a server
 * ArrDeck does not control in the path of a payment address.
 *
 * UI-agnostic in the sense that matters here: it is plain React + design tokens
 * with no Capacitor import and no browser-only globals at module scope, so the
 * same component renders in the Android webview and in the Docker web UI.
 */

import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Heart, X, Copy, Check, ExternalLink } from 'lucide-react';
import {
  CRYPTO_RAILS,
  DONATE_URL,
  X_HANDLE,
  X_URL,
  openDonatePage,
  openX,
} from '../lib/sponsor.js';
import { copyText } from '../platform/clipboard.js';
import { SPONSOR_RED } from './SponsorHeart.tsx';

/** Copy state per rail: idle, confirmed, or "we could not, do it yourself". */
type CopyState = 'idle' | 'ok' | 'fail';

function CryptoRow({ label, hint, value }: { label: string; hint: string; value: string }) {
  const [state, setState] = useState<CopyState>('idle');

  useEffect(() => {
    if (state === 'idle') return;
    const t = setTimeout(() => setState('idle'), 2200);
    return () => clearTimeout(t);
  }, [state]);

  async function onCopy() {
    setState((await copyText(value)) ? 'ok' : 'fail');
  }

  return (
    <div
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '14px 0',
        borderTop: '1px solid var(--divider)',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 8 }}>{hint}</div>

        {/* Selectable so a user can always copy by hand, whatever the API does. */}
        <code
          style={{
            display: 'block',
            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
            fontSize: 11.5,
            lineHeight: 1.5,
            color: 'var(--text)',
            background: 'var(--surface-recessed)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '8px 9px',
            wordBreak: 'break-all',
            userSelect: 'all',
          }}
        >
          {value}
        </code>

        <button
          onClick={() => void onCopy()}
          aria-label={`Copy ${label} address`}
          style={{
            marginTop: 8,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            font: 'inherit',
            fontSize: 12,
            color: state === 'ok' ? 'var(--green)' : state === 'fail' ? 'var(--muted)' : 'var(--text-2)',
            background: 'transparent',
            border: `1px solid ${state === 'ok' ? 'var(--green)' : 'var(--border)'}`,
            borderRadius: 8,
            padding: '6px 11px',
            cursor: 'pointer',
          }}
        >
          {state === 'ok' ? <Check size={13} /> : <Copy size={13} />}
          {state === 'ok' ? 'Copied' : state === 'fail' ? 'Select it and copy' : 'Copy'}
        </button>
      </div>

      {/* White plate: QR contrast is a scanning requirement, not a style choice. */}
      <div style={{ flex: 'none', background: '#fff', borderRadius: 8, padding: 6, lineHeight: 0 }}>
        <QRCodeSVG value={value} size={92} level="M" marginSize={0} />
      </div>
    </div>
  );
}

function LinkRow({
  label,
  sub,
  onClick,
  note,
}: {
  label: string;
  sub: string;
  onClick: () => void;
  note?: string;
}) {
  return (
    <div style={{ padding: '13px 0', borderTop: '1px solid var(--divider)' }}>
      <button
        onClick={onClick}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          width: '100%',
          font: 'inherit',
          textAlign: 'left',
          color: 'var(--text)',
          background: 'transparent',
          border: 'none',
          padding: 0,
          cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{label}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{sub}</div>
        </div>
        <ExternalLink size={15} color="var(--muted)" />
      </button>
      {note && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.5 }}>
          {note}
        </div>
      )}
    </div>
  );
}

export function SupportSheet({ onClose }: { onClose: () => void }) {
  // Escape closes it. Nothing about this sheet should ever feel like a trap.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Support ArrDeck"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'color-mix(in srgb, #000 62%, transparent)',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 460,
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderBottom: 'none',
          borderRadius: '16px 16px 0 0',
          padding: '16px 18px calc(22px + env(safe-area-inset-bottom))',
        }}
      >
        <header style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
          <Heart size={16} fill={SPONSOR_RED} stroke={SPONSOR_RED} />
          <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>Support ArrDeck</span>
          <button
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-2)',
              cursor: 'pointer',
              display: 'inline-flex',
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </header>

        <p style={{ margin: '0 0 4px', fontSize: 12.5, lineHeight: 1.6, color: 'var(--text-2)' }}>
          ArrDeck is free and AGPL, and nothing in it is paywalled — no paid tier, no
          key, no feature held back. This is just a tip jar if it saved you some
          clicks. Closing it costs you nothing.
        </p>

        {CRYPTO_RAILS.map((rail) => (
          <CryptoRow key={rail.id} label={rail.label} hint={rail.hint} value={rail.value} />
        ))}

        <LinkRow label="X Money" sub={X_HANDLE} onClick={() => void openX()} />

        <div style={{ borderTop: '1px solid var(--divider)', paddingTop: 13, marginTop: 1 }}>
          <button
            onClick={() => void openDonatePage()}
            style={{
              font: 'inherit',
              fontSize: 12,
              color: 'var(--amber)',
              background: 'transparent',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {DONATE_URL.replace('https://', '')}
            <ExternalLink size={12} />
          </button>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5, lineHeight: 1.5 }}>
            The same addresses, published in a public git repo so they can be audited.
          </div>
        </div>
      </div>
    </div>
  );
}
