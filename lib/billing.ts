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
//
// Sandbox a živý účet Stripe jsou dva oddělené světy: jiní zákazníci, jiná
// předplatná. U podniku se proto s ID ukládá i režim (`teams.stripe_mode`,
// z prefixu klíče) a ID z jiného režimu se nikdy neposílá do Stripe — po
// přepnutí na živé klíče by checkout padal na „No such customer". Rozhodnutí
// jsou v billingPravidla.ts (čistá, s testy), tady je jejich provedení.

import { stripeLocale } from './i18n/config';
import { jazykPodniku } from './i18n/jazykPozadavku';
import Stripe from 'stripe';
import { clenoveSOpravnenim } from './opravneniDb';
import { neon } from '@neondatabase/serverless';
import { PRICES, REFERRALS_PER_MONTH, MAX_OFFER_DAYS, TRIAL_DAYS, type Interval, type PlanId, planInfoOf } from './plan';
import { generateJoinCode } from './team';
import { pocetClenu, organizaceTymu, podnikyOrganizace } from './tenant';
import type { CerpaniTarifu } from './plan';
import { zapomenTarif } from './tarifServer';
import { notifyUsers } from './push';
import { audit } from './audit';
import { pragueToday } from './pragueTime';
import { patickaFaktury } from './firma';
import { poleIcoPokladny, icoZPokladny, platneIco, fakturacniPoleIco } from './icoPokladna';
import {
  rezimZKlice, rezimZLivemode, rozhodniOZdroji, jeChybejiciZdroj, jeChybejiciZakaznik, jeSmazanyZakaznik,
  udalostPatriDoRezimu, vyhodnotPredplatne, nabidnoutTrial, jeZivyStav, ulozenyRezim, type StripeRezim,
} from './billingPravidla';

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
/** V jakém režimu Stripe aplikace běží (podle klíče); `null` = neznámý formát klíče. */
export function stripeRezim(): StripeRezim | null {
  return rezimZKlice(process.env.STRIPE_SECRET_KEY);
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
  try {
    const [t] = await sql`
      SELECT t.id, t.name, t.plan, t.stripe_customer_id, t.stripe_subscription_id, t.stripe_mode, t.subscription_status,
             t.subscription_interval, t.current_period_end, t.cancel_at_period_end, t.trial_end, t.max_offer_until,
             t.had_subscription, t.referral_code, t.referred_by_team_id, t.referral_rewarded, t.trial_ends_at,
             u.email AS owner_email, u.name AS owner_name
      FROM teams t LEFT JOIN users u ON u.id = t.owner_id
      WHERE t.id = ${teamId}`;
    return t ?? null;
  } catch {
    // Před migrací (sloupec stripe_mode ještě není): platby jedou postaru,
    // bez kontroly režimu, dokud neproběhne /api/init.
    const [t] = await sql`
      SELECT t.id, t.name, t.plan, t.stripe_customer_id, t.stripe_subscription_id, t.subscription_status,
             t.subscription_interval, t.current_period_end, t.cancel_at_period_end, t.trial_end, t.max_offer_until,
             t.had_subscription, t.referral_code, t.referred_by_team_id, t.referral_rewarded, t.trial_ends_at,
             u.email AS owner_email, u.name AS owner_name
      FROM teams t LEFT JOIN users u ON u.id = t.owner_id
      WHERE t.id = ${teamId}`;
    return t ? { ...t, stripe_mode: null } : null;
  }
}

/** Zapíše režim, do kterého patří uložená ID. Před migrací tiše nic. */
async function oznacRezim(teamId: number, rezim: StripeRezim | null) {
  if (!rezim) return;
  try { await sql`UPDATE teams SET stripe_mode = ${rezim} WHERE id = ${teamId}`; } catch { /* před migrací */ }
}

/**
 * Vymaže z podniku předplatné, které Stripe (v tomhle režimu) nezná: buď je
 * ze sandboxu a klíče se přepnuly na živé, nebo ho někdo smazal. Podnik se
 * vrací na Zdarma — testovací platba nesmí dávat Pro za skutečné peníze.
 * Zkušební doba se vrací jen když šlo o testovací předplatné a jedeme živě
 * (sandbox nesmí spálit skutečný trial).
 */
