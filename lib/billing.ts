// Předplatné přes Stripe — jedno místo pro celý koloběh peněz.
//
// Tarify: Free (napořád), Pro 499 Kč/měs nebo 3 990 Kč/rok, Max 999 Kč/měs
// nebo 7 990 Kč/rok. Nový podnik zkouší Pro nebo Max 30 dní zdarma s kartou
// (trial ve Stripe, po měsíci se karta strhne sama). Po koupi Pro běží 7 dní
// nabídka Max −30 % (kupon MAX30). Affiliate: každý podnik má odkaz
// /register?ref=KÓD; když doporučený podnik poprvé zaplatí, doporučitel
// dostane měsíc zdarma jako kredit na další fakturu (nejvýš 3 za měsíc).
//
// Zdroj pravdy o stavu je webhook (lib/billing.ts → applySubscription),
// ne návrat z pokladny. Denní cron stav dorovná, kdyby webhook nedošel.
// Ceny se hledají podle lookup_key (pro_monthly…), takže sandbox i živý
// účet fungují bez ID v env — stačí STRIPE_SECRET_KEY a STRIPE_WEBHOOK_SECRET.

import Stripe from 'stripe';
import { neon } from '@neondatabase/serverless';
import { PRICES, REFERRALS_PER_MONTH, MAX_OFFER_DAYS, TRIAL_DAYS, type Interval, type PlanId, planInfoOf } from './plan';
import { generateJoinCode } from './team';
import { notifyUsers } from './push';
import { audit } from './audit';
import { pragueToday } from './pragueTime';

const sql = neon(process.env.DATABASE_URL!);

export type PaidPlan = Exclude<PlanId, 'free'>;
export const LOOKUP_KEYS: Record<PaidPlan, Record<Interval, string>> = {
  pro: { month: 'pro_monthly', year: 'pro_yearly' },
  max: { month: 'max_monthly', year: 'max_yearly' },
};
export const MAX_COUPON = 'MAX30';

let client: Stripe | null = null;
/** Stripe klient; bez klíče vrací null a API odpoví „platby nejsou nastavené“. */
export function stripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key, { typescript: true });
  return client;
}
export const NOT_CONFIGURED = 'Platby ještě nejsou nastavené (chybí STRIPE_SECRET_KEY).';

export function appUrl(): string {
  return (process.env.NEXTAUTH_URL ?? 'https://managero.app').replace(/\/$/, '');
}

// ---- Ceny podle lookup_key (cache na dobu běhu funkce) ----
const priceCache = new Map<string, Stripe.Price>();
export async function priceFor(plan: PaidPlan, interval: Interval): Promise<Stripe.Price> {
  const s = stripe(); if (!s) throw new Error(NOT_CONFIGURED);
  const key = LOOKUP_KEYS[plan][interval];
  const hit = priceCache.get(key); if (hit) return hit;
  const res = await s.prices.list({ lookup_keys: [key], active: true, limit: 1, expand: ['data.product'] });
  const price = res.data[0];
  if (!price) throw new Error(`Ve Stripe chybí cena s lookup_key „${key}“.`);
  priceCache.set(key, price);
  return price;
}

/** plan + interval z ceny (lookup_key pro_monthly → pro/month). */
export function planOfPrice(price: Stripe.Price | null | undefined): { plan: PaidPlan; interval: Interval } | null {
  const key = price?.lookup_key ?? '';
  const m = /^(pro|max)_(monthly|yearly)$/.exec(key);
  if (m) return { plan: m[1] as PaidPlan, interval: m[2] === 'yearly' ? 'year' : 'month' };
  const meta = price?.metadata?.plan;
  if (meta === 'pro' || meta === 'max') return { plan: meta, interval: price?.recurring?.interval === 'year' ? 'year' : 'month' };
  return null;
}

// ---- Tým ↔ zákazník ----
async function teamRow(teamId: number) {
  const [t] = await sql`
    SELECT t.id, t.name, t.plan, t.stripe_customer_id, t.stripe_subscription_id, t.subscription_status,
           t.subscription_interval, t.current_period_end, t.cancel_at_period_end, t.trial_end, t.max_offer_until,
           t.had_subscription, t.referral_code, t.referred_by_team_id, t.referral_rewarded, t.trial_ends_at,
           u.email AS owner_email, u.name AS owner_name
    FROM teams t LEFT JOIN users u ON u.id = t.owner_id
    WHERE t.id = ${teamId}`;
  return t ?? null;
}

