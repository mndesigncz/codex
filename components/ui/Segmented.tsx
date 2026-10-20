'use client';

import React, { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icons';

// Přepínač pohledů (Seznam / Týden, Rozvrh / Kalendář / Typy směn…).
// v3: jemný segment — šedá dráha bez rámečku a v ní bílý jezdec se stínem
// jen náznakem (jako segmentované ovládání iOS). Dřív byl vybraný pohled
// tmavá pilulka, a protože na obrazovce bývá i tmavé tlačítko a tmavý
// filtr, četly se tři inkoustové skvrny jako tři akce. Inkoustová pilulka
// zůstala filtrovacím čipům (`.filter-pill.seg-on`) — segment je pohled,
// čip je výběr.
//
// Jezdec je jeden prvek, který PŘEJÍŽDÍ mezi položkami, ne barva,
// která se na jedné položce vypne a na druhé zapne. Přechod pak čte oko jako
// pohyb jedné věci — stejný trik, jakým iOS animuje segmentované ovládání.
//
// Vždy jeden řádek. Co se nevejde, jede do strany prstem (slider) — dřív se
// šest a víc položek na telefonu zalomilo na dva řádky a přepínač vypadal
// jako hromádka textu, ne jako jedna ovládací lišta. Že je kus mimo, prozradí
// vyblednutý okraj a vybraná položka se sama posune do záběru.
//
// v4 (spec-skladba P11, audit V07): segment buď vyplní šířku L→R (položky
// rovným dílem, `sirka="plna"`, výchozí), nebo — když se nevejde — je to
// posuvný pás, který na telefonu PŘETÉKÁ AŽ K HRANĚ OBRAZOVKY (v kartě a v okně
// zůstává mezi L a R) s vyblednutím 24 px. Dřív měl šířku podle obsahu: stál sám
// na řádku v půlce šířky, nebo končil o 6–8 px před R (Úkoly 363,5, Sklad
// 361,5) a vypadal jako chyba, ne jako posuv. Výška 44 na stránce (md), 36 v kartě (sm).
// `sirka="obsah"` jen tam, kde segment stojí v řadě s jiným prvkem a má být obsahový.
//
// Hranice: Segmented je přepínač pohledu pro pár položek (do pěti — Odměny, Úkoly,
// Vše · Nepřečtené). Navigace mezi víc sekcemi patří na telefonu do svislého seznamu
// s „Zpět" (Nastavení, kolo 6): posuvný pás třinácti sekcí schoval Notifikace i Role
// za okraj obrazovky a nic neprozradilo, že tam jsou.

export interface SegmentedOption<T extends string = string> {
  id: T;
  label: string;
  icon?: string;
  /** Malý počet vpravo od názvu („Ke schválení 3"). */
  count?: number;
}

/** Šířka vyblednutí okraje, když za ním ještě něco je (P11: 24). */
const FADE = 24;
/** Pás přetéká k hraně obrazovky jen na telefonu; na monitoru se posouvá mezi L a R. */
const TELEFON = 640;

export function Segmented<T extends string>({ options, value, onChange, size = 'md', className = '', ariaLabel, sirka = 'plna' }: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (id: T) => void;
  /** md = 44 (segment stránky), sm = 36 (segment v kartě). */
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
  /** plna (výchozí) = L→R, položky rovným dílem; obsah = šířka podle položek (segment v řadě s dalším prvkem). */
  sirka?: 'plna' | 'obsah';
}) {
  // Výška položky 28 / 36 v dráze s odsazením 4 → segment 36 / 44 (stupně S a M).
  const pad = size === 'sm' ? 'h-7 px-3 text-xs' : 'h-9 px-4 text-sm';
  // Segment, který stojí v ŘADĚ s dalším prvkem (flex řádek s viditelným sourozencem — MonthNav,
  // výběr, tlačítko), se nesmí roztáhnout přes celý řádek: vytlačil by souseda za R (finance-uzaverky
  // C7). Tam je to pružný/obsahový díl řady; L→R platí, když stojí na řádku sám.
  const [vRade, setVRade] = useState(false);
  const plna = sirka === 'plna' && !vRade;
  const obalRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [okraje, setOkraje] = useState({ vlevo: false, vpravo: false });
  // O kolik pás přetéká za R k hraně obrazovky (karty), když se položky nevejdou (P11).
  const [presah, setPresah] = useState(0);
  const presahRef = useRef(0);
  presahRef.current = presah;

  useLayoutEffect(() => {
    const obal = obalRef.current, rodic = obal?.parentElement;
    if (!obal || !rodic || sirka !== 'plna') return;
    const cs = getComputedStyle(rodic);
    const radek = /flex/.test(cs.display) && !cs.flexDirection.startsWith('column');
    const soused = radek && Array.from(rodic.children).some(c => c !== obal && (c as HTMLElement).offsetParent !== null
      && getComputedStyle(c).position !== 'absolute');
    setVRade(soused);
  }, [sirka, options.length]);

  // Vejde se? Přirozená šířka položek (obsah + odsazení + mezery) proti šířce, kterou by
  // segment měl bez přesahu. Měří se z obsahu položek, ne ze scrollWidth: ten po přesahu
  // naroste a rozhodnutí by se houpalo sem a tam.
  const zmerPresah = useCallback(() => {
    const obal = obalRef.current, list = listRef.current;
    if (!obal || !list || !plna) { if (presahRef.current) setPresah(0); return; }
    const polozky = Array.from(list.querySelectorAll<HTMLElement>('[role=tab]'));
    if (!polozky.length) return;
    const csP = getComputedStyle(polozky[0]);
    const padP = parseFloat(csP.paddingLeft) + parseFloat(csP.paddingRight);
    const csL = getComputedStyle(list);
    const mezera = parseFloat(csL.columnGap) || 0;
    const potreba = polozky.reduce((s, el) => s + ((el.firstElementChild as HTMLElement | null)?.offsetWidth ?? el.offsetWidth) + padP, 0)
      + mezera * (polozky.length - 1) + parseFloat(csL.paddingLeft) + 4;
    const r = obal.getBoundingClientRect();
    const zakladni = r.width - presahRef.current;
    const pravaBez = r.right - presahRef.current;
    // Přetéká jen segment, který sám končí na R svého rodiče (stojí na celém řádku) —
    // v řadě s dalším prvkem by přesah přelezl souseda.
    const rodic = obal.parentElement;
    const rr = rodic?.getBoundingClientRect();
    const rodicR = rr && rodic ? rr.right - (parseFloat(getComputedStyle(rodic).paddingRight) || 0) - (parseFloat(getComputedStyle(rodic).borderRightWidth) || 0) : pravaBez;
    if (potreba <= zakladni + 0.5 || window.innerWidth >= TELEFON || Math.abs(pravaBez - rodicR) > 1.5) { if (presahRef.current) setPresah(0); return; }
    // Přetéká jen pás v hlavičce stránky (k hraně obrazovky). V kartě, v okně a v buňce plochy
    // (nástroj bez karty) zůstává mezi L a R s vyblednutím: pás uříznutý o linku karty vypadal
    // jako chyba a z buňky plochy nesmí nic vylézt (sondy preteceni-*).
    if (obal.parentElement?.closest('.card, .glass-card, [role=dialog], li[data-widget]')) { if (presahRef.current) setPresah(0); return; }
    const hrana = document.documentElement.clientWidth;
    const novy = Math.max(0, Math.floor(hrana - pravaBez));
    if (novy !== presahRef.current) setPresah(novy);
  }, [plna]);

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
    zmerPresah();
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { zmerPresah(); measure(); }) : null;
    ro?.observe(list);
    if (obalRef.current?.parentElement) ro?.observe(obalRef.current.parentElement);
    return () => ro?.disconnect();
  }, [value, options, size, zmerOkraje, zmerPresah]);

  // Vybraná položka do záběru — jen vodorovně a jen v pásu. scrollIntoView
  // by posunul i celou stránku, když je přepínač zrovna mimo obrazovku.
  useLayoutEffect(() => {
    const list = listRef.current;
    const el = list?.querySelector<HTMLElement>('[data-on="true"]');
    if (!list || !el || list.scrollWidth <= list.clientWidth) return;
    // O kus víc než šířka vyblednutí, ať okraj pilulku nepřekrývá.
    const zacatek = el.offsetLeft - FADE - 8;
    const konec = el.offsetLeft + el.offsetWidth + FADE + 8;
    if (zacatek < list.scrollLeft) list.scrollLeft = Math.max(0, zacatek);
    else if (konec > list.scrollLeft + list.clientWidth) list.scrollLeft = konec - list.clientWidth;
    zmerOkraje();
  }, [value, zmerOkraje]);

  const maska = okraje.vlevo || okraje.vpravo
    ? `linear-gradient(to right, ${okraje.vlevo ? 'transparent' : '#000'} 0, #000 ${okraje.vlevo ? FADE : 0}px, #000 calc(100% - ${okraje.vpravo ? FADE : 0}px), ${okraje.vpravo ? 'transparent' : '#000'} 100%)`
    : undefined;

  return (
    <div ref={obalRef} data-presah={presah ? '' : undefined}
      // Šířka navíc (ne záporný okraj): okraj by zmenšil vnější rozměr a v zalamované řadě
      // by na týž řádek vylezl soused. flex-shrink 0, ať ho řada nesmrskne zpátky.
      style={presah ? { width: `calc(100% + ${presah}px)`, maxWidth: 'none', flexShrink: 0 } : undefined}
      className={`${plna ? 'seg-plna flex' : 'inline-flex max-w-full'} min-w-0 seg-draha ${presah ? 'rounded-l-full' : 'rounded-full'} ${className}`}>
      <div ref={listRef} role="tablist" aria-label={ariaLabel} onScroll={zmerOkraje}
        style={{ ...(maska ? { WebkitMaskImage: maska, maskImage: maska } : {}), ...(presah ? { paddingRight: presah + 4 } : {}) }}
        // snap-x: po švihnutí prstem se pás zastaví na hraně položky, ne
        // uprostřed slova. overscroll-x-contain: dojetí na konec nepřepne
        // stránku gestem zpět v Safari.
        className={`relative ${plna ? 'seg-plna-pas flex-1' : 'flex'} gap-1 p-1 min-w-0 overflow-x-auto overscroll-x-contain snap-x snap-proximity scrollbar-none ${presah ? 'rounded-l-full' : 'rounded-full'}`}>
        {pill && (
          <span aria-hidden
            className="absolute left-0 top-0 rounded-full seg-jezdec pointer-events-none motion-safe:transition-[transform,width,height] motion-safe:duration-[240ms] motion-safe:ease-out"
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
              className={`tap-target-sm relative z-[1] shrink-0 snap-start inline-flex items-center justify-center rounded-full font-medium whitespace-nowrap transition-colors duration-200 ${pad} ${
                on ? `seg-vybrano ${pill ? '' : 'seg-jezdec'}` : 'text-black/60 hover:text-[#16181A]'
              }`}
            >
              {/* Obsah v jednom obalu: podle jeho šířky se měří, jestli se pás vejde (zmerPresah). */}
              <span className="inline-flex items-center gap-1.5">
                {o.icon && <Icon name={o.icon} size={size === 'sm' ? 14 : 16} className="shrink-0" />}
                {o.label}
                {o.count != null && o.count > 0 && (
                  <span className={`ml-0.5 rounded-full px-1.5 min-w-[1.25rem] text-center text-[11px] font-semibold tabular-nums transition-colors duration-200 ${
                    'bg-black/[0.08] text-[#16181A]'}`}>{o.count}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default Segmented;