async function odpojPredplatne(teamId: number, stareId: string, staryRezim: StripeRezim | null, duvod: string) {
  const vratitTrial = rezimZKlice(process.env.STRIPE_SECRET_KEY) === 'live' && staryRezim !== 'live';
  await sql`
    UPDATE teams SET
      plan = 'free',
      stripe_subscription_id = NULL, subscription_status = NULL, subscription_interval = NULL,
      subscription_price = NULL, current_period_end = NULL, cancel_at_period_end = FALSE, trial_end = NULL,
      had_subscription = CASE WHEN ${vratitTrial} THEN FALSE ELSE had_subscription END,
      max_offer_until = CASE WHEN ${vratitTrial} THEN NULL ELSE max_offer_until END,
      billing_synced_at = NOW()
    WHERE id = ${teamId} AND stripe_subscription_id = ${stareId}`;
  audit(teamId, null, 'billing.subscription_reset', 'team', teamId, `Předplatné ${stareId} vymazáno: ${duvod}`);
}

/** Zapomene zákazníka, kterého Stripe (v tomhle režimu) nezná; nový se založí při nejbližším použití. */
async function odpojZakaznika(teamId: number, stareId: string, duvod: string) {
  await sql`UPDATE teams SET stripe_customer_id = NULL WHERE id = ${teamId} AND stripe_customer_id = ${stareId}`;
  audit(teamId, null, 'billing.customer_reset', 'team', teamId, `Zákazník ${stareId} zapomenut: ${duvod}`);
}

/**
 * Srovná uložená ID podniku s účtem Stripe, na kterém aplikace běží, a vrátí
 * čerstvý řádek. ID z jiného režimu se zahodí (zákazník se založí znovu při
 * použití), ID bez značky režimu se jednou ověří dotazem na Stripe a označí.
 * Živé záznamy se z testovacího klíče nikdy nemažou — radši chyba.
 */
export async function srovnejSeStripe(teamId: number) {
  const s = stripe(); if (!s) throw new Error(NOT_CONFIGURED);
  let t = await teamRow(teamId);
  if (!t) throw new Error('Tým nenalezen');
  const rezim = stripeRezim();
  if (!rezim) return t;
  let zmena = false;

  if (t.stripe_subscription_id) {
    const r = rozhodniOZdroji({ id: t.stripe_subscription_id, ulozeny: t.stripe_mode, aktualni: rezim });
    if (r === 'odmitnout') throw new Error('Podnik má živé předplatné, ale aplikace běží na testovacím klíči Stripe.');
    if (r === 'nahradit') {
      await odpojPredplatne(teamId, String(t.stripe_subscription_id), ulozenyRezim(t.stripe_mode), 'patří do jiného režimu Stripe'); zmena = true;
    } else if (r === 'overit') {
      try { await s.subscriptions.retrieve(String(t.stripe_subscription_id)); }
      catch (e) {
        if (!jeChybejiciZdroj(e)) throw e;
        await odpojPredplatne(teamId, String(t.stripe_subscription_id), null, 've Stripe neexistuje'); zmena = true;
      }
    }
  }
  if (t.stripe_customer_id) {
    const r = rozhodniOZdroji({ id: t.stripe_customer_id, ulozeny: t.stripe_mode, aktualni: rezim });
    if (r === 'odmitnout') throw new Error('Podnik má živého zákazníka Stripe, ale aplikace běží na testovacím klíči.');
    if (r === 'nahradit') {
      await odpojZakaznika(teamId, String(t.stripe_customer_id), 'patří do jiného režimu Stripe'); zmena = true;
    } else if (r === 'overit') {
      let existuje = true;
      try { existuje = !jeSmazanyZakaznik(await s.customers.retrieve(String(t.stripe_customer_id))); }
      catch (e) { if (!jeChybejiciZdroj(e)) throw e; existuje = false; }
      if (!existuje) { await odpojZakaznika(teamId, String(t.stripe_customer_id), 've Stripe neexistuje'); zmena = true; }
    }
  }
  // Všechno, co v řádku zbylo, je ověřené pro tenhle režim.
  if (t.stripe_mode !== rezim) { await oznacRezim(teamId, rezim); zmena = true; }
  if (zmena) t = (await teamRow(teamId)) ?? t;
  return t;
}

