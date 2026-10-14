// Čistá logika zaměstnanecké části „Tresty" (kolo 10, balík Z): bez Reactu, aby ji
// pouštěly testy scripts/testy/k86-tresty-z.ts přímo v Node. Smlouva se serverem
// (typy, souhrny, chip stavu, pořadí opakování) je v lib/tresty.ts — tady je jen to,
// co potřebuje widget Moje tresty a okno DetailTrestu: co se ukáže v měsíci, filtr
// Vše / Platné / Zrušené, který trest otevřít z oznámení, sloučení po změně
// a kontrola vyjádření před odesláním.

import { MAX_DELKA_VYJADRENI, nepotvrzeny, normalizujText, poradiOpakovani, seradTresty, type Trest } from '../../lib/tresty.ts';

/** Argument pohledu rewards z oznámení (`/employee/shifts?view=rewards&arg=tresty`). */
export const ARG_TRESTY = 'tresty';

/** Filtr ve velkém widgetu. */
export type FiltrTrestu = 'vse' | 'plati' | 'zruseno';
export const FILTRY_TRESTU: readonly FiltrTrestu[] = ['vse', 'plati', 'zruseno'];

/**
 * Co widget v měsíci ukáže: tresty toho měsíce a k nim každý nepotvrzený trest
 * odjinud (z konce minulého měsíce, který člověk ještě neviděl — ten nesmí zmizet
 * jen proto, že se přehouplo datum). Seřazené: sporné, nepotvrzené, nejnovější,
 * zrušené na konec (seradTresty).
 */
export function trestyMesice(items: readonly Trest[], mesic: string): Trest[] {
  return seradTresty(items.filter(t => t.day.startsWith(mesic) || nepotvrzeny(t)));
}

/** Nepotvrzené tresty, nejnovější první (malá karta ukazuje ten první). */
export function nepotvrzene(items: readonly Trest[]): Trest[] {
  return items.filter(nepotvrzeny).sort((a, b) => b.day.localeCompare(a.day) || b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
}

export function filtrujTresty(items: readonly Trest[], f: FiltrTrestu): Trest[] {
  return f === 'vse' ? [...items] : items.filter(t => t.status === f);
}

export function poctyFiltru(items: readonly Trest[]): Record<FiltrTrestu, number> {
  const p: Record<FiltrTrestu, number> = { vse: items.length, plati: 0, zruseno: 0 };
  for (const t of items) p[t.status]++;
  return p;
}

/**
 * Který trest otevřít z oznámení: nejnovější nepotvrzený; když žádný není (oznámení
 * o zrušení vede na stejnou adresu), ten, se kterým se naposled něco stalo
 * (zrušení, jinak udělení). Prázdný seznam = nic.
 */
export function trestKOtevreni(items: readonly Trest[]): Trest | null {
  const n = nepotvrzene(items)[0];
  if (n) return n;
  const kdy = (t: Trest) => t.cancelledAt ?? t.createdAt ?? t.day;
  return [...items].sort((a, b) => kdy(b).localeCompare(kdy(a)) || b.id - a.id)[0] ?? null;
}

/** Stejný trest po změně (potvrzení, vyjádření): nahradit v seznamu, nebo přidat na začátek. */
export function sloucTrest(items: readonly Trest[], t: Trest): Trest[] {
  return items.some(x => x.id === t.id) ? items.map(x => (x.id === t.id ? t : x)) : [t, ...items];
}

/** Vyjádření před odesláním — stejná pravidla a hlášky jako server (PATCH response). */
export function validujVyjadreni(raw: string): { ok: true; text: string } | { ok: false; chyba: string } {
  const t = normalizujText(raw, MAX_DELKA_VYJADRENI);
  if (t === null) return { ok: false, chyba: 'Napiš své vyjádření.' };
  if (t === false) return { ok: false, chyba: 'Vyjádření je moc dlouhé (nejvýš 500 znaků) nebo moc krátké.' };
  return { ok: true, text: t };
}

/** Smí člověk u trestu ještě něco udělat? Potvrdit jen nepotvrzený platný, vyjádřit se k platnému. */
export function akceTrestu(t: Pick<Trest, 'status' | 'seenAt'>): { potvrdit: boolean; vyjadrit: boolean } {
  const plati = t.status === 'plati';
  return { potvrdit: plati && !t.seenAt, vyjadrit: plati };
}

/**
 * Kolikátý je tenhle trest stejného druhu (položky sazebníku) v jeho měsíci — „3. v tomto
 * měsíci" v detailu. poradiOpakovani z lib/tresty počítá pro NOVÝ trest (všechny platné
 * v měsíci + 1); u existujícího se počítají jen ty, které přišly před ním. Zrušený
 * a trest bez položky sazebníku null.
 */
export function poradiVMesici(items: readonly Trest[], t: Trest): number | null {
  if (t.status !== 'plati' || !t.typeId) return null;
  const pred = items.filter(x => x.id !== t.id && (x.day < t.day || (x.day === t.day && (x.createdAt < t.createdAt || (x.createdAt === t.createdAt && x.id < t.id)))));
  return poradiOpakovani(pred, { userId: t.userId, typeId: t.typeId, day: t.day });
}
