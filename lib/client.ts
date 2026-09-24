// Managero client — zákaznická strana aplikace.
//
// Doteď Managero vidělo jen tým: směny, sklad, uzávěrky. Tohle je poprvé, kdy
// do aplikace vstupuje host. Má vlastní roli („customer"), vlastní veřejné
// stránky (/client) a k podnikům se váže členstvím, ne týmem — jeden host může
// být členem víc podniků. Vedení to spravuje v režimu Client vedle TO GO.
//
// Co tu je: kdo je host (tým hlídá lib/opravneniDb), profil podniku podle
// veřejné adresy, členství, věrnostní účet (body, razítka, návštěvy) a kupony.

import { neon } from '@neondatabase/serverless';
import { getServerSession } from 'next-auth';
import { randomBytes } from 'crypto';
import { authOptions } from './auth';
import { notifyUser } from './push';
import { pragueToday } from './pragueTime';
import { slotsFor as _slotsFor } from './clientSlots';

// Veřejné routy hosta (podnik podle adresy, seznam podniků) sahají do
// databáze dřív, než se dotknou session. Next.js na Vercelu takové volání
// Neonu i přes `force-dynamic` cachoval, takže host viděl profil podniku ve
// stavu, v jakém byl při prvním zobrazení — zapnuté objednávky nebo nové
// motto se mu neukázaly. Odpověď databáze se cachovat nesmí nikdy.
export const sql = neon(process.env.DATABASE_URL!, { fetchOptions: { cache: 'no-store' } });

// ---- Kdo je kdo ------------------------------------------------------------

export interface Customer { id: number; name: string; email: string }

/** Přihlášený host. Kdokoli jiný (tým, nikdo) → null. */
export async function customer(): Promise<Customer | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id || u.role !== 'customer') return null;
  const [row] = await sql`SELECT id, name, email FROM users WHERE id = ${parseInt(String(u.id))} AND role = 'customer'`;
  return row ? { id: Number(row.id), name: String(row.name), email: String(row.email) } : null;
}

// ---- Profil podniku --------------------------------------------------------

