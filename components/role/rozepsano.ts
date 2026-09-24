'use client';

import { useState } from 'react';
import type { ModalGuard } from '@/lib/useModal';

// Rozepsaná role a přechod jinam (kolo 67).
//
// Editor role sedí na stránce (Nastavení → Role a oprávnění), ne v okně.
// Přepnutí záložky Nastavení nebo pohledu v navigaci ho odmontuje a čtyřicet
// proklikaných přepínačů je pryč — `useModal` to nehlídá, protože to není
// okno, a `useDraft` taky ne: úprava existující role se podle něj záměrně
// neobnovuje a k tomu by se po návratu musel znovu otevřít správný editor.
//
// Proto se místo tichého zahození ptá, stejnou vrstvou <DiscardGuard> jako
// okna. Stav je v modulu, ne v Reactu: kdo přechod spouští (Nastavení,
// navigace vedení), je o několik úrovní nad editorem a nemá jak se ho
// zeptat jinak. Soubor je schválně malý a bez katalogu oprávnění — importuje
// ho i EmployerLayout, a editor rolí se má stahovat až při otevření.

let rozepsano = false;

/** Editor hlásí, jestli drží neuložené změny. Při odmontování vždy `false`. */
export function nastavRozepsanouRoli(v: boolean): void { rozepsano = v; }

/** Drží teď editor rolí neuložené změny? */
export function jeRozepsanaRole(): boolean { return rozepsano; }

/**
 * Přechod, který se u rozepsané role nejdřív zeptá.
 *
 * `pokus(fn)` provede přechod hned, když nic rozepsáno není; jinak si ho
 * odloží a `guard.asking` přepne na true. Volající vykreslí
 * `<DiscardGuard guard={straz.guard} what={CO_SE_ZAHODI} />`.
 */
export function useStrazRole() {
  const [odlozeno, setOdlozeno] = useState<null | (() => void)>(null);
  const pokus = (fn: () => void) => {
    if (!rozepsano) { fn(); return; }
    // Funkce do useState se musí zabalit, jinak by ji React zavolal jako updater.
    setOdlozeno(() => fn);
  };
  const guard: ModalGuard = {
    asking: odlozeno != null,
    dirty: rozepsano,
    keep: () => setOdlozeno(null),
    discard: () => {
      const fn = odlozeno;
      rozepsano = false;
      setOdlozeno(null);
      fn?.();
    },
    attemptClose: () => { /* tahle stráž žádné okno nezavírá */ },
  };
  return { pokus, guard };
}

export const CO_SE_ZAHODI_ROLE = 'Rozepsané změny role se neuloží.';
