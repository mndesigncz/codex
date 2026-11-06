'use client';
// Texty jdou přes t() z useT('klient-host') volajícího (sekce slovníku pro kontrolu i18n).

// Z odpovědi /api/client/me skládá, co host vidí: karty podniků s jedním číslem, připravené odměny,
// „dnes“ (rezervace, objednávka, kupon, kterému končí platnost). Čisté funkce bez fetch.

import { tierForMember, dayKey } from '@/lib/clientSlots';
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

/** Úroveň hosta v podniku pro trojici pod QR (body · úroveň a sleva · kolik zbývá do další). */
export interface UrovenHosta {
  id: string;
  nazev: string;
  sleva: number;
  /** Další úroveň (přeložená), null = nejvyšší. */
  dalsi: string | null;
  /** Kolik návštěv (nebo útraty v měně podniku) zbývá do další úrovně. */
  zbyva: number | null;
  jednotka: 'visits' | 'spend';
  /** Měna podniku pro útratu (z členství). */
  mena: string;
}

/** Karta podniku ve směru A: props pro InkoustovaKarta (balíček, otevřená karta, U kasy) a pár čísel navíc. */
export interface KartaHosta {
  slug: string;
  nazev: string;
  klic: string;
  logoUrl: string | null;
  /** Druhý řádek hlavičky („Káva podle výběru · Stříbrný host“, „Body · Zlatý host“). */
  popis: string;
  /** Hodnota vpravo v hlavičce zasunuté karty („8 / 10“, „320 b.“). */
  hodnota: string;
  /** Velké číslo přední a otevřené karty a menší „/ 10“ nebo „b.“ za ním. */
  cislo: number;
  z: string;
  /** Štítek za číslem v balíčku („ještě 2 do odměny“, „Káva je připravená“). */
  stitek: string;
  /** Štítek za číslem na otevřené kartě („poslední 4. 11.“); bez návštěvy stejný jako `stitek`. */
  stitekOtevrena: string;
  /** Věta pod otevřenou kartou („Ještě 2 razítka a Káva podle výběru je tvoje“). */
  veta: string;
  /** `ceka` = hotová odměna čeká na uplatnění: dárek na kartě svítí limetkou. */
  razitka: { pocet: number; cil: number; popis: string; ceka?: boolean } | null;
  postup: { podil: number; popis: string; ceka?: boolean } | null;
  /** Hotová odměna čeká (stejný stav ukazuje balíček, otevřená karta i U kasy). */
  odmenaCeka: boolean;
  /** Odměny tohohle podniku připravené k uplatnění. */
  pripravene: Odmena[];
  /** Jak blízko je host odměně (0–1, připravená odměna 2): přední karta balíčku je ta nejbližší. */
  blizkost: number;
  body: number;
  uroven: UrovenHosta;
  /** Celá věta pro odečítač. */
  aria: string;
}