export async function ensureCustomer(teamId: number): Promise<string> {
  const s = stripe(); if (!s) throw new Error(NOT_CONFIGURED);
  const t = await srovnejSeStripe(teamId);
  if (t.stripe_customer_id) return String(t.stripe_customer_id);
  const c = await s.customers.create({
    name: String(t.name ?? `Podnik ${teamId}`),
    email: t.owner_email ?? undefined,
    metadata: { teamId: String(teamId), app: 'managero' },
    // Patička faktur: identifikace provozovatele a „Nejsem plátce DPH“ (§ 435 OZ, lib/firma.ts).
    invoice_settings: { footer: patickaFaktury() },
    // Jazyk podniku (kolo 76); před migrací sloupce a bez nastavení čeština.
    preferred_locales: [stripeLocale(await jazykPodniku(teamId))],
  });
  // Uloží se jen do prázdného místa: dvě souběžné pokladny by jinak každá
  // založily zákazníka a jedna z nich by přepsala druhou.
  const rezim = stripeRezim();
  let zapsano: any[];
  try {
    zapsano = await sql`UPDATE teams SET stripe_customer_id = ${c.id}, stripe_mode = ${rezim} WHERE id = ${teamId} AND stripe_customer_id IS NULL RETURNING id`;
  } catch {
    zapsano = await sql`UPDATE teams SET stripe_customer_id = ${c.id} WHERE id = ${teamId} AND stripe_customer_id IS NULL RETURNING id`;
  }
  if (zapsano.length === 0) {
    // Někdo byl rychlejší — použije se jeho zákazník a náš přebytečný se smaže.
    try { await s.customers.del(c.id); } catch { /* osiřelý zákazník bez předplatného nevadí */ }
    const znovu = await teamRow(teamId);
    if (znovu?.stripe_customer_id) return String(znovu.stripe_customer_id);
    throw new Error('Zákazníka Stripe se nepodařilo uložit.');
  }
  return c.id;
}

/**
 * Provede akci se zákazníkem Stripe. Když Stripe zákazníka přesto nezná
 * („No such customer" — smazaný v dashboardu, jiný účet, kterého klíč jsme
 * nepoznali), zapomene ho, založí nového a akci zopakuje jednou. Ostatní
 * chyby (síť, limity, neplatná cena) se nezopakují: jinak by výpadek
 * Stripe vedl k zakládání duplicitních zákazníků.
 */
async function sZakaznikem<T>(teamId: number, akce: (customer: string) => Promise<T>): Promise<T> {
  const customer = await ensureCustomer(teamId);
  try {
    return await akce(customer);
  } catch (e) {
    if (!jeChybejiciZakaznik(e)) throw e;
    const rezim = stripeRezim();
    const t = await teamRow(teamId);
    // Živého zákazníka testovací klíč nezahazuje (viz srovnejSeStripe).
    if (rozhodniOZdroji({ id: customer, ulozeny: t?.stripe_mode, aktualni: rezim }) === 'odmitnout') throw e;
    await odpojZakaznika(teamId, customer, 'Stripe ho nezná (resource_missing)');
    return await akce(await ensureCustomer(teamId));
  }
}

/**
 * Patička faktury u zákazníka Stripe (identifikace provozovatele, neplátce DPH) — z lib/firma.ts,
 * jedna pravda pro web i faktury. Doplní ji i zákazníkům založeným dřív a po změně údajů
 * (přechod na s.r.o., DIČ). Nepovedená aktualizace pokladnu nezastaví: fakturu pak ponese
 * výchozí patička z dashboardu Stripe (Settings → Invoices → Default footer), viz docs/PRAVNI.md.
 */
async function nastavPatickuFaktury(s: Stripe, customer: string, ico: string | null = null): Promise<void> {
  try {
    // IČO odběratele (B2B, OP čl. 1) na fakturu, když ho podnik už má v profilu (lib/icoPokladna.ts).
    await s.customers.update(customer, { invoice_settings: { footer: patickaFaktury(), ...(ico ? { custom_fields: fakturacniPoleIco(ico) } : {}) } });
  } catch (e) {
    console.error('billing: patičku faktury se nepodařilo nastavit', customer, (e as { message?: string })?.message ?? e);
  }
}

/** IČO podniku z Nastavení → Profil podniku, jen platné (kontrolní součet). Před migrací null. */
async function icoPodnikuProFakturu(teamId: number): Promise<string | null> {
  try {
    const [r] = await sql`SELECT ico FROM teams WHERE id = ${teamId}`;
    return platneIco(r?.ico);
  } catch { return null; }
}

