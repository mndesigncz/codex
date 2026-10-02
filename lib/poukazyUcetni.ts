// Export dárkových poukazů pro účetnictví: měsíční souhrn a deník pohybů. Čisté funkce bez databáze.
//
// Poukaz je závazek: při prodeji vzniká (přibývá), uplatněním a propadnutím zaniká. Účetní proto potřebuje
// dvě věci: součty po měsících (kolik se prodalo, uplatnilo a vrátilo) a řádek za každý pohyb s datem,
// kódem a zůstatkem po pohybu. CSV je českého typu: středník, BOM, čísla bez oddělovače tisíců (Excel je
// přečte jako čísla), data jako „31. 12. 2026“, pole chráněná proti vzorcům (csvPole).

import { csvPole } from './poukazy.ts';
import { datumCesky } from './poukazyTisk.ts';
import { pragueDayOf, parseDbTime } from './pragueTime.ts';

export type DruhPohybu = 'sale' | 'use' | 'refund' | 'void';
export const DRUH_POHYBU_POPISEK: Record<DruhPohybu, string> = { sale: 'Prodej', use: 'Uplatnění', refund: 'Vrácení', void: 'Zrušení' };

/** Znaménko pro závazek podniku: prodej ho zvyšuje, uplatnění a zrušení snižují, vrácení zvyšuje. */
const ZNAMENKO: Record<DruhPohybu, 1 | -1> = { sale: 1, use: -1, refund: 1, void: -1 };

export interface PohybPoukazu {
  /** Okamžik z databáze (UTC bez zóny) nebo ISO text. */
  at: string | Date;
  kind: DruhPohybu;
  code: string;
  amount: number;
  balance_after: number | null;
  currency: string;
  by_name?: string | null;
  note?: string | null;
}

/** Měsíc `YYYY-MM` z okamžiku v pražském čase (ne UTC: pohyb v 00:30 patří do pražského dne). */
export function mesicPohybu(at: string | Date): string {
  const d = parseDbTime(at as any);
  return d ? pragueDayOf(d).slice(0, 7) : '';
}

/** Měsíc `2026-10` jako „10/2026“ (účetní řadí a filtruje podle čísla). */
export const mesicCislem = (m: string) => (/^\d{4}-\d{2}$/.test(m) ? `${m.slice(5)}/${m.slice(0, 4)}` : m);

/** Deník pohybů: jedna řádka za pohyb, nejstarší nahoře (jako účetní kniha), částka se znaménkem závazku. */
export function pohybyCsv(radky: PohybPoukazu[]): string {
  const hlavicka = ['Datum', 'Měsíc', 'Druh pohybu', 'Kód poukazu', 'Částka', 'Dopad na závazek', 'Zůstatek poukazu po pohybu', 'Měna', 'Obsluha', 'Poznámka'];
  const razene = [...radky].sort((a, b) => (parseDbTime(a.at as any)?.getTime() ?? 0) - (parseDbTime(b.at as any)?.getTime() ?? 0));
  const r = razene.map(p => {
    const den = (() => { const d = parseDbTime(p.at as any); return d ? pragueDayOf(d) : ''; })();
    // Čísla se do CSV píšou holá: csvPole by záporné číslo (začíná „-“) bral za vzorec a předsadil mu apostrof.
    return [
      csvPole(den ? datumCesky(den) : ''), csvPole(mesicCislem(mesicPohybu(p.at))), csvPole(DRUH_POHYBU_POPISEK[p.kind] ?? p.kind), csvPole(p.code),
      String(p.amount), String(ZNAMENKO[p.kind] * p.amount), p.balance_after == null ? '' : String(p.balance_after), csvPole(p.currency), csvPole(p.by_name ?? ''), csvPole(p.note ?? ''),
    ].join(';');
  });
  return '﻿' + [hlavicka.join(';'), ...r].join('\r\n') + '\r\n';
}

export interface RadekSouhrnu {
  mesic: string; pocetProdanych: number; prodano: number; uplatneno: number; vraceno: number; cistoUplatneno: number;
}

/** Měsíční souhrn pro účetnictví (měsíce od nejstaršího). Poslední řádek je součet za celé období. */
export function mesicniCsv(radky: RadekSouhrnu[], mena: string): string {
  const hlavicka = ['Měsíc', 'Prodáno kusů', 'Prodáno', 'Uplatněno', 'Vráceno', 'Uplatněno po vrácení', 'Měna'];
  const out = radky.map(m => [csvPole(mesicCislem(m.mesic)), ...[m.pocetProdanych, m.prodano, m.uplatneno, m.vraceno, m.cistoUplatneno].map(String), csvPole(mena)].join(';'));
  const soucet = radky.reduce((s, m) => ({
    pocet: s.pocet + m.pocetProdanych, prodano: s.prodano + m.prodano, uplatneno: s.uplatneno + m.uplatneno, vraceno: s.vraceno + m.vraceno, cisto: s.cisto + m.cistoUplatneno,
  }), { pocet: 0, prodano: 0, uplatneno: 0, vraceno: 0, cisto: 0 });
  out.push(['Celkem', ...[soucet.pocet, soucet.prodano, soucet.uplatneno, soucet.vraceno, soucet.cisto].map(String), csvPole(mena)].join(';'));
  return '﻿' + [hlavicka.join(';'), ...out].join('\r\n') + '\r\n';
}

/** Rozsah exportu: platné `YYYY-MM` (od), `YYYY-MM` (do), od ≤ do, nejvýš 36 měsíců. Chyba = česká věta. */
export function overRozsahExportu(odRaw: unknown, doRaw: unknown, dnesMesic: string): { ok: true; od: string; do: string } | { ok: false; chyba: string } {
  const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
  const pocet = (a: string, b: string) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + (Number(b.slice(5)) - Number(a.slice(5))) + 1;
  const od = String(odRaw ?? '').trim() || null;
  const do_ = String(doRaw ?? '').trim() || dnesMesic;
  if (!od || !MES.test(od) || !MES.test(do_)) return { ok: false, chyba: 'Vyber měsíc od a do (ve tvaru RRRR-MM).' };
  if (od > do_) return { ok: false, chyba: 'Měsíc „od“ je později než „do“.' };
  if (pocet(od, do_) > 36) return { ok: false, chyba: 'Export pokryje nejvýš 36 měsíců najednou.' };
  return { ok: true, od, do: do_ };
}
