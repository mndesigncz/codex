'use client';

import { useEffect } from 'react';
import { Icon } from './Icons';

export interface MoreItem { id: string; label: string; icon: string }
export interface MoreGroup { title?: string | null; items: MoreItem[] }
export interface MoreAction { label: string; icon: string; onClick: () => void; danger?: boolean }

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  items?: MoreItem[];
  groups?: MoreGroup[];
  activeId: string;
  onSelect: (id: string) => void;
  actions?: MoreAction[];
}

// A premium bottom sheet for the mobile "Více" menu — large tap targets,
// icon tiles, grouped into labelled categories, slides up over a dimmed scrim.
export default function MobileMoreSheet({ open, onClose, title = 'Menu', items, groups, activeId, onSelect, actions = [] }: Props) {
  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  // Normalise to groups so we always render the same way.
  const renderGroups: MoreGroup[] = groups && groups.length
    ? groups.filter(g => g.items.length)
    : [{ title: null, items: items ?? [] }];

  const Tile = (item: MoreItem) => {
    const active = item.id === activeId;
    return (
      <button key={item.id} onClick={() => { onSelect(item.id); onClose(); }}
        className={`flex flex-col items-center justify-center gap-1.5 rounded-2xl py-2.5 px-1 transition active:scale-[0.96] ${
          active ? 'bg-[#16181A] text-white' : 'text-[#16181A] hover:bg-black/[0.04]'
        }`}>
        <span className={`flex h-10 w-10 items-center justify-center rounded-full ${active ? 'bg-white/15' : 'bg-black/[0.05]'}`}>
          <Icon name={item.icon} size={20} className={active ? 'text-[#C8F542]' : 'text-[#16181A]'} />
        </span>
        <span className="text-[10.5px] font-medium text-center leading-tight truncate w-full">{item.label}</span>
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 modal-overlay animate-[fade_0.2s_ease-out]" onClick={onClose} />

      <div
        className="absolute inset-x-0 bottom-0 modal-sheet rounded-t-[24px] px-3.5 pt-2.5 pb-[max(env(safe-area-inset-bottom),16px)] shadow-[0_-14px_40px_rgba(15,20,25,0.2)] animate-[sheetUp_0.26s_cubic-bezier(0.16,1,0.3,1)]"
        role="dialog" aria-modal="true"
      >
        {/* Grabber */}
        <div className="mx-auto mb-2 h-1.5 w-9 rounded-full bg-black/15" />

        {/* Category groups — compact 4-across tiles under a small label */}
        <div className="max-h-[62vh] overflow-y-auto scrollbar-thin space-y-2.5">
          {renderGroups.map((g, gi) => (
            <div key={g.title ?? gi}>
              {g.title && (
                <p className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-black/35">{g.title}</p>
              )}
              <div className="grid grid-cols-4 gap-2">
                {g.items.map(Tile)}
              </div>
            </div>
          ))}
        </div>

        {actions.length > 0 && (
          <>
            <div className="h-px bg-black/[0.06] my-2" />
            <div className="flex flex-col">
              {actions.map((a, i) => (
                <button key={i} onClick={() => { a.onClick(); onClose(); }}
                  className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-xl text-sm font-medium transition ${
                    a.danger ? 'text-red-600 hover:bg-red-500/[0.06]' : 'text-black/70 hover:text-black hover:bg-black/[0.05]'
                  }`}>
                  <Icon name={a.icon} size={18} className="shrink-0" />
                  {a.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes sheetUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
    </div>
  );
}