/**
 * Po zaplacení (checkout.session.completed): IČO z povinného pole pokladny k podniku (teams.ico)
 * a na faktury zákazníka Stripe, název firmy (pokud ho člověk v pokladně uvedl) do jména zákazníka.
 * Neplatný kontrolní součet se neuloží, jen zapíše do historie změn. Nikdy nevyhazuje: webhook se
 * kvůli tomu nesmí opakovat.
 */
async function ulozIcoZPokladny(s: Stripe, session: Stripe.Checkout.Session): Promise<void> {
  try {
    const teamId = Number(session.client_reference_id ?? session.metadata?.teamId);
    if (!Number.isFinite(teamId) || teamId <= 0) return;
    const { ico, zadano } = icoZPokladny(session.custom_fields);
    if (!zadano) return;
    if (!ico) {
      audit(teamId, null, 'billing.ico_neplatne', 'team', teamId, `IČO z pokladny neprošlo kontrolou: ${zadano.slice(0, 12)}`);
      return;
    }
    const zmena = await sql`UPDATE teams SET ico = ${ico} WHERE id = ${teamId} AND ico IS DISTINCT FROM ${ico} RETURNING id`;
    if (zmena.length) audit(teamId, null, 'billing.ico', 'team', teamId, `IČO z pokladny: ${ico}`);
    const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
    if (customer) {
      const firma = String(session.customer_details?.business_name ?? '').trim();
      await s.customers.update(customer, {
        ...(firma ? { name: firma.slice(0, 256) } : {}),
        invoice_settings: { footer: patickaFaktury(), custom_fields: fakturacniPoleIco(ico) },
      });
    }
  } catch (e) {
    console.error('[billing] IČO z pokladny se nepodařilo uložit', session.id, (e as { message?: string })?.message ?? e);
  }
}

/** Chce pokladna Stripe souhlas s podmínkami? Jen s výslovným STRIPE_SOUHLAS_PODMINEK=1 (viz createCheckout). */
export function souhlasVPokladne(env: Record<string, string | undefined> = process.env): boolean {
  return env.STRIPE_SOUHLAS_PODMINEK === '1';
}

