'use client';

import React from 'react';
import { Menu, type MenuItem } from './Menu';

// Hlavička obrazovky — jedna pro všechny.
//
// Vlevo název a jeden řádek kontextu („190 položek · hodnota zásob 365 897 Kč").
// Vpravo nejvýš: dvě vedlejší akce (jen na monitoru), menu „···" a jedna
// hlavní akce. Na telefonu jdou vedlejší akce do menu a hlavní zůstane.
// Dřív měla každá obrazovka svůj nadpis (osm variant) a svou řadu tlačítek.

export function PageHeader({ title, subtitle, primary, secondary, menu, aside, className = '' }: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Jedna hlavní akce — typicky <Button variant="accent">. */
  primary?: React.ReactNode;
  /** Nejvýš dvě vedlejší akce; na telefonu se schovají do menu (viz `menu`). */
  secondary?: React.ReactNode;
  /** Položky do „···". Na telefonu se sem přidají i vedlejší akce, pokud je dodáš znovu tady. */
  menu?: MenuItem[];
  /** Přepínač nebo filtr pod hlavičkou (Segmented, chipy). */
  aside?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1 basis-[14rem]">
          <h1 className="t-page text-balance">{title}</h1>
          {subtitle && <p className="t-meta mt-1.5 max-w-[70ch] text-pretty">{subtitle}</p>}
        </div>
        {(primary || secondary || (menu && menu.length > 0)) && (
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {secondary && <div className="hidden md:flex items-center gap-2">{secondary}</div>}
            {menu && menu.length > 0 && <Menu items={menu} />}
            {primary}
          </div>
        )}
      </div>
      {aside}
    </div>
  );
}

export default PageHeader;
