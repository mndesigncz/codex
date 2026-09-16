// Zprávy členům v plné síle (po vzoru Kartičky): zpráva umí počkat na svůj
// čas (scheduled_at), mířit na publikum (všem / kdo dlouho nebyl / úroveň /
// ruční skupina) a nést cíl, kam hosta vezme (link_kind).
//
// Plánování bez minutového cronu: naplánovaná zpráva leží ve frontě a
// dispatchDueBroadcasts() ji pošle, jakmile ji kdokoli „potká" — otevření
// správy, návštěva hosta (client/me), nebo noční crony. Odeslání si řádek
// atomicky přivlastní (status scheduled → sent), takže dva souběžné
// dispatchery zprávu nepošlou dvakrát.

import { sql } from './client';
import { notifyUsers } from './push';

export const AUDIENCES = ['all', 'quiet', 'tier:silver', 'tier:gold', 'tier:platinum'] as const;

export function audienceLabel(a: string, groupName?: string | null): string {
  if (a === 'quiet') return 'kdo dlouho nebyl';
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

/**
 * Kdo do publika patří. Úrovně se počítají z prahů podniku (visits),
 * „tier:silver" znamená Stříbrný A VÝŠ — zpráva pro věrné, ne jen pro
 * jednu přihrádku.
 */
export async function audienceIds(teamId: number, audience: string): Promise<number[]> {
  let rows: any[] = [];
  if (audience === 'quiet') {
    rows = await sql`
      SELECT customer_id FROM client_memberships
      WHERE team_id = ${teamId} AND (last_visit_at IS NULL OR last_visit_at < NOW() - INTERVAL '30 days')` as any[];
  } else if (audience.startsWith('tier:')) {
    const [p] = await sql`SELECT silver_at, gold_at, platinum_at FROM client_profiles WHERE team_id = ${teamId}`;
    const silverAt = Math.max(1, Number(p?.silver_at) || 10);
    const goldAt = Math.max(silverAt + 1, Number(p?.gold_at) || 25);
    const platinumAt = Number(p?.platinum_at) > 0 ? Math.max(goldAt + 1, Number(p?.platinum_at)) : 0;
    const tier = audience.slice(5);
    const from = tier === 'platinum' ? (platinumAt || goldAt) : tier === 'gold' ? goldAt : silverAt;
    rows = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${teamId} AND visits >= ${from}` as any[];
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
      type: 'info', category: 'general',
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
