'use client';

import React from 'react';
import { Icon } from '../Icons';

// Přepínač měsíce: ‹ Září 2026 ›.
//
// Finance, Rozvrh, Uzávěrky i Všechny podniky si ho kreslily samy, každý
// trochu jinak — jednou v tónované pilulce, jednou holé šipky vedle nadpisu,
// jednou s popiskem „title" místo `aria-label`, takže odečítač slyšel jen
// „tlačítko". Tady je ta převažující podoba: pilulka `glass`, kulaté šipky
// `btn-icon`, název měsíce uprostřed s pevnou minimální šířkou, aby šipky
// při přepnutí z „Května" na „Listopad" neuskakovaly.

/** „2026-09" posunuté o `o` měsíců. Počítá se v místním čase na 1. dni, takže přechod roku ani délka měsíce nevadí. */
export function posunMesic(mesic: string, o: number): string {
  const [y, m] = mesic.split('-').map(Number);
  const d = new Date(y, m - 1 + o, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** „2026-09" → „září 2026". Velké písmeno na začátku dodá `cz-sentence`, ne `capitalize` (to by zvětšilo každé slovo). */
export function nazevMesice(mesic: string): string {
  const [y, m] = mesic.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('cs-CZ', { month: 'long', year: 'numeric' });
}

/**
 * Přepínač měsíce se šipkami. Pro obrazovky, které ukazují jeden měsíc
 * (Finance, Rozvrh, Uzávěrky, přehled organizace). Hodnota je „RRRR-MM";
 * `min`/`max` zamknou šipku na kraji (třeba budoucí měsíce, kde nic není).
 * Rychlé skoky („Tento měsíc") patří vedle, ne dovnitř.
 */
export function MonthNav({ value, onChange, min, max, className = '' }: {
  value: string;
  onChange: (mesic: string) => void;
  min?: string;
  max?: string;
  className?: string;
}) {
  // „RRRR-MM" se dá porovnávat jako text — nuly na začátku drží pořadí.
  const naZacatku = !!min && value <= min;
  const naKonci = !!max && value >= max;
  // Šipka na kraji je `aria-disabled`, ne `disabled`: kdo došel šipkou
  // z klávesnice na poslední měsíc, nesmí o fokus přijít (zakázané tlačítko
  // prohlížeč odfokusuje a Tab pak začíná od začátku stránky).
  const zamcena = 'aria-disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:active:scale-100';
  return (
    <div role="group" aria-label="Měsíc"
      className={`flex items-center gap-1 glass rounded-full p-1 min-w-0 w-full sm:w-fit ${className}`}>
      <button type="button" onClick={() => { if (!naZacatku) onChange(posunMesic(value, -1)); }}
        aria-disabled={naZacatku || undefined}
        aria-label="Předchozí měsíc" className={`tap-target btn-icon ${zamcena}`}>
        <Icon name="chevronRight" size={16} className="rotate-180" />
      </button>
      {/* aria-live: po přepnutí odečítač řekne nový měsíc, jinak by po
          stisku šipky bylo ticho a člověk by nevěděl, kde je. */}
      <span aria-live="polite"
        className="px-2 min-w-0 sm:min-w-[9rem] flex-1 text-center text-sm font-semibold cz-sentence text-[#16181A] truncate tabular-nums">
        {nazevMesice(value)}
      </span>
      <button type="button" onClick={() => { if (!naKonci) onChange(posunMesic(value, 1)); }}
        aria-disabled={naKonci || undefined}
        aria-label="Další měsíc" className={`tap-target btn-icon ${zamcena}`}>
        <Icon name="chevronRight" size={16} />
      </button>
    </div>
  );
}

export default MonthNav;
