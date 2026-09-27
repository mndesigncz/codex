'use client';

import React from 'react';
import { Icon } from '../Icons';

// Avatar člověka. Lidé si v nastavení vybírají emoji — to je jejich obsah
// a zůstává. Náhrada za chybějící avatar ale nebude další emoji (👤 vypadá
// na každém telefonu jinak), nýbrž kreslená silueta v barvě systému.

const SIZES = {
  xs: { box: 'h-6 w-6', text: 'text-xs', icon: 12, pismo: 'text-[11px]' },
  sm: { box: 'h-8 w-8', text: 'text-base', icon: 15, pismo: 'text-[12px]' },
  md: { box: 'h-10 w-10', text: 'text-xl', icon: 18, pismo: 'text-[13px]' },
  lg: { box: 'h-14 w-14', text: 'text-3xl', icon: 24, pismo: 'text-[18px]' },
  xl: { box: 'h-20 w-20', text: 'text-5xl', icon: 34, pismo: 'text-[26px]' },
} as const;

/**
 * Iniciály ze jména: „Martin Nemeškal" → „MN", „Martin" → „MA".
 * U víc slov bereme první a poslední (u „Jana Nováková Dvořáková" je to
 * příjmení, podle kterého ji tým zná). Znaky, které nejsou písmena
 * (závorky, pomlčky, číslice), vynecháváme, ať v kruhu nesvítí „(" nebo „–".
 * Array.from místo indexu, ať se neroztrhne znak mimo BMP.
 */
export function inicialy(jmeno: string | null | undefined): string {
  const slova = (jmeno ?? '').split(/\s+/)
    .map(w => Array.from(w).filter(z => /\p{L}/u.test(z)))
    .filter(w => w.length > 0);
  if (slova.length === 0) return '';
  const vysledek = slova.length === 1
    ? slova[0].slice(0, 2).join('')
    : slova[0][0] + slova[slova.length - 1][0];
  return vysledek.toLocaleUpperCase('cs-CZ');
}

export function Avatar({ emoji, name, size = 'md', ring = true, className = '', title }: {
  emoji?: string | null;
  /** Jméno člověka — když nemá emoji, kruh ukáže jeho iniciály místo siluety.
   *  Počítá se s tím, že jméno stojí vedle kruhu: kruh je proto pro odečítač
   *  skrytý (jinak by přečetl „MN, Martin Nemeškal"). Stojí-li avatar sám,
   *  patří mu `title` — ten se pak stane jeho přístupným jménem (role img). */
  name?: string | null;
  size?: keyof typeof SIZES;
  ring?: boolean;
  className?: string;
  title?: string;
}) {
  const s = SIZES[size];
  const has = !!(emoji && emoji.trim());
  // Emoji má přednost: je to obsah, který si člověk vybral sám.
  const zkratka = has ? '' : inicialy(name);
  return (
    // S `title` je kruh obrázek se jménem: `role="img"` + `aria-label`, obsah
    // (emoji, iniciály, silueta) skrytý. Bez toho by odečítač přečetl textový
    // obsah „MN" a title nanejvýš jako popis navíc — tedy „MN, Martin
    // Nemeškal", přesně to dvojí čtení, kterému má `name` bránit.
    <span
      title={title}
      role={title ? 'img' : undefined}
      aria-label={title || undefined}
      aria-hidden={title ? undefined : true}
      className={`inline-flex shrink-0 items-center justify-center rounded-full select-none leading-none ${s.box} ${
        zkratka ? `${s.pismo} font-semibold tracking-tight` : s.text
      } ${
        ring ? 'ring-1 ring-black/10' : ''
      } ${has ? 'bg-white/60' : zkratka ? 'bg-black/[0.06] text-black/60' : 'bg-black/[0.06] text-black/45'} ${className}`}
    >
      <span aria-hidden className="contents">{has ? emoji : zkratka ? zkratka : <Icon name="user" size={s.icon} />}</span>
    </span>
  );
}

export default Avatar;
