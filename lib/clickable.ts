'use client';

// Klikatelná karta, na kterou dojde i klávesnice.
//
// `<div onClick>` se myší chová jako tlačítko, ale Tabem na něj nikdo
// nedojde a Enter na něm nic neudělá — pro člověka, který ovládá aplikaci
// klávesnicí, ta akce prostě neexistuje. V aplikaci to potkalo devět míst:
// kartu postupu, kartu návodu, řádek žebříčku, avatara v týmu a další.
//
// Nejlepší řešení je `<button>`. Tyhle případy ale nesou uvnitř další
// odkazy a tlačítka (jméno člověka, štítky), a tlačítko v tlačítku je
// neplatné HTML. Proto tenhle vzor: `role="button"` + `tabIndex` +
// obsluha Enteru a mezerníku, přesně jak to dělá `ProfileLinkProvider`.
//
// Když uvnitř nic interaktivního není, je pořád lepší napsat `<button>`.

import type React from 'react';

export function clickable(onActivate: () => void, opts: { disabled?: boolean; label?: string } = {}) {
  if (opts.disabled) return {};
  return {
    role: 'button' as const,
    tabIndex: 0,
    ...(opts.label ? { 'aria-label': opts.label } : {}),
    onClick: onActivate,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      // Mezerník na kartě jinak odscrolluje stránku pod ní.
      e.preventDefault();
      // Enter uvnitř vnořeného odkazu nebo pole patří jemu, ne kartě.
      if (e.target !== e.currentTarget) return;
      onActivate();
    },
  };
}

export default clickable;
