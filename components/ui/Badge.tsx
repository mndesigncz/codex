'use client';

import React from 'react';

// Odznak s počtem — jedna podoba pro dok, zvonek i dlaždice.
//
// Dřív byly tři: dok měl inkoustový s limetkovým číslem, zvonek limetkový
// a TO GO ještě jiný. Limetková plocha na zvonku navíc soupeřila s hlavní
// akcí obrazovky o jedinou limetku. Tady je inkoust s limetkovým číslem;
// oranžová jen pro varování (dochází zásoba), červená pro vlajku.
//
// Prstenec má barvu plochy (`--surface`), ne papíru (`--bg`): papír se
// v tmavém režimu nepřemapuje, takže odznak v tmavém doku nosil světlý
// kroužek.

const TONE = {
  // Třída v globals.css, ne `bg-[#16181A]`: ta je v tmavém režimu průhledná.
  ink: 'odznak-inkoust',
  // `on-accent` drží inkoust v obou režimech; `text-[#16181A]` by se v tmavém
  // převrátil na světlý text na oranžové.
  wait: 'bg-wait on-accent',
  bad: 'bg-bad text-white',
} as const;

/**
 * Odznak s počtem nad ikonou (nepřečtené zprávy, notifikace, čekající
 * položky). Při nule se nekreslí. Polohu dodá místo použití přes `className`
 * (typicky `absolute -top-1 -right-1`); nadřazený prvek má být `relative`.
 * `label` je celá věta pro odečítač („3 nepřečtené zprávy") — viditelné
 * „9+" samo nic neříká.
 */
export function Badge({ count, tone = 'ink', max = 9, label, ring = true, className = '' }: {
  count: number;
  tone?: keyof typeof TONE;
  /** Nad tímhle číslem se ukáže „9+". */
  max?: number;
  label?: string;
  /** Prstenec v barvě plochy — odliší odznak od ikony, přes kterou leží. */
  ring?: boolean;
  className?: string;
}) {
  if (!(count > 0)) return null;
  const text = count > max ? `${max}+` : String(count);
  return (
    // pop-in: odznak naskočí za 160 ms, když přibude první nepřečtené —
    // říká „něco nového", ne ozdoba. Změna čísla už se neanimuje.
    <span className={[
      'pop-in inline-grid place-items-center min-w-[18px] h-[18px] px-1 rounded-full',
      'text-[11px] font-bold leading-none tabular-nums',
      TONE[tone],
      ring ? 'ring-2 ring-[var(--surface)]' : '',
      className,
    ].join(' ')}>
      {label ? <><span aria-hidden>{text}</span><span className="sr-only">{label}</span></> : text}
    </span>
  );
}

export default Badge;
