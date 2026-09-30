// Sdílený stav překladače: slovníky načtené v tomhle procesu a (jen v prohlížeči)
// jazyk, který je právě zvolený.
//
// Proč modul a ne jen React kontext: texty se překládají i mimo komponenty,
// třeba chybová hláška ze serveru v lib/api.ts. Slovníky jsou statická data
// z repa, takže je v procesu serveru smí sdílet všechny požadavky (jsou pro
// všechny stejné). Jazyk sdílet nesmějí: na serveru je jazyk vždy parametr
// požadavku a `tg()` bez prohlížeče vrací češtinu, nikdy „poslední jazyk".

import { preloz, prelozId, type Hodnoty, type Slovnik, type Slovniky } from './core.ts';
import { type Jazyk, VYCHOZI } from './config.ts';

const slovniky: Slovniky = {};
let aktualni: Jazyk = VYCHOZI;
const posluchaci = new Set<() => void>();
let verze = 0;

/** Slovníky načtené do procesu (pro `preloz`). */
export function vsechnySlovniky(): Slovniky {
  return slovniky;
}

/**
 * Přidá sekci ke slovníku jazyka. Vrací true, když se něco změnilo.
 * Slovník je plochý: věta, která už ve slovníku je, se nepřepisuje (přepis by zvedl verzi,
 * `t` by změnilo identitu a překreslilo by se vše; stejná věta musí mít v každé sekci stejný
 * překlad, to hlídá check-i18n).
 */
export function pridejSlovnik(jazyk: Jazyk, sekce: Slovnik): boolean {
  if (jazyk === 'cs') return false;
  const cil = (slovniky[jazyk] ??= {});
  let zmena = false;
  for (const k of Object.keys(sekce)) {
    if (!(k in cil)) { cil[k] = sekce[k]; zmena = true; }
  }
  if (zmena) { verze++; for (const p of Array.from(posluchaci)) p(); }
  return zmena;
}

export function verzeSlovniku(): number {
  return verze;
}

export function posluchejSlovniky(fn: () => void): () => void {
  posluchaci.add(fn);
  return () => { posluchaci.delete(fn); };
}

/** Jen prohlížeč: provider sem zapisuje zvolený jazyk. */
export function nastavAktualniJazyk(j: Jazyk): void {
  if (typeof window !== 'undefined') aktualni = j;
}

export function aktualniJazyk(): Jazyk {
  return typeof window !== 'undefined' ? aktualni : VYCHOZI;
}

/** Překlad mimo komponenty. Na serveru vždy česky (viz nahoře). */
export function tg(klic: string, hodnoty?: Hodnoty, ctx?: string): string {
  return preloz(slovniky, aktualniJazyk(), klic, hodnoty, ctx);
}

export function tgId(id: string, cs: string, hodnoty?: Hodnoty): string {
  return prelozId(slovniky, aktualniJazyk(), id, cs, hodnoty);
}
