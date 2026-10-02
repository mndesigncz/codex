// Časová osa hosta ve správě: deník bodů, kupony, poukazy a objednávky v jednom
// seznamu od nejnovějšího, plus věty „do čeho mu zbývá“. Čistá logika bez
// databáze (testy: scripts/testy/k80-segmenty.ts); data načítá GET
// /api/client/admin/loyalty?customerId=…&detail=1 z tabulek, které už existují.

import { czCount } from './czech.ts';
import type { Tier } from './clientSlots.ts';

export type DruhUdalosti = 'body' | 'kupon' | 'poukaz' | 'objednavka';

export interface UdalostOsy { at: string; druh: DruhUdalosti; titulek: string; meta?: string }

export const DRUHY_DENIKU: Record<string, string> = {
  visit: 'Návštěva', order: 'Objednávka', manual: 'Ruční úprava', coupon: 'Kupon za body', welcome: 'Uvítací body',
  birthday: 'Dárek k narozeninám', referral: 'Body za pozvání', cashback: 'Cashback', credit: 'Kredit',
  reactivation: 'Chybíš nám',
};

const STAV_OBJEDNAVKY: Record<string, string> = {
  new: 'nová', accepted: 'přijatá', preparing: 'v přípravě', ready: 'hotová', done: 'vyřízená', served: 'vyřízená', cancelled: 'zrušená', rejected: 'odmítnutá',
};

const BOD = { one: 'bod', few: 'body', many: 'bodů' };

function cas(v: unknown): number {
  const t = new Date(String(v ?? '')).getTime();
  return Number.isNaN(t) ? 0 : t;
}

export interface VstupOsy {
  ledger?: any[]; claims?: any[]; vouchers?: any[]; orders?: any[];
}

/** Spojí všechny zdroje do jedné osy, nejnovější první. Peníze formátuje volající (měna podniku). */
export function casovaOsa(v: VstupOsy, money: (n: number) => string, limit = 60): UdalostOsy[] {
  const out: UdalostOsy[] = [];
  for (const l of v.ledger ?? []) {
    const delta = Number(l.delta) || 0;
    const kredit = Number(l.credit_delta) || 0;
    const znak = (n: number) => (n > 0 ? '+' : '');
    const meta = [delta ? `${znak(delta)}${czCount(delta, BOD)}` : null, kredit ? `${znak(kredit)}${money(kredit)} kredit` : null].filter(Boolean).join(' · ');
    out.push({ at: String(l.created_at), druh: 'body', titulek: String(l.note || DRUHY_DENIKU[String(l.kind)] || l.kind || 'Změna'), meta: meta || undefined });
  }
  for (const c of v.claims ?? []) {
    out.push({ at: String(c.claimed_at), druh: 'kupon', titulek: `Vzal kupon ${c.title ?? ''}`.trim() });
    if (c.redeemed_at) out.push({ at: String(c.redeemed_at), druh: 'kupon', titulek: `Uplatnil kupon ${c.title ?? ''}`.trim() });
  }
  for (const p of v.vouchers ?? []) {
    out.push({ at: String(p.created_at), druh: 'poukaz', titulek: `Dárkový poukaz ${p.code ?? ''}`.trim(), meta: `${money(Number(p.value_amount) || 0)}, zbývá ${money(Number(p.balance) || 0)}` });
  }
  for (const o of v.orders ?? []) {
    out.push({ at: String(o.created_at), druh: 'objednavka', titulek: `Objednávka za ${money(Number(o.total) || 0)}`, meta: STAV_OBJEDNAVKY[String(o.status)] ?? String(o.status ?? '') });
  }
  return out.sort((a, b) => cas(b.at) - cas(a.at)).slice(0, limit);
}

/** „Do Zlatého hosta zbývá 5 návštěv“ nebo null, když je host na nejvyšší úrovni. */
export function zbyvaDoUrovne(t: Tier, hodnota: number, money: (n: number) => string): string | null {
  if (t.nextAt == null || !t.nextLabel) return null;
  const zbyva = Math.max(0, Math.round(t.nextAt - (Number(hodnota) || 0)));
  const co = t.unit === 'spend' ? money(zbyva) : czCount(zbyva, { one: 'návštěva', few: 'návštěvy', many: 'návštěv' });
  return `Do úrovně ${t.nextLabel} mu zbývá ${co}.`;
}

export interface KampanRazitek { name: string; required_stamps: number; stamps: number; reward_title?: string }

/** Věty o razítkách: „Čaj: 8 z 10, zbývají 2 do odměny“. Kampaně bez razítek se vynechají. */
export function zbyvaDoOdmeny(kampane: KampanRazitek[]): string[] {
  const out: string[] = [];
  for (const k of kampane) {
    const potreba = Math.max(0, Number(k.required_stamps) || 0);
    const ma = Math.max(0, Number(k.stamps) || 0);
    if (!potreba || ma <= 0) continue;
    const zbyva = Math.max(0, potreba - ma);
    out.push(zbyva === 0
      ? `${k.name}: ${ma} z ${potreba}, odměna je hotová`
      : `${k.name}: ${ma} z ${potreba}, chybí ${czCount(zbyva, { one: 'razítko', few: 'razítka', many: 'razítek' })}`);
  }
  return out;
}
