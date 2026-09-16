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

/** Řada statistik oddělených linkou — bez karet v kartě. */
export function StatRow({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`grid grid-flow-col auto-cols-fr divide-x divide-[var(--surface-line)] -mx-2 [&>*]:px-4 ${className}`}>{children}</div>;
}

export default Stat;
