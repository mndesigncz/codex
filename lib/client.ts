// Managero client — zákaznická strana aplikace.
//
// Doteď Managero vidělo jen tým: směny, sklad, uzávěrky. Tohle je poprvé, kdy
// do aplikace vstupuje host. Má vlastní roli („customer"), vlastní veřejné
// stránky (/client) a k podnikům se váže členstvím, ne týmem — jeden host může
// být členem víc podniků. Vedení to spravuje v režimu Client vedle TO GO.
//
// Co tu je: kdo je kdo (customer / employer / člen týmu), profil podniku podle
// veřejné adresy, členství, věrnostní účet (body, razítka, návštěvy) a kupony.

import { neon } from '@neondatabase/serverless';
import { getServerSession } from 'next-auth';
import { randomBytes } from 'crypto';
import { authOptions } from './auth';
import { notifyUsers } from './push';
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

/** Vedení s týmem — spravuje Client svého podniku. */
export async function employer(): Promise<{ id: number; team_id: number } | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id) return null;
  const [row] = await sql`SELECT id, role, team_id FROM users WHERE id = ${parseInt(String(u.id))}`;
  if (!row || row.role !== 'employer' || !row.team_id) return null;
  return { id: Number(row.id), team_id: Number(row.team_id) };
}

/** Kdokoli z týmu (vedení, zaměstnanec, kiosk) — obsluha, která přijímá objednávky. */
export async function teamMember(): Promise<{ id: number; role: string; team_id: number } | null> {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id) return null;
  const [row] = await sql`SELECT id, role, team_id FROM users WHERE id = ${parseInt(String(u.id))}`;
  if (!row || !row.team_id || !['employer', 'employee', 'kiosk'].includes(String(row.role))) return null;
  return { id: Number(row.id), role: String(row.role), team_id: Number(row.team_id) };
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
  const [row] = await sql`
    SELECT p.*, t.name AS team_name, t.opening_hours, t.share_theme, t.currency
    FROM client_profiles p JOIN teams t ON t.id = p.team_id
    WHERE p.slug = ${s} AND p.enabled = TRUE`;
  return row ?? null;
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
    stampTarget: Number(p.stamp_target) || 0,
    stampReward: p.stamp_reward ?? '',
    maxParty: Number(p.max_party) || 8,
    leadDays: Number(p.lead_days) || 30,
    slotMinutes: Number(p.slot_minutes) || 30,
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
  const [m] = await sql`
    INSERT INTO client_memberships (customer_id, team_id) VALUES (${customerId}, ${teamId})
    ON CONFLICT (customer_id, team_id) DO UPDATE SET customer_id = EXCLUDED.customer_id
    RETURNING *`;
  return m;
}

export type LedgerKind = 'visit' | 'order' | 'manual' | 'coupon' | 'welcome';

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

/** Návštěva: +1 razítko, +1 návštěva; po dosažení cíle se razítka vynulují a vznikne kupon na odměnu. */
export async function stampVisit(teamId: number, customerId: number, profile: any, ref?: string): Promise<{ stamps: number; rewarded: boolean }> {
  await join(customerId, teamId);
  const target = Number(profile?.stamp_target) || 0;
  const [m] = await sql`
    UPDATE client_memberships SET stamps = stamps + 1, visits = visits + 1, last_visit_at = NOW()
    WHERE customer_id = ${customerId} AND team_id = ${teamId}
    RETURNING stamps`;
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

// ---- Oznámení vedení -------------------------------------------------------

export async function notifyTeamEmployers(teamId: number, payload: { title: string; body?: string; link?: string; type?: string }) {
  try {
    const rows = await sql`SELECT id FROM users WHERE team_id = ${teamId} AND role = 'employer'`;
    const ids = (rows as any[]).map(r => Number(r.id));
    if (ids.length) await notifyUsers(ids, { ...payload, category: 'general' });
  } catch { /* oznámení je best-effort */ }
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
