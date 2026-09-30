// Předvolby podle země. Čistá data a jedna funkce, žádný výpočet.
//
// Všechno tady jsou NÁVRHY, které si člověk přepíše: země nic nezamyká a nic
// netvrdí o právu. Sazby DPH jsou označené `overit: true` (legislativa se mění,
// gastro sazby obzvlášť) a appka z nich nic nepočítá; slouží jen jako
// nastavitelný číselník do budoucna. V UI k nim patří věta „Návrh podle země.
// Zkontroluj si to s účetním."
//
// Pásmo: pět zemí MVP leží v CET/CEST se stejnými pravidly letního času jako
// Praha, takže pragueTime.ts pro ně funguje beze změny (plán §1.3).

import type { Jazyk } from './config.ts';

export const ZEME = ['CZ', 'SK', 'DE', 'AT', 'PL'] as const;
export type Zeme = (typeof ZEME)[number];

export interface SazbaDph {
  id: 'zakladni' | 'snizena' | 'druha-snizena';
  /** Procenta. Návrh, ne fakt: viz `overit`. */
  sazba: number;
}

export interface PredvolbaZeme {
  zeme: Zeme;
  /** Endonym země do výběru (země se v přepínači nepřekládá, ať ji člověk pozná). */
  nazev: string;
  jazyk: Jazyk;
  mena: string;
  /** Locale pro čísla a měnu (teams.locale). */
  locale: string;
  /** 1 = pondělí, 0 = neděle (teams.week_start). */
  zacatekTydne: 0 | 1;
  /** '24' | '12' (teams.time_format). */
  hodiny: '24' | '12';
  /** IANA pásmo; pro pět zemí MVP číselně totožné s Prahou. */
  pasmo: string;
  dph: SazbaDph[];
  /** Sazby DPH jsou jen návrh a musí je potvrdit účetní. Vždy true. */
  overit: true;
  telefonPredvolba: string;
  /** Pořadí řádků adresy, jen jako nápověda pro formuláře. */
  adresa: string;
}

export const PREDVOLBY_ZEMI: Record<Zeme, PredvolbaZeme> = {
  CZ: {
    zeme: 'CZ', nazev: 'Česko', jazyk: 'cs', mena: 'CZK', locale: 'cs-CZ', zacatekTydne: 1, hodiny: '24',
    pasmo: 'Europe/Prague', dph: [{ id: 'zakladni', sazba: 21 }, { id: 'snizena', sazba: 12 }], overit: true,
    telefonPredvolba: '+420', adresa: 'Ulice č.p., PSČ Obec',
  },
  SK: {
    zeme: 'SK', nazev: 'Slovensko', jazyk: 'sk', mena: 'EUR', locale: 'sk-SK', zacatekTydne: 1, hodiny: '24',
    pasmo: 'Europe/Bratislava', dph: [{ id: 'zakladni', sazba: 23 }, { id: 'snizena', sazba: 19 }, { id: 'druha-snizena', sazba: 5 }], overit: true,
    telefonPredvolba: '+421', adresa: 'Ulica č., PSČ Obec',
  },
  DE: {
    zeme: 'DE', nazev: 'Deutschland', jazyk: 'de', mena: 'EUR', locale: 'de-DE', zacatekTydne: 1, hodiny: '24',
    pasmo: 'Europe/Berlin', dph: [{ id: 'zakladni', sazba: 19 }, { id: 'snizena', sazba: 7 }], overit: true,
    telefonPredvolba: '+49', adresa: 'Straße Nr., PLZ Ort',
  },
  AT: {
    zeme: 'AT', nazev: 'Österreich', jazyk: 'de', mena: 'EUR', locale: 'de-AT', zacatekTydne: 1, hodiny: '24',
    pasmo: 'Europe/Vienna', dph: [{ id: 'zakladni', sazba: 20 }, { id: 'snizena', sazba: 10 }], overit: true,
    telefonPredvolba: '+43', adresa: 'Straße Nr., PLZ Ort',
  },
  PL: {
    zeme: 'PL', nazev: 'Polska', jazyk: 'pl', mena: 'PLN', locale: 'pl-PL', zacatekTydne: 1, hodiny: '24',
    pasmo: 'Europe/Warsaw', dph: [{ id: 'zakladni', sazba: 23 }, { id: 'snizena', sazba: 8 }, { id: 'druha-snizena', sazba: 5 }], overit: true,
    telefonPredvolba: '+48', adresa: 'ul. Nazwa nr, 00-000 Miasto',
  },
};

export function jeZeme(v: unknown): v is Zeme {
  return typeof v === 'string' && (ZEME as readonly string[]).includes(v);
}

/** Cokoli (cookie, DB, formulář) → kód země, jinak undefined. */
export function cistaZeme(v: unknown): Zeme | undefined {
  if (typeof v !== 'string') return undefined;
  const k = v.trim().toUpperCase();
  return jeZeme(k) ? k : undefined;
}

/** Předvolby pro zemi, nebo undefined pro zemi, kterou neznáme (pak se nic nepředvyplní). */
export function predvolbaProZemi(zeme: unknown): PredvolbaZeme | undefined {
  const z = cistaZeme(zeme);
  return z ? PREDVOLBY_ZEMI[z] : undefined;
}

/**
 * Jen pole, která se mají předvyplnit do nastavení podniku; bez DPH (to má
 * svůj číselník a vždy s ověřením). Volající hodnoty ukáže a uloží až po
 * potvrzení, nikdy je nepřepíše potichu.
 */
export function navrhNastaveni(zeme: unknown): { defaultLang: Jazyk; currency: string; locale: string; weekStart: 0 | 1; timeFormat: '24' | '12'; timezone: string } | undefined {
  const p = predvolbaProZemi(zeme);
  if (!p) return undefined;
  return { defaultLang: p.jazyk, currency: p.mena, locale: p.locale, weekStart: p.zacatekTydne, timeFormat: p.hodiny, timezone: p.pasmo };
}
