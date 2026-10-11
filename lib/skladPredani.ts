// Co dostane Sklad od widgetu, který do něj vede: kategorii (jménem) a/nebo „jen co dochází".
// Tvar argumentu: `Nápoje`, `stav:dochazi` nebo `stav:dochazi|Nápoje`. Holé jméno je kategorie
// (tak to bylo dřív, proto zůstává), `stav:` je filtr; části odděluje `|`.

export interface SkladPredani { kategorie?: string; jenDochazi: boolean }

export const STAV_DOCHAZI = 'stav:dochazi';

export function rozborSkladArg(arg: string | null | undefined): SkladPredani {
  let kategorie: string | undefined;
  let jenDochazi = false;
  for (const cast of (arg ?? '').split('|').map(c => c.trim()).filter(Boolean)) {
    if (cast === STAV_DOCHAZI) jenDochazi = true;
    else if (!cast.startsWith('stav:')) kategorie = cast;
  }
  return { kategorie, jenDochazi };
}

export function skladArg(p: { kategorie?: string | null; jenDochazi?: boolean }): string | undefined {
  const casti = [p.jenDochazi ? STAV_DOCHAZI : '', p.kategorie ?? ''].filter(Boolean);
  return casti.length ? casti.join('|') : undefined;
}
