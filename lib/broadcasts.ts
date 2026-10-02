// Zprávy členům v plné síle (po vzoru Kartičky): zpráva umí počkat na svůj
// čas (scheduled_at), mířit na publikum (všem / kdo dlouho nebyl / úroveň /
// ruční skupina) a nést cíl, kam hosta vezme (link_kind).
//
// Plánování bez minutového cronu: naplánovaná zpráva leží ve frontě a
// dispatchDueBroadcasts() ji pošle, jakmile ji kdokoli „potká" — otevření
// správy, návštěva hosta (client/me), nebo noční crony. Odeslání si řádek
// atomicky přivlastní (status scheduled → sent), takže dva souběžné
// dispatchery zprávu nepošlou dvakrát.

import { tierThresholds, tierRulesFromProfile } from './clientSlots';
import { sql } from './client';
import { notifyUsers } from './push';
import { pragueToday } from './pragueTime';
import { SEGMENTY, jeSegment, stitekPublika, vyberClenu, spoctiSegmenty, type ClenSegmentu, type KontextSegmentu } from './segmenty';

export const AUDIENCES = ['all', 'quiet', 'tier:silver', 'tier:gold', 'tier:platinum'] as const;

export function audienceLabel(a: string, groupName?: string | null): string {
  if (jeSegment(a)) return stitekPublika(a) ?? 'všem členům';
  if (a === 'tier:silver') return 'Stříbrní a výš';
  if (a === 'tier:gold') return 'Zlatí a výš';
  if (a === 'tier:platinum') return 'Platinoví hosté';
  if (a.startsWith('group:')) return groupName ? `skupina ${groupName}` : 'skupina';
  return 'všem členům';
}

/** Kam zpráva hosta vezme. Cesta se skládá ze slugu podniku. */
export function linkFor(kind: string | null | undefined, slug: string | null): string {
  const base = slug ? `/client/${slug}` : '/client';
  if (kind === 'loyalty') return `${base}?tab=loyalty`;
  if (kind === 'events') return `${base}?tab=menu`;
  if (kind === 'order') return `${base}?tab=order`;
  if (kind === 'me') return '/client/me';
  return base;
}

/** Členové s údaji, podle kterých se řadí do segmentů (jeden průchod, bez N+1). */
async function nactiClenySegmentu(teamId: number): Promise<{ clenove: ClenSegmentu[]; kontext: KontextSegmentu }> {
  const rows = await sql`
    SELECT m.customer_id, m.points, m.last_visit_at, m.joined_at, us.birthday
    FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${teamId}` as any[];
  // Razítka: kolik chybí do nejbližší odměny v aktivních kampaních, kde host už něco nasbíral.
  const chybi = new Map<number, number>();
  try {
    const st = await sql`
      SELECT p.customer_id, MIN(c.required_stamps - p.stamps)::int AS chybi
      FROM client_stamp_progress p JOIN client_stamp_campaigns c ON c.id = p.campaign_id
      WHERE p.team_id = ${teamId} AND c.active = TRUE AND p.stamps > 0 AND p.stamps < c.required_stamps
      GROUP BY p.customer_id` as any[];
    for (const r of st) chybi.set(Number(r.customer_id), Number(r.chybi));
  } catch { /* bez kampaní nikdo blízko není */ }
  let cenyKuponu: number[] = [];
  try {
    const kp = await sql`SELECT cost_points FROM client_coupons WHERE team_id = ${teamId} AND active = TRUE AND cost_points > 0` as any[];
    cenyKuponu = kp.map(r => Number(r.cost_points));
  } catch { cenyKuponu = []; }
  const dnes = pragueToday();
  return {
    clenove: rows.map(r => ({
      id: Number(r.customer_id), points: Number(r.points) || 0,
      lastVisitAt: r.last_visit_at ?? null, joinedAt: r.joined_at ?? null,
      birthday: r.birthday ? String(r.birthday) : null,
      chybiRazitek: chybi.get(Number(r.customer_id)) ?? null,
    })),
    kontext: { now: new Date(), mesic: parseInt(dnes.slice(5, 7), 10), cenyKuponu },
  };
}

