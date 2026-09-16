'use client';

import React from 'react';
import { Icon } from '../Icons';

// Řádek seznamu Managera 2: vlevo obrázek/ikona, uprostřed titulek a
// meta řádek, vpravo chip nebo hodnota a šipka, když se dá otevřít.
// Seznam = <ul className="list"> se ListRow jako <li>; linky mezi řádky
// kreslí .list, ne každý řádek zvlášť.

export function ListRow({ lead, title, meta, right, onClick, href, chevron, className = '', as }: {
  lead?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
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
      {right && <span className="shrink-0 flex items-center gap-2 text-right">{right}</span>}
      {(chevron ?? interactive) && <Icon name="chevron" size={16} className="shrink-0 -rotate-90 text-black/30" />}
    </>
  );
  const cls = `list-row ${interactive ? 'list-row-tap' : ''} ${className}`;
  if (href) return <Tag className="contents"><a href={href} className={cls}>{inner}</a></Tag>;
  if (onClick) return <Tag className="contents"><button type="button" onClick={onClick} className={`${cls} w-full text-left`}>{inner}</button></Tag>;
  return <Tag className={cls}>{inner}</Tag>;
}

export default ListRow;
