'use client';

// Rozbalovací panel se vejde na obrazovku, ať ho kotva postaví kamkoli.
//
// Panely se kotví k tlačítku (`absolute right-0` / `left-0`). Na telefonu to
// nestačí: „···" vlevo v hlavičce a panel zarovnaný doprava dřív utekl
// z levého okraje a půlka položek byla mimo obrazovku. Hook panel po otevření
// změří a posune zpátky dovnitř s okrajem 16 px (stejná mezera jako obsah
// stránky), a když je vyšší než místo pod kotvou, dá mu strop a vlastní
// posuv.
//
// Posun jde přes CSS vlastnost `translate`, ne `transform`, aby se nepral
// s animací pop-in, a měří se bez předchozího posunu — po otočení telefonu
// se spočítá znovu od nuly.

import { useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from 'react';

export const OKRAJ_OBRAZOVKY = 16;

export function useVejdiSe(ref: RefObject<HTMLElement | null>, { smer = 'down', aktivni = true }: {
  /** Kam panel roste od kotvy — podle toho se počítá volné místo na výšku. */
  smer?: 'down' | 'up';
  /** Zavřený panel nic neměří. */
  aktivni?: boolean;
} = {}): CSSProperties {
  const [posun, setPosun] = useState<{ x: number; maxH: number | null }>({ x: 0, maxH: null });
  const posunRef = useRef(0);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!aktivni || !el) { posunRef.current = 0; setPosun(p => (p.x === 0 && p.maxH == null ? p : { x: 0, maxH: null })); return; }
    const zmer = () => {
      const r = el.getBoundingClientRect();
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const levy = r.left - posunRef.current;
      const pravy = levy + r.width;
      let x = 0;
      if (levy < OKRAJ_OBRAZOVKY || r.width > vw - 2 * OKRAJ_OBRAZOVKY) x = OKRAJ_OBRAZOVKY - levy;
      else if (pravy > vw - OKRAJ_OBRAZOVKY) x = vw - OKRAJ_OBRAZOVKY - pravy;
      const volno = smer === 'up' ? r.bottom - OKRAJ_OBRAZOVKY : vh - r.top - OKRAJ_OBRAZOVKY;
      const maxH = r.height > volno ? Math.max(160, Math.floor(volno)) : null;
      posunRef.current = x;
      setPosun(p => (p.x === x && p.maxH === maxH ? p : { x, maxH }));
    };
    zmer();
    window.addEventListener('resize', zmer);
    return () => window.removeEventListener('resize', zmer);
  }, [ref, smer, aktivni]);

  return {
    ...(posun.x ? { translate: `${posun.x}px 0` } : {}),
    ...(posun.maxH ? { maxHeight: posun.maxH, overflowY: 'auto' } : {}),
  };
}
