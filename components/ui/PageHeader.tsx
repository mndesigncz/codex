'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { Menu, type MenuItem } from './Menu';

// Hlavička obrazovky — jedna pro všechny.
//
// Vlevo název a jeden řádek kontextu („190 položek · hodnota zásob 365 897 Kč").
// Vpravo nejvýš: dvě vedlejší akce (jen na monitoru), menu „···" a jedna
// hlavní akce. Na telefonu jdou vedlejší akce do menu a hlavní zůstane.
// Dřív měla každá obrazovka svůj nadpis (osm variant) a svou řadu tlačítek.

export function PageHeader({ title, subtitle, hintId, primary, secondary, menu, aside, className = '', as: Nadpis = 'h1' }: {
  title: React.ReactNode;
  /**
   * Úroveň nadpisu. Obrazovka má jeden `h1`; když se jedna obrazovka
   * vykresluje uvnitř druhé (Dostupnost pod Mými směnami), ta vnořená
   * musí být `h2`. Dva `h1` na stránce znamenají, že kdo se pohybuje
   * po nadpisech, nepozná, která je ta hlavní.
   */
  as?: 'h1' | 'h2';
  subtitle?: React.ReactNode;
  /**
   * Klíč, pod kterým si pamatujeme, že člověk tenhle vysvětlující řádek
   * zavřel. Název obrazovky zůstává vždycky — ten je orientace. Vysvětlení
   * „co se tu dělá" ale po roce používání nikdo nečte, jen zabírá první
   * obrazovku. S klíčem jde zavřít křížkem a vrátit v Nastavení → Vzhled.
   */
  hintId?: string;
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
  // Server localStorage nezná, tak se první vykreslení tváří „ukaž"
  // a schová se až v prohlížeči — jinak by neseděla hydratace.
  const [subtitleHidden, setSubtitleHidden] = useState(false);
  useEffect(() => {
    if (!hintId) return;
    const read = () => {
      try {
        setSubtitleHidden(localStorage.getItem('managero-hint-' + hintId) === '1'
          || localStorage.getItem('managero-hints-off') === '1');
      } catch { setSubtitleHidden(false); }
    };
    read();
    window.addEventListener('managero-hints-changed', read);
    return () => window.removeEventListener('managero-hints-changed', read);
  }, [hintId]);

  const showSubtitle = subtitle && !(hintId && subtitleHidden);

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div className="min-w-0 sm:flex-1">
          <Nadpis className="t-page text-balance">{title}</Nadpis>
          {showSubtitle && (
            <p className="t-meta mt-1.5 max-w-[70ch] text-pretty group">
              {subtitle}
              {hintId && (
                <button type="button"
                  onClick={() => { try { localStorage.setItem('managero-hint-' + hintId, '1'); } catch { /* soukromý režim */ } setSubtitleHidden(true); }}
                  aria-label="Skrýt tenhle popis"
                  title="Skrýt tenhle popis (vrátit jde v Nastavení → Vzhled)"
                  className="tap-target-sm ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full align-[-2px] opacity-0 focus-visible:opacity-100 group-hover:opacity-50 hover:!opacity-100 transition">
                  <Icon name="close" size={11} />
                </button>
              )}
            </p>
          )}
        </div>
        {(primary || secondary || (menu && menu.length > 0)) && (
          <div className="flex items-center gap-2 sm:shrink-0 sm:ml-auto">
            {secondary && <div className="hidden md:flex items-center gap-2">{secondary}</div>}
            {menu && menu.length > 0 && <Menu items={menu} />}
            {primary && <div className="flex-1 sm:flex-none flex flex-col sm:flex-row gap-2 [&>*]:w-full sm:[&>*]:w-auto">{primary}</div>}
          </div>
        )}
      </div>
      {aside}
    </div>
  );
}

export default PageHeader;
