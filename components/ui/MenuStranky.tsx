'use client';

import React, { createContext, useCallback, useContext, useId, useLayoutEffect, useMemo, useState } from 'react';
import { Menu, type MenuItem } from './Menu';

// „···" jen JEDNOU na obrazovce (spec-skladba P18, vzor V0).
//
// Do v3 měla horní lišta svoje „···" (Účtenky, Managero client, TO GO) a hlavička
// stránky (PageHeader) druhé hned pod ním (Upravit stránku, Export…): na Úkolech,
// ve Skladu, Týmu, Rozvrhu i Uzávěrkách dvě stejná kolečka nad sebou a h1 se dělil
// o řádek s ikonou. Teď lišta drží jedno „···" pro obojí: PageHeader své položky
// lištové nabídce ODEVZDÁ (useOdevzdejMenu) a sám žádné kolečko nekreslí; h1 má
// celou šířku L→R. Položky stránky jsou v nabídce první, položky lišty pod linkou.
//
// Mimo lištu (správa platformy, okna, ukázky bez layoutu) poskytovatel chybí
// a PageHeader kreslí své „···" jako dřív — žádná funkce nezmizí.

interface Zapis { menu: MenuItem[]; mobil: MenuItem[] }

const ZapisCtx = createContext<{ zapis: (id: string, z: Zapis | null) => void } | null>(null);
const CteniCtx = createContext<Zapis[]>([]);

/** Obal layoutu (lišta + obsah): sbírá položky „···" hlaviček stránky pro nabídku v liště. */
export function MenuStrankyProvider({ children }: { children: React.ReactNode }) {
  const [mapa, setMapa] = useState<ReadonlyMap<string, Zapis>>(() => new Map());
  const zapis = useCallback((id: string, z: Zapis | null) => {
    setMapa(m => {
      if (!z && !m.has(id)) return m;
      const n = new Map(m);
      if (z) n.set(id, z); else n.delete(id);
      return n;
    });
  }, []);
  const api = useMemo(() => ({ zapis }), [zapis]);
  const cteni = useMemo(() => [...mapa.values()], [mapa]);
  return <ZapisCtx.Provider value={api}><CteniCtx.Provider value={cteni}>{children}</CteniCtx.Provider></ZapisCtx.Provider>;
}

/**
 * Hlavička stránky odevzdá položky „···" liště. Vrací true, když lišta existuje —
 * pak hlavička vlastní „···" nekreslí. `mobil` jsou položky jen pod `md`
 * (vedlejší akce, které jsou na monitoru vidět jako tlačítka).
 */
export function useOdevzdejMenu(menu: MenuItem[] | undefined, mobil: MenuItem[] | undefined): boolean {
  const lista = useContext(ZapisCtx);
  const id = useId();
  useLayoutEffect(() => {
    if (!lista) return;
    const ma = (menu?.length ?? 0) + (mobil?.length ?? 0) > 0;
    lista.zapis(id, ma ? { menu: menu ?? [], mobil: mobil ?? [] } : null);
  }, [lista, id, menu, mobil]);
  useLayoutEffect(() => () => lista?.zapis(id, null), [lista, id]);
  return !!lista;
}

/**
 * „···" v horní liště: položky stránky (z PageHeader) nahoře, položky lišty pod linkou.
 * Bez položek stránky nese jméno `label` (např. „Další možnosti"), s nimi „Další akce" —
 * je to pak nabídka akcí obrazovky (a sondy ji hledají pod stejným jménem jako dřív v hlavičce).
 */
export function MenuListy({ polozky = [], label }: { polozky?: MenuItem[]; label?: string }) {
  const zapisy = useContext(CteniCtx);
  const stranky: MenuItem[] = zapisy.flatMap(z => [...z.menu, ...z.mobil.map(i => ({ ...i, jenMobil: true }))]);
  const vzdy = stranky.some(i => !i.jenMobil);
  const items: MenuItem[] = [
    ...stranky,
    ...polozky.map((p, i) => (i === 0 && stranky.length ? { ...p, oddelit: vzdy ? true : 'mobil' as const } : p)),
  ];
  return <Menu items={items} label={stranky.length ? undefined : label} />;
}

export default MenuListy;
