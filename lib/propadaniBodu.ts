// Propadání věrnostních bodů: čistá logika bez databáze.
//
// Podnik si nastaví, po kolika dnech body propadnou (0 = nikdy). Počítá se
// FIFO podle deníku: nejstarší body se utrácejí první, takže po utracení
// zbývají jen novější. Propadnout smí jen to, co host ještě má, a nikdy víc
// než jeho aktuální zůstatek.
//
// Dny jsou pražské (YYYY-MM-DD). Body získané v den D propadají v den D + N.

import { dayPlus, pragueDayOf, parseDbTime } from './pragueTime.ts';

/** Kolik dní předem host dostane upozornění. */
export const VAROVANI_DNI = 7;
/** Horní mez nastavení (deset let). */
export const MAX_DNI_PROPADANI = 3650;

/** Řádek deníku, jak ho potřebuje výpočet: změna bodů a pražský den vzniku. */
export interface RadekDeniku { delta: number; day: string }

export interface PlanPropadani {
  /** Kolik bodů má dnes propadnout (už oříznuto o zůstatek). */
  propadne: number;
  /** Kolik bodů propadne v nejbližších VAROVANI_DNI dnech (po dnešním propadnutí). */
  varovat: number;
  /** Den, kdy propadne první z nich, nebo null. */
  varovatDo: string | null;
}

const DEN_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Nastavení z formuláře na celé dny 0..MAX; cokoli neplatného = 0 (nikdy). */
export function normalizujDny(raw: unknown): number {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MAX_DNI_PROPADANI, n);
}

/**
 * Plán propadnutí jednoho člena.
 *
 * @param radky    deník člena od nejstaršího (záporné řádky včetně dřívějších propadnutí spotřebují nejstarší body)
 * @param zustatek aktuální body člena
 * @param dnes     dnešní pražský den
 * @param dny      po kolika dnech body propadají (0 = nikdy)
 * @param od       nejdřív od kdy se stáří počítá (den zapnutí propadání), ať zapnutí nesmaže starý zůstatek najednou
 */
export function planPropadani(radky: RadekDeniku[], zustatek: number, dnes: string, dny: number, od?: string | null): PlanPropadani {
  const prazdny: PlanPropadani = { propadne: 0, varovat: 0, varovatDo: null };
  const n = normalizujDny(dny);
  const bodu = Math.floor(Number(zustatek));
  if (n <= 0 || !Number.isFinite(bodu) || bodu <= 0 || !DEN_RE.test(dnes)) return prazdny;
  const zacatek = od && DEN_RE.test(od) ? od : null;

  // Fronta várek: každé kladné připsání je várka, záporné ubírá od nejstarší.
  const varky: { vyprsi: string; zbyva: number }[] = [];
  for (const r of radky) {
    const d = Math.trunc(Number(r.delta));
    if (!Number.isFinite(d) || d === 0 || !DEN_RE.test(r.day)) continue;
    if (d > 0) {
      const den = zacatek && r.day < zacatek ? zacatek : r.day;
      varky.push({ vyprsi: dayPlus(den, n), zbyva: d });
    } else {
      let utraceno = -d;
      for (const v of varky) {
        if (utraceno <= 0) break;
        const vzit = Math.min(v.zbyva, utraceno);
        v.zbyva -= vzit; utraceno -= vzit;
      }
    }
  }

  let prosle = 0;
  for (const v of varky) if (v.zbyva > 0 && v.vyprsi <= dnes) prosle += v.zbyva;
  const propadne = Math.min(prosle, bodu);

  // Varování: várky, které propadnou do VAROVANI_DNI, bez toho, co propadne dnes.
  const hranice = dayPlus(dnes, VAROVANI_DNI);
  let blizko = 0; let kdy: string | null = null;
  for (const v of varky) {
    if (v.zbyva > 0 && v.vyprsi > dnes && v.vyprsi <= hranice) {
      blizko += v.zbyva;
      if (!kdy || v.vyprsi < kdy) kdy = v.vyprsi;
    }
  }
  const varovat = Math.max(0, Math.min(blizko, bodu - propadne));
  return { propadne, varovat, varovatDo: varovat > 0 ? kdy : null };
}

/** 2026-11-12 → „12. 11.". */
export function denKratce(den: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(den ?? ''));
  return m ? `${Number(m[3])}. ${Number(m[2])}.` : '';
}

function denZRadku(v: any): string {
  const d = parseDbTime(v);
  return d ? pragueDayOf(d) : '';
}

/** Rozdělí řádky deníku člena na vstup výpočtu, den posledního upozornění a „už dnes propadlo". */
export function rozlisDenik(radky: any[], dnes: string): { vstup: RadekDeniku[]; poslednVarovani: string | null; dnesUz: boolean } {
  const vstup: RadekDeniku[] = [];
  let posledni: string | null = null;
  let dnesUz = false;
  for (const r of radky) {
    const ref = String(r.ref ?? '');
    if (r.kind === 'expire' && ref.startsWith('warn:')) {
      const d = ref.slice(5);
      if (!posledni || d > posledni) posledni = d;
      continue;
    }
    if (r.kind === 'expire' && ref === `exp:${dnes}`) dnesUz = true;
    vstup.push({ delta: Number(r.delta) || 0, day: denZRadku(r.created_at) });
  }
  return { vstup, poslednVarovani: posledni, dnesUz };
}

/** Nemá člen upozornění z posledních VAROVANI_DNI dnů (včetně dneška)? */
export function smiVarovat(posledni: string | null, dnes: string): boolean {
  return !posledni || posledni <= dayPlus(dnes, -VAROVANI_DNI);
}
