'use client';

// Volby v okně jako řádky a díly (skladba v4, audit V03) — sdílené pro Navíc, Tresty, Sklad
// a další okna s výběrem z nabídky. Dřív žily v components/navic/NabidkaChipy.tsx.

import type { ReactNode } from 'react';
import { Icon, type IconName } from '../Icons';

/**
 * Volba z nabídky / sazebníku v okně (v4, audit V03). Dřív řada `filter-pill` s `flex-wrap`:
 * každá pilulka jiné šířky, na telefonu zalomené pod sebe → zubatý sloupec se třemi pravými
 * hranami a třetí výškou (36) vedle polí 52. Teď řádek L→R jako pole okna (52, rádius pole):
 * název vlevo (smí se zalomit), dopad vpravo na R (`tabular-nums`, P15). Vybraná je inkoustová
 * (`seg-on`), ostatní šedá jamka jako pole. Řádky pod sebou s mezerou 8 (`VolbyRadky`).
 */
export function VolbaRadek({ vybrano, onClick, titul, hodnota, ikona, disabled, title, vyska = 'l', className = '', ...data }: {
  vybrano: boolean;
  /** l = 52 (okno, jako pole okna), m = 44 (karta na ploše — L patří jen oknu, P8). */
  vyska?: 'm' | 'l';
  onClick: () => void;
  titul: ReactNode;
  /** Dopad / odměna vpravo („−10 b", „20 b · 300 Kč"). */
  hodnota?: ReactNode;
  ikona?: IconName;
  disabled?: boolean;
  title?: string;
  className?: string;
} & { [k: `data-${string}`]: string | number | undefined }) {
  return (
    <button type="button" aria-pressed={vybrano} disabled={disabled} title={title} onClick={onClick} {...data}
      className={`tap-target flex w-full min-w-0 items-center gap-3 rounded-[var(--r-md)] px-4 py-2.5 ${vyska === 'l' ? 'min-h-[var(--h-l)]' : 'min-h-[var(--h-m)]'} text-left text-[0.9375rem] font-medium leading-snug select-none transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] ${vybrano ? 'seg-on' : 'btn-secondary'} ${className}`}>
      {ikona && <Icon name={ikona} size={18} className="shrink-0" />}
      <span className="min-w-0 flex-1 text-pretty">{titul}</span>
      {hodnota != null && hodnota !== '' && <><span className="sr-only"> · </span><span className="shrink-0 text-right tabular-nums">{hodnota}</span></>}
    </button>
  );
}

/**
 * Díl mřížky voleb (dny v týdnu, Všem / Vybraným, lidé, kategorie): krátká volba se stejnou
 * šířkou jako sousedé (`rada rada-rovne` nebo `grid grid-cols-n`) a výškou pole okna 52.
 * `role="tab"` jen tam, kde nahrazuje přepínač pohledu (aria-selected místo aria-pressed).
 */
export function VolbaDil({ vybrano, onClick, children, role, disabled, title, className = '', ...data }: {
  vybrano: boolean; onClick: () => void; children: ReactNode; role?: 'tab'; disabled?: boolean; title?: string; className?: string;
} & { [k: `data-${string}`]: string | number | undefined }) {
  const stav = role === 'tab' ? { role, 'aria-selected': vybrano } : { 'aria-pressed': vybrano };
  return (
    <button type="button" {...stav} disabled={disabled} title={title} onClick={onClick} {...data}
      className={`tap-target flex min-w-0 items-center justify-center rounded-[var(--r-md)] px-2 min-h-[var(--h-l)] text-center text-sm font-medium leading-tight select-none transition-colors disabled:opacity-45 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C8F542] ${vybrano ? 'seg-on' : 'btn-secondary'} ${className}`}>
      <span className="min-w-0 text-pretty [overflow-wrap:anywhere]">{children}</span>
    </button>
  );
}

/** Skupina voleb pod sebou: štítek → 6 → řádky L→R s mezerou 8. */
export function VolbyRadky({ label, ariaLabel, children, className = '', ...data }: {
  label?: ReactNode; ariaLabel: string; children: ReactNode; className?: string;
} & { [k: `data-${string}`]: string | number | undefined }) {
  return (
    <div className={`min-w-0 ${className}`} {...data}>
      {label && <p className="field-label">{label}</p>}
      <div className="sloupec sloupec-2" role="group" aria-label={ariaLabel}>{children}</div>
    </div>
  );
}
