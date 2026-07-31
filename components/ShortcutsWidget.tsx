'use client';

// Employer-composed quick-access tiles. Targets are deliberately just strings
// so a tile can point at a nav view or at the stock filtered to one category
// without this component knowing anything about either.

import { Icon } from './Icons';
import { type Shortcut, parseTarget } from '@/lib/dashboardWidgets';

export default function ShortcutsWidget({ shortcuts, onNavigate }: {
  shortcuts: Shortcut[];
  onNavigate: (view: string, arg?: string) => void;
}) {
  if (shortcuts.length === 0) return null;

  return (
    <div className="glass-card p-5">
      <h3 className="text-xs font-bold uppercase tracking-[0.13em] text-black/40 mb-3">Rychlý přístup</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
        {shortcuts.map((s, i) => {
          const { kind, arg } = parseTarget(s.target);
          return (
            <button
              key={`${s.target}-${i}`}
              onClick={() => onNavigate(kind === 'inventory' ? 'inventory' : arg || kind, kind === 'inventory' ? arg : undefined)}
              className="flex items-center gap-2.5 rounded-2xl bg-black/[0.03] hover:bg-black/[0.06] px-3.5 py-3 min-h-[56px] text-left transition active:scale-[0.98]"
            >
              <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#C8F542]/20 text-[#5B7A08]">
                <Icon name={s.icon || (kind === 'inventory' ? 'box' : 'chevron')} size={16} />
              </span>
              <span className="text-sm font-medium text-[#16181A] min-w-0 leading-snug">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
