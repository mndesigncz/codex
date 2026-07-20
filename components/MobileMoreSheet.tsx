'use client';

import { useEffect } from 'react';
import { Icon } from './Icons';

export interface MoreItem { id: string; label: string; icon: string }
export interface MoreAction { label: string; icon: string; onClick: () => void; danger?: boolean }

interface Props {
  open: boolean;
  onClose: () => void;
  title?: string;
  items: MoreItem[];
  activeId: string;
  onSelect: (id: string) => void;
  actions?: MoreAction[];
}

// A premium bottom sheet for the mobile "Více" menu — large tap targets,
// icon tiles, clear grouping, slides up over a dimmed scrim.
export default function MobileMoreSheet({ open, onClose, title = 'Menu', items, activeId, onSelect, actions = [] }: Props) {
  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 md:hidden">
      <div className="absolute inset-0 modal-overlay animate-[fade_0.2s_ease-out]" onClick={onClose} />

      <div
        className="absolute inset-x-0 bottom-0 modal-sheet rounded-t-[28px] px-4 pt-3 pb-[max(env(safe-area-inset-bottom),20px)] shadow-[0_-16px_44px_rgba(15,20,25,0.22)] animate-[sheetUp_0.28s_cubic-bezier(0.16,1,0.3,1)]"
        role="dialog" aria-modal="true"
      >
        {/* Grabber */}
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-black/15" />

        <div className="flex items-center justify-between px-1 mb-3">
          <h3 className="font-bold text-[#16181A] tracking-tight">{title}</h3>
          <button onClick={onClose} aria-label="Zavřít"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-black/[0.05] text-black/50 hover:text-black transition">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {/* Item tiles */}
        <div className="grid grid-cols-3 gap-2.5 max-h-[46vh] overflow-y-auto scrollbar-thin">
          {items.map(item => {
            const active = item.id === activeId;
            return (
              <button key={item.id} onClick={() => { onSelect(item.id); onClose(); }}
                className={`flex flex-col items-center justify-center gap-2 rounded-2xl py-4 px-1 border transition active:scale-[0.97] ${
                  active
                    ? 'bg-[#16181A] border-[#16181A] text-white'
                    : 'bg-black/[0.03] border-black/[0.05] text-[#16181A] hover:bg-black/[0.05]'
                }`}>
                <span className={`flex h-11 w-11 items-center justify-center rounded-2xl ${active ? 'bg-white/15' : 'bg-white shadow-sm'}`}>
                  <Icon name={item.icon} size={22} className={active ? 'text-[#C8F542]' : 'text-[#16181A]'} />
                </span>
                <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>

        {actions.length > 0 && (
          <>
            <div className="h-px bg-black/[0.07] my-3" />
            <div className="space-y-1">
              {actions.map((a, i) => (
                <button key={i} onClick={() => { a.onClick(); onClose(); }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-2xl text-sm font-medium transition ${
                    a.danger ? 'text-red-600 hover:bg-red-500/[0.06]' : 'text-black/70 hover:text-black hover:bg-black/[0.05]'
                  }`}>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full ${a.danger ? 'bg-red-500/10' : 'bg-black/[0.05]'}`}>
                    <Icon name={a.icon} size={18} />
                  </span>
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
