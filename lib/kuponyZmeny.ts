// Kupony: čitelná historie změn (před → po) a export do CSV. Čistá logika bez databáze,
// ať ji načte `npm test` přímo Nodem. Pravidla kuponů jsou v lib/kuponyPravidla.ts,
// kontrola polí v lib/kuponyPole.ts.

import { TIER_LABELS, VCH_KORUNY, intList, tierList, odkazyList, benefitLabel, type FormatCastky } from './kuponyPopisky.ts';
import { stavKuponu, STAV_POPISKY } from './kuponyPravidla.ts';
import { csvBunka } from './promoKody.ts';
import { pragueToday, parseDbTime } from './pragueTime.ts';

const DNY_NAZVY = ['', 'po', 'út', 'st', 'čt', 'pá', 'so', 'ne'];
const DEN_MS = 86_400_000;

// ---- Historie změn -------------------------------------------------------------------

const POLE_ZMEN: { k: string; label: string; fmt?: (v: any) => string }[] = [
  { k: 'title', label: 'název' },
  { k: 'description', label: 'popis' },
  { k: 'cost_points', label: 'cena', fmt: v => `${Number(v) || 0} b.` },
  { k: 'draft', label: 'koncept', fmt: v => (v === true ? 'ano' : 'ne') },
  { k: 'active', label: 'zapnutý', fmt: v => (v === false ? 'ne' : 'ano') },
  { k: 'benefit_kind', label: 'typ výhody', fmt: v => ({ text: 'vlastní', percent: 'sleva %', amount: 'sleva v měně', free_item: 'zdarma', xy: 'X+Y' } as Record<string, string>)[String(v)] ?? String(v) },
  { k: 'percent_off', label: 'sleva %', fmt: v => (v == null ? '—' : `${v} %`) },
  { k: 'amount_off', label: 'sleva', fmt: v => (v == null ? '—' : String(v)) },
  { k: 'xy_buy', label: 'X' }, { k: 'xy_free', label: 'Y' },
  { k: 'min_order_value', label: 'min. útrata' },
  { k: 'max_total', label: 'limit kusů' }, { k: 'daily_limit', label: 'limit uplatnění za den' },
  { k: 'target_tiers', label: 'úrovně', fmt: v => (tierList(v).map(t => TIER_LABELS[t]).join(', ') || 'všem') },
  { k: 'target_groups', label: 'skupiny', fmt: v => (intList(v).length ? `${intList(v).length}` : 'všem') },
  { k: 'per_customer', label: 'limit na hosta' },
  { k: 'cooldown_days', label: 'cooldown (dní)' },
  { k: 'days_of_week', label: 'dny', fmt: v => (intList(v).map(d => DNY_NAZVY[d]).join(', ') || 'každý') },
  { k: 'hour_from', label: 'od hodiny' }, { k: 'hour_till', label: 'do hodiny' },
  { k: 'adult_only', label: '18+', fmt: v => (v === true ? 'ano' : 'ne') },
  { k: 'welcome', label: 'uvítací', fmt: v => (v === true ? 'ano' : 'ne') },
  { k: 'valid_since', label: 'platí od' }, { k: 'valid_until', label: 'platí do' },
  { k: 'menu_item_id', label: 'položka nabídky', fmt: v => (v == null ? 'žádná' : `č. ${v}`) },
  { k: 'excluded_items', label: 'vyloučené položky', fmt: v => `${odkazyList(v, 'itemId').length}` },
  { k: 'excluded_sections', label: 'vyloučené kategorie', fmt: v => `${odkazyList(v, 'sectionId').length}` },
];

