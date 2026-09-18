// Skloňování po číslovce.
//
// Čeština má tři tvary, ne dva: 1 položka, 2–4 položky, 5+ položek. Stejně
// tak sloveso: „3 návody čekají", ale „5 návodů čeká". Angličtina si vystačí
// s jedním „s", takže tenhle rozdíl se v kódu snadno ztratí a vzniknou věty
// jako „3 návodů čeká", které v aplikaci nikdo psaný rukou nenapíše.
//
// Pravidlo bylo v repu třikrát opsané (Sklad, CategoryNav, plán). Tohle je
// to jedno místo.

export interface CzNoun {
  /** 1 */
  one: string;
  /** 2–4 */
  few: string;
  /** 0 a 5+ */
  many: string;
}

/** Správný tvar podstatného jména pro daný počet, bez čísla. */
export function czForm(n: number, w: CzNoun): string {
  const abs = Math.abs(n);
  if (abs === 1) return w.one;
  if (abs >= 2 && abs <= 4) return w.few;
  return w.many;
}

/** Počet i tvar dohromady: „3 položky". */
export function czCount(n: number, w: CzNoun): string {
  return `${n} ${czForm(n, w)}`;
}

/** Tvar slovesa po číslovce: „čeká" / „čekají" / „čeká". */
export function czVerb(n: number, sg: string, pl: string): string {
  const abs = Math.abs(n);
  return abs >= 2 && abs <= 4 ? pl : sg;
}

/** Nejčastější slovo v téhle aplikaci. */
export const POLOZKA: CzNoun = { one: 'položka', few: 'položky', many: 'položek' };
