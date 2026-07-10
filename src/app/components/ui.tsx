/**
 * ui.tsx — small shared primitives. Every color comes from a token var; no
 * component hardcodes a hex value.
 */

import type { CSSProperties, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';

export function Card({
  children,
  style,
  recessed,
  onClick,
}: {
  children: ReactNode;
  style?: CSSProperties;
  recessed?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{
        background: recessed ? 'var(--surface-recessed)' : 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export type DotState = 'ok' | 'fail' | 'idle' | 'busy';

export function StatusDot({ state, size = 9 }: { state: DotState; size?: number }) {
  const color =
    state === 'ok'
      ? 'var(--green)'
      : state === 'fail'
        ? 'var(--red)'
        : state === 'busy'
          ? 'var(--amber)'
          : 'var(--muted)';
  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: state === 'ok' ? '0 0 6px color-mix(in srgb, var(--green) 60%, transparent)' : 'none',
        flexShrink: 0,
      }}
    />
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = 'primary',
  style,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: 'primary' | 'ghost';
  style?: CSSProperties;
}) {
  const primary = variant === 'primary';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        width: '100%',
        padding: '12px 16px',
        borderRadius: 'var(--radius-sm)',
        border: primary ? 'none' : '1px solid var(--border)',
        background: primary ? 'var(--amber)' : 'transparent',
        color: primary ? '#1a1205' : 'var(--text)',
        fontSize: 15,
        fontWeight: 500,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'opacity 120ms ease',
        ...style,
      }}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <Loader2
      size={size}
      style={{ animation: 'arrdeck-spin 900ms linear infinite', color: 'var(--amber)' }}
    />
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  mono,
  type = 'text',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  mono?: boolean;
  type?: string;
}) {
  return (
    <input
      value={value}
      type={type}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      style={{
        width: '100%',
        padding: '11px 12px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        background: 'var(--surface-recessed)',
        color: 'var(--text)',
        fontSize: 14,
        fontFamily: mono ? 'ui-monospace, SFMono-Regular, Menlo, monospace' : 'inherit',
        outline: 'none',
      }}
    />
  );
}