/** Počty členů ve všech segmentech, pro výběr komu zprávu poslat. */
export async function segmentyPocty(teamId: number): Promise<Record<string, number>> {
  try {
    const { clenove, kontext } = await nactiClenySegmentu(teamId);
    return spoctiSegmenty(clenove, kontext);
  } catch {
    return Object.fromEntries(SEGMENTY.map(s => [s.id, 0]));
  }
}

/**
 * Kdo do publika patří. Úrovně se počítají z prahů podniku (visits),
 * „tier:silver" znamená Stříbrný A VÝŠ — zpráva pro věrné, ne jen pro
 * jednu přihrádku.
 */
export async function audienceIds(teamId: number, audience: string): Promise<number[]> {
  let rows: any[] = [];
  if (jeSegment(audience)) {
    const { clenove, kontext } = await nactiClenySegmentu(teamId);
    return vyberClenu(audience, clenove, kontext);
  } else if (audience.startsWith('tier:')) {
    // Prahy i režim (návštěvy / útrata) z jedné funkce s pravidly podniku.
    const [p] = await sql`SELECT * FROM client_profiles WHERE team_id = ${teamId}`;
    const th = tierThresholds(tierRulesFromProfile(p));
    const tier = audience.slice(5);
    const from = tier === 'platinum' ? (th.platinum || th.gold) : tier === 'gold' ? th.gold : th.silver;
    rows = th.by === 'spend'
      ? await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND spend >= ${from}` as any[]
      : await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND visits >= ${from}` as any[];
  } else if (audience.startsWith('group:')) {
    const gid = parseInt(audience.slice(6), 10);
    if (Number.isFinite(gid)) {
      try {
        rows = await sql`SELECT customer_id FROM client_group_members WHERE team_id = ${teamId} AND group_id = ${gid}` as any[];
      } catch { rows = []; }
    }
  } else {
    rows = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId}` as any[];
  }
  return rows.map(r => Number(r.customer_id));
}

/** Pošle jeden řádek zprávy (už přivlastněný) a doplní počet příjemců. */
async function deliver(row: any): Promise<number> {
  const teamId = Number(row.team_id);
  const [p] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${teamId}`;
  const ids = await audienceIds(teamId, String(row.audience ?? 'all'));
  if (ids.length) {
    await notifyUsers(ids, {
      title: String(row.title),
      body: row.body ? String(row.body) : undefined,
      link: linkFor(row.link_kind, p?.slug ?? null),
      type: 'info', category: 'novinky',
    });
  }
  await sql`UPDATE client_broadcasts SET recipients = ${ids.length} WHERE id = ${row.id}`;
  return ids.length;
}

/**
 * Odešle všechny naplánované zprávy, jejichž čas nastal. Bezpečné volat
 * odkudkoli a klidně souběžně; chyba nesmí položit volající endpoint.
 */
export async function dispatchDueBroadcasts(): Promise<number> {
  let sent = 0;
  try {
    const due = await sql`
      SELECT id FROM client_broadcasts
      WHERE status = 'scheduled' AND scheduled_at <= NOW()
      ORDER BY scheduled_at LIMIT 5` as any[];
    for (const d of due) {
      // Atomické přivlastnění: kdo přepne scheduled → sent, ten posílá.
      const [claimed] = await sql`
        UPDATE client_broadcasts SET status = 'sent', sent_at = NOW()
        WHERE id = ${d.id} AND status = 'scheduled' RETURNING *`;
      if (!claimed) continue;
      try { await deliver(claimed); sent += 1; }
      catch (e) { console.error('broadcast deliver failed', claimed.id, e); }
    }
  } catch { /* fronta bez migrace nebo výpadek — příště */ }
  return sent;
}

/** Okamžité odeslání nové zprávy (bez plánování). */
export async function sendNow(row: any): Promise<number> {
  return deliver(row);
}
