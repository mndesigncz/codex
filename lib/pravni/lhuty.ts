// Čísla a lhůty, které se opakují ve víc právních dokumentech (obchodní podmínky,
// zpracovatelská smlouva, zásady, podmínky užívání, zrušení předplatného) — na
// JEDNOM místě, ať si dokumenty nikdy neodporují. Ceny a tarify se berou z
// lib/plan.ts (stejné jako ceník a Stripe), lhůty retence z lib/retence.ts
// (stejné, jaké maže cron /api/retence).
//
// Čistý modul bez databáze a bez node:crypto (lib/retence.ts se sem schválně
// neimportuje — čísla jsou zrcadlená a test scripts/testy/k88-pravni-souhlas.ts
// hlídá, že sedí).

import { formatMoney } from '../money.ts';
import { LOCALE_PRO_JAZYK } from '../i18n/config.ts';
import { LIMITS, MAX_OFFER_DAYS, MAX_OFFER_PCT, PRICES, REFERRALS_PER_MONTH, TRIAL_DAYS } from '../plan.ts';

export const LHUTY = {
  /** Oznámení změny obchodních podmínek, cen nebo zpracovatelské smlouvy předem (dny). */
  oznameniZmenDni: 30,
  /** Oznámení nového nebo vyměněného subzpracovatele předem (dny) a lhůta pro námitku. */
  subzpracovatelDni: 30,
  /** Výpovědní doba provozovatele bez porušení na straně zákazníka (měsíce). */
  vypovedProvozovateleMesicu: 2,
  /** Přechodné období po skončení smlouvy, kdy jde účet podniku exportovat (Data Act čl. 25). */
  prechodneObdobiDni: 30,
  /** Období pro vyzvednutí dat po přechodném období (Data Act: nejméně 30 dní). */
  vyzvednutiDatDni: 30,
  /** Zálohy u poskytovatelů se přepíšou nejpozději do (dny). */
  zalohyDni: 30,
  /** Oznámení porušení zabezpečení podniku nejpozději do (hodiny od zjištění). */
  incidentHodin: 48,
  /** Předání žádosti subjektu údajů, která přišla nám, podniku (pracovní dny). */
  predaniZadostiPracDni: 5,
  /** Odpověď podpory zpravidla do (pracovní dny). */
  podporaPracDni: 2,
  /** Vyřízení výtky vady u uživatele (dny). */
  vadyDni: 30,
  /** Strop odpovědnosti: ceny zaplacené za posledních N měsíců… */
  stropMesicu: 12,
  /** …nejméně však tato částka (Kč). */
  stropMinKc: 10_000,
  /** Upozornění na konec zkušební doby předem (dny; Stripe customer.subscription.trial_will_end). */
  konecZkouskyPredemDni: 3,
  /** Vrácení peněz na kartu zpravidla do (dny). */
  vraceniDni: 14,
  /** Platnost odkazu na denní zálohu (dny; lib/pravni/zalohaOdkaz.ts PLATNOST_ODKAZU_DNI). */
  odkazZalohyDni: 7,
  /** Platnost přihlášení (dny; lib/authRelace.ts PLATNOST_S). */
  relaceDni: 30,
} as const;

/** Lhůty retence — zrcadlo lib/retence.ts (RETENCE) a úklidu v app/api/init. */
export const RETENCE_TEXT = {
  neaktivniHostMesicu: 24,
  upozorneniPredemDni: 30,
  auditLogLet: 3,
  oznameniDni: 365,
  zrusenyPodnikDni: 90,
  /** E-mail vlastníkovi a správcům předplatného před smazáním zrušeného podniku (dny předem): první a druhý. */
  podnikUpozorneniDni: 30,
  podnikDruheUpozorneniDni: 7,
  /** Počítadla neúspěšných přihlášení (auth_attempts) se mažou po (dny). */
  pokusyPrihlaseniDni: 1,
} as const;

export const TARIFY = {
  zkusebniDni: TRIAL_DAYS,
  maxNabidkaDni: MAX_OFFER_DAYS,
  maxNabidkaProcent: MAX_OFFER_PCT,
  doporuceniMesicne: REFERRALS_PER_MONTH,
  zdarmaClenu: LIMITS.free.members ?? 3,
  ceny: PRICES,
} as const;

/** Cena pro české znění (lib/money, koruny bez haléřů). */
export const kc = (n: number): string => formatMoney(n, 'CZK', LOCALE_PRO_JAZYK.cs);

/** Cena pro anglické znění. */
export const czk = (n: number): string => formatMoney(n, 'CZK', LOCALE_PRO_JAZYK.en);

/** Datum účinnosti aktuální verze dokumentů (stejné jako VERZE_PODMINEK / VERZE_ZASAD). */
export const UCINNOST = { cs: '21. 10. 2026', en: '21 October 2026' } as const;
