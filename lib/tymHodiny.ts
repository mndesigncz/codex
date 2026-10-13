// Hodiny a výdělek u lidí v Týmu za zvolené období (kolo 8, balík R8-3).
//
// Martin hledal „kdo kolik odpracoval" na stránce Tým, ale nástroj Týmu ukazoval
// u člena jen pozici, telefon a sazbu; hodiny a mzdu měla jen Docházka. Tady je
// čistá logika, kterou seznam lidí použije: hodiny po lidech ze stejných pravidel
// jako Souhrn hodin (lib/dochazkaPrehled: zapomenuté odchody se nepočítají,
// běžící příchod se počítá do „teď"), hrubá mzda = hodiny × sazba z rosteru,
// řazení podle jména, hodin nebo výdělku a součet pro řádek pod seznamem.
//
// Výplata s příplatky a dýškem (GET /api/payroll, balík R8-1) se sem napojí
// později — do té doby je výdělek jen hodiny × sazba, stejně jako Souhrn hodin.

import { sazbyZRosteru, souhrnHodin, zaznamyVRozmezi, type ClenRosteru, type ZaznamDochazky } from './dochazkaPrehled.ts';

export interface HodinyClena {
  /** Započitatelný čas (ms) — bez zapomenutých odchodů a záznamů nad 24 h. */
  ms: number;
  /** Počet záznamů (směn) v období. */
  pocet: number;
  /** Hrubá mzda (hodiny × sazba); null bez sazby nebo když sazby nejsou vidět. */
  mzda: number | null;
  /** Právě běžící příchod. */
  bezi: boolean;
}

export type RazeniClenu = 'jmeno' | 'hodiny' | 'vydelek';

/**
 * Hodiny a mzda po lidech za rozmezí pražských dnů <od, do> (den příchodu).
 * `sMzdou` = false nechá mzdu null i tam, kde roster sazbu nese (divák bez finance.mzdy).
 */
export function hodinyClenu(
  entries: readonly ZaznamDochazky[], roster: readonly ClenRosteru[], od: string, doD: string, ted: number, sMzdou: boolean,
): Map<string, HodinyClena> {
  const sazby = sMzdou ? sazbyZRosteru(roster) : new Map<string, number>();
  const out = new Map<string, HodinyClena>();
  for (const r of souhrnHodin(zaznamyVRozmezi(entries, od, doD), ted, sazby)) {
    out.set(r.id, { ms: r.ms, pocet: r.pocet, mzda: r.mzda, bezi: r.bezi });
  }
  return out;
}

/** Součet pod seznamem: hodiny všech, mzdy těch se sazbou a kolik lidí odpracovalo něco bez sazby. */
export function soucetHodinClenu(hodiny: ReadonlyMap<string, HodinyClena>): { ms: number; mzda: number; bezSazby: number } {
  let ms = 0, mzda = 0, bezSazby = 0;
  for (const h of hodiny.values()) {
    ms += h.ms;
    if (h.mzda != null) mzda += h.mzda;
    else if (h.ms > 0) bezSazby += 1;
  }
  return { ms, mzda, bezSazby };
}

/**
 * Seřadí členy: podle jména (česky), hodin (nejvíc nahoře) nebo výdělku (bez sazby
 * až za těmi, kdo ji mají; při shodě víc hodin). Kdo v období nic neodpíchl, je u hodin
 * i výdělku dole v abecedě — seznam se tím nerozpadne na dvě poloviny.
 */
export function seradCleny<T extends { id: number | string; name: string }>(
  members: readonly T[], hodiny: ReadonlyMap<string, HodinyClena> | null, razeni: RazeniClenu,
): T[] {
  const r = [...members];
  const jmeno = (a: T, b: T) => a.name.localeCompare(b.name, 'cs');
  if (razeni === 'jmeno' || !hodiny) return r.sort(jmeno);
  const h = (m: T) => hodiny.get(String(m.id));
  if (razeni === 'vydelek') {
    return r.sort((a, b) => (h(b)?.mzda ?? -1) - (h(a)?.mzda ?? -1) || (h(b)?.ms ?? 0) - (h(a)?.ms ?? 0) || jmeno(a, b));
  }
  return r.sort((a, b) => (h(b)?.ms ?? 0) - (h(a)?.ms ?? 0) || jmeno(a, b));
}

/** Kolik dní zpět si od serveru vyžádat (nejvýš 180 — tolik /api/attendance vrací), aby rozmezí od `od` do dneška bylo celé. */
export function dniKNacteni(od: string, dnes: string): number {
  const ms = Date.parse(`${dnes}T12:00:00Z`) - Date.parse(`${od}T12:00:00Z`);
  const dni = Number.isFinite(ms) ? Math.floor(ms / 86_400_000) + 1 : 30;
  return Math.min(180, Math.max(1, dni));
}