export async function ensureCustomer(teamId: number): Promise<string> {
  const s = stripe(); if (!s) throw new Error(NOT_CONFIGURED);
  const t = await teamRow(teamId);
  if (!t) throw new Error('Tým nenalezen');
  if (t.stripe_customer_id) return String(t.stripe_customer_id);
  const c = await s.customers.create({
    name: String(t.name ?? `Podnik ${teamId}`),
    email: t.owner_email ?? undefined,
    metadata: { teamId: String(teamId), app: 'managero' },
    preferred_locales: ['cs'],
  });
  await sql`UPDATE teams SET stripe_customer_id = ${c.id} WHERE id = ${teamId}`;
  return c.id;
}

// ---- Checkout ----
// hosted = přesměrování na stránku Stripe; embedded = pokladna Stripe vložená
// do našeho okna (components/CheckoutModal.tsx). Karta ani v jednom případě
// neprojde naším kódem.
export type CheckoutMode = 'hosted' | 'embedded';
export async function createCheckout(teamId: number, plan: PaidPlan, interval: Interval, mode: CheckoutMode = 'hosted'): Promise<{ url?: string; clientSecret?: string }> {
  const s = stripe(); if (!s) throw new Error(NOT_CONFIGURED);
  const t = await teamRow(teamId);
  if (!t) throw new Error('Tým nenalezen');
  if (t.stripe_subscription_id && ['active', 'trialing', 'past_due'].includes(String(t.subscription_status))) {
    throw new Error('Podnik už předplatné má — změny dělej přes „Spravovat předplatné“.');
  }
  const customer = await ensureCustomer(teamId);
  const price = await priceFor(plan, interval);
  // Trial s kartou jen jednou na podnik — kdo už předplatné měl, platí hned.
  const trial = !t.had_subscription && !t.stripe_subscription_id;
  const session = await s.checkout.sessions.create({
    mode: 'subscription',
    customer,
    client_reference_id: String(teamId),
    line_items: [{ price: price.id, quantity: 1 }],
    allow_promotion_codes: true,
    payment_method_collection: 'always',
    billing_address_collection: 'auto',
    // DIČ na faktuře: Stripe si k tomu musí smět přepsat jméno a adresu
    // zákazníka podle toho, co člověk vyplní v pokladně.
    tax_id_collection: { enabled: true },
    customer_update: { name: 'auto', address: 'auto' },
    locale: 'cs',
    subscription_data: {
      metadata: { teamId: String(teamId), plan },
      ...(trial ? {
        trial_period_days: TRIAL_DAYS,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      } : {}),
    },
    metadata: { teamId: String(teamId), plan, interval },
    ...(mode === 'embedded' ? {
      ui_mode: 'embedded' as const,
      // Zůstat v aplikaci; přesměruje se jen když to banka po 3D Secure vyžaduje.
      redirect_on_completion: 'if_required' as const,
      return_url: `${appUrl()}/employer/overview?view=settings&billing=success`,
    } : {
      success_url: `${appUrl()}/employer/overview?view=settings&billing=success`,
      cancel_url: `${appUrl()}/employer/overview?view=settings&billing=cancel`,
    }),
  });
  if (mode === 'embedded') {
    if (!session.client_secret) throw new Error('Stripe nevrátil klíč pokladny.');
    return { clientSecret: session.client_secret };
  }
  if (!session.url) throw new Error('Stripe nevrátil adresu pokladny.');
  return { url: session.url };
}

// ---- Zákaznický portál (karta, faktury, změna tarifu, zrušení) ----
let portalConfigId: string | null = null;
async function portalConfiguration(s: Stripe): Promise<string> {
  if (portalConfigId) return portalConfigId;
  const list = await s.billingPortal.configurations.list({ limit: 10 });
  const mine = list.data.find(c => c.metadata?.app === 'managero') ?? list.data.find(c => c.is_default);
  if (mine) { portalConfigId = mine.id; return mine.id; }
  const prices = await Promise.all([
    priceFor('pro', 'month'), priceFor('pro', 'year'), priceFor('max', 'month'), priceFor('max', 'year'),
  ]);
  const byProduct = new Map<string, string[]>();
  for (const p of prices) {
    const pid = typeof p.product === 'string' ? p.product : p.product.id;
    byProduct.set(pid, [...(byProduct.get(pid) ?? []), p.id]);
  }
  const conf = await s.billingPortal.configurations.create({
    business_profile: { headline: 'Managero — správa předplatného' },
    features: {
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ['email', 'address', 'name', 'tax_id'] },
      subscription_cancel: { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] } },
      subscription_update: {
        enabled: true, default_allowed_updates: ['price'], proration_behavior: 'create_prorations',
        products: Array.from(byProduct.entries()).map(([product, ps]) => ({ product, prices: ps })),
      },
    },
    metadata: { app: 'managero' },
  });
  portalConfigId = conf.id;
  return conf.id;
}

