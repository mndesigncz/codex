// Co aplikace slibuje o zkušební době a placení — na jednom místě, ať slib
// nikdy nepřekročí to, co Stripe opravdu udělá.
//
// Skutečnost (lib/billing.ts → createCheckout): nový podnik se zakládá na
// tarifu ZDARMA a bez zkoušky. Třicet dní Pro/Max zdarma začíná až tím, že
// člověk zadá kartu ve Stripe pokladně (trial je ve Stripe, po měsíci se
// karta strhne sama) — a jen jednou na podnik: kdo už předplatné měl,
// platí hned. Texty proto rozlišují: ještě nezkoušel × zkouší × už měl.

import { PLAN_NAMES, TRIAL_DAYS, czDays, priceLabel, type Interval, type PlanId, type PlanInfo } from './plan.ts';

export type DruhSlibuZamku = 'nenacteno' | 'jizMel' | 'zkouska';

/** Který slib se dává: UI podle druhu vybírá přeloženou větu, nepřekládá se česká věta porovnáním textu. */
export function druhSlibuZamku(v: { nacteno: boolean; hadSubscription: boolean }): DruhSlibuZamku {
  // Dokud nevíme, jestli podnik předplatné měl, nic o zkoušce netvrdíme.
  if (!v.nacteno) return 'nenacteno';
  return v.hadSubscription ? 'jizMel' : 'zkouska';
}

/** Věta pod tlačítkem v okně zamčené funkce (UpgradeModal). */
export function slibZamku(v: { nacteno: boolean; hadSubscription: boolean }): string {
  switch (druhSlibuZamku(v)) {
    case 'nenacteno': return 'Zrušit jde kdykoliv.';
    case 'jizMel': return 'Karta se strhne hned, zrušit jde kdykoliv — platí se do konce zaplaceného období.';
    default: return `${TRIAL_DAYS} dní zdarma, zrušit jde kdykoliv.`;
  }
}

export type StavPoRegistraci = 'aktivni' | 'zdarma' | 'zavrenaPokladna';

/**
 * Sdělení na obrazovce po založení podniku.
 *  - `aktivni`         — pokladna proběhla, zkouška běží (Stripe ji zapíše webhookem),
 *  - `zdarma`          — člověk zvolil Zdarma; nic se nezkouší,
 *  - `zavrenaPokladna` — chtěl placený tarif, ale pokladnu zavřel bez karty:
 *                        podnik je na Zdarma a zkoušku si může zapnout kdykoli.
 */
export function textPoRegistraci(v: { plan: PlanId; stav: StavPoRegistraci; interval: Interval }): string {
  const nazev = PLAN_NAMES[v.plan];
  if (v.stav === 'aktivni' && v.plan !== 'free') {
    return `${nazev} je aktivní. Prvních ${TRIAL_DAYS} dní zdarma, pak ${priceLabel(v.plan, v.interval)}.`;
  }
  if (v.stav === 'zavrenaPokladna' && v.plan !== 'free') {
    return `Podnik zatím běží na tarifu Zdarma (do 3 lidí). ${nazev} na ${TRIAL_DAYS} dní zdarma si zapnete kartou tady nebo později v Nastavení → Předplatné.`;
  }
  return `Podnik běží na tarifu Zdarma (do 3 lidí). Pro nebo Max si můžete kdykoli vyzkoušet na ${TRIAL_DAYS} dní v Nastavení → Předplatné.`;
}

/** Text lišty v hlavičce vedení, když podnik zkouší placený tarif. */
export function textZkousky(p: Pick<PlanInfo, 'subscriptionStatus' | 'effective' | 'trialDaysLeft' | 'cancelAt'>): string {
  const nazev = p.effective === 'max' ? 'Max' : 'Pro';
  const zbyva = czDays(p.trialDaysLeft);
  // Zkouška se Stripe (s kartou): po ní se strhne platba — pokud ji člověk nezrušil.
  if (p.subscriptionStatus === 'trialing') {
    return p.cancelAt
      ? `Zkoušíte ${nazev} — zbývá ${zbyva}. Předplatné je zrušené, nic se nestrhne a potom se vrátíte na tarif Zdarma.`
      : `Zkoušíte ${nazev} — zbývá ${zbyva}, potom se strhne první platba.`;
  }
  // Starý trial bez karty (z doby před platbami).
  return `Zkoušíte Pro — zbývá ${zbyva}. Kliknutím zjistíte, co zůstane ve Zdarma.`;
}
