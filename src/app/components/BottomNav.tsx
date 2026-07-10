/**
 * BottomNav — persistent tab bar: Deck / Search / Queue / Services.
 * Amber = active, muted = inactive.
 */

import { LayoutDashboard, Search, ListVideo, Server, type LucideIcon } from 'lucide-react';

export type Tab = 'deck' | 'search' | 'queue' | 'services';

const TABS: { tab: Tab; label: string; icon: LucideIcon }[] = [
  { tab: 'deck', label: 'Deck', icon: LayoutDashboard },
  { tab: 'search', label: 'Search', icon: Search },
  { tab: 'queue', label: 'Queue', icon: ListVideo },
  { tab: 'services', label: 'Services', icon: Server },
];

export function BottomNav({ active, onChange }: { active: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      style={{
        position: 'sticky',
        bottom: 0,
        display: 'flex',
        borderTop: '1px solid var(--divider)',
        background: 'color-mix(in srgb, var(--bg) 92%, black)',
        backdropFilter: 'blur(8px)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}
    >
      {TABS.map(({ tab, label, icon: Icon }) => {
        const isActive = tab === active;
        const color = isActive ? 'var(--amber)' : 'var(--muted)';
        return (
          <button
            key={tab}
            onClick={() => onChange(tab)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              padding: '9px 0 8px',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              color,
            }}
          >
            <Icon size={21} strokeWidth={isActive ? 2.2 : 1.8} />
            <span style={{ fontSize: 10.5, fontWeight: isActive ? 500 : 400 }}>{label}</span>
          </button>
        );
      })}
    </nav>
  );
}
