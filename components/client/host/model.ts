'use client';

// Z odpovědi /api/client/me skládá, co host vidí: karty podniků s jedním číslem, připravené odměny,
// „dnes“ (rezervace, objednávka, kupon, kterému končí platnost). Čisté funkce bez fetch.

import { tierForMember, dayKey } from '@/lib/clientSlots';
import type { KartaPodnikuProps } from '../karta/KartaPodniku';
import type { Hodnoty } from '@/lib/i18n/core';

type T = (cs: string, p?: Hodnoty) => string;

export interface Odmena {
  id: number; code: string; title: string; slug: string; business: string;
  validUntil: string | null; fromStamps: boolean; benefit: string | null; accent: string | null; logoUrl: string | null;
}

export function pripraveneOdmeny(me: any): Odmena[] {
  const podle = new Map<string, any>((me?.memberships ?? []).map((m: any) => [String(m.slug), m]));
  return (me?.claims ?? []).filter((c: any) => !c.redeemed_at).map((c: any) => {
    const m = podle.get(String(c.slug));
    return {
      id: Number(c.id), code: String(c.code ?? ''), title: String(c.title ?? ''), slug: String(c.slug ?? ''), business: String(c.business ?? m?.name ?? ''),
      validUntil: c.valid_until ?? null, fromStamps: c.kind === 'stamps', benefit: c.benefit ?? null,
      accent: m?.accent || null, logoUrl: m?.logoUrl || null,
    };
  });
}

/** Kampaň, která je nejblíž odměně (karta ukazuje jedno číslo). */
export function hlavniKampan(m: any): any | null {
  const k = (m?.campaigns ?? []).filter((c: any) => Number(c.required) > 0 && !c.finishedForever);
  if (!k.length) return null;
  return k.slice().sort((a: any, b: any) => (Number(b.stamps) / Number(b.required)) - (Number(a.stamps) / Number(a.required)))[0];
}

/** Datum ISO dne bez času → kolik dní zbývá do konce platnosti (0 = dnes). */
export function dniDo(den: string | null | undefined, dnes: string): number | null {
  if (!den || !/^\d{4}-\d{2}-\d{2}/.test(String(den))) return null;
  const a = Date.UTC(+dnes.slice(0, 4), +dnes.slice(5, 7) - 1, +dnes.slice(8, 10));
  const b = Date.UTC(+String(den).slice(0, 4), +String(den).slice(5, 7) - 1, +String(den).slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

/** Props karty podniku pro domov a U kasy. */
export function kartaZClenstvi(m: any, odmeny: Odmena[], t: T): KartaPodnikuProps & { razitka: { pocet: number; cil: number; data: (string | null)[]; kampanId: number } | null } {
  const moje = odmeny.filter(o => o.slug === m.slug);
  const lv = tierForMember({ visits: Number(m.visits), spend: Number(m.spend), lastVisitAt: m.lastVisitAt }, m.tiers);
  const uroven = lv.id !== 'bronze' ? t(lv.label) : '';
  const kamp = hlavniKampan(m);
  const pripraveno = moje.length ? t('Připraveno') : null;
  const zaklad = { nazev: String(m.name ?? ''), logoUrl: m.logoUrl || null, barva: m.accent || null, pripraveno };
  if (kamp) {
    const cil = Number(kamp.required);
    const pocet = Math.min(Number(kamp.stamps) || 0, cil);
    const zbyva = Math.max(0, cil - pocet);
    const odmena = String(kamp.reward || m.stampReward || '');
    return {
      ...zaklad,
      podtitul: [t('razítka'), uroven].filter(Boolean).join(' · '),
      cislo: pocet, jednotka: t('/ {n, plural, one {# razítko} few {# razítek} other {# razítek}}', { n: cil }),
      veta: moje.length ? t('{odmena} — ukaž kartu u kasy', { odmena: moje[0].title })
        : odmena ? t('Ještě {n, plural, one {# razítko} few {# razítka} other {# razítek}} a {odmena} je tvoje', { n: zbyva, odmena })
        : t('Ještě {n, plural, one {# razítko} few {# razítka} other {# razítek}} do odměny', { n: zbyva }),
      razitka: { pocet, cil, data: (m.razitkaData?.[String(kamp.id)] ?? []) as (string | null)[], kampanId: Number(kamp.id) },
    };
  }
  if (Number(m.stampTarget) > 0 && !(Number(m.points) > 0)) {
    const cil = Number(m.stampTarget);
    const pocet = Math.min(Number(m.stamps) || 0, cil);
    return {
      ...zaklad,
      podtitul: [t('razítka'), uroven].filter(Boolean).join(' · '),
      cislo: pocet, jednotka: t('/ {n, plural, one {# razítko} few {# razítek} other {# razítek}}', { n: cil }),
      veta: moje.length ? t('{odmena} — ukaž kartu u kasy', { odmena: moje[0].title })
        : t('Ještě {n, plural, one {# razítko} few {# razítka} other {# razítek}} do odměny', { n: Math.max(0, cil - pocet) }),
      razitka: { pocet, cil, data: [], kampanId: 0 },
    };
  }
  const body = Number(m.points) || 0;
  const zebricek: { title: string; cost: number }[] = Array.isArray(m.zebricek) ? m.zebricek : [];
  const dalsi = zebricek.find(z => z.cost > body);
  return {
    ...zaklad,
    podtitul: [t('body'), uroven].filter(Boolean).join(' · '),
    cislo: body, jednotka: t('b.'),
    prahy: zebricek.length ? { body, prahy: zebricek.slice(0, 3).map(z => ({ at: z.cost, nazev: z.title })) } : null,
    veta: moje.length ? t('{odmena} — ukaž kartu u kasy', { odmena: moje[0].title })
      : m.expiring ? t('{n, plural, one {# bod propadne} few {# body propadnou} other {# bodů propadne}} do {kdy}', { n: m.expiring.points, kdy: denMesicRok(m.expiring.till) })
      : dalsi ? t('Ještě {n} b. do odměny {odmena}', { n: dalsi.cost - body, odmena: dalsi.title }) : undefined,
    razitka: null,
  };
}

/** „2026-11-12“ → „12. 11.“ */
export function denMesicRok(den: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(den ?? ''));
  return m ? `${Number(m[3])}. ${Number(m[2])}.` : String(den ?? '');
}

/** Pozdrav podle pražské hodiny. */
export function pozdrav(hodina: number, t: T): string {
  if (hodina < 5) return t('Dobrý večer');
  if (hodina < 10) return t('Dobré ráno');
  if (hodina < 12) return t('Dobré dopoledne');
  if (hodina < 18) return t('Dobré odpoledne');
  return t('Dobrý večer');
}

/** První jméno pro pozdrav („Jana“ z „Jana Dvořáková“). */
export function krestni(jmeno: string | null | undefined): string {
  return String(jmeno ?? '').trim().split(/\s+/)[0] ?? '';
}

/** Je podnik teď otevřený? Podle otevírací doby (klíč dne „0“–„6“ jako lib/clientSlots dayKey). */
export function stavOtevreni(hours: any, den: string, hm: string): { otevreno: boolean; doKdy: string | null; odKdy: string | null } {
  const h = hours?.[dayKey(den)];
  if (!h || h.closed || !h.open || !h.close) return { otevreno: false, doKdy: null, odKdy: null };
  const otevreno = hm >= h.open && hm < h.close;
  return { otevreno, doKdy: otevreno ? h.close : null, odKdy: !otevreno && hm < h.open ? h.open : null };
}
