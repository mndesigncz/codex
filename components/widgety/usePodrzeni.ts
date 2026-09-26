'use client';

// Podržení na ploše (kolo 68, spec §4.2).
//
// Podržet widget 500 ms = kontextové menu, podržet prázdné místo = rovnou
// režim úprav. Na iPhonu je to jediná cesta, jak se k úpravám dostat bez
// hledání tlačítka, a zároveň nejcitlivější místo celé plochy: podržení se
// nesmí plést s rolováním (přehled jsou samé widgety, takže skoro každé
// rolování začíná na nějakém), s výběrem textu ani se systémovým menu.
//
// Proto:
//  - promáčknutí (.98) až po 100 ms — skoro každé rolování ujede přes 10 px
//    dřív, takže se widget pod prstem při rolování nehýbe;
//  - zrušení pohybem o víc než 10 px, puštěním, `pointercancel`, posunem
//    předka (capture), druhým prstem i ztrátou okna;
//  - po splnění se spolkne následující click, jinak by se po puštění
//    stisklo tlačítko pod prstem;
//  - `contextmenu` se na ploše vždy zruší (Android ho posílá při dlouhém
//    stisku); pravé tlačítko myši otevře menu hned, jako všude na desktopu.
//
// Hodnoty jsou v lib/widgety/konstanty.ts — ladí se na skutečném telefonu
// (spec §8, první riziko), ne tady.

import { useCallback, useEffect, useRef } from 'react';
import type React from 'react';
import { HYSTEREZE_PX, PODRZENI_MS, PROMACKNUTI } from '@/lib/widgety/konstanty';

export interface Podrzeni {
  cil: 'widget' | 'prazdne';
  li: HTMLElement | null;
  instance: string | null;
  /** Bod stisku (clientX/Y). */
  x: number;
  y: number;
  pointerId: number;
  pointerType: string;
}

/** Kde podržení nezačne: pole, editovatelný text, vlastní gesta, chrom plochy (lišta, menu, okna). */
const ZAKAZANO = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-bez-podrzeni], [data-plocha-chrom]';

/** Haptika jen na dotyku a jen tam, kde to prohlížeč umí (iOS Safari volání tiše přeskočí). */
export function vibruj(pointerType: string): void {
  if (pointerType !== 'touch') return;
  try { navigator.vibrate?.(8); } catch { /* nepodporováno */ }
}

export interface VolbyPodrzeni {
  /** V klidu a jen se smiUpravit; v úpravách se místo podržení táhne. */
  aktivni: boolean;
  /** Je cíl „prázdné místo" plochy (mezery mřížky, pruh pod ní)? */
  jePrazdne: (cil: Element) => boolean;
  /** Stisk, ze kterého může být podržení — čas přednačíst jádro úprav. */
  onZacatek?: () => void;
  onSplneno: (p: Podrzeni) => void;
  /** Prst se po splnění (menu už je otevřené) pohnul o víc než 10 px — pokračování tahem (spec §4.3). */
  onPohybPoSplneni?: (p: Podrzeni, e: PointerEvent) => void;
  /** Pravé tlačítko myši (nebo klávesová zkratka menu) na widgetu. */
  onPraveTlacitko: (p: Podrzeni) => void;
}

interface Drzeni {
  p: Podrzeni;
  splneno: boolean;
  pokracovano: boolean;
  mer: HTMLElement | null;
  t100: ReturnType<typeof setTimeout> | null;
  t500: ReturnType<typeof setTimeout> | null;
  ukonci: () => void;
}