export function slugify(raw: any): string {
  return String(raw ?? '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export const DEFAULT_PROFILE = {
  enabled: false,
  tagline: '',
  description: '',
  address: '',
  cover_url: '',
  reservations_on: true,
  ordering_on: false,
  loyalty_on: true,
  points_per_100: 5,
  stamp_target: 10,
  stamp_reward: 'Nápoj zdarma',
  max_party: 8,
  lead_days: 30,
  slot_minutes: 30,
  menu_slug: null as string | null,
};

/** Profil podniku pro tým; když ještě není, založí se výchozí (vypnutý). */
export async function ensureProfile(teamId: number): Promise<any> {
  const [existing] = await sql`SELECT * FROM client_profiles WHERE team_id = ${teamId}`;
  if (existing) return existing;
  const [team] = await sql`SELECT name FROM teams WHERE id = ${teamId}`;
  let slug = slugify(team?.name) || `podnik-${teamId}`;
  for (let i = 0; i < 5; i++) {
    const [clash] = await sql`SELECT team_id FROM client_profiles WHERE slug = ${slug}`;
    if (!clash) break;
    slug = `${slugify(team?.name) || 'podnik'}-${randomBytes(2).toString('hex')}`;
  }
  const d = DEFAULT_PROFILE;
  const [row] = await sql`
    INSERT INTO client_profiles (team_id, slug, enabled, tagline, description, address, cover_url,
      reservations_on, ordering_on, loyalty_on, points_per_100, stamp_target, stamp_reward, max_party, lead_days, slot_minutes, menu_slug)
    VALUES (${teamId}, ${slug}, ${d.enabled}, ${d.tagline}, ${d.description}, ${d.address}, ${d.cover_url},
      ${d.reservations_on}, ${d.ordering_on}, ${d.loyalty_on}, ${d.points_per_100}, ${d.stamp_target}, ${d.stamp_reward}, ${d.max_party}, ${d.lead_days}, ${d.slot_minutes}, ${d.menu_slug})
    ON CONFLICT (team_id) DO UPDATE SET team_id = EXCLUDED.team_id
    RETURNING *`;
  return row;
}

/** Zapnutý profil podle veřejné adresy, i s tím, co host smí vidět z týmu. */
export async function profileBySlug(slug: string): Promise<any | null> {
  const s = slugify(slug);
  if (!s) return null;
  try {
    const [row] = await sql`
      SELECT p.*, t.name AS team_name, t.opening_hours, t.share_theme, t.currency
      FROM client_profiles p JOIN teams t ON t.id = p.team_id
      WHERE p.slug = ${s} AND p.enabled = TRUE AND t.blocked_at IS NULL`;
    return row ?? null;
  } catch {
    // Databáze před migrací správy platformy: sloupec blocked_at ještě není.
    const [row] = await sql`
      SELECT p.*, t.name AS team_name, t.opening_hours, t.share_theme, t.currency
      FROM client_profiles p JOIN teams t ON t.id = p.team_id
      WHERE p.slug = ${s} AND p.enabled = TRUE`;
    return row ?? null;
  }
}

/** Tvar profilu, který jde ven hostovi — bez id týmu a interních věcí. */
export function publicProfile(p: any) {
  const theme = p.share_theme ?? {};
  return {
    slug: p.slug,
    name: theme.businessName || p.team_name,
    tagline: p.tagline ?? '',
    description: p.description ?? '',
    address: p.address ?? '',
    coverUrl: p.cover_url || theme.logoUrl || '',
    hours: p.opening_hours ?? {},
    currency: p.currency ?? 'CZK',
    reservationsOn: !!p.reservations_on,
    orderingOn: !!p.ordering_on,
    loyaltyOn: !!p.loyalty_on,
    pointsPer100: Number(p.points_per_100) || 0,
    tiers: {
      silverAt: Number(p.silver_at) || 10, goldAt: Number(p.gold_at) || 25,
      platinumAt: Number(p.platinum_at) || 0,
      memberDiscount: Number(p.member_discount) || 0,
      silverDiscount: Number(p.silver_discount) || 0,
      goldDiscount: Number(p.gold_discount) || 0,
      platinumDiscount: Number(p.platinum_discount) || 0,
    },
    cashbackPct: Number(p.cashback_pct) || 0,
    stampTarget: Number(p.stamp_target) || 0,
    stampReward: p.stamp_reward ?? '',
    maxParty: Number(p.max_party) || 8,
    leadDays: Number(p.lead_days) || 30,
    slotMinutes: Number(p.slot_minutes) || 30,
    logoUrl: p.logo_url || '',
    gallery: Array.isArray(p.gallery) ? p.gallery : [],
    accent: p.accent || '',
    orderQrRequired: p.order_qr_required !== false,
    orderGeo: (p.order_geo === 'off' || p.lat == null || p.lng == null) ? 'off' : (p.order_geo === 'block' ? 'block' : 'warn'),
  };
}

// ---- Členství a věrnost ----------------------------------------------------

export async function membership(customerId: number, teamId: number): Promise<any | null> {
  const [m] = await sql`SELECT * FROM client_memberships WHERE customer_id = ${customerId} AND team_id = ${teamId}`;
  return m ?? null;
}

export async function join(customerId: number, teamId: number): Promise<any> {
  const [existing] = await sql`SELECT id FROM client_memberships WHERE customer_id = ${customerId} AND team_id = ${teamId}`;
  const [m] = await sql`
    INSERT INTO client_memberships (customer_id, team_id) VALUES (${customerId}, ${teamId})
    ON CONFLICT (customer_id, team_id) DO UPDATE SET customer_id = EXCLUDED.customer_id
    RETURNING *`;
  // Pozvi kamaráda: odměna padá při PRVNÍM členství ve společném podniku.
  // award() volá join() taky, ale to už členství existuje, takže se nezacyklí.
  if (!existing) {
    await maybeReferralReward(customerId, teamId).catch(() => {});
    // Uvítací balíček: aktivní welcome kupony padnou novému členovi samy.
    // Dynamický import, ať se lib/client a lib/coupons nezacyklí.
    try {
      const { grantWelcomeCoupons } = await import('./coupons');
      await grantWelcomeCoupons(teamId, customerId, couponCode);
    } catch { /* uvítací kupony nesmí shodit vstup do podniku */ }
  }
  return m;
}

/**
 * Odměna za pozvání: nový člen byl pozvaný (users.referred_by), podnik má
 * odměnu zapnutou a pozvatel je tu taky členem — oba dostanou body. Deník
 * hlídá nejvýš jednou na pozvaného a podnik.
 */
async function maybeReferralReward(customerId: number, teamId: number): Promise<void> {
  const [u] = await sql`SELECT referred_by, name FROM users WHERE id = ${customerId}`;
  const inviter = Number(u?.referred_by);
  if (!inviter || inviter === customerId) return;
  const [p] = await sql`SELECT referral_points, enabled, loyalty_on, slug FROM client_profiles WHERE team_id = ${teamId}`;
  const pts = Number(p?.referral_points) || 0;
  if (!p?.enabled || !p?.loyalty_on || pts <= 0) return;
  const [im] = await sql`SELECT id FROM client_memberships WHERE customer_id = ${inviter} AND team_id = ${teamId}`;
  if (!im) return;
  const [done] = await sql`SELECT id FROM client_loyalty_ledger WHERE team_id = ${teamId} AND customer_id = ${customerId} AND kind = 'referral'`;
  if (done) return;
  const [iv] = await sql`SELECT name FROM users WHERE id = ${inviter}`;
  await award(teamId, customerId, pts, 'referral', `ref:${inviter}`, `Pozvání od ${iv?.name ?? 'kamaráda'}`);
  await award(teamId, inviter, pts, 'referral', `invited:${customerId}`, `Pozval(a) ${u?.name ?? 'kamaráda'}`);
  notifyUser(inviter, {
    title: `+${pts} bodů za pozvání`,
    body: `${u?.name ?? 'Kamarád'} se přes tvůj kód přidal k podniku.`,
    link: p.slug ? `/client/${p.slug}` : '/client/me', type: 'success',
  }).catch(() => {});
}

export type LedgerKind = 'visit' | 'order' | 'manual' | 'coupon' | 'welcome' | 'birthday' | 'referral' | 'cashback' | 'credit';

/**
 * Připíše (nebo odečte) body a zapíše to do deníku. Body nikdy nejdou pod
 * nulu — kupon za víc, než host má, se prostě nedá vzít.
 */
export async function award(teamId: number, customerId: number, delta: number, kind: LedgerKind, ref?: string | null, note?: string | null): Promise<number> {
  await join(customerId, teamId);
  const [m] = await sql`
    UPDATE client_memberships SET points = GREATEST(0, points + ${delta})
    WHERE customer_id = ${customerId} AND team_id = ${teamId}
    RETURNING points`;
  await sql`
    INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note)
    VALUES (${teamId}, ${customerId}, ${delta}, ${kind}, ${ref ?? null}, ${note ?? null})`;
  return Number(m?.points ?? 0);
}

/**
 * Utracení bodů za odměnu. Na rozdíl od award(-cost) je odečet atomický:
 * `points = points - cost WHERE points >= cost` proběhne v jednom kroku,
 * takže dva souběžné požadavky nemůžou utratit stejné body dvakrát (dvojklik,
 * dvě zařízení). Vrací nový zůstatek, nebo null, když body nestačí.
 */
export async function spendPoints(teamId: number, customerId: number, cost: number, kind: LedgerKind, ref?: string | null, note?: string | null): Promise<number | null> {
  await join(customerId, teamId);
  const [m] = await sql`
    UPDATE client_memberships SET points = points - ${cost}
    WHERE customer_id = ${customerId} AND team_id = ${teamId} AND points >= ${cost}
    RETURNING points`;
  if (!m) return null;
  await sql`
    INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note)
    VALUES (${teamId}, ${customerId}, ${-cost}, ${kind}, ${ref ?? null}, ${note ?? null})`;
  return Number(m.points);
}

/**
 * Uplatnění kreditu u kasy. Atomicky jako spendPoints: odečte se jen tehdy,
 * když kredit stačí, takže dvojklik / dvě zařízení nepřečerpají zůstatek.
 * awardCredit(+/-) zůstává na přičítání; na odečet je tohle, protože
 * GREATEST(0, ...) tam přečerpání jen skrývalo. Vrací nový zůstatek, nebo null.
 */
export async function spendCredit(teamId: number, customerId: number, amountCzk: number, kind: LedgerKind, ref?: string | null, note?: string | null): Promise<number | null> {
  await join(customerId, teamId);
  const amt = Math.round(amountCzk);
  const [m] = await sql`
    UPDATE client_memberships SET credit = credit - ${amt}
    WHERE customer_id = ${customerId} AND team_id = ${teamId} AND credit >= ${amt}
    RETURNING credit`;
  if (!m) return null;
  await sql`
    INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, credit_delta, kind, ref, note)
    VALUES (${teamId}, ${customerId}, 0, ${-amt}, ${kind}, ${ref ?? null}, ${note ?? null})`;
  return Number(m.credit);
}

/** Návštěva: +1 razítko, +1 návštěva; po dosažení cíle se razítka vynulují a vznikne kupon na odměnu. */
export async function stampVisit(teamId: number, customerId: number, profile: any, ref?: string): Promise<{ stamps: number; rewarded: boolean; already?: boolean }> {
  await join(customerId, teamId);
  const target = Number(profile?.stamp_target) || 0;
  // Razítko nejvýš jedno za pražský den. Podmínka je přímo v UPDATE, takže dva
  // rychlé pokusy neprojdou oba — dřív se „už dnes byl" kontrolovalo zvlášť a
  // dalo se to dvojklikem obejít (dvě razítka, dvě návštěvy, dvakrát odměna).
  const [m] = await sql`
    UPDATE client_memberships SET stamps = stamps + 1, visits = visits + 1, last_visit_at = NOW()
    WHERE customer_id = ${customerId} AND team_id = ${teamId}
      AND (last_visit_at IS NULL OR
           (last_visit_at AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date
             < (NOW() AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague')::date)
    RETURNING stamps`;
  if (!m) {
    // Dnes už razítko má — vrátí se aktuální stav beze změny.
    const [cur] = await sql`SELECT stamps FROM client_memberships WHERE customer_id = ${customerId} AND team_id = ${teamId}`;
    return { stamps: Number(cur?.stamps ?? 0), rewarded: false, already: true };
  }
  let stamps = Number(m?.stamps ?? 0);
  let rewarded = false;
  if (target > 0 && stamps >= target) {
    await sql`UPDATE client_memberships SET stamps = 0 WHERE customer_id = ${customerId} AND team_id = ${teamId}`;
    stamps = 0; rewarded = true;
    // Odměna za razítka je kupon, který host ukáže u kasy.
    const [coupon] = await sql`
      INSERT INTO client_coupons (team_id, title, description, cost_points, active, kind)
      VALUES (${teamId}, ${profile?.stamp_reward || 'Odměna za razítka'}, 'Za nasbíraná razítka.', 0, TRUE, 'stamps')
      RETURNING id`;
    await sql`
      INSERT INTO client_coupon_claims (coupon_id, customer_id, team_id, code)
      VALUES (${coupon.id}, ${customerId}, ${teamId}, ${couponCode()})`;
    await sql`INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note) VALUES (${teamId}, ${customerId}, 0, 'visit', ${ref ?? null}, 'Razítka doplněna — odměna')`;
  } else {
    await sql`INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, kind, ref, note) VALUES (${teamId}, ${customerId}, 0, 'visit', ${ref ?? null}, 'Razítko za návštěvu')`;
  }
  return { stamps, rewarded };
}

/** Kód kuponu: čitelný, bez zaměnitelných znaků (0/O, 1/I). */
export function couponCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(6);
  let s = '';
  for (let i = 0; i < 6; i++) s += abc[b[i] % abc.length];
  return s.slice(0, 3) + '-' + s.slice(3);
}

