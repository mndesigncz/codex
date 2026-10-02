// Přehled uplatnění kuponů: kolik se vydalo a uplatnilo, průměrná útrata,
// doba do uplatnění a propadlé neuplatněné kódy. Čistý výpočet nad řádky
// vydaných kódů (SQL je v app/api/client/admin/coupons/prehled).

import { parseDbTime } from './pragueTime.ts';
import { czCount, type CzNoun } from './czech.ts';

export type RadekKodu = {
  claimed_at: any; redeemed_at: any; order_value: any;
  /** Konec platnosti kuponu (YYYY-MM-DD) nebo null. */
  valid_until: any;
};

export type SouhrnKuponu = {
  vydano: number; uplatneno: number; otevrene: number; propadle: number;
  /** Podíl uplatněných z vydaných, 0–100 (null, když se nic nevydalo). */
  miraUplatneni: number | null;
  /** Počet uplatnění, u kterých obsluha zadala částku účtenky. */
  sUtratou: number;
  prumernaUtrata: number | null; celkemUtrata: number;
  /** Medián doby od vydání po uplatnění v hodinách (null bez uplatnění). */
  medianHodin: number | null;
};

export function souhrnKuponu(rows: RadekKodu[], today: string): SouhrnKuponu {
  let uplatneno = 0, propadle = 0, otevrene = 0, sUtratou = 0, celkem = 0;
  const doby: number[] = [];
  for (const r of rows) {
    if (r.redeemed_at) {
      uplatneno++;
      const hodnota = r.order_value == null || r.order_value === '' ? NaN : Number(r.order_value);
      if (Number.isFinite(hodnota) && hodnota >= 0) { sUtratou++; celkem += hodnota; }
      const a = parseDbTime(r.claimed_at), b = parseDbTime(r.redeemed_at);
      if (a && b && b.getTime() >= a.getTime()) doby.push((b.getTime() - a.getTime()) / 3600000);
    } else if (r.valid_until && String(r.valid_until) < today) propadle++;
    else otevrene++;
  }
  doby.sort((x, y) => x - y);
  const med = doby.length ? (doby.length % 2 ? doby[(doby.length - 1) / 2] : (doby[doby.length / 2 - 1] + doby[doby.length / 2]) / 2) : null;
  const vydano = rows.length;
  return {
    vydano, uplatneno, otevrene, propadle,
    miraUplatneni: vydano ? Math.round((uplatneno / vydano) * 100) : null,
    sUtratou,
    prumernaUtrata: sUtratou ? Math.round((celkem / sUtratou) * 100) / 100 : null,
    celkemUtrata: Math.round(celkem * 100) / 100,
    medianHodin: med == null ? null : Math.round(med * 10) / 10,
  };
}

/**
 * Odhad poskytnutých slev: u procentních kuponů procento z útraty, u částkových pevná částka.
 * Počítá se jen u uplatnění, kde obsluha zadala částku účtenky (jinak by procenta nešla spočítat);
 * částkový kupon se započítá vždy. X+Y, „zdarma" a vlastní výhody se neodhadují.
 */
export function odhadSlevy(rows: (RadekKodu & { benefit_kind?: any; percent_off?: any; amount_off?: any })[]): number {
  let s = 0;
  for (const r of rows) {
    if (!r.redeemed_at) continue;
    const v = r.order_value == null || r.order_value === '' ? NaN : Number(r.order_value);
    if (r.benefit_kind === 'percent' && Number(r.percent_off) > 0 && Number.isFinite(v)) s += (v * Number(r.percent_off)) / 100;
    else if (r.benefit_kind === 'amount' && Number(r.amount_off) > 0) s += Number.isFinite(v) ? Math.min(Number(r.amount_off), v) : Number(r.amount_off);
  }
  return Math.round(s * 100) / 100;
}

const DEN: CzNoun = { one: 'den', few: 'dny', many: 'dní' };
const HODINA: CzNoun = { one: 'hodina', few: 'hodiny', many: 'hodin' };

/** Doba do uplatnění pro člověka: „45 min", „6 hodin", „3 dny". */
export function dobaPopis(hodin: number | null): string {
  if (hodin == null) return '—';
  if (hodin < 1) return `${Math.max(1, Math.round(hodin * 60))} min`;
  if (hodin < 48) return czCount(Math.round(hodin), HODINA);
  return czCount(Math.round(hodin / 24), DEN);
}