function hodnotaProPorovnani(k: string, v: any): string {
  if (v === undefined || v === null || v === '') return '';
  if (k === 'excluded_items') return JSON.stringify(odkazyList(v, 'itemId').map(x => x.id).sort((a, b) => a - b));
  if (k === 'excluded_sections') return JSON.stringify(odkazyList(v, 'sectionId').map(x => x.id).sort((a, b) => a - b));
  if (Array.isArray(v)) return JSON.stringify([...v].map(String).sort());
  if (typeof v === 'string' && /^[\[{]/.test(v)) { try { return hodnotaProPorovnani(k, JSON.parse(v)); } catch { /* text */ } }
  return String(v);
}

/** Co se na kuponu změnilo (stará řádka z databáze × nové hodnoty ve tvaru sloupců). Prázdné pole = beze změny. */
export function popisZmen(stary: any, novy: Record<string, any>): string[] {
  const out: string[] = [];
  for (const p of POLE_ZMEN) {
    if (!(p.k in novy)) continue;
    if (hodnotaProPorovnani(p.k, stary?.[p.k]) === hodnotaProPorovnani(p.k, novy[p.k])) continue;
    const f = p.fmt ?? ((v: any) => (v == null || v === '' ? '—' : String(v)));
    out.push(`${p.label}: ${f(stary?.[p.k])} → ${f(novy[p.k])}`);
  }
  return out;
}

/** Věta do audit_log (sloupec má strop): ořízne na hranici položky. */
export function vetaZmen(co: string, zmeny: string[], strop = 280): string {
  if (!zmeny.length) return `${co} (beze změny polí)`;
  let out = '';
  for (let i = 0; i < zmeny.length; i++) {
    const dalsi = out ? `${out}; ${zmeny[i]}` : zmeny[i];
    if (`${co}: ${dalsi}`.length > strop - 14 && i > 0) return `${co}: ${out}; a ${zmeny.length - i} dalších`;
    out = dalsi;
  }
  return `${co}: ${out}`.slice(0, strop);
}

// ---- CSV -----------------------------------------------------------------------------

const BOM = '﻿';
const radky = (hlavicka: string[], data: unknown[][]) =>
  BOM + [hlavicka, ...data].map(r => r.map(csvBunka).join(';')).join('\r\n') + '\r\n';
const den = (v: any) => (v ? String(v).slice(0, 10) : '');

/** Katalog kuponů do CSV (středník, BOM pro Excel, ochrana proti vzorcům). */
export function kuponyCsv(kupony: any[], today: string = pragueToday(), castka: FormatCastky = VCH_KORUNY): string {
  return radky(
    ['Název', 'Stav', 'Výhoda', 'Cena (body)', 'Min. útrata', 'Platí od', 'Platí do', 'Pro úrovně', 'Limit kusů', 'Limit uplatnění za den', 'Vydáno', 'Uplatněno', 'Uvítací', '18+', 'Položka'],
    kupony.map(c => [
      c.title, STAV_POPISKY[stavKuponu(c, today)], benefitLabel(c, castka), Number(c.cost_points) || 0, c.min_order_value ?? '',
      den(c.valid_since), den(c.valid_until), tierList(c.target_tiers).map(t => TIER_LABELS[t]).join(' / '),
      c.max_total ?? '', c.daily_limit ?? '', Number(c.claimed) || 0, Number(c.redeemed) || 0,
      c.welcome === true ? 'ano' : 'ne', c.adult_only === true ? 'ano' : 'ne', c.menu_item_name ?? '',
    ]),
  );
}

export const ZDROJ_POPISEK: Record<string, string> = {
  points: 'Za body', welcome: 'Uvítací', promo: 'Promo kód', send: 'Poslal podnik', stamps: 'Za razítka', unknown: 'Neznámý',
};

/** Vydané kódy (kdo, kdy, kolik utratil, obsluha, odkud se vzal) do CSV. */
export function claimyCsv(rows: any[], today: string = pragueToday()): string {
  return radky(
    ['Kupon', 'Kód', 'Host', 'Vydáno', 'Uplatněno', 'Útrata', 'Obsluha', 'Původ', 'Dnů do uplatnění', 'Stav'],
    rows.map(r => {
      const z = parseDbTime(r.claimed_at), u = parseDbTime(r.redeemed_at);
      const stav = r.redeemed_at ? 'uplatněno' : (r.valid_until && String(r.valid_until) < today ? 'propadlo' : 'čeká');
      return [
        r.title, r.code, r.customer_name ?? '', den(r.claimed_at), den(r.redeemed_at), r.order_value ?? '', r.staff_name ?? '',
        ZDROJ_POPISEK[r.source && r.source in ZDROJ_POPISEK ? r.source : 'unknown'],
        z && u ? Math.round(Math.max(0, (u.getTime() - z.getTime()) / DEN_MS) * 10) / 10 : '', stav,
      ];
    }),
  );
}