// ---- Rezervace: sloty (sdílené s prohlížečem) --------------------------------
export { slotsFor } from './clientSlots';

// ---- Kartička hosta -----------------------------------------------------------

/** Kód kartičky: osm znaků bez zaměnitelných písmen, zapsaný jako ABCD-EFGH. */
export function cardCode(): string {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = randomBytes(8);
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[b[i] % abc.length];
  return s.slice(0, 4) + '-' + s.slice(4);
}

/** Kartička hosta; když ještě není, vznikne. Jeden kód pro všechny podniky. */
export async function ensureCard(customerId: number): Promise<string> {
  const [c] = await sql`SELECT code FROM client_cards WHERE customer_id = ${customerId}`;
  if (c) return String(c.code);
  for (let i = 0; i < 5; i++) {
    const code = cardCode();
    try {
      await sql`INSERT INTO client_cards (customer_id, code) VALUES (${customerId}, ${code})`;
      return code;
    } catch { /* kolize kódu — zkusit jiný */ }
  }
  throw new Error('Kartičku se nepodařilo vytvořit.');
}

/** Normalizace kódu z klávesnice nebo skeneru: velká písmena, bez mezer, s pomlčkou. */
export function normalizeCardCode(raw: string): string {
  const s = String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (s.length !== 8) return '';
  return s.slice(0, 4) + '-' + s.slice(4);
}

