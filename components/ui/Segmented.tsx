'use client';

import React from 'react';
import { Icon } from '../Icons';

// Přepínač pohledů (Seznam / Týden, Rozvrh / Kalendář / Typy směn…).
// Vybraná položka je tmavá — stejně jako v postranní liště a doku, takže
// „vybráno" vypadá v celé aplikaci stejně a nikdy jako tlačítko akce.

export interface SegmentedOption<T extends string = string> {
  id: T;
  label: string;
  icon?: string;
  /** Malý počet vpravo od názvu („Ke schválení 3"). */
  count?: number;
}

export function Segmented<T extends string>({ options, value, onChange, size = 'md', className = '', ariaLabel, wrap = false }: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
  /** Šest a víc položek na telefonu: raději zalomit na dva řádky než
      schovat poslední za okraj, kde je nikdo nehledá. */
  wrap?: boolean;
}) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  return (
    <div role="tablist" aria-label={ariaLabel}
      className={`inline-flex max-w-full gap-1 rounded-[22px] glass border border-black/[0.07] p-1 ${wrap ? 'flex-wrap' : 'overflow-x-auto scrollbar-thin rounded-full'} ${className}`}>
      {options.map(o => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={on}
            onClick={() => onChange(o.id)}
            className={`tap-target-sm inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition ${pad} ${
              on ? 'bg-[#16181A] text-white shadow-sm' : 'text-black/60 hover:text-[#16181A]'
            }`}
          >
            {o.icon && <Icon name={o.icon} size={size === 'sm' ? 14 : 16} className="shrink-0" />}
            {o.label}
            {o.count != null && o.count > 0 && (
              <span className={`ml-0.5 rounded-full px-1.5 min-w-[1.25rem] text-center text-[11px] font-semibold tabular-nums ${
                on ? 'bg-white/20 text-white' : 'bg-black/[0.08] text-[#16181A]'}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