/** Karta podniku z členství (domov, otevřená karta, U kasy). Barvu podniku záměrně nenese. */
export function kartaZClenstvi(m: any, odmeny: Odmena[], t: T): KartaHosta {
  const slug = String(m?.slug ?? '');
  const nazev = String(m?.name ?? '');
  const moje = odmeny.filter(o => o.slug === slug);
  const lv = tierForMember({ visits: Number(m?.visits), spend: Number(m?.spend), lastVisitAt: m?.lastVisitAt }, m?.tiers);
  const jmenoUrovne = lv.id !== 'bronze' ? t(lv.label) : '';
  const hodnotaUrovne = lv.unit === 'spend' ? Number(m?.spend) || 0 : Number(m?.visits) || 0;
  const uroven: UrovenHosta = {
    id: lv.id, nazev: t(lv.label), sleva: Number(lv.discount) || 0,
    dalsi: lv.nextLabel ? t(lv.nextLabel) : null,
    zbyva: lv.nextAt != null ? Math.max(0, Math.ceil(lv.nextAt - hodnotaUrovne)) : null,
    jednotka: lv.unit === 'spend' ? 'spend' : 'visits',
    mena: String(m?.currency || 'CZK'),
  };
  const body = Number(m?.points) || 0;
  const pripravena = moje[0] ?? null;
  const vetaPripravena = pripravena ? odmenaCekaVeta(pripravena, t) : '';
  /** Štítek s hotovou odměnou: obě informace naráz („Odměna čeká · další za 2“). */
  const stitekCeka = (zbyva: string | null) => (zbyva ? t('Odměna čeká · další za {n}', { n: zbyva }) : t('Odměna čeká'));
  const zaklad = { slug, nazev, klic: slug || nazev, logoUrl: m?.logoUrl || null, pripravene: moje, body, uroven };
  const posledniDen = (den: unknown) => (den ? t('poslední {datum}', { datum: denMesicRok(String(den)) }) : '');

  const razitkova = (pocetRaw: number, cil: number, nazevKampane: string, odmena: string, data: (string | null)[]): KartaHosta => {
    const pocet = Math.max(0, Math.min(pocetRaw || 0, cil));
    const zbyva = Math.max(0, cil - pocet);
    const stitek = pripravena ? stitekCeka(zbyva > 0 ? String(zbyva) : null)
      : zbyva > 0 ? t('ještě {n} do odměny', { n: zbyva }) : t('karta je plná');
    const veta = vetaPripravena
      || (zbyva === 0 ? t('Karta je plná — odměnu ti obsluha vydá u kasy')
        : odmena ? t('Ještě {n, plural, one {# razítko} few {# razítka} other {# razítek}} a {odmena} je tvoje', { n: zbyva, odmena })
        : t('Ještě {n, plural, one {# razítko} few {# razítka} other {# razítek}} do odměny', { n: zbyva }));
    const posledni = [...data].reverse().find(Boolean) ?? (pocet > 0 ? m?.lastVisitAt : null);
    const popis = [nazevKampane || t('Razítka'), jmenoUrovne || (nazevKampane ? t('razítka') : '')].filter(Boolean).join(' · ');
    const hodnota = `${pocet} / ${cil}`;
    return {
      ...zaklad, popis, hodnota, cislo: pocet, z: `/ ${cil}`, stitek,
      stitekOtevrena: pripravena ? stitek : posledniDen(posledni) || stitek, veta,
      razitka: { pocet, cil, ceka: !!pripravena, popis: [t('{n} z {cil} razítek', { n: pocet, cil }), pripravena ? t('Odměna čeká') : ''].filter(Boolean).join(', ') },
      postup: null, odmenaCeka: !!pripravena,
      blizkost: pripravena ? 2 : pocet / Math.max(1, cil),
      aria: [nazev, popis, hodnota, stitek].filter(Boolean).join(', '),
    };
  };

  const kamp = hlavniKampan(m);
  if (kamp) {
    const cil = Number(kamp.required);
    return razitkova(Number(kamp.stamps), cil, String(kamp.name ?? ''), String(kamp.reward || m?.stampReward || ''),
      (m?.razitkaData?.[String(kamp.id)] ?? []) as (string | null)[]);
  }
  if (Number(m?.stampTarget) > 0 && !(Number(m?.points) > 0)) {
    return razitkova(Number(m?.stamps), Number(m.stampTarget), '', String(m?.stampReward ?? ''), []);
  }

  const zebricek: { title: string; cost: number }[] = Array.isArray(m?.zebricek) ? m.zebricek : [];
  const dalsi = zebricek.find(z => z.cost > body) ?? null;
  const popis = [t('Body'), jmenoUrovne].filter(Boolean).join(' · ');
  const hodnota = `${body} ${t('b.')}`;
  const stitek = pripravena ? stitekCeka(dalsi ? t('{n} b.', { n: dalsi.cost - body }) : null)
    : dalsi ? t('ještě {n} b. do odměny', { n: dalsi.cost - body }) : '';
  const veta = vetaPripravena
    || (m?.expiring ? t('{n, plural, one {# bod propadne} few {# body propadnou} other {# bodů propadne}} do {kdy}', { n: m.expiring.points, kdy: denMesicRok(m.expiring.till) })
      : dalsi ? t('Ještě {n} b. do odměny {odmena}', { n: dalsi.cost - body, odmena: dalsi.title }) : '');
  return {
    ...zaklad, popis, hodnota, cislo: body, z: t('b.'), stitek,
    stitekOtevrena: pripravena ? stitek : posledniDen(m?.lastVisitAt) || stitek, veta,
    razitka: null,
    postup: dalsi || pripravena ? {
      podil: dalsi ? body / dalsi.cost : 1, ceka: !!pripravena,
      popis: [dalsi ? t('{n} z {cil} b. do odměny {odmena}', { n: body, cil: dalsi.cost, odmena: dalsi.title }) : '', pripravena ? t('Odměna čeká') : ''].filter(Boolean).join(', '),
    } : null,
    odmenaCeka: !!pripravena,
    blizkost: pripravena ? 2 : dalsi ? body / dalsi.cost : 0,
    aria: [nazev, popis, hodnota, stitek].filter(Boolean).join(', '),
  };
}

/** Název hotové odměny pro přepínač u kasy a lístky („Káva podle výběru čeká“). Jeden zdroj pro Domů, kartu i U kasy. */
export function odmenaCekaNazev(o: Pick<Odmena, 'title'>, t: T): string {
  return t('{odmena} čeká', { odmena: o.title });
}

/** Věta pod otevřenou kartou, když odměna čeká („Káva podle výběru čeká — ukaž kartu u kasy“). */
export function odmenaCekaVeta(o: Pick<Odmena, 'title'>, t: T): string {
  return t('{odmena} čeká — ukaž kartu u kasy', { odmena: o.title });
}

/** Index karty, která má v balíčku jít dopředu: připravená odměna, jinak nejblíž odměně (při shodě první). */
export function indexPredni(karty: Pick<KartaHosta, 'blizkost'>[]): number {
  let nej = 0;
  karty.forEach((k, i) => { if (k.blizkost > karty[nej].blizkost) nej = i; });
  return nej;
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
export function stavOtevreni(hours: any, den: string, hm: string): { otevreno: boolean; doKdy: string | null; odKdy: string | null; dnesZavreno: boolean } {
  const h = hours?.[dayKey(den)];
  if (!h || h.closed || !h.open || !h.close) return { otevreno: false, doKdy: null, odKdy: null, dnesZavreno: true };
  const otevreno = hm >= h.open && hm < h.close;
  return { otevreno, doKdy: otevreno ? h.close : null, odKdy: !otevreno && hm < h.open ? h.open : null, dnesZavreno: false };
}

/** „Otevřeno do 20:00“ / „Otevírá v 7:30“ / „Teď zavřeno“ / „Dnes zavřeno“. */
export function popisOtevreni(o: ReturnType<typeof stavOtevreni>, t: T): string {
  return o.otevreno ? t('Otevřeno do {cas}', { cas: o.doKdy ?? '' }) : o.odKdy ? t('Otevírá v {cas}', { cas: o.odKdy }) : o.dnesZavreno ? t('Dnes zavřeno') : t('Teď zavřeno');
}
