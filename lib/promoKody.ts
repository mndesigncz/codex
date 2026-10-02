// Promo kódy bez databáze: čištění a kontrola vstupu, dávková generace,
// stav kódu, rozpad použití po dnech a export do CSV.

import { pragueDayOf, parseDbTime } from './pragueTime.ts';

/** Znaky bez zaměnitelných (0/O, 1/I), ať kód jde opsat z letáku. */
const ABECEDA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const MAX_DAVKA = 200;
export const MAX_DELKA_KODU = 16;

/** Kód jen z velkých písmen a číslic, nejvýš 16 znaků. */
export const cistiKod = (v: unknown): string => String(v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, MAX_DELKA_KODU);

export type PromoVstup = {
  title: string; points: number; couponId: number | null; maxUses: number | null; validUntil: string | null;
};

/** Společná kontrola odměny a limitů (nový i upravovaný kód). Chybu vrací jako větu. */
export function zkontrolujPromo(b: any): { chyba: string } | { hodnoty: PromoVstup } {
  const title = String(b?.title ?? '').trim().slice(0, 80);
  if (!title) return { chyba: 'Kód potřebuje název.' };
  const points = Math.max(0, Math.min(10000, parseInt(String(b?.points ?? '0'), 10) || 0));
  const kupon = b?.coupon_id ? parseInt(String(b.coupon_id), 10) : null;
  const couponId = kupon && Number.isFinite(kupon) && kupon > 0 ? kupon : null;
  if (!points && !couponId) return { chyba: 'Kód musí dávat body, kupon, nebo obojí.' };
  const rawMax = String(b?.max_uses ?? '').trim();
  let maxUses: number | null = null;
  if (rawMax) {
    const n = parseInt(rawMax, 10);
    if (!Number.isFinite(n) || n < 1) return { chyba: 'Počet použití musí být aspoň 1, nebo nech pole prázdné.' };
    maxUses = Math.min(1000000, n);
  }
  const rawDo = String(b?.valid_until ?? '').trim();
  if (rawDo && !/^\d{4}-\d{2}-\d{2}$/.test(rawDo)) return { chyba: 'Datum „platí do" nemá platný tvar.' };
  return { hodnoty: { title, points, couponId, maxUses, validUntil: rawDo || null } };
}

/** Náhodný sufix z čitelné abecedy; `rnd` vrací číslo 0–1 (v testu deterministické). */
export function nahodnyKod(delka: number, rnd: () => number = Math.random): string {
  let s = '';
  for (let i = 0; i < delka; i++) s += ABECEDA[Math.min(ABECEDA.length - 1, Math.floor(rnd() * ABECEDA.length))];
  return s;
}

/** Kontrola zadání dávky: předpona (0–8 znaků), počet 1–200. */
export function zkontrolujDavku(b: any): { chyba: string } | { pocet: number; predpona: string } {
  const pocet = parseInt(String(b?.count ?? ''), 10);
  if (!Number.isFinite(pocet) || pocet < 1) return { chyba: 'Zadej, kolik kódů chceš vytvořit.' };
  if (pocet > MAX_DAVKA) return { chyba: `Najednou jde vytvořit nejvýš ${MAX_DAVKA} kódů.` };
  const predpona = cistiKod(b?.prefix).slice(0, 8);
  if (String(b?.prefix ?? '').trim() && !predpona) return { chyba: 'Předpona smí mít jen písmena bez diakritiky a číslice.' };
  return { pocet, predpona };
}

/** Navrhne `pocet` unikátních kódů s předponou (suffix 6 znaků). Kolize v dávce se přeskočí. */
export function navrhniKody(pocet: number, predpona: string, rnd: () => number = Math.random): string[] {
  const out = new Set<string>();
  const sufix = Math.max(4, Math.min(8, MAX_DELKA_KODU - predpona.length));
  let pokusy = 0;
  while (out.size < pocet && pokusy < pocet * 20) { out.add(predpona + nahodnyKod(sufix, rnd)); pokusy++; }
  return Array.from(out);
}

export type StavPromo = 'aktivni' | 'vypnuto' | 'vyprselo' | 'vycerpano';
export const STAV_PROMO_POPISKY: Record<StavPromo, string> = { aktivni: 'Aktivní', vypnuto: 'Vypnuto', vyprselo: 'Vypršelo', vycerpano: 'Vyčerpáno' };

export function stavPromo(p: any, today: string): StavPromo {
  if (p.valid_until && String(p.valid_until) < today) return 'vyprselo';
  if (Number(p.max_uses) > 0 && Number(p.uses) >= Number(p.max_uses)) return 'vycerpano';
  if (p.active === false) return 'vypnuto';
  return 'aktivni';
}

/** Použití kódu po pražských dnech (nejnovější první). */
export function rozpadPouziti(uses: { used_at: any }[]): { den: string; pocet: number }[] {
  const m = new Map<string, number>();
  for (const u of uses) {
    const d = parseDbTime(u.used_at);
    if (!d) continue;
    const den = pragueDayOf(d);
    m.set(den, (m.get(den) ?? 0) + 1);
  }
  return Array.from(m, ([den, pocet]) => ({ den, pocet })).sort((a, b) => b.den.localeCompare(a.den));
}

/** Buňka CSV: uvozovky a oddělovače se ošetří; vzorce (=, +, -, @) se zneškodní. */
export function csvBunka(v: unknown): string {
  let s = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV s kódy dávky (středník, UTF-8 s BOM pro Excel). */
export function davkaCsv(rows: { code: string; title: string; points: number; coupon_title?: string | null; max_uses: number | null; valid_until: string | null; uses: number }[]): string {
  const hlava = ['Kód', 'Název', 'Body', 'Kupon', 'Nejvýš použití', 'Platí do', 'Použito'];
  const radky = rows.map(r => [r.code, r.title, r.points, r.coupon_title ?? '', r.max_uses ?? '', r.valid_until ?? '', r.uses].map(csvBunka).join(';'));
  return '﻿' + [hlava.join(';'), ...radky].join('\r\n') + '\r\n';
}
