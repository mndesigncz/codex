'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { liseSeOdPrazdneho, maSeObnovit, slouceni } from './draft';

// Rozepsaný formulář, který přežije odchod na jinou záložku.
//
// Kolo 34 ohlídalo okna: Escape ani klik vedle už nezahodí, co je napsané.
// Formuláře, které sedí přímo na stránce, ale zůstaly po staru — záložky
// v aplikaci jsou `?view=`, takže přechod komponentu odmontuje a text je
// pryč. Napsat úkol, mrknout na rozvrh a vrátit se znamenalo psát znovu.
//
// Koncept se drží v `sessionStorage`: přežije přechod i obnovení stránky,
// ale ne zavření okna prohlížeče. Koncept z minulého týdne, který vyskočí
// v úplně jiné situaci, je horší než žádný.
//
// Obnovení se **neděje potichu.** Tiše předvyplněný formulář je vlastní
// malá lež: uživatel nepozná, jestli to napsal on, nebo se to vzalo odjinud.
// Hook proto vrací `obnoveno` a volající u formuláře řekne, co se stalo,
// a nabídne zahození.
export interface Koncept {
  /**
   * Čeká uložený koncept na otevření formuláře? Volající podle toho
   * formulář otevře.
   *
   * Bez toho je celá pojistka k ničemu: sonda ukázala, že po návratu je
   * formulář zavřený, takže uživatel nevidí žádnou stopu po tom, co
   * napsal — a píše to znovu. **Koncept, který není vidět, je totéž co
   * ztracený.**
   */
  cekaKoncept: boolean;
  /** Koncept se právě obnovil — řekni to u formuláře. */
  obnoveno: boolean;
  /** Zahodit obnovený koncept a začít na čisto. */
  zahodit: () => void;
  /** Uloženo — koncept už není potřeba. Volá se po úspěšném odeslání. */
  hotovo: () => void;
}

const KLIC = (jmeno: string) => `managero-koncept-${jmeno}`;

export function useDraft<T extends Record<string, unknown>>(
  /** Jméno formuláře. Musí být v aplikaci jedinečné. */
  jmeno: string,
  hodnota: T,
  nastav: (v: T) => void,
  {
    vychozi,
    aktivni = true,
    upravujeSe = false,
  }: {
    /** Prázdný tvar formuláře — podle něj se pozná, že koncept něco nese. */
    vychozi: T;
    /** Zapisovat? Zavřený formulář koncept neaktualizuje. */
    aktivni?: boolean;
    /** Upravuje se existující záznam? Tam se koncept neobnovuje. */
    upravujeSe?: boolean;
  },
): Koncept {
  const [obnoveno, setObnoveno] = useState(false);
  const [cekaKoncept, setCekaKoncept] = useState(false);
  const nactenoRef = useRef(false);
  const nastavRef = useRef(nastav);
  nastavRef.current = nastav;
  const vychoziRef = useRef(vychozi);

  const smazat = useCallback(() => {
    try { sessionStorage.removeItem(KLIC(jmeno)); } catch { /* soukromý režim */ }
  }, [jmeno]);

  const precti = useCallback((): unknown => {
    try {
      const raw = sessionStorage.getItem(KLIC(jmeno));
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [jmeno]);

  // Rozhlédnutí po konceptu proběhne hned, i když je formulář zavřený —
  // jinak by o něm uživatel nevěděl a psal znovu.
  useEffect(() => {
    if (upravujeSe) return;
    const ulozeny = precti();
    if (!ulozeny) return;
    if (maSeObnovit({ upravujeSe: false, ulozeny, vychozi: vychoziRef.current })) setCekaKoncept(true);
    else smazat();
  }, [precti, smazat, upravujeSe]);

  // Dosazení až ve chvíli, kdy je formulář otevřený a je kam psát.
  useEffect(() => {
    if (nactenoRef.current || !aktivni) return;
    nactenoRef.current = true;
    const ulozeny = precti();
    if (!maSeObnovit({ upravujeSe, ulozeny, vychozi: vychoziRef.current })) {
      if (ulozeny) smazat();
      return;
    }
    nastavRef.current(slouceni(vychoziRef.current, ulozeny));
    setObnoveno(true);
    setCekaKoncept(false);
  }, [aktivni, precti, upravujeSe, smazat]);

  // Zápis. Ukládá se jen to, co se liší od prázdného formuláře — jinak by
  // po zahození zůstal v úložišti prázdný koncept navěky, protože výchozí
  // hodnoty (priorita, typ) nejsou prázdné samy o sobě.
  useEffect(() => {
    if (!aktivni || upravujeSe || !nactenoRef.current) return;
    try {
      if (liseSeOdPrazdneho(hodnota, vychoziRef.current)) sessionStorage.setItem(KLIC(jmeno), JSON.stringify(hodnota));
      else sessionStorage.removeItem(KLIC(jmeno));
    } catch { /* soukromý režim nebo plné úložiště */ }
  }, [hodnota, aktivni, upravujeSe, jmeno]);

  const zahodit = useCallback(() => {
    smazat();
    setObnoveno(false);
    setCekaKoncept(false);
    nastavRef.current(vychoziRef.current);
  }, [smazat]);

  const hotovo = useCallback(() => { smazat(); setObnoveno(false); setCekaKoncept(false); }, [smazat]);

  return { cekaKoncept, obnoveno, zahodit, hotovo };
}