// ---- Checkout ----
// hosted = přesměrování na stránku Stripe; embedded = pokladna Stripe vložená
// do našeho okna (components/CheckoutModal.tsx). Karta ani v jednom případě
// neprojde naším kódem.
export type CheckoutMode = 'hosted' | 'embedded';
export async function createCheckout(teamId: number, plan: PaidPlan, interval: Interval, mode: CheckoutMode = 'hosted', jazyk?: string): Promise<{ url?: string; clientSecret?: string }> {
  const s = stripe(); if (!s) throw new Error(NOT_CONFIGURED);
  // Nejdřív srovnat s účtem Stripe: předplatné ze sandboxu nesmí po přepnutí
  // na živé klíče blokovat pokladnu hláškou „podnik už předplatné má".
  const t = await srovnejSeStripe(teamId);
  if (t.stripe_subscription_id && jeZivyStav(t.subscription_status)) {
    throw new Error('Podnik už předplatné má — změny dělej přes „Spravovat předplatné“.');
  }
  const price = await priceFor(plan, interval);
  // Trial s kartou jen jednou na podnik — kdo už předplatné měl, platí hned.
  // Stejné pravidlo používají texty v aplikaci (billingPravidla.nabidnoutTrial).
  const trial = nabidnoutTrial({ hadSubscription: t.had_subscription, stripeSubscriptionId: t.stripe_subscription_id });
  // B2B (OP čl. 1): povinné IČO v pokladně; má-li ho podnik v profilu, je předvyplněné i na faktuře.
  const icoPodniku = await icoPodnikuProFakturu(teamId);
  const session = await sZakaznikem(teamId, async customer => { await nastavPatickuFaktury(s, customer, icoPodniku); return s.checkout.sessions.create({
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
    custom_fields: [poleIcoPokladny(icoPodniku, jazyk)],
    locale: stripeLocale(jazyk),
    subscription_data: {
      metadata: { teamId: String(teamId), plan },
      ...(trial ? {
        trial_period_days: TRIAL_DAYS,
        trial_settings: { end_behavior: { missing_payment_method: 'cancel' } },
      } : {}),
    },
    metadata: { teamId: String(teamId), plan, interval },
    // Souhlas s obchodními podmínkami přímo v pokladně (spuštění, balík P) — JEN se zapnutým
    // STRIPE_SOUHLAS_PODMINEK=1: Stripe vytvoření pokladny odmítne, když v dashboardu
    // (Settings → Public details → Terms of service) chybí adresa podmínek. Bez proměnné se
    // chová jako dřív. Adresa má být https://www.managero.app/obchodni-podminky (docs/PRAVNI.md).
    ...(souhlasVPokladne() ? { consent_collection: { terms_of_service: 'required' as const } } : {}),
    ...(mode === 'embedded' ? {
      // Stripe hodnotu přejmenoval: „embedded“ už neexistuje, platí „embedded_page“.
      ui_mode: 'embedded_page' as const,
      // Zůstat v aplikaci; přesměruje se jen když to banka po 3D Secure vyžaduje.
      redirect_on_completion: 'if_required' as const,
      return_url: `${appUrl()}/employer/overview?view=settings&tab=billing&billing=success`,
    } : {
      success_url: `${appUrl()}/employer/overview?view=settings&tab=billing&billing=success`,
      cancel_url: `${appUrl()}/employer/overview?view=settings&tab=billing&billing=cancel`,
    }),
  }); });
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
    // Neutrální: konfigurace portálu je jedna pro všechny jazyky zákazníků.
    business_profile: { headline: 'Managero' },
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

export async function createPortal(teamId: number, jazyk?: string): Promise<string> {
  const s = stripe(); if (!s) throw new Error(NOT_CONFIGURED);
  const configuration = await portalConfiguration(s);
  const session = await sZakaznikem(teamId, customer => s.billingPortal.sessions.create({
    customer, configuration, locale: stripeLocale(jazyk) as any,
    return_url: `${appUrl()}/employer/overview?view=settings&tab=billing`,
  }));
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
  // Rozhodnutí (nedokončená pokladna, starší předplatné, nabídka Max) jsou
  // v billingPravidla.ts s testy.
  const v = vyhodnotPredplatne({
    status, planZCeny: info?.plan ?? null, ulozenyPlan: t.plan, ulozeneSubId: t.stripe_subscription_id,
    subId: sub.id, nabidkaDo: t.max_offer_until,
  });
  if (v.akce === 'preskocit') return id;
  if (v.live && !info) console.error('[billing] živé předplatné s neznámou cenou — podnik zůstane na Zdarma', sub.id, item?.price?.id);

  const periodEnd = item?.current_period_end ? new Date(item.current_period_end * 1000).toISOString()
    : (sub as any).current_period_end ? new Date((sub as any).current_period_end * 1000).toISOString() : null;
  const trialEnd = sub.trial_end ? new Date(sub.trial_end * 1000).toISOString() : null;
  // Po koupi Pro běží 7 dní nabídka Max −30 % — jen jednou.
  const offerUntil = v.zacitNabidkuMax ? new Date(Date.now() + MAX_OFFER_DAYS * 86400000).toISOString() : null;
  const rezim = rezimZLivemode(sub.livemode) ?? stripeRezim();
  const live = v.live;
  // Platí-li předplatné, zákazník je ten, na kterém běží (portál i faktury se
  // hledají přes něj); u zrušeného zůstává uložený.
  const zapis = (sloupecRezim: boolean) => sloupecRezim ? sql`
    UPDATE teams SET
      plan = ${v.plan},
      stripe_customer_id = CASE WHEN ${live} THEN ${customer} ELSE COALESCE(stripe_customer_id, ${customer}) END,
      stripe_mode = ${rezim},
      stripe_subscription_id = ${live ? sub.id : null},
      subscription_status = ${status},
      subscription_interval = ${info?.interval ?? null},
      subscription_price = ${item?.price?.lookup_key ?? null},
      current_period_end = ${periodEnd},
      cancel_at_period_end = ${!!sub.cancel_at_period_end},
      trial_end = ${trialEnd},
      had_subscription = COALESCE(had_subscription, FALSE) OR ${v.meloPredplatne},
      trial_ends_at = NULL,
      max_offer_until = COALESCE(${offerUntil}, max_offer_until),
      billing_synced_at = NOW()
    WHERE id = ${id}` : sql`
    UPDATE teams SET
      plan = ${v.plan},
      stripe_customer_id = CASE WHEN ${live} THEN ${customer} ELSE COALESCE(stripe_customer_id, ${customer}) END,
      stripe_subscription_id = ${live ? sub.id : null},
      subscription_status = ${status},
      subscription_interval = ${info?.interval ?? null},
      subscription_price = ${item?.price?.lookup_key ?? null},
      current_period_end = ${periodEnd},
      cancel_at_period_end = ${!!sub.cancel_at_period_end},
      trial_end = ${trialEnd},
      had_subscription = COALESCE(had_subscription, FALSE) OR ${v.meloPredplatne},
      trial_ends_at = NULL,
      max_offer_until = COALESCE(${offerUntil}, max_offer_until),
      billing_synced_at = NOW()
    WHERE id = ${id}`;
  try { await zapis(true); } catch { await zapis(false); /* před migrací: sloupec stripe_mode ještě není */ }
  // Brána placených funkcí (lib/tarifServer) si tarif drží 10 s; po změně ho v tomhle isolátu zahodí hned.
  zapomenTarif(id);
  return id;
}

async function employersOf(teamId: number): Promise<number[]> {
  // Platbu řeší ten, kdo smí spravovat předplatné (kolo 67). Jde přes
  // členství, takže dojde i tomu, kdo je právě přepnutý jinam.
  try { return await clenoveSOpravnenim(teamId, 'predplatne.spravovat'); } catch { return []; }
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
      type: 'billing', link: '/employer/overview?view=settings&tab=billing',
    });
  } catch { /* push best-effort */ }
  return true;
}

