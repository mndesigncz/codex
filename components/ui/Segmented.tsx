'use client';

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';

// Přepínač pohledů (Seznam / Týden, Rozvrh / Kalendář / Typy směn…).
// Vybraná položka je tmavá — stejně jako v postranní liště a doku, takže
// „vybráno" vypadá v celé aplikaci stejně a nikdy jako tlačítko akce.
//
// Tmavá pilulka je jeden prvek, který PŘEJÍŽDÍ mezi položkami, ne barva,
// která se na jedné položce vypne a na druhé zapne. Přechod pak čte oko jako
// pohyb jedné věci — stejný trik, jakým iOS animuje segmentované ovládání.
//
// Vždy jeden řádek. Co se nevejde, jede do strany prstem (slider) — dřív se
// šest a víc položek na telefonu zalomilo na dva řádky a přepínač vypadal
// jako hromádka textu, ne jako jedna ovládací lišta. Že je kus mimo, prozradí
// vyblednutý okraj a vybraná položka se sama posune do záběru.

export interface SegmentedOption<T extends string = string> {
  id: T;
  label: string;
  icon?: string;
  /** Malý počet vpravo od názvu („Ke schválení 3"). */
  count?: number;
}

/** Šířka vyblednutí okraje, když za ním ještě něco je. */
const FADE = 28;

export function Segmented<T extends string>({ options, value, onChange, size = 'md', className = '', ariaLabel }: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
}) {
  const pad = size === 'sm' ? 'px-3 py-1.5 text-xs' : 'px-4 py-2 text-sm';
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [okraje, setOkraje] = useState({ vlevo: false, vpravo: false });

  const zmerOkraje = useCallback(() => {
    const list = listRef.current;
    if (!list) return;
    const vlevo = list.scrollLeft > 1;
    const vpravo = list.scrollLeft + list.clientWidth < list.scrollWidth - 1;
    setOkraje(o => (o.vlevo === vlevo && o.vpravo === vpravo ? o : { vlevo, vpravo }));
  }, []);

  // Poloha pilulky se měří z DOM: písmo i šířka se mění za běhu. Pilulka je
  // uvnitř posuvného pásu, takže jede s obsahem a scroll ji nerozhodí.
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>('[data-on="true"]');
      if (!el) { setPill(null); zmerOkraje(); return; }
      setPill({ x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight });
      zmerOkraje();
    };
    measure();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(list);
    return () => ro?.disconnect();
  }, [value, options, size, zmerOkraje]);

  // Vybraná položka do záběru — jen vodorovně a jen v pásu. scrollIntoView
  // by posunul i celou stránku, když je přepínač zrovna mimo obrazovku.
  useLayoutEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[data-on="true"]');
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    const zacatek = el.offsetLeft - FADE;
    const konec = el.offsetLeft + el.offsetWidth + FADE;
    if (zacatek < list.scrollLeft) list.scrollLeft = Math.max(0, zacatek);
    else if (konec > list.scrollLeft + list.clientWidth) list.scrollLeft = konec - list.clientWidth;
    zmerOkraje();
  }, [value, zmerOkraje]);

  const maska = okraje.vlevo || okraje.vpravo
    ? `linear-gradient(to right, ${okraje.vlevo ? 'transparent' : '#000'} 0, #000 ${okraje.vlevo ? FADE : 0}px, #000 calc(100% - ${okraje.vpravo ? FADE : 0}px), ${okraje.vpravo ? 'transparent' : '#000'} 100%)`
    : undefined;

  return (
    <div className={`inline-flex max-w-full min-w-0 rounded-full glass border border-black/[0.07] ${className}`}>
      <div ref={listRef} role="tablist" aria-label={ariaLabel} onScroll={zmerOkraje}
        style={maska ? { WebkitMaskImage: maska, maskImage: maska } : undefined}
        // snap-x: po švihnutí prstem se pás zastaví na hraně položky, ne
        // uprostřed slova. overscroll-x-contain: dojetí na konec nepřepne
        // stránku gestem zpět v Safari.
        className="relative flex gap-1 p-1 min-w-0 overflow-x-auto overscroll-x-contain snap-x snap-proximity scrollbar-none rounded-full">
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
              type="button"
              role="tab"
              aria-selected={on}
              data-on={on ? 'true' : undefined}
              onClick={() => onChange(o.id)}
              className={`tap-target-sm relative z-[1] shrink-0 snap-start inline-flex items-center gap-1.5 rounded-full font-medium whitespace-nowrap transition-colors duration-200 ${pad} ${
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
    </div>
  );
}

export default Segmented;
