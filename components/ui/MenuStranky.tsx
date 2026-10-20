'use client';

import React, { createContext, useContext, useId, useLayoutEffect, useMemo, useState } from 'react';
import { Menu, type MenuItem } from './Menu';

// „···" jen JEDNOU na obrazovce (spec-skladba P18, vzor V0).
//
// Do v3 měla horní lišta svoje „···" (Účtenky, Managero client, TO GO) a hlavička
// stránky (PageHeader) druhé hned pod ním (Upravit stránku, Export…): na Úkolech,
// ve Skladu, Týmu, Rozvrhu i Uzávěrkách dvě stejná kolečka nad sebou. P18 dovoluje
// jedno z dvojího — v liště, nebo v hlavičce. Platí: **má-li stránka vlastní „···",
// nese ho hlavička a přibírá do něj (pod linku) položky lišty; lišta své „···" na té
// obrazovce nekreslí.** Stránka bez vlastních akcí (Chat, Nastavení…) má „···" v liště.
// Žádná funkce nezmizí, jen se nezdvojuje kolečko.
//
// Proč hlavička, ne lišta: „···" hlavičky je akce obrazovky (Upravit stránku, Export) —
// patří k nadpisu a k ploše, kde ho hledá i klávesnice a odečítač; položky lišty
// (přepnutí režimu, Účtenky) jsou doplněk a v nabídce stojí pod linkou.

interface Lista {
  /** Položky „···" lišty — hlavička s vlastním „···" je přibere pod linku. */
  polozky: MenuItem[];
  /** Hlavička ohlásí, že „···" převzala: 'vzdy' = na každé šířce, 'mobil' = jen pod md (má jen položky menuMobile). */
  prevzit: (id: string, jak: 'vzdy' | 'mobil' | null) => void;
}

const ListaCtx = createContext<Lista | null>(null);
const PrevzatoCtx = createContext<'vzdy' | 'mobil' | null>(null);

/**
 * Obal layoutu s horní lištou. `polozky` = co nabízí „···" lišty (Účtenky, Managero client, TO GO).
 * Lišta pak místo vlastního `<Menu>` kreslí `<MenuListy>`, který se schová, když „···" převzala hlavička.
 */
export function MenuStrankyProvider({ polozky = [], children }: { polozky?: MenuItem[]; children: React.ReactNode }) {
  const [mapa, setMapa] = useState<ReadonlyMap<string, 'vzdy' | 'mobil'>>(() => new Map());
  const api = useMemo<Lista>(() => ({
    polozky,
    prevzit: (id, jak) => setMapa(m => {
      if ((m.get(id) ?? null) === jak) return m;
      const n = new Map(m);
      if (jak) n.set(id, jak); else n.delete(id);
      return n;
    }),
  }), [polozky]);
  const hodnoty = [...mapa.values()];
  const prevzato = hodnoty.includes('vzdy') ? 'vzdy' : hodnoty.includes('mobil') ? 'mobil' : null;
  return <ListaCtx.Provider value={api}><PrevzatoCtx.Provider value={prevzato}>{children}</PrevzatoCtx.Provider></ListaCtx.Provider>;
}

/**
 * Pro PageHeader: vrátí položky lišty, které má přibrat do svého „···" (pod linku), a ohlásí
 * liště, že „···" převzal. `menu` = položky na každé šířce, `mobil` = jen pod md.
 */
export function usePrevzitMenuListy(menu: MenuItem[] | undefined, mobil: MenuItem[] | undefined): MenuItem[] {
  const lista = useContext(ListaCtx);
  const id = useId();
  const maVzdy = (menu?.length ?? 0) > 0;
  const maMobil = (mobil?.length ?? 0) > 0;
  const jak: 'vzdy' | 'mobil' | null = !lista || !lista.polozky.length ? null : maVzdy ? 'vzdy' : maMobil ? 'mobil' : null;
  useLayoutEffect(() => { lista?.prevzit(id, jak); }, [lista, id, jak]);
  useLayoutEffect(() => () => lista?.prevzit(id, null), [lista, id]);
  if (!lista || !jak) return [];
  // Pod linkou; když hlavička nese na monitoru jen mobilní položky, je na monitoru „···" v liště
  // a tyhle přibrané položky jsou taky jen pro telefon.
  return lista.polozky.map((p, i) => ({ ...p, ...(jak === 'mobil' ? { jenMobil: true } : {}), ...(i === 0 ? { oddelit: true } : {}) }));
}

/** „···" horní lišty: na obrazovce, jejíž hlavička má vlastní „···", se nekreslí (P18). */
export function MenuListy({ label }: { label?: string }) {
  const lista = useContext(ListaCtx);
  const prevzato = useContext(PrevzatoCtx);
  if (!lista || !lista.polozky.length || prevzato === 'vzdy') return null;
  return <Menu items={lista.polozky} label={label} className={prevzato === 'mobil' ? 'max-md:hidden' : ''} />;
}

export default MenuListy;
