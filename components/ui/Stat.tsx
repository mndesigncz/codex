import React from 'react';
import { Icon } from '../Icons';

// Číslo s popiskem. Jedna podoba statistiky pro přehledy, věrnost, finance
// i kiosk: štítek nahoře, číslo velké a pevné, poznámka dole. Ikona je
// volitelná a sedí vpravo v tónovaném kolečku.

export function Stat({ label, value, unit, note, icon, tone = 'muted', className = '' }: {
  label: React.ReactNode; value: React.ReactNode; unit?: React.ReactNode; note?: React.ReactNode;
  icon?: string; tone?: 'ok' | 'wait' | 'bad' | 'info' | 'muted'; className?: string;
}) {
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="t-label truncate">{label}</p>
        {icon && <span className={`chip chip-${tone} !rounded-full !px-0 h-8 w-8 justify-center shrink-0`}><Icon name={icon} size={15} /></span>}
      </div>
      <p className="mt-1.5 text-[1.75rem] leading-none font-bold tracking-tight tabular-nums text-[#16181A]">
        {value}{unit && <span className="ml-1 text-base font-medium text-black/45">{unit}</span>}
      </p>
      {note && <p className="mt-1.5 text-[13px] text-black/50 truncate">{note}</p>}
    </div>
  );
}

/**
 * Řada statistik oddělených linkou — bez karet v kartě. Patří do jedné karty
 * (`<Card><StatRow>…</StatRow></Card>`); víc čísel vedle sebe, ne dlaždice
 * na každé číslo.
 *
 * Na telefonu nejvýš dva sloupce a mezi řadami vodorovná linka, od `sm`
 * jedna řada se svislými linkami. Dřív byla řada vždycky jedna
 * (`grid-flow-col`), takže šest čísel na 390 px dostalo po šedesáti pixelech
 * a zbyla z nich jen kolečka ikon (superadmin → Podniky). Lichý poslední
 * údaj se na telefonu roztáhne přes oba sloupce, ať linka nad ním nekončí
 * v půlce karty.
 */
export function StatRow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={[
      'grid -mx-2 [&>*]:px-4',
      'max-sm:grid-cols-2 max-sm:gap-y-4',
      'max-sm:[&>*:nth-child(n+3)]:border-t max-sm:[&>*:nth-child(n+3)]:border-[var(--surface-line)] max-sm:[&>*:nth-child(n+3)]:pt-4',
      'max-sm:[&>*:last-child:nth-child(odd)]:col-span-2',
      'sm:grid-flow-col sm:auto-cols-fr sm:divide-x sm:divide-[var(--surface-line)]',
      className,
    ].join(' ')}>{children}</div>
  );
}

export default Stat;
