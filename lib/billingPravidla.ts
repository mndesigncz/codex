// Čistá pravidla plateb — bez Stripe SDK a bez databáze, aby je šlo testovat.
//
// lib/billing.ts řeší styk se Stripe a databází; tady jsou jen rozhodnutí:
// patří uložené ID zákazníka do právě používaného účtu Stripe? co má
// udělat webhook s předplatným ve stavu „incomplete"? je událost z našeho
// režimu? Chyby v těchhle rozhodnutích se v sandboxu neprojeví a ve
// ostrém provozu stojí peníze, proto jsou oddělená a pokrytá testy.

import type { PlanId } from './plan.ts';

/** Sandbox a živý účet Stripe jsou dva oddělené světy: jiní zákazníci, jiná předplatná. */
export type StripeRezim = 'live' | 'test';

/**
 * Režim podle prefixu klíče. `sk_live_`/`rk_live_` je živý účet, `sk_test_`/
 * `rk_test_` sandbox. Cokoli jiného (prázdný klíč, cizí formát) je `null`
 * = režim neznáme a nesmíme z něj nic vyvozovat.
 */
export function rezimZKlice(klic: string | null | undefined): StripeRezim | null {
  const k = String(klic ?? '').trim();
  if (/^[sr]k_live_/.test(k)) return 'live';
  if (/^[sr]k_test_/.test(k)) return 'test';
  return null;
}

/** Režim z příznaku `livemode`, který nese každý objekt i událost ze Stripe. */
export function rezimZLivemode(livemode: boolean | null | undefined): StripeRezim | null {
  if (livemode === true) return 'live';
  if (livemode === false) return 'test';
  return null;
}

/** Normalizace hodnoty uložené v `teams.stripe_mode`. */
export function ulozenyRezim(v: unknown): StripeRezim | null {
  return v === 'live' || v === 'test' ? v : null;
}

export type RozhodnutiZdroje = 'pouzit' | 'overit' | 'nahradit' | 'odmitnout';

/**
 * Co s uloženým ID zákazníka (nebo předplatného) při používání klíče
 * `aktualni`:
 *  - `pouzit`   — ID patří do tohoto režimu (nebo režim neznáme a nemáme důvod pochybovat),
 *  - `overit`   — ID pochází z doby před značkou režimu; jednou se ověří dotazem na Stripe,
 *  - `nahradit` — ID patří do jiného režimu (sandbox × živý), ve Stripe by skončilo
 *                 chybou „No such customer"; musí se založit nové,
 *  - `odmitnout` — ID je ŽIVÉ, ale aplikace běží na testovacím klíči (typicky
 *                 náhledové nasazení nebo lokální běh nad produkční databází).
 *                 Živého zákazníka nesmí testovací prostředí zahodit ani
 *                 přepsat; radši selže.
 * Bez ID se vždy zakládá nové.
 */
export function rozhodniOZdroji(v: { id: string | null | undefined; ulozeny: unknown; aktualni: StripeRezim | null }): RozhodnutiZdroje {
  if (!v.id) return 'nahradit';
  if (!v.aktualni) return 'pouzit';
  const ulozeny = ulozenyRezim(v.ulozeny);
  if (ulozeny === v.aktualni) return 'pouzit';
  if (ulozeny === null) return 'overit';
  if (ulozeny === 'live') return 'odmitnout';
  return 'nahradit';
}

/**
 * Je chyba ze Stripe „takový objekt neexistuje"? Stripe pro smazaného
 * zákazníka, cizí účet i sandbox ID v živém režimu vrací totéž:
 * `resource_missing` (HTTP 404). Nic jiného (síť, limit, oprávnění) se za
 * chybějící objekt brát nesmí — jinak by výpadek Stripe vedl k zakládání
 * duplicitních zákazníků.
 */
export function jeChybejiciZdroj(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false;
  const x = e as { code?: unknown; statusCode?: unknown; type?: unknown };
  if (x.code === 'resource_missing') return true;
  return x.statusCode === 404 && typeof x.type === 'string' && /InvalidRequest/.test(x.type);
}

/** Chybí konkrétně ZÁKAZNÍK (ne cena ani jiný objekt): „No such customer". */
export function jeChybejiciZakaznik(e: unknown): boolean {
  if (!jeChybejiciZdroj(e)) return false;
  const x = e as { param?: unknown; message?: unknown };
  return x.param === 'customer' || /no such customer/i.test(String(x.message ?? ''));
}

