/**
 * SideNav — DESKTOP left rail (renders instead of BottomNav at >=900px).
 * Mirrors BottomNav's props (active + onChange) and reuses the same tabs/icons
 * so the two stay in sync. BottomNav is untouched; App.tsx picks which to render.
 */

import { LayoutDashboard, Search, ListVideo, Server, type LucideIcon } from 'lucide-react';
import type { Tab } from './BottomNav.tsx';

const TABS: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: 'deck', label: 'Deck', icon: LayoutDashboard },
  { tab: 'search', label: 'Search', icon: Search },
  { tab: 'queue', label: 'Queue', icon: ListVideo },
  { tab: 'services', label: 'Services', icon: Server },
];

export function SideNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      style={{
        width: 212,
        flexShrink: 0,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        padding: '18px 12px',
        borderRight: '1px solid var(--divider)',
        background: 'color-mix(in srgb, var(--bg) 92%, black)',
      }}
    >
      <div style={{ fontSize: 20, fontWeight: 500, color: 'var(--amber)', padding: '4px 10px 16px' }}>
        ArrDeck
      </div>
      {TABS.map(({ tab, label, icon: Icon }) => {
        const isActive = tab === active;
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '11px 12px',
              borderRadius: 'var(--radius-sm)',
              background: isActive ? 'color-mix(in srgb, var(--amber) 12%, transparent)' : 'transparent',
              border: '1px solid ' + (isActive ? 'color-mix(in srgb, var(--amber) 35%, transparent)' : 'transparent'),
              cursor: 'pointer',
              color: isActive ? 'var(--amber)' : 'var(--text-2)',
              textAlign: 'left',
            }}
          >
            <Icon size={20} strokeWidth={isActive ? 2.2 : 1.8} />
            <span style={{ fontSize: 14, fontWeight: isActive ? 500 : 400 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
