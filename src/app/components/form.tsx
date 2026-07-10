/**
 * form.tsx — small token-driven form controls for the edit dialog.
 */

import type { ReactNode } from 'react';
import { Folder, HardDrive } from 'lucide-react';
import { fmtBytes } from '../lib/format.js';

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div className="micro-label" style={{ margin: '0 2px 8px' }}>
        {label}
      </div>
      {children}
    </div>
  );
}

export function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      aria-pressed={on}
      style={{
        width: 46,
        height: 26,
        borderRadius: 999,
        background: on ? 'var(--amber)' : 'var(--surface-recessed)',
        border: `1px solid ${on ? 'var(--amber)' : 'var(--border)'}`,
        position: 'relative',
        flexShrink: 0,
        cursor: 'pointer',
        transition: 'background 140ms ease',
        padding: 0,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: 2,
          left: on ? 22 : 2,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: on ? '#1a1205' : 'var(--muted)',
          transition: 'left 140ms ease',
        }}
      />
    </button>
  );
}

export function ToggleRow({
  label,
  on,
  onToggle,
}: {
  label: string;
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '11px 13px',
        borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)',
        background: 'var(--surface)',
      }}
    >
      <span style={{ flex: 1, fontSize: 14, color: 'var(--text)' }}>{label}</span>
      <Toggle on={on} onToggle={onToggle} />
    </div>
  );
}

export interface Option<T extends string | number> {
  value: T;
  label: string;
}

export function SelectChips<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: Option<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const sel = o.value === value;
        return (
          <button
            key={String(o.value)}
            onClick={() => onChange(o.value)}
            style={{
              padding: '8px 13px',
              borderRadius: 999,
              border: `1px solid ${sel ? 'var(--amber)' : 'var(--border)'}`,
              background: sel ? 'var(--amber)' : 'var(--surface)',
              color: sel ? '#1a1205' : 'var(--text-2)',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function TextField({
  value,
  onChange,
  placeholder,
  invalid,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      style={{
        width: '100%',
        padding: '11px 12px',
        borderRadius: 'var(--radius-sm)',
        border: `1px solid ${invalid ? 'var(--red)' : 'var(--border)'}`,
        background: 'var(--surface-recessed)',
        color: 'var(--text)',
        fontSize: 14,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        outline: 'none',
      }}
    />
  );
}

/**
 * Root-folder radio list — tappable rows with path + free space and an amber
 * ring on the selected one. Matches the grab/detail root picker styling.
 */
export function RootFolderList({
  roots,
  selected,
  onSelect,
}: {
  roots: { id: number; path: string; freeSpace: number }[];
  selected: string | null;
  onSelect: (path: string) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {roots.map((r) => {
        const sel = r.path === selected;
        return (
          <button
            key={r.id}
            onClick={() => onSelect(r.path)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '11px 13px',
              borderRadius: 'var(--radius-sm)',
              border: `1px solid ${sel ? 'var(--amber)' : 'var(--border)'}`,
              background: sel ? 'color-mix(in srgb, var(--amber) 8%, var(--surface))' : 'var(--surface)',
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                border: `2px solid ${sel ? 'var(--amber)' : 'var(--muted)'}`,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {sel && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--amber)' }} />}
            </span>
            <Folder size={15} color="var(--text-3)" />
            <span style={{ flex: 1, fontSize: 14, color: 'var(--text)', fontFamily: 'ui-monospace, monospace' }}>
              {r.path}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--muted)' }}>
              <HardDrive size={12} /> {fmtBytes(r.freeSpace)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Multi-select tag chips (toggle membership). */
export function TagPicker({
  tags,
  selected,
  onToggle,
}: {
  tags: { id: number; label: string }[];
  selected: Set<number>;
  onToggle: (id: number) => void;
}) {
  if (tags.length === 0) {
    return <div style={{ color: 'var(--muted)', fontSize: 13 }}>No tags defined in Sonarr.</div>;
  }
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {tags.map((t) => {
        const sel = selected.has(t.id);
        return (
          <button
            key={t.id}
            onClick={() => onToggle(t.id)}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: `1px solid ${sel ? 'var(--amber)' : 'var(--border)'}`,
              background: sel ? 'color-mix(in srgb, var(--amber) 16%, var(--surface))' : 'var(--surface)',
              color: sel ? 'var(--amber)' : 'var(--text-3)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
