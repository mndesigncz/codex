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
//
// Panel a položky jsou vytažené zvlášť (`MenuPanel`, `MenuItemButton`), aby
// kontextové menu po podržení widgetu a nabídka v liště úprav vypadaly
// a chovaly se přesně jako tohle — jen s jinou kotvou.

export interface MenuItem {
  label: string;
  icon?: string;
  onClick: () => void;
  danger?: boolean;
  disabled?: boolean;
  /** Vysvětlivka pod názvem, když akce není samozřejmá. */
  hint?: string;
}

/**
 * Panel nabídky: `glass-strong`, rádius 14, stín, roste z místa, odkud se
 * otevřel (`pop-in` 160 ms). Pro vlastní rozbalovací nabídky — kontextové
 * menu, nabídka v plovoucí liště. Polohu a `origin-*` dodá místo použití
 * přes `className`/`style`. Položky jsou `MenuItemButton`. Otevírá-li se
 * nahoru, dej `direction="up"`.
 *
 * Šipky, Escape, klepnutí vedle a návrat fokusu řeší `usePopover`; panel
 * dostane `ref={pop.panelRef}` a `onKeyDown={pop.onPanelKeyDown}` a pak:
 * - **se spouští** (tlačítko „···" v liště): tlačítko `ref={pop.triggerRef}`
 *   a obojí — tlačítko i panel — v obalu `ref={pop.ref}`, jako `Menu` níž.
 *   Jinak by se klepnutí na tlačítko počítalo za „vedle" a panel by se
 *   zavřel a hned zase otevřel;
 * - **bez spouště** (kontextové menu z podržení widgetu): obal netřeba,
 *   „vedle" je všechno mimo panel. Fokus po zavření vrátí
 *   `usePopover(…, { anchorRef })` na kotvu (widget s `tabIndex`) — bez ní
 *   by po Escapu spadl na <body>.
 */
export const MenuPanel = React.forwardRef<HTMLDivElement, {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  /** Kam panel roste od kotvy — podle toho přijede o kousek shora, nebo zdola. */
  direction?: 'down' | 'up';
  id?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}>(function MenuPanel({ children, className = '', style, onKeyDown, direction = 'down', ...aria }, ref) {
  return (
    <div
      role="menu"
      ref={ref}
      onKeyDown={onKeyDown}
      style={style}
      {...aria}
      // Roste z tlačítka, které ho otevřelo — ne ze středu. Rychlé
      // (160 ms): menu se otevírá desetkrát denně, ne jednou.
      className={`z-40 min-w-[220px] max-w-[calc(100vw-2rem)] glass-strong rounded-2xl p-1.5 shadow-[0_14px_40px_rgba(25,35,15,0.16)] ${direction === 'up' ? 'pop-in-up' : 'pop-in'} ${className}`}
    >
      {children}
    </div>
  );
});

/**
 * Jedna položka nabídky (`role="menuitem"`) v `MenuPanel`: ikona 18, název,
 * volitelná vysvětlivka. Nebezpečnou akci (`danger`) dej červeně a na konec.
 * `onClick` dostane místo použití — typicky nejdřív zavře panel, pak akci.
 */
export function MenuItemButton({ label, icon, hint, danger, disabled, onClick, className = '' }: MenuItem & { className?: string }) {
  return (
    <button
      // type="button": v menu uvnitř formuláře by položka jinak formulář odeslala.
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-start gap-3 px-3 py-2.5 rounded-xl text-sm text-left transition-colors disabled:opacity-40 ${
        danger ? 'text-bad-ink hover:bg-bad/[0.07]' : 'text-[#16181A] hover:bg-black/[0.05]'
      } ${className}`}
    >
      {icon && <Icon name={icon} size={18} className={`shrink-0 mt-px ${danger ? '' : 'text-black/55'}`} />}
      <span className="min-w-0">
        <span className="block font-medium leading-snug">{label}</span>
        {hint && <span className="block text-xs text-black/55 mt-0.5 leading-snug">{hint}</span>}
      </span>
    </button>
  );
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
        <MenuPanel
          ref={pop.panelRef}
          onKeyDown={pop.onPanelKeyDown}
          className={`absolute top-full mt-2 ${align === 'right' ? 'right-0 origin-top-right' : 'left-0 origin-top-left'}`}
        >
          {visible.map((it, i) => (
            <MenuItemButton key={i} {...it} onClick={() => { pop.close(false); it.onClick(); }} />
          ))}
        </MenuPanel>
      )}
    </div>
  );
}

export default Menu;
