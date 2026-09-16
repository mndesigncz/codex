'use client';

import React, { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';

// Přepínač pohledů (Seznam / Týden, Rozvrh / Kalendář / Typy směn…).
// Vybraná položka je tmavá — stejně jako v postranní liště a doku, takže
// „vybráno" vypadá v celé aplikaci stejně a nikdy jako tlačítko akce.
//
// Tmavá pilulka je jeden prvek, který PŘEJÍŽDÍ mezi položkami, ne barva,
// která se na jedné položce vypne a na druhé zapne. Přechod pak čte oko jako
// pohyb jedné věci — stejný trik, jakým iOS animuje segmentované ovládání.

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
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Poloha pilulky se měří z DOM: písmo, zalomení i šířka se mění za běhu.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[data-on="true"]');
      if (!el) { setPill(null); return; }
      setPill({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(list);
    return () => ro?.disconnect();
  }, [value, options, size, wrap]);

  return (
    <div ref={listRef} role="tablist" aria-label={ariaLabel}
      // Ve dvou řádcích potřebuje svislá mezera víc než 4px: pilulka je vysoká
      // 30px, ale `tap-target-sm` jí dotykovou plochu roztáhne na 36, takže při
      // gap-1 se plochy sousedních řádků překrývaly a dotyk mezi nimi padl na
      // řádek pod ním. Vodorovně to nevadí — pilulky jsou širší než 36px, tam
      // se plocha nezvětšuje.
      className={`relative inline-flex max-w-full ${wrap ? 'gap-x-1 gap-y-2' : 'gap-1'} rounded-[22px] glass border border-black/[0.07] p-1 ${wrap ? 'flex-wrap' : 'overflow-x-auto scrollbar-thin rounded-full'} ${className}`}>
      {pill && (
        <span aria-hidden
          className="absolute left-0 top-0 rounded-full bg-[#16181A] shadow-sm pointer-events-none motion-safe:transition-[transform,width,height] motion-safe:duration-[240ms] motion-safe:ease-out"
          style={{ transform: `translate(${pill.x}px, ${pill.y}px)`, width: pill.w, height: pill.h }} />
      )}
      {options.map(o => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            role="tab"
            aria-selected={on}
            data-on={on ? 'true' : undefined}
            onClick={() => onChange(o.id)}
            className={`tap-target-sm relative z-[1] inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-200 ${pad} ${
              on ? `text-white ${pill ? '' : 'bg-[#16181A] shadow-sm'}` : 'text-black/60 hover:text-[#16181A]'
            }`}
          >
            {o.icon && <Icon name={o.icon} size={size === 'sm' ? 14 : 16} className="shrink-0" />}
            {o.label}
            {o.count != null && o.count > 0 && (
              <span className={`ml-0.5 rounded-full px-1.5 min-w-[1.25rem] text-center text-[11px] font-semibold tabular-nums transition-colors duration-200 ${
                on ? 'bg-white/20 text-white' : 'bg-black/[0.08] text-[#16181A]'}`}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export default Segmented;