export async function customerByCard(code: string): Promise<{ id: number; name: string } | null> {
  const norm = normalizeCardCode(code);
  if (!norm) return null;
  const [row] = await sql`SELECT u.id, u.name FROM client_cards c JOIN users u ON u.id = c.customer_id WHERE c.code = ${norm}`;
  return row ? { id: Number(row.id), name: String(row.name) } : null;
}


/**
 * Dárek k narozeninám: členům, kteří mají dnes narozeniny, se připíšou body
 * podniku (birthday_points > 0). Volá se z denního cronu; deník hlídá, že
 * každý dostane nejvýš jednou za rok na podnik.
 */
export async function awardBirthdays(): Promise<number> {
  const today = pragueToday();
  const md = today.slice(5); const year = today.slice(0, 4);
  const rows = await sql`
    SELECT m.customer_id, m.team_id, p.birthday_points, p.slug, COALESCE(t.name, 'podniku') AS team_name
    FROM client_memberships m
    JOIN client_profiles p ON p.team_id = m.team_id AND p.enabled = TRUE AND p.loyalty_on = TRUE AND p.birthday_points > 0
    LEFT JOIN teams t ON t.id = m.team_id
    JOIN users us ON us.id = m.customer_id
    WHERE us.birthday IS NOT NULL AND substr(us.birthday, 6, 5) = ${md}
      AND NOT EXISTS (
        SELECT 1 FROM client_loyalty_ledger l
        WHERE l.team_id = m.team_id AND l.customer_id = m.customer_id AND l.kind = 'birthday' AND l.ref = ${'bday:' + year})` as any[];
  let n = 0;
  for (const r of rows) {
    try {
      await award(Number(r.team_id), Number(r.customer_id), Number(r.birthday_points), 'birthday', `bday:${year}`, 'Dárek k narozeninám');
      notifyUser(Number(r.customer_id), {
        title: `Všechno nejlepší! ${r.birthday_points} bodů od ${r.team_name}`,
        body: 'Dárek k narozeninám máš na kartičce.',
        link: r.slug ? `/client/${r.slug}?tab=loyalty` : '/client/me', type: 'success',
      }).catch(() => {});
      n++;
    } catch { /* další člen; nepovedené připsání nesmí zastavit ostatní */ }
  }
  return n;
}