/** Zákazník smazaný ve Stripe se vrací jako objekt `{ deleted: true }`, ne jako chyba. */
export function jeSmazanyZakaznik(c: unknown): boolean {
  return !!c && typeof c === 'object' && (c as { deleted?: unknown }).deleted === true;
}

/**
 * Patří událost z webhooku do režimu, ve kterém aplikace běží? Podpis by
 * cizí událost normálně nepustil (každý endpoint má vlastní secret), ale
 * kdyby vedle klíče živého účtu zůstal sandboxový webhook secret nebo
 * naopak, nesmí testovací platba dostat podnik na Pro. Neznámý režim
 * (klíč cizího formátu) nic nevyřazuje.
 */
export function udalostPatriDoRezimu(livemode: boolean | null | undefined, aktualni: StripeRezim | null): boolean {
  if (!aktualni) return true;
  const r = rezimZLivemode(livemode);
  return r === null || r === aktualni;
}

/** Stavy, ve kterých předplatné podniku něco dává. */
export const ZIVE_STAVY = ['active', 'trialing', 'past_due'] as const;
export function jeZivyStav(status: unknown): boolean {
  return (ZIVE_STAVY as readonly string[]).includes(String(status));
}

/** Stavy, ve kterých už se opravdu něco dělo (i zrušené předplatné znamená „už měl"). */
const STAVY_S_HISTORII = ['trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'];

export interface VstupPredplatne {
  status: string;
  /** Tarif podle ceny v předplatném; `null` = cena, kterou nezná ani lookup_key, ani metadata. */
  planZCeny: Exclude<PlanId, 'free'> | null;
  /** `teams.plan` teď. */
  ulozenyPlan: string | null | undefined;
  /** `teams.stripe_subscription_id` teď. */
  ulozeneSubId: string | null | undefined;
  subId: string;
  /** `teams.max_offer_until` teď (cokoli, co není prázdné, znamená „nabídka už byla"). */
  nabidkaDo: unknown;
}

export interface VysledekPredplatne {
  /** `preskocit` = události se nedotýkat týmu. */
  akce: 'preskocit' | 'zapsat';
  duvod?: string;
  live: boolean;
  plan: PlanId;
  zacitNabidkuMax: boolean;
  /** Má se `had_subscription` nastavit na TRUE (jinak zůstává, jaké bylo). */
  meloPredplatne: boolean;
}

/**
 * Co má zpráva o předplatném udělat s podnikem. Rozhodují tři pojistky:
 *  1. `incomplete` a `incomplete_expired` — pokladna byla otevřená, ale nikdy
 *     se nezaplatilo. Nesmí shodit podnik na Zdarma (třeba starý tým na Max)
 *     ani mu spálit zkušební dobu.
 *  2. Nemá-li nová zpráva živý stav a podnik už má JINÉ předplatné, starší
 *     zpráva ho nepřepíše (portál umí založit nové, když staré doběhlo).
 *  3. Nabídka Max −30 % se otevře jen při přechodu na Pro a jen jednou.
 */
export function vyhodnotPredplatne(v: VstupPredplatne): VysledekPredplatne {
  const live = jeZivyStav(v.status);
  const nic = { live, plan: 'free' as PlanId, zacitNabidkuMax: false, meloPredplatne: false };
  if (v.status === 'incomplete' || v.status === 'incomplete_expired') {
    return { akce: 'preskocit', duvod: 'nikdy nezaplaceno', ...nic };
  }
  if (v.ulozeneSubId && v.ulozeneSubId !== v.subId && !live) {
    return { akce: 'preskocit', duvod: 'jiné, novější předplatné', ...nic };
  }
  const plan: PlanId = live && v.planZCeny ? v.planZCeny : 'free';
  return {
    akce: 'zapsat',
    live,
    plan,
    zacitNabidkuMax: live && plan === 'pro' && v.ulozenyPlan !== 'pro' && !v.nabidkaDo,
    meloPredplatne: STAVY_S_HISTORII.includes(v.status),
  };
}

/**
 * Trial má smysl nabízet i slibovat jen podniku, který předplatné ještě
 * neměl — přesně tak rozhoduje createCheckout. Jedno pravidlo pro server
 * i pro texty v aplikaci, ať slib nikdy nepřekročí to, co Stripe udělá.
 */
export function nabidnoutTrial(t: { hadSubscription?: boolean | null; stripeSubscriptionId?: string | null }): boolean {
  return !t.hadSubscription && !t.stripeSubscriptionId;
}