export async function createPortal(teamId: number): Promise<string> {
  const s = stripe(); if (!s) throw new Error(NOT_CONFIGURED);
  const customer = await ensureCustomer(teamId);
  const configuration = await portalConfiguration(s);
  const session = await s.billingPortal.sessions.create({
    customer, configuration, locale: 'cs',
    return_url: `${appUrl()}/employer/overview?view=settings`,
  });
  return session.url;
}

// ---- Zrcadlení předplatného do týmu (webhook + denní cron) ----
export async function applySubscription(sub: Stripe.Subscription): Promise<number | null> {
  const teamId = Number(sub.metadata?.teamId) || null;
  const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
  let [t] = teamId
    ? await sql`SELECT id, plan, max_offer_until, stripe_subscription_id FROM teams WHERE id = ${teamId}`
    : await sql`SELECT id, plan, max_offer_until, stripe_subscription_id FROM teams WHERE stripe_customer_id = ${customer}`;
  if (!t) {
    [t] = await sql`SELECT id, plan, max_offer_until, stripe_subscription_id FROM teams WHERE stripe_customer_id = ${customer}`;
    if (!t) return null;
  }
  const id = Number(t.id);
  const item = sub.items.data[0];
  const info = planOfPrice(item?.price);
  const status = sub.status;
  const live = ['active', 'trialing', 'past_due'].includes(status);
  // Novější předplatné vyhrává (portál umí založit nové, když staré doběhlo).
  if (t.stripe_subscription_id && t.stripe_subscription_id !== sub.id && !live) return id;

  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString()
    : (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000).toISOString() : null;
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
  const plan: PlanId = live && info ? info.plan : 'free';
  // Po koupi Pro běží 7 dní nabídka Max −30 % — jen jednou.
  const startOffer = live && info?.plan === 'pro' && t.plan !== 'pro' && !t.max_offer_until;
  const offerUntil = startOffer ? new Date(Date.now() + MAX_OFFER_DAYS * 86400000).toISOString() : null;
  await sql`
    UPDATE teams SET
      plan = ${plan},
      stripe_customer_id = COALESCE(stripe_customer_id, ${customer}),
      stripe_subscription_id = ${live ? sub.id : null},
      subscription_status = ${status},
      subscription_interval = ${info?.interval ?? null},
      subscription_price = ${item?.price?.lookup_key ?? null},
      current_period_end = ${periodEnd},
      cancel_at_period_end = ${!!sub.cancel_at_period_end},
      trial_end = ${trialEnd},
      had_subscription = TRUE,
      trial_ends_at = NULL,
      max_offer_until = COALESCE(${offerUntil}, max_offer_until),
      billing_synced_at = NOW()
    WHERE id = ${id}`;
  return id;
}

async function employersOf(teamId: number): Promise<number[]> {
  try {
    const rows = await sql`SELECT id FROM users WHERE team_id = ${teamId} AND role = 'employer'`;
    return rows.map((r: any) => Number(r.id));
  } catch { return []; }
}