/**
 * Kredit z útraty (cashback). Na rozdíl od bodů se utrácí přímo v korunách
 * u kasy, takže se drží v členství zvlášť a v deníku má vlastní sloupec.
 */
export async function awardCredit(teamId: number, customerId: number, deltaCzk: number, kind: LedgerKind, ref?: string | null, note?: string | null): Promise<number> {
  await join(customerId, teamId);
  const [m] = await sql`
    UPDATE client_memberships SET credit = GREATEST(0, credit + ${Math.round(deltaCzk)})
    WHERE customer_id = ${customerId} AND team_id = ${teamId} RETURNING credit`;
  await sql`
    INSERT INTO client_loyalty_ledger (team_id, customer_id, delta, credit_delta, kind, ref, note)
    VALUES (${teamId}, ${customerId}, 0, ${Math.round(deltaCzk)}, ${kind}, ${ref ?? null}, ${note ?? null})`;
  return Number(m?.credit ?? 0);
}

/** Souhrnná čísla věrnosti pro přehled: co je v oběhu a co čeká na vyzvednutí. */
export async function loyaltySummary(teamId: number) {
  const [m] = await sql`
    SELECT COUNT(*)::int AS members, COALESCE(SUM(points), 0)::int AS points, COALESCE(SUM(credit), 0)::int AS credit,
           COALESCE(SUM(stamps), 0)::int AS stamps, COALESCE(SUM(visits), 0)::int AS visits,
           COUNT(*) FILTER (WHERE joined_at >= NOW() - INTERVAL '30 days')::int AS new30
    FROM client_memberships WHERE team_id = ${teamId}` as any[];
  const [c] = await sql`
    SELECT COUNT(*) FILTER (WHERE redeemed_at IS NULL)::int AS open,
           COUNT(*) FILTER (WHERE redeemed_at IS NOT NULL)::int AS redeemed
    FROM client_coupon_claims WHERE team_id = ${teamId}` as any[];
  const [l] = await sql`
    SELECT COALESCE(SUM(delta) FILTER (WHERE delta > 0 AND created_at >= NOW() - INTERVAL '30 days'), 0)::int AS given30,
           COALESCE(SUM(-delta) FILTER (WHERE delta < 0 AND created_at >= NOW() - INTERVAL '30 days'), 0)::int AS spent30
    FROM client_loyalty_ledger WHERE team_id = ${teamId}` as any[];
  return {
    members: Number(m?.members) || 0, newMembers30: Number(m?.new30) || 0,
    points: Number(m?.points) || 0, credit: Number(m?.credit) || 0,
    stamps: Number(m?.stamps) || 0, visits: Number(m?.visits) || 0,
    couponsOpen: Number(c?.open) || 0, couponsRedeemed: Number(c?.redeemed) || 0,
    pointsGiven30: Number(l?.given30) || 0, pointsSpent30: Number(l?.spent30) || 0,
  };
}
