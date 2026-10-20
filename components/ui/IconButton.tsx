'use client';

import React from 'react';
import { Icon } from '../Icons';

// Ikonové tlačítko v jemně šedém kruhu (v3).
//
// Inspirace (Bond, [untitled], World App) mají v liště nejvýš dvě tři akce
// a každá je ikona v tichém šedém kruhu bez rámečku. Dřív si každá lišta
// psala vlastní `rounded-full p-2 text-black/45 hover:bg-black/[0.05]`
// a kruh byl vidět až pod kurzorem — na telefonu nikdy, takže ikony
// v liště visely ve vzduchu a nepoznalo se, že jsou to tlačítka.
//
//   md — 40 px, horní lišta a hlavička okna
//   sm — 36 px, v řádku a v kartě (= .btn-icon)
//
// Dotyková plocha je vždy aspoň 44 px (`tap-target`), rozměr kruhu se nemění.
// `aria-label` je povinný: ikona sama odečítači nic neřekne.

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  icon: string;
  'aria-label': string;
  size?: 'sm' | 'md';
  /** Vybraný / otevřený stav (otevřené menu, zapnutý filtr). */
  active?: boolean;
  /** Obsah navíc v kruhu — typicky odznak (Badge) v rohu. */
  children?: React.ReactNode;
}

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { icon, size = 'md', active = false, className = '', type = 'button', children, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={[
        'tap-target relative inline-flex shrink-0 items-center justify-center rounded-full',
        size === 'md' ? 'h-10 w-10' : 'h-9 w-9',
        active ? 'bg-black/10 text-[#16181A]' : 'bg-black/[0.05] text-black/70 hover:bg-black/[0.08] hover:text-[#16181A]',
        'transition duration-200 disabled:opacity-45 disabled:cursor-not-allowed',
        className,
      ].join(' ')}
      {...rest}
    >
      <Icon name={icon} size={size === 'md' ? 19 : 17} className="shrink-0" />
      {children}
    </button>
  );
});

export default IconButton;
