'use client';

import React, { useState } from 'react';
import { Icon } from '../Icons';
import { Button, type ButtonSize } from './Button';
import { usePopover } from '@/lib/usePopover';

// Přetékající menu „···".
//
// Obrazovka má jednu hlavní akci a nejvýš dvě vedlejší vidět. Zbytek patří
// sem — sedm tlačítek v řadě nad kalendářem nikdo nečte, tři přečte každý.
// Na telefonu se sem schová i to, co je na monitoru venku.

export interface MenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Vysvětlivka pod názvem, když akce není samozřejmá. */
  hint?: string;
}

export function Menu({ items, label = 'Další akce', size = 'md', align = 'right', icon = 'more', className = '' }: {
  items: MenuItem[];
  label?: string;
  size?: ButtonSize;
  align?: 'left' | 'right';
  icon?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  // Escape, kliknutí mimo, návrat fokusu na tlačítko a pohyb šipkami řeší
  // společný `usePopover` — stejně jako v panelu oznámení a v účtu.
  const pop = usePopover(open, setOpen, { focusFirst: true, arrowKeys: true });

  const visible = items.filter(Boolean);
  if (visible.length === 0) return null;

  return (
    <div ref={pop.ref} className={`relative shrink-0 ${className}`}>
      <Button
        ref={pop.triggerRef}
        variant="secondary" size={size} iconOnly icon={icon} aria-label={label}
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => setOpen(v => !v)}
        onKeyDown={pop.onTriggerKeyDown}
        className={open ? 'bg-black/[0.06]' : ''}
      />
      {open && (
        <div
          role="menu"
          ref={pop.panelRef}
          onKeyDown={pop.onPanelKeyDown}
          // Roste z tlačítka, které ho otevřelo — ne ze středu. Rychlé
          // (160 ms): menu se otevírá desetkrát denně, ne jednou.
          className={`absolute top-full mt-2 z-40 min-w-[220px] max-w-[calc(100vw-2rem)] glass-strong rounded-2xl p-1.5 shadow-[0_14px_40px_rgba(25,35,15,0.16)] pop-in ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'}`}
        >
          {visible.map((it, i) => (
            <button
              key={i}
              role="menuitem"
              disabled={it.disabled}
              onClick={() => { pop.close(false); it.onClick(); }}
              className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors disabled:opacity-40 ${
                it.danger ? 'text-bad-ink hover:bg-bad/[0.07]' : 'text-[#16181A] hover:bg-black/[0.05]'
              }`}
            >
              {it.icon && <Icon name={it.icon} size={18} className={`shrink-0 mt-px ${it.danger ? '' : 'text-black/55'}`} />}
              <span className="min-w-0">
                <span className="block font-medium leading-snug">{it.label}</span>
                {it.hint && <span className="block text-xs text-black/55 mt-0.5 leading-snug">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default Menu;
