'use client';

// Navigace a oprávnění pro widgety (kolo 68, spec §2.6).
//
// Widget nedostává onNavigate ani smiPohled přes props. Tatáž komponenta
// se kreslí na Přehledu, v TO GO, v náhledu galerie i v Nastavení → Stránky
// a každé z těch míst naviguje jinak (nebo vůbec) — přes props by se to
// muselo protahovat deseti vrstvami a v kole 69 do každé stránky znovu.
// Proto kontext: layout ho poskytne jednou kolem všech svých režimů a widget
// si ho vezme přes useNavigace().
//
// Mimo layout (náhled výchozího rozložení, testovací stránka) platí „nikam":
// smiPohled vrací ne, takže se odkaz, na který nevíme, jestli divák smí,
// radši vůbec nekreslí.

import { createContext, useCallback, useContext, useMemo, useRef } from 'react';
import type { Navigace, PohledNavigace, Smi } from '@/lib/widgety/typy';
import { useOpravneni } from '../role/useOpravneni';

const NIKAM: Navigace = { onNavigate: () => {}, smiPohled: () => false, pohledy: [] };

export const NavigaceKontext = createContext<Navigace>(NIKAM);

/** `{ onNavigate(pohled, arg?), smiPohled(pohled), pohledy }` — z layoutu, v náhledu bez navigace. */
export function useNavigace(): Navigace {
  return useContext(NavigaceKontext);
}

/**
 * Přísné oprávnění pro pole a akce widgetu: po načtení `ma(klic)`, během
 * načítání NE, a když /api/teams/mine selže, ANO.
 *
 * Samotné `ma()` před načtením oprávnění vrací ANO (záchyt, aby výpadek
 * /api/teams/mine neschoval půlku aplikace). Pro widget to nestačí: dotaz
 * na tržby by odešel dřív, než víme, jestli na ně divák má, a skončil by
 * 403 jako falešná chyba (spec §1.5). Pole = stačí kterékoli z klíčů.
 *
 * Při chybě načtení platí totéž rozhodnutí jako u brány widgetu (useBrana
 * v oblasti obecne): plocha widgety připojí, server je vrátil v rozložení
 * a každý dotaz si hlídá sám (403 widget ukáže jako „Nenačetly se: …").
 * Kdyby tu bylo NE, „Čeká na tebe" by při výpadku potichu zmizelo celé —
 * všechny fronty vypnuté, nic k ukázání (review kola 68).
 */
export function useSmi(): Smi {
  const { nacteno, chyba, ma, opravneni } = useOpravneni();
  // `ma` vzniká při každém vykreslení; widget dává výsledek do závislostí
  // efektů (URL dotazu), tak ať se funkce mění jen se stavem oprávnění.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback((klic: string | readonly string[]) => (nacteno ? ma(klic) : chyba), [nacteno, chyba, opravneni]);
}

/**
 * Hodnota kontextu pro layout.
 *
 * Funkce layoutu vznikají při každém jeho vykreslení a layout se překresluje
 * často (tik chatu, přepínač podniků). Kdyby šly do kontextu přímo, každý
 * tik by překreslil každý widget na ploše. Drží se proto v refu a objekt
 * kontextu se mění jen s tím, co opravdu mění výsledek `smiPohled` —
 * oprávnění, režim aplikace a seznam pohledů (`zavislosti`).
 */
export function useHodnotaNavigace(
  onNavigate: Navigace['onNavigate'],
  smiPohled: Navigace['smiPohled'],
  pohledy: readonly PohledNavigace[],
  zavislosti: readonly unknown[],
): Navigace {
  const posledni = useRef({ onNavigate, smiPohled });
  posledni.current = { onNavigate, smiPohled };
  const klicPohledu = pohledy.map(p => p.id).join(',');
  return useMemo<Navigace>(() => ({
    onNavigate: (pohled, arg) => posledni.current.onNavigate(pohled, arg),
    smiPohled: pohled => posledni.current.smiPohled(pohled),
    pohledy,
  }),
  // Seznam pohledů se porovnává podle id, ne podle identity pole (vzniká znovu při každém vykreslení).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [klicPohledu, ...zavislosti]);
}

// ---------------------------------------------------------------------------
// Cíl widgetu Odkaz (nastavení `cil`)
// ---------------------------------------------------------------------------
//
// Tvar zůstává ze starého editoru přehledu (lib/widgety/migrace přenáší
// `target` beze změny), jen postup a návod se nově ukládají podle ID, ne
// podle názvu: přejmenování postupu dřív odkaz rozbilo a proklik vedl jen
// na seznam (katalog, poznámka u `odkaz`). Staré odkazy s názvem fungují
// dál — vedou na seznam, jako dřív.
//   view:<pohled>           záložka z navigace role
//   inventory:<kategorie>   kategorie skladu podle názvu (tak ji hledá Sklad)
//   procedure:<id>          postup (starý tvar: procedure:<název>)
//   guide:<id>              návod (starý tvar: guide:<název>)

export type CilOdkazu =
  | { druh: 'pohled'; pohled: string }
  | { druh: 'kategorie'; nazev: string }
  | { druh: 'postup'; id: number | null; nazev: string | null }
  | { druh: 'navod'; id: number | null; nazev: string | null };

const cisloNeboNic = (s: string): number | null => (/^[1-9]\d{0,9}$/.test(s) ? Number(s) : null);

/** Cíl z uloženého řetězce, nebo null, když mu nerozumíme. */
export function rozeberCil(cil: unknown): CilOdkazu | null {
  if (typeof cil !== 'string') return null;
  const i = cil.indexOf(':');
  if (i <= 0) return null;
  const druh = cil.slice(0, i);
  const arg = cil.slice(i + 1).trim();
  if (!arg) return null;
  if (druh === 'view') return { druh: 'pohled', pohled: arg };
  if (druh === 'inventory') return { druh: 'kategorie', nazev: arg };
  if (druh === 'procedure') { const id = cisloNeboNic(arg); return { druh: 'postup', id, nazev: id == null ? arg : null }; }
  if (druh === 'guide') { const id = cisloNeboNic(arg); return { druh: 'navod', id, nazev: id == null ? arg : null }; }
  return null;
}

/** Řetězec do nastavení `cil`. */
export function slozCil(c: CilOdkazu): string {
  switch (c.druh) {
    case 'pohled': return `view:${c.pohled}`;
    case 'kategorie': return `inventory:${c.nazev}`;
    case 'postup': return `procedure:${c.id ?? c.nazev ?? ''}`;
    case 'navod': return `guide:${c.id ?? c.nazev ?? ''}`;
  }
}

/** Kam cíl vede: pohled a argument pro onNavigate (a smiPohled). */
export function navigaceCile(c: CilOdkazu): { pohled: string; arg?: string } {
  switch (c.druh) {
    case 'pohled': return { pohled: c.pohled };
    case 'kategorie': return { pohled: 'inventory', arg: c.nazev };
    case 'postup': return { pohled: 'procedures', arg: c.id != null ? String(c.id) : undefined };
    case 'navod': return { pohled: 'guides', arg: c.id != null ? String(c.id) : undefined };
  }
}