// ---- Události z webhooku ----
/**
 * Předplatné z události se nebere ze zprávy, ale znovu ze Stripe: události
 * nechodí v pořadí (starší `updated` může dorazit po novějším) a zpráva
 * nese stav z doby odeslání. Když ho Stripe nezná (smazané v sandboxu),
 * platí zpráva; jiná chyba (síť) shodí zpracování a Stripe pošle událost znovu.
 */
async function cerstvePredplatne(s: Stripe, sub: Stripe.Subscription): Promise<Stripe.Subscription> {
  try {
    return await s.subscriptions.retrieve(sub.id);
  } catch (e) {
    if (jeChybejiciZdroj(e)) return sub;
    throw e;
  }
}

export async function handleEvent(event: Stripe.Event): Promise<void> {
  const s = stripe(); if (!s) return;
  // Událost z druhého režimu (sandbox × živý) by dala podniku Pro za testovací
  // platbu nebo naopak. Tiše se přeskočí — jako zpracovaná, ať ji Stripe neopakuje.
  if (!udalostPatriDoRezimu(event.livemode, stripeRezim())) {
    console.warn('[billing] událost z jiného režimu Stripe přeskočena', event.id, event.type);
    return;
  }
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.mode === 'subscription') await ulozIcoZPokladny(s, session);
      if (session.mode === 'subscription' && session.subscription) {
        const sub = await s.subscriptions.retrieve(String(typeof session.subscription === 'string' ? session.subscription : session.subscription.id));
        await applySubscription(sub);
      }
      break;
    }
    case 'customer.subscription.created':
    case 'customer.subscription.updated':
    case 'customer.subscription.deleted': {
      await applySubscription(await cerstvePredplatne(s, event.data.object as Stripe.Subscription));
      break;
    }
    case 'customer.subscription.trial_will_end': {
      const sub = await cerstvePredplatne(s, event.data.object as Stripe.Subscription);
      const teamId = await applySubscription(sub);
      if (teamId) {
        // Kdo předplatné během zkoušky zrušil, nic platit nebude — sdělení
        // „strhne se první platba" by lhalo.
        const zruseno = !!sub.cancel_at_period_end || sub.status !== 'trialing';
        try {
          await notifyUsers(await employersOf(teamId), {
            title: 'Zkušební období končí za 3 dny',
            body: zruseno
              ? 'Předplatné máte zrušené, nic se nestrhne. Po skončení zkoušky se podnik vrátí na tarif Zdarma.'
              : 'Potom se z karty strhne první platba. Změnit nebo zrušit jde v Nastavení → Předplatné.',
            type: 'billing', link: '/employer/overview?view=settings&tab=billing',
          });
        } catch { /* ignore */ }
        // Spuštění (balík G): i e-mailem vlastníkovi, kdo aplikaci zrovna neotevře, by o konci zkoušky nevěděl.
        await (await import('./platbyEmailDb')).emailVlastnikoviOPlatbe(teamId, 'konec_zkousky', { zruseno });
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
            type: 'billing', link: '/employer/overview?view=settings&tab=billing',
          });
        } catch { /* ignore */ }
        // Spuštění (balík G): i e-mailem vlastníkovi s odkazem na Platby (jen push nestačil).
        await (await import('./platbyEmailDb')).emailVlastnikoviOPlatbe(Number(t.id), 'platba_selhala', { pokus: typeof inv.attempt_count === 'number' ? inv.attempt_count : null });
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

