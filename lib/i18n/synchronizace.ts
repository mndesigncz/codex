// Kdy se jazyk a motiv uložené na účtu uplatní na zařízení (components/NastaveniSync.tsx).
// Čistá pravidla bez Reactu a prohlížeče, ať jdou do `npm test`.
//
// Zásada: účet nese poslední volbu člověka a nové zařízení ji převezme, ALE výslovná volba
// udělaná na tomhle zařízení má přednost. „Výslovná" znamená, že ji člověk udělal přepínačem;
// jazyk zjištěný automaticky (prohlížeč hosta, ?lang=) ani jazyk převzatý z účtu výslovná
// není, takže ho příští změna na účtu zase přepíše.

import { cistyJazyk, type Jazyk } from './config.ts';

/**
 * Je jazyk na zařízení výslovná volba? Bez cookie ne. S cookie ano, pokud ji nenastavila
 * automatika (značka `auto`); cookie ze starších verzí značku nemá a bere se jako výslovná,
 * protože se to zpětně nedá poznat.
 */
export function jeJazykVyslovny(cookie: unknown, znackaAuto: boolean): boolean {
  return cistyJazyk(cookie) !== undefined && !znackaAuto;
}

/** Jazyk z účtu k uplatnění; null = nic nedělat (účet jazyk nemá, zařízení si ho zvolilo samo, nebo už sedí). */
export function jazykKUplatneni(o: { zUctu: unknown; aktualni: Jazyk; vyslovnyNaZarizeni: boolean }): Jazyk | null {
  const j = cistyJazyk(o.zUctu);
  if (!j || o.vyslovnyNaZarizeni || j === o.aktualni) return null;
  return j;
}

export type VolbaMotivu = 'light' | 'dark' | 'system';

export function jeVolbaMotivu(v: unknown): v is VolbaMotivu {
  return v === 'light' || v === 'dark' || v === 'system';
}

/** Motiv z účtu k uplatnění; null = nic nedělat (neplatná hodnota, nebo má zařízení výslovnou volbu). */
export function motivKUplatneni(o: { zUctu: unknown; vyslovnyNaZarizeni: boolean }): VolbaMotivu | null {
  return jeVolbaMotivu(o.zUctu) && !o.vyslovnyNaZarizeni ? o.zUctu : null;
}