export function usePodrzeni(o: VolbyPodrzeni) {
  const oRef = useRef(o);
  oRef.current = o;
  const drzeni = useRef<Drzeni | null>(null);
  /** Poslední dotyk — contextmenu, které po něm přijde, je z dlouhého stisku, ne z myši. */
  const posledniDotyk = useRef(0);

  const zrus = useCallback(() => {
    const d = drzeni.current;
    if (!d) return;
    drzeni.current = null;
    if (d.t100) clearTimeout(d.t100);
    if (d.t500) clearTimeout(d.t500);
    d.mer?.removeAttribute('data-drzim');
    d.ukonci();
  }, []);

  useEffect(() => { if (!o.aktivni) zrus(); }, [o.aktivni, zrus]);
  useEffect(() => zrus, [zrus]);

  /**
   * Po splnění spolknout click, který přijde s puštěním — tlačítko pod
   * prstem se nesmí stisknout. Pojistka se sundá až s puštěním tohohle
   * prstu (click chodí hned po pointerup), ne dřív: kdo drží dál a pak
   * táhne, puštění přijde až za pár sekund. A nesmí zůstat viset — tah
   * prstem žádný click nepošle a pojistka by spolkla ten příští, skutečný.
   */
  const spolknoutKlik = (pointerId: number) => {
    const spolkni = (e: Event) => { e.preventDefault(); e.stopPropagation(); pryc(); };
    // Po puštění prstu prohlížeč dosílá kompatibilní mousedown/mouseup/click.
    // Ten mousedown by menu, které se právě otevřelo, zavřel (usePopover ho
    // bere jako klepnutí vedle) — zrušený touchend je nepošle vůbec.
    const tlum = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };
    const konec = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      setTimeout(pryc, e.type === 'pointercancel' ? 0 : 60);
    };
    const pojistka = setTimeout(() => pryc(), 15_000);
    const pryc = () => {
      clearTimeout(pojistka);
      window.removeEventListener('click', spolkni, true);
      window.removeEventListener('touchend', tlum, true);
      window.removeEventListener('pointerup', konec, true);
      window.removeEventListener('pointercancel', konec, true);
    };
    window.addEventListener('click', spolkni, true);
    window.addEventListener('touchend', tlum, { capture: true, passive: false });
    window.addEventListener('pointerup', konec, true);
    window.addEventListener('pointercancel', konec, true);
  };

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const opt = oRef.current;
    if (e.pointerType === 'touch') posledniDotyk.current = Date.now();
    // Druhý prst podržení ruší (štípnutí, rolování dvěma prsty).
    if (drzeni.current) { zrus(); return; }
    if (!opt.aktivni || !e.isPrimary || e.button !== 0) return;
    const cil = e.target as Element;
    if (cil.closest(ZAKAZANO)) return;
    const li = cil.closest<HTMLElement>('li[data-widget]');
    // Uvnitř nástroje v klidu ne: seznamy mají vlastní dotyková gesta (tažení směn v rozvrhu).
    if (li && li.dataset.widget === 'nastroj') return;
    if (!li && !opt.jePrazdne(cil)) return;
    opt.onZacatek?.();

    const p: Podrzeni = {
      cil: li ? 'widget' : 'prazdne', li, instance: li?.dataset.instance ?? null,
      x: e.clientX, y: e.clientY, pointerId: e.pointerId, pointerType: e.pointerType,
    };
    const mer = li?.querySelector<HTMLElement>('.w-mer') ?? null;

    const pohyb = (ev: PointerEvent) => {
      const d = drzeni.current;
      if (!d || ev.pointerId !== p.pointerId) return;
      if (Math.hypot(ev.clientX - p.x, ev.clientY - p.y) <= HYSTEREZE_PX) return;
      if (!d.splneno) { zrus(); return; }
      if (!d.pokracovano) {
        d.pokracovano = true;
        // Tah teď přebírá plocha (a její tah) — podržení končí, click se spolkne dál.
        const ukonceni = d.ukonci;
        drzeni.current = null;
        ukonceni();
        opt.onPohybPoSplneni?.(p, ev);
      }
    };
    const pusteni = (ev: PointerEvent) => { if (ev.pointerId === p.pointerId) zrus(); };
    const posun = () => { if (!drzeni.current?.splneno) zrus(); };
    const ztrata = () => zrus();

    window.addEventListener('pointermove', pohyb, { passive: true });
    window.addEventListener('pointerup', pusteni);
    window.addEventListener('pointercancel', pusteni);
    window.addEventListener('scroll', posun, { capture: true, passive: true });
    window.addEventListener('blur', ztrata);
    const ukonci = () => {
      window.removeEventListener('pointermove', pohyb);
      window.removeEventListener('pointerup', pusteni);
      window.removeEventListener('pointercancel', pusteni);
      window.removeEventListener('scroll', posun, { capture: true });
      window.removeEventListener('blur', ztrata);
    };

    const d: Drzeni = { p, splneno: false, pokracovano: false, mer, t100: null, t500: null, ukonci };
    d.t100 = mer ? setTimeout(() => mer.setAttribute('data-drzim', ''), PROMACKNUTI.odMs) : null;
    d.t500 = setTimeout(() => {
      d.splneno = true;
      d.t500 = null;
      // Zpátky na 1 a haptika ve stejném snímku jako otevření menu (apple-design §13).
      mer?.removeAttribute('data-drzim');
      spolknoutKlik(p.pointerId);
      vibruj(p.pointerType);
      oRef.current.onSplneno(p);
    }, PODRZENI_MS);
    drzeni.current = d;
  }, [zrus]);

  const onContextMenu = useCallback((e: React.MouseEvent) => {
    const opt = oRef.current;
    if (!opt.aktivni) return;
    const cil = e.target as Element;
    if (cil.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-plocha-chrom]')) return;
    const li = cil.closest<HTMLElement>('li[data-widget]');
    if (!li && !opt.jePrazdne(cil)) return;
    // Systémové menu na ploše nikdy: Android ho posílá při dlouhém stisku
    // a přes naše menu by vyskočilo jeho.
    e.preventDefault();
    // Dotyk: menu otevře časovač podržení, ne contextmenu (to by ho otevřelo dvakrát).
    if (drzeni.current || Date.now() - posledniDotyk.current < 1500) return;
    if (!li || li.dataset.widget === 'nastroj') return;
    opt.onPraveTlacitko({
      cil: 'widget', li, instance: li.dataset.instance ?? null,
      x: e.clientX, y: e.clientY, pointerId: -1, pointerType: 'mouse',
    });
  }, []);

  return { onPointerDown, onContextMenu, zrus };
}

export default usePodrzeni;
