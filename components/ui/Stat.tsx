'use client';

import React, { useLayoutEffect, useRef } from 'react';
import { Icon } from '../Icons';

// Číslo s popiskem. Jedna podoba statistiky pro přehledy, věrnost, finance
// i kiosk: štítek nahoře, číslo velké a pevné, poznámka dole. Ikona je
// volitelná a sedí vpravo v tónovaném kolečku.
//
// Číslo se nezalamuje („12 400 Kč" drží pevné mezery) a nezkracuje — částka
// s „…" by lhala. Když se do sloupce nevejde (dva sloupce na 320 px mají po
// 100 px, číslo o 28 px má 130), zmenší se o stupeň typografické škály
// (28 → 18 → 14 px), a v řadě StatRow všechna čísla stejně: „850 Kč" velké
// vedle malého „12 400 Kč" by vypadalo jako jiná důležitost. CSS to samo
// neumí (kontejnerový dotaz by zmenšil i tam, kde se číslo vejde), proto
// měření v prohlížeči; stupeň nese `data-tesne` na obalu (globals.css).

const STUPNE = ['1', '2'] as const;

/** Zmenší čísla v obalu (jeden Stat, nebo celá řada StatRow) o stupeň, dokud přetékají. */
function srovnejCisla(obal: HTMLElement) {
  const cisla = Array.from(obal.querySelectorAll<HTMLElement>('.stat-hodnota'));
  obal.removeAttribute('data-tesne');
  for (const stupen of STUPNE) {
    // Čtení scrollWidth po změně atributu vynutí nové rozvržení — měří se už zmenšené písmo.
    if (!cisla.some(c => c.scrollWidth > c.clientWidth + 1)) return;
    obal.setAttribute('data-tesne', stupen);
  }
}

/**
 * Po vykreslení a při každé změně šířky srovná čísla v nejbližší řadě
 * (`[data-statrow]`), nebo jen v tomhle Stat, když v řadě není. Změna písma
 * jde přes requestAnimationFrame, ne přímo v obsluze ResizeObserveru — ten
 * by jinak hlásil „loop completed with undelivered notifications", protože
 * menší písmo změní výšku pozorovaného obalu.
 */
function useSrovnaniCisel(ref: React.RefObject<HTMLDivElement | null>, zavislosti: React.DependencyList) {
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obal = el.closest<HTMLElement>('[data-statrow]') ?? el;
    srovnejCisla(obal);
    if (typeof ResizeObserver === 'undefined') return;
    let snimek = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(snimek);
      snimek = requestAnimationFrame(() => srovnejCisla(obal));
    });
    ro.observe(obal);
    return () => { cancelAnimationFrame(snimek); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, zavislosti);
}

export function Stat({ label, value, unit, note, icon, tone = 'muted', className = '' }: {
  label: React.ReactNode; value: React.ReactNode; unit?: React.ReactNode; note?: React.ReactNode;
  icon?: string; tone?: 'ok' | 'wait' | 'bad' | 'info' | 'muted'; className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useSrovnaniCisel(ref, [value, unit]);
  return (
    <div ref={ref} className={`min-w-0 ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="t-label truncate">{label}</p>
        {icon && <span className={`chip chip-${tone} !rounded-full !px-0 h-8 w-8 justify-center shrink-0`}><Icon name={icon} size={15} /></span>}
      </div>
      <p className="stat-hodnota mt-1.5 leading-none font-bold tracking-tight tabular-nums text-[#16181A]">
        {value}{unit && <span className="stat-jednotka ml-1 font-medium text-black/45">{unit}</span>}
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
 *
 * `data-statrow`: čísla v řadě se při nedostatku místa zmenšují společně (viz Stat).
 */
export function StatRow({ children, className = '', podleKarty = false }: { children: React.ReactNode; className?: string; podleKarty?: boolean }) {
  // Widget bývá na tabletu a počítači jen v půlce řádku: okno je široké, ale karta ne, a tři čísla vedle sebe
  // („12 400 Kč  850 Kč") se pak dotýkala. `podleKarty` skládá sloupce podle šířky karty, ne okna (container query).
  if (podleKarty) return <div data-statrow className={`statrow-karta ${className}`}><div className="statrow-karta-v">{children}</div></div>;
  return (
    <div data-statrow className={[
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
