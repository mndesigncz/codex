'use client';

import React, { useEffect, useState } from 'react';
import { Icon } from '../Icons';
import { Menu, type MenuItem } from './Menu';
import { useT } from '@/lib/i18n/client';

// Hlavička obrazovky — jedna pro všechny.
//
// Vlevo název (jediný h1, 32 px) a jeden řádek kontextu („190 položek ·
// hodnota zásob 365 897 Kč"). Vpravo nejvýš: dvě vedlejší akce (jen na
// monitoru), menu „···" a jedna hlavní akce. Na telefonu jdou vedlejší akce
// do menu, „···" zůstane vedle nadpisu a hlavní akce pod ním přes šířku.
// Dřív měla každá obrazovka svůj nadpis (osm variant) a svou řadu tlačítek.

export function PageHeader({ title, subtitle, hintId, primary, secondary, menu, menuMobile, aside, className = '', as: Nadpis = 'h1' }: {
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
  /**
   * Položky „···" jen pod `md`, kde se vedlejší akce schovají — typicky
   * zopakovaná vedlejší akce. Na monitoru by „···" jen opakovalo tlačítko
   * vedle sebe; když stránka nemá vlastní `menu`, na monitoru „···" vůbec není.
   */
  menuMobile?: MenuItem[];
  /** Přepínač nebo filtr pod hlavičkou (Segmented, chipy). */
  aside?: React.ReactNode;
  className?: string;
}) {
  const t = useT('spolecne');
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
  const maMenu = !!menu && menu.length > 0;
  const maMenuMobil = !!menuMobile && menuMobile.length > 0;
  const maAkce = !!(secondary || maMenu || maMenuMobil);

  // v3: jeden velký nadpis vlevo a vedle něj tiché akce v šedých kruzích
  // („···", vedlejší akce od md). Hlavní (limetková) akce stojí na monitoru
  // v téže řadě úplně vpravo; na telefonu se přes `order` odlomí pod nadpis
  // na celou šířku — palec ji najde a „···" zůstane u nadpisu, kam patří.
  // Dřív stálo na telefonu „···" osamocené vlevo pod nadpisem vedle limetky.
  // Jeden DOM, žádné zdvojené tlačítko: sondy počítají limetky na stránce.
  return (
    <div className={`space-y-5 ${className}`}>
      {/* Akce se zalamují (iPad 768 px s postranní lištou má na obsah 448 px
          a tři tlačítka s menu přes 480) a drží se vpravo; název (`flex-1`)
          se nikdy nesmrskne na nulu — má minimální šířku a akce jdou pod něj. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-4">
        <div className="min-w-0 flex-1 basis-[12rem]">
          <Nadpis className="t-page text-balance">{title}</Nadpis>
          {showSubtitle && (
            <p className="mt-2 max-w-[70ch] text-[15px] leading-snug text-black/60 text-pretty group">
              {subtitle}
              {hintId && (
                <button type="button"
                  onClick={() => { try { localStorage.setItem('managero-hint-' + hintId, '1'); } catch { /* soukromý režim */ } setSubtitleHidden(true); }}
                  aria-label={t('Skrýt tenhle popis')}
                  title={t('Skrýt tenhle popis (vrátit jde v Nastavení → Vzhled)')}
                  className="tap-target-sm ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full align-[-2px] opacity-0 focus-visible:opacity-100 group-hover:opacity-50 hover:!opacity-100 transition">
                  <Icon name="close" size={11} />
                </button>
              )}
            </p>
          )}
        </div>
        {maAkce && (
          // Vedlejší akce + „···" mají v němčině přes 300 px — zalamují se mezi sebou a drží se vpravo.
          <div className="flex flex-wrap items-center justify-end gap-2 min-w-0 max-w-full ml-auto">
            {secondary && <div className="hidden md:flex flex-wrap items-center justify-end gap-2">{secondary}</div>}
            {maMenuMobil ? (
              <>
                <div className="md:hidden"><Menu items={[...(menu ?? []), ...menuMobile!]} /></div>
                {maMenu && <div className="hidden md:block"><Menu items={menu!} /></div>}
              </>
            ) : maMenu && <Menu items={menu!} />}
          </div>
        )}
        {primary && (
          <div className="max-sm:order-last max-sm:basis-full sm:ml-auto sm:flex-none flex flex-col sm:flex-row gap-2 [&>*]:w-full sm:[&>*]:w-auto">{primary}</div>
        )}
      </div>
      {aside}
    </div>
  );
}

export default PageHeader;
