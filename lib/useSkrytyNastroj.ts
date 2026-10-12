'use client';

// Je nástroj plochy právě schovaný? Plocha ho v režimu úprav nechává připojený,
// jen v obalu s `hidden` (PlochaWidgetu: „v úpravách sbalený, ale připojený"),
// a nástroj o tom jinak neví — nedostává kontext widgetu.
//
// Potřebuje to plovoucí lišta nástroje (průvodce uzávěrkou, hromadné uložení
// skladu, odeslání dostupnosti): ve schovaném obalu se sice nevykreslí, ale
// PlovouciLista dál měří svou polohu pro toast — z nulového obdélníku vyjde
// výška celého okna a toasty v úpravách by odjely mimo obrazovku. Lišta se
// proto ve schovaném nástroji nekreslí vůbec.
//
// `ref` patří prvku uvnitř nástroje (ne fixnímu). Sleduje se atribut `hidden`
// a `data-upravy` pod nejbližší plochou (jinde pod <body>).

import { useEffect, useState, type RefObject } from 'react';

export function useSkrytyNastroj(ref: RefObject<HTMLElement | null>): boolean {
  const [skryty, setSkryty] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof MutationObserver === 'undefined') return;
    const zmer = () => setSkryty(!!el.closest('[hidden]'));
    zmer();
    const koren = el.closest('[data-plocha]') ?? document.body;
    const mo = new MutationObserver(zmer);
    mo.observe(koren, { attributes: true, subtree: true, attributeFilter: ['hidden', 'data-upravy'] });
    return () => mo.disconnect();
  }, [ref]);
  return skryty;
}