/**
 * Aktivní sdílené odkazy podniku — týž dotaz, kterým POST /api/share odmítá další
 * odkaz na plánu Zdarma (app/api/share/route.ts), ať se číslo v kartě a v chybě neliší.
 */
export async function pocetSdilenychOdkazu(teamId: number): Promise<number> {
  try {
    const [r] = await sql`SELECT COUNT(*)::int AS n FROM share_links WHERE team_id = ${teamId} AND enabled = TRUE` as any[];
    return Number(r?.n ?? 0);
  } catch { return 0; /* tabulka před migrací — není co počítat, stejně jako u limitu */ }
}

/**
 * Čerpání limitů tarifu pro kartu Váš plán. Lidé stejnou funkcí jako vymáhání limitu
 * (pocetClenu — canAddMember ve všech cestách, kudy člen přibývá), odkazy stejným dotazem
 * jako POST /api/share; podniky jen v organizaci.
 */
export async function cerpaniTarifu(teamId: number): Promise<CerpaniTarifu> {
  const [members, shareLinks, teams] = await Promise.all([
    pocetClenu(teamId).catch(() => 0),
    pocetSdilenychOdkazu(teamId),
    organizaceTymu(teamId).then(o => (o ? podnikyOrganizace(o.id).then(p => p.length) : null)).catch(() => null),
  ]);
  return { members, shareLinks, teams };
}

export async function billingStatus(teamId: number) {
  const t = await teamRow(teamId);
  const info = planInfoOf(t);
  const usage = await cerpaniTarifu(teamId);
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
    usage,
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
export async function reconcile(limit = 40): Promise<{ checked: number; reset: number }> {
  const s = stripe(); if (!s) return { checked: 0, reset: 0 };
  const rezim = stripeRezim();
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT id, stripe_subscription_id, stripe_mode FROM teams
      WHERE stripe_subscription_id IS NOT NULL
      ORDER BY billing_synced_at ASC NULLS FIRST LIMIT ${limit}`;
  } catch {
    try {
      rows = await sql`
        SELECT id, stripe_subscription_id FROM teams
        WHERE stripe_subscription_id IS NOT NULL
        ORDER BY billing_synced_at ASC NULLS FIRST LIMIT ${limit}`;
    } catch { return { checked: 0, reset: 0 }; }
  }
  let checked = 0, reset = 0;
  for (const r of rows) {
    const subId = String(r.stripe_subscription_id);
    try {
      const rozhodnuti = rozhodniOZdroji({ id: subId, ulozeny: r.stripe_mode, aktualni: rezim });
      // Živé předplatné se z testovacího klíče nedotýkáme; jen se odloží na příště.
      if (rozhodnuti === 'odmitnout') { await sql`UPDATE teams SET billing_synced_at = NOW() WHERE id = ${r.id}`; continue; }
      // Předplatné z druhého režimu Stripe nemá smysl číst — nikdy tam nebylo.
      if (rozhodnuti === 'nahradit') {
        await odpojPredplatne(Number(r.id), subId, ulozenyRezim(r.stripe_mode), 'patří do jiného režimu Stripe');
        reset++; continue;
      }
      const sub = await s.subscriptions.retrieve(subId);
      await applySubscription(sub);
      checked++;
    } catch (e) {
      if (jeChybejiciZdroj(e)) {
        // Stripe předplatné nezná (sandbox po vyčištění, ID z jiného účtu).
        // Nechat podniku Pro napořád by byl dar zdarma.
        try { await odpojPredplatne(Number(r.id), subId, null, 've Stripe neexistuje'); reset++; continue; } catch { /* níž */ }
      }
      await sql`UPDATE teams SET billing_synced_at = NOW() WHERE id = ${r.id}`;
    }
  }
  return { checked, reset };
}