// ---- Affiliate: měsíc zdarma za první platbu doporučeného podniku ----
export async function rewardReferrer(referredTeamId: number, invoiceId: string): Promise<boolean> {
  const s = stripe(); if (!s) return false;
  const t = await teamRow(referredTeamId);
  if (!t || !t.referred_by_team_id || t.referral_rewarded) return false;
  const referrerId = Number(t.referred_by_team_id);
  if (referrerId === referredTeamId) return false;
  const month = pragueToday().slice(0, 7);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM referral_rewards WHERE team_id = ${referrerId} AND month = ${month}` as any[];
  if (Number(n) >= REFERRALS_PER_MONTH) {
    // Strop tři podniky měsíčně: označíme jako vyřízené bez odměny, ať se to nezkouší pořád.
    await sql`UPDATE teams SET referral_rewarded = TRUE WHERE id = ${referredTeamId}`;
    return false;
  }
  const ref = await teamRow(referrerId);
  if (!ref) return false;
  // Měsíc zdarma = cena měsíce tarifu, který doporučitel má (nebo Pro, když ještě neplatí).
  const refPlan: PaidPlan = ref.plan === 'max' ? 'max' : 'pro';
  const amount = PRICES[refPlan].month * 100;
  const customer = await ensureCustomer(referrerId);
  try {
    await sql`INSERT INTO referral_rewards (team_id, referred_team_id, month, amount) VALUES (${referrerId}, ${referredTeamId}, ${month}, ${amount})`;
  } catch { return false; /* už odměněno */ }
  await s.customers.createBalanceTransaction(customer, {
    amount: -amount, currency: 'czk',
    description: `Měsíc zdarma za doporučení: ${t.name}`,
    metadata: { referredTeamId: String(referredTeamId), invoiceId },
  });
  await sql`UPDATE teams SET referral_rewarded = TRUE WHERE id = ${referredTeamId}`;
  audit(referrerId, null, 'billing.referral', 'team', referredTeamId, `Měsíc zdarma (${amount / 100} Kč) za ${t.name}`);
  try {
    await notifyUsers(await employersOf(referrerId), {
      title: 'Měsíc zdarma za doporučení 🎉',
      body: `${t.name} začal platit — odečteme ti ${amount / 100} Kč z další faktury.`,
      type: 'billing', link: '/employer/overview?view=settings',
    });
  } catch { /* push best-effort */ }
  return true;
}

// ---- Události z webhooku ----
export async function handleEvent(event: Stripe.Event): Promise<void> {
  const s = stripe(); if (!s) return;
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription' && session.subscription) {
        const sub = await s.subscriptions.retrieve(String(typeof session.subscription === 'string' ? session.subscription : session.subscription.id));
        await applySubscription(sub);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await applySubscription(event.data.object as Stripe.Subscription);
      break;
    }
    case 'customer.subscription.trial_will_end': {
      const sub = event.data.object as Stripe.Subscription;
      const teamId = await applySubscription(sub);
      if (teamId) {
        try {
          await notifyUsers(await employersOf(teamId), {
            title: 'Zkušební období končí za 3 dny',
            body: 'Potom se z karty strhne první platba. Změnit nebo zrušit jde v Nastavení → Předplatné.',
            type: 'billing', link: '/employer/overview?view=settings',
          });
        } catch { /* ignore */ }
      }
      break;
    }
    case 'invoice.paid': {
      const inv = event.data.object as Stripe.Invoice;
      const customer = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
      if (!customer || !(inv.amount_paid > 0)) break;
      const [t] = await sql`SELECT id FROM teams WHERE stripe_customer_id = ${customer}`;
      if (t) {
        await sql`UPDATE teams SET subscription_status = CASE WHEN subscription_status = 'past_due' THEN 'active' ELSE subscription_status END WHERE id = ${t.id}`;
        await rewardReferrer(Number(t.id), inv.id);
      }
      break;
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      const customer = typeof inv.customer === 'string' ? inv.customer : inv.customer?.id;
      if (!customer) break;
      const [t] = await sql`SELECT id FROM teams WHERE stripe_customer_id = ${customer}`;
      if (t) {
        await sql`UPDATE teams SET subscription_status = 'past_due' WHERE id = ${t.id} AND subscription_status IN ('active', 'trialing')`;
        try {
          await notifyUsers(await employersOf(Number(t.id)), {
            title: 'Platba předplatného se nezdařila',
            body: 'Stripe to zkusí znovu. Zkontroluj kartu v Nastavení → Předplatné → Spravovat předplatné.',
            type: 'billing', link: '/employer/overview?view=settings',
          });
        } catch { /* ignore */ }
      }
      break;
    }
    default: break;
  }
}

// ---- Přechod Pro → Max (s kuponem, dokud běží nabídka) ----
export async function upgradeToMax(teamId: number): Promise<{ discounted: boolean }> {
  const s = stripe(); if (!s) throw new Error(NOT_CONFIGURED);
  const t = await teamRow(teamId);
  if (!t?.stripe_subscription_id) throw new Error('Podnik nemá aktivní předplatné.');
  const sub = await s.subscriptions.retrieve(String(t.stripe_subscription_id));
  const item = sub.items.data[0];
  const cur = planOfPrice(item?.price);
  if (!cur || cur.plan === 'max') throw new Error('Podnik už má Max.');
  const target = await priceFor('max', cur.interval);
  const info = planInfoOf(t);
  const discounted = !!info.maxOfferUntil;
  const updated = await s.subscriptions.update(sub.id, {
    items: [{ id: item.id, price: target.id }],
    proration_behavior: 'create_prorations',
    ...(discounted ? { discounts: [{ coupon: MAX_COUPON }] } : {}),
    metadata: { teamId: String(teamId), plan: 'max' },
  });
  await applySubscription(updated);
  await sql`UPDATE teams SET max_offer_until = NULL WHERE id = ${teamId}`;
  audit(teamId, null, 'billing.upgrade', 'team', teamId, `Pro → Max${discounted ? ' (−30 %)' : ''}`);
  return { discounted };
}

// ---- Affiliate kód a stav pro Nastavení ----
export async function referralCodeFor(teamId: number): Promise<string> {
  const t = await teamRow(teamId);
  if (t?.referral_code) return String(t.referral_code);
  for (let i = 0; i < 6; i++) {
    const code = generateJoinCode();
    try {
      await sql`UPDATE teams SET referral_code = ${code} WHERE id = ${teamId} AND referral_code IS NULL`;
      return code;
    } catch { /* kolize, zkus jiný */ }
  }
  throw new Error('Nepodařilo se vytvořit kód.');
}

export async function teamByReferralCode(code: string): Promise<number | null> {
  const c = String(code ?? '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,12}$/.test(c)) return null;
  try {
    const [t] = await sql`SELECT id FROM teams WHERE referral_code = ${c}`;
    return t ? Number(t.id) : null;
  } catch { return null; }
}

export async function billingStatus(teamId: number) {
  const t = await teamRow(teamId);
  const info = planInfoOf(t);
  const code = await referralCodeFor(teamId).catch(() => null);
  const month = pragueToday().slice(0, 7);
  let thisMonth = 0, total = 0, referredCount = 0;
  try {
    const [a] = await sql`SELECT COUNT(*)::int AS n FROM referral_rewards WHERE team_id = ${teamId} AND month = ${month}` as any[];
    const [b] = await sql`SELECT COUNT(*)::int AS n FROM referral_rewards WHERE team_id = ${teamId}` as any[];
    const [c] = await sql`SELECT COUNT(*)::int AS n FROM teams WHERE referred_by_team_id = ${teamId}` as any[];
    thisMonth = Number(a?.n) || 0; total = Number(b?.n) || 0; referredCount = Number(c?.n) || 0;
  } catch { /* před migrací */ }
  return {
    configured: !!stripe(),
    plan: info,
    prices: PRICES,
    subscription: t?.stripe_subscription_id ? {
      status: t.subscription_status, interval: t.subscription_interval, price: t.subscription_price,
      currentPeriodEnd: t.current_period_end, cancelAtPeriodEnd: !!t.cancel_at_period_end, trialEnd: t.trial_end,
    } : null,
    referral: {
      code, link: code ? `${appUrl()}/register?ref=${code}` : null,
      thisMonth, limit: REFERRALS_PER_MONTH, total, referredCount,
    },
  };
}

// ---- Denní dorovnání se Stripe (kdyby webhook nedošel) ----
export async function reconcile(limit = 40): Promise<{ checked: number }> {
  const s = stripe(); if (!s) return { checked: 0 };
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT id, stripe_subscription_id FROM teams
      WHERE stripe_subscription_id IS NOT NULL
      ORDER BY billing_synced_at ASC NULLS FIRST LIMIT ${limit}`;
  } catch { return { checked: 0 }; }
  let checked = 0;
  for (const r of rows) {
    try {
      const sub = await s.subscriptions.retrieve(String(r.stripe_subscription_id));
      await applySubscription(sub);
      checked++;
    } catch {
      await sql`UPDATE teams SET billing_synced_at = NOW() WHERE id = ${r.id}`;
    }
  }
  return { checked };
}
