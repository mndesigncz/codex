// Co dostane Sklad od widgetu nebo jiné stránky, která do něj vede: kategorii (jménem),
// „jen co dochází", akci (otevřít inventuru) nebo konkrétní položku k úpravě.
// Tvar argumentu: `Nápoje`, `stav:dochazi`, `stav:dochazi|Nápoje`, `akce:inventura`,
// `polozka:12`. Holé jméno je kategorie (tak to bylo dřív, proto zůstává), `stav:` je
// filtr, `akce:` otevře okno, `polozka:` otevře úpravu položky; části odděluje `|`.
//
// Kolo 82: `akce:` a `polozka:` přibyly kvůli záložkám Sklad › Položky / Receptury z kasy
// / Inventura a prokliku z receptury na položku — deep linky `navigate('inventory', arg)`
// z katalogu widgetů (`cil`) zůstávají, jen umí víc.

export interface SkladPredani {
  kategorie?: string;
  jenDochazi: boolean;
  /** Otevřít po příchodu: `inventura` = okno Inventura skladu. */
  akce?: 'inventura';
  /** Otevřít úpravu téhle položky (id). */
  polozkaId?: number;
}

export const STAV_DOCHAZI = 'stav:dochazi';
export const AKCE_INVENTURA = 'akce:inventura';
export const polozkaArg = (id: number) => `polozka:${id}`;

export function rozborSkladArg(arg: string | null | undefined): SkladPredani {
  let kategorie: string | undefined;
  let jenDochazi = false;
  let akce: 'inventura' | undefined;
  let polozkaId: number | undefined;
  for (const cast of (arg ?? '').split('|').map(c => c.trim()).filter(Boolean)) {
    if (cast === STAV_DOCHAZI) jenDochazi = true;
    else if (cast === AKCE_INVENTURA) akce = 'inventura';
    else if (cast.startsWith('polozka:')) { const n = Number(cast.slice('polozka:'.length)); if (Number.isInteger(n) && n > 0) polozkaId = n; }
    else if (!cast.startsWith('stav:') && !cast.startsWith('akce:')) kategorie = cast;
  }
  return { kategorie, jenDochazi, ...(akce ? { akce } : {}), ...(polozkaId ? { polozkaId } : {}) };
}

export function skladArg(p: { kategorie?: string | null; jenDochazi?: boolean; akce?: 'inventura'; polozkaId?: number }): string | undefined {
  const casti = [
    p.jenDochazi ? STAV_DOCHAZI : '',
    p.akce === 'inventura' ? AKCE_INVENTURA : '',
    p.polozkaId ? polozkaArg(p.polozkaId) : '',
    p.kategorie ?? '',
  ].filter(Boolean);
  return casti.length ? casti.join('|') : undefined;
}
