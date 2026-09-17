'use client';

import React from 'react';
import { Icon } from '../Icons';

// Řádek seznamu Managera 2: vlevo obrázek/ikona, uprostřed titulek a
// meta řádek, vpravo číslo, doplněk a akce. Seznam = <ul className="list">
// se ListRow jako <li>; linky mezi řádky kreslí .list, ne každý řádek zvlášť.
//
// Proč pevné šířky u čísel a akcí: dokud si každý řádek sázel vlastní
// grid s `auto` sloupci, skončila každá číselná hodnota na jiném místě —
// 320 b., 140 b. a 880 b. se vodorovně houpaly o desítky pixelů a seznam
// se nedal přečíst očima po sloupci. `auto` se sází v každém řádku zvlášť;
// jediné, co drží sloupec svisle, je pevná šířka a `tabular-nums`.

export function ListRow({
  lead, title, meta, value, valueMeta, aside, actions, right,
  onClick, href, chevron, className = '', as,
}: {
  lead?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Hlavní číslo řádku — sloupec pevné šířky, zarovnaný doprava, tabulkové číslice. */
  value?: React.ReactNode;
  /** Druhý řádek pod číslem (menší, tišší). */
  valueMeta?: React.ReactNode;
  /** Doplňková informace vpravo; na mobilu se schová, ať řádek nekřičí. */
  aside?: React.ReactNode;
  /** Tlačítka řádku. Nejvýš dvě: jedna hlavní a jedna tichá. */
  actions?: React.ReactNode;
  /** Volný pravý slot (chip, stav) pro řádky bez čísla a bez akcí. */
  right?: React.ReactNode;
  onClick?: () => void;
  href?: string;
  /** Šipka vpravo — jen když řádek někam vede. Doplní se sama u onClick/href. */
  chevron?: boolean;
  className?: string;
  as?: 'li' | 'div';
}) {
  const interactive = !!(onClick || href);
  const Tag = (as ?? 'li') as any;
  const inner = (
    <>
      {lead && <span className="shrink-0 flex items-center">{lead}</span>}
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-[15px] leading-snug text-[#16181A] truncate">{title}</span>
        {meta && <span className="block text-[13px] text-black/55 leading-snug mt-0.5 truncate">{meta}</span>}
      </span>
      {/* Ocas řádku. Na počítači je `display: contents`, takže číslo, doplněk
          a akce sedí ve svých svislých sloupcích. Na mobilu se z něj stane
          samostatný druhý řádek — jinak by se na 390 px jméno ořezalo na
          „Pet…" a z přehledného seznamu by zbyla drť. */}
      <span className="list-tail">
        {(value != null || valueMeta != null) && (
          <span className="list-value shrink-0">
            {value != null && <span className="block font-bold text-[15px] leading-snug text-[#16181A]">{value}</span>}
            {valueMeta != null && <span className="block text-[13px] text-black/55 leading-snug mt-0.5">{valueMeta}</span>}
          </span>
        )}
        {aside != null && <span className="list-aside shrink-0 hidden md:block text-[13px] text-black/55">{aside}</span>}
        {right && <span className="shrink-0 flex items-center gap-2 text-right">{right}</span>}
        {actions && <span className="list-actions shrink-0">{actions}</span>}
      </span>
      {(chevron ?? interactive) && <Icon name="chevron" size={16} className="shrink-0 -rotate-90 text-black/30" />}
    </>
  );
  const cls = `list-row ${interactive ? 'list-row-tap' : ''} ${className}`;
  if (href) return <Tag className="contents"><a href={href} className={cls}>{inner}</a></Tag>;
  if (onClick) return <Tag className="contents"><button type="button" onClick={onClick} className={`${cls} w-full text-left`}>{inner}</button></Tag>;
  return <Tag className={cls}>{inner}</Tag>;
}

export default ListRow;
