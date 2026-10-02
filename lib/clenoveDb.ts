// Členové a skupiny v databázi: načtení členů s úrovní, slevou a skupinami, dynamické
// skupiny (pravidla se promítají do client_group_members, takže kupony a slevy
// skupin fungují stejně jako u ručních) a poznámky k hostovi.
// Čistá logika: lib/clenoveFiltr.ts. Sloupce se zajišťují i tady (IF NOT EXISTS při
// prvním použití); stejné příkazy jsou v app/api/init/route.ts (blok „Kolo 81“).

import { sql, ensureProfile } from './client';
import { maKampane } from './stamps';
import { tierForMember, tierRulesFromProfile } from './clientSlots';
import { efektivniSleva } from './slevy';
import { pragueToday } from './pragueTime';
import { vyberPodlePravidel, normalizujPravidla, type ClenFiltrovany, type PravidlaSkupiny } from './clenoveFiltr';

let pripraveno: Promise<void> | null = null;

/** Zajistí sloupce skupin a tabulku poznámek. Jednou za studený start. */
export function zajistiClenove(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS discount_pct INTEGER NOT NULL DEFAULT 0`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS description TEXT`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS color TEXT`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS rules JSONB`;
      await sql`ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS rules_refreshed_at TIMESTAMP`;
      await sql`
        CREATE TABLE IF NOT EXISTS client_member_notes (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          customer_id INTEGER NOT NULL,
          body TEXT NOT NULL,
          created_by INTEGER,
          created_at TIMESTAMP DEFAULT NOW()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_member_notes_customer ON client_member_notes (team_id, customer_id)`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS coupon_id INTEGER`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS promo_id INTEGER`;
      await sql`ALTER TABLE client_broadcasts ADD COLUMN IF NOT EXISTS muted INTEGER NOT NULL DEFAULT 0`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

export interface SkupinaClena { id: number; name: string; color: string | null }

export interface ClenTymu extends ClenFiltrovany {
  email: string | null;
  birthday: string | null;
  credit: number;
  level: string;
  level_label: string;
  /** Úroveň po pauze snížená (tier_inactive_months). */
  level_reduced: boolean;
  discount: number;
  discount_source: 'uroven' | 'skupina' | null;
  discount_name: string | null;
  skupiny: SkupinaClena[];
}

/** Členové podniku s údaji pro filtry (jeden dotaz, bez N+1). Bez skupin, úrovní a slev. */
export async function nactiZaklad(teamId: number): Promise<Omit<ClenTymu, 'level' | 'level_label' | 'level_reduced' | 'discount' | 'discount_source' | 'discount_name' | 'skupiny'>[]> {
  const rows = await sql`
    SELECT m.customer_id AS id, us.name, us.email, us.birthday, m.points, m.stamps, m.visits, m.joined_at, m.last_visit_at,
           COALESCE((to_jsonb(m)->>'spend')::int, 0) AS spend,
           COALESCE((to_jsonb(m)->>'credit')::int, 0) AS credit,
           COALESCE(oc.n, 0) AS open_coupons
    FROM client_memberships m
    JOIN users us ON us.id = m.customer_id
    LEFT JOIN (
      SELECT customer_id, COUNT(*)::int AS n FROM client_coupon_claims
      WHERE team_id = ${teamId} AND redeemed_at IS NULL GROUP BY customer_id
    ) oc ON oc.customer_id = m.customer_id
    WHERE m.team_id = ${teamId}` as any[];
  // Razítka: s kampaněmi je zdrojem pravdy průběh kampaní, ne staré počítadlo na členství (dvojí počítadlo).
  const razitkaBy = new Map<number, number>();
  try {
    if (await maKampane(teamId)) {
      const sp = await sql`
        SELECT p.customer_id, COALESCE(SUM(p.stamps), 0)::int AS s FROM client_stamp_progress p
        JOIN client_stamp_campaigns c ON c.id = p.campaign_id AND c.active = TRUE
        WHERE p.team_id = ${teamId} GROUP BY p.customer_id` as any[];
      for (const r of sp) razitkaBy.set(Number(r.customer_id), Number(r.s) || 0);
      for (const r of rows) if (!razitkaBy.has(Number(r.id))) razitkaBy.set(Number(r.id), 0);
    }
  } catch { /* před migrací zůstane počítadlo z členství */ }
  return rows.map(r => ({
    id: Number(r.id), name: String(r.name ?? ''), email: r.email ? String(r.email) : null,
    birthday: r.birthday ? String(r.birthday) : null,
    points: Number(r.points) || 0, stamps: razitkaBy.size ? (razitkaBy.get(Number(r.id)) ?? 0) : (Number(r.stamps) || 0), visits: Number(r.visits) || 0,
    spend: Number(r.spend) || 0, credit: Number(r.credit) || 0,
    joined_at: r.joined_at ?? null, last_visit_at: r.last_visit_at ?? null,
    open_coupons: Number(r.open_coupons) || 0,
  }));
}

/** Členové s úrovní, efektivní slevou a skupinami (štítky v seznamu). */
export async function nactiClenyTymu(teamId: number): Promise<ClenTymu[]> {
  await zajistiClenove();
  const [zaklad, profil, sk] = await Promise.all([
    nactiZaklad(teamId),
    ensureProfile(teamId),
    sql`
      SELECT gm.customer_id, g.id, g.name, g.color, COALESCE(g.discount_pct, 0) AS discount_pct
      FROM client_group_members gm
      JOIN client_groups g ON g.id = gm.group_id AND g.team_id = gm.team_id
      WHERE gm.team_id = ${teamId}
      ORDER BY g.name, g.id` as Promise<any[]>,
  ]);
  const pravidla = tierRulesFromProfile(profil);
  const poHostu = new Map<number, { id: number; name: string; color: string | null; discount: number }[]>();
  for (const r of sk) {
    const c = Number(r.customer_id);
    if (!poHostu.has(c)) poHostu.set(c, []);
    poHostu.get(c)!.push({ id: Number(r.id), name: String(r.name), color: r.color ? String(r.color) : null, discount: Number(r.discount_pct) || 0 });
  }
  return zaklad.map(c => {
    const t = tierForMember({ visits: c.visits, spend: c.spend, lastVisitAt: c.last_visit_at }, pravidla);
    const gs = poHostu.get(c.id) ?? [];
    const s = efektivniSleva({ uroven: t, skupiny: gs.filter(g => g.discount > 0).map(g => ({ name: g.name, discount: g.discount })) });
    return {
      ...c, level: t.id, level_label: t.label, level_reduced: !!t.reduced,
      discount: s.pct, discount_source: s.zdroj, discount_name: s.nazev,
      skupiny: gs.map(g => ({ id: g.id, name: g.name, color: g.color })),
    };
  });
}

/** Pražský kontext pro filtry (měsíc podle pražského dne, ne podle UTC). */
export function kontextFiltru(): { now: Date; mesic: number } {
  return { now: new Date(), mesic: parseInt(pragueToday().slice(5, 7), 10) };
}

/** Jak dlouho platí vypočtené členství dynamické skupiny, než se přepočítá znovu. */
export const OBNOVA_SKUPIN_MIN = 30;

/**
 * Přepočítá členy dynamických skupin podniku. Bez `force` jen skupiny, které se dlouho
 * nepřepočítaly; přepočet si skupina atomicky přivlastní (UPDATE … RETURNING), takže dva
 * souběžné požadavky nepřepočítají totéž dvakrát. Vrací počet přepočítaných skupin.
 */
export async function obnovDynamickeSkupiny(teamId: number, opts: { force?: boolean; groupId?: number } = {}): Promise<number> {
  await zajistiClenove();
  const skupiny = await sql`
    SELECT id, rules FROM client_groups
    WHERE team_id = ${teamId} AND rules IS NOT NULL
      AND (${opts.groupId ?? 0} = 0 OR id = ${opts.groupId ?? 0})` as any[];
  if (!skupiny.length) return 0;
  const minuty = opts.force ? 0 : OBNOVA_SKUPIN_MIN;
  let clenove: ClenFiltrovany[] | null = null;
  let hotovo = 0;
  for (const g of skupiny) {
    const pravidla = normalizujPravidla(g.rules);
    if (!pravidla) continue;
    const [vzal] = await sql`
      UPDATE client_groups SET rules_refreshed_at = NOW()
      WHERE id = ${g.id} AND team_id = ${teamId}
        AND (rules_refreshed_at IS NULL OR rules_refreshed_at < NOW() - (${minuty} || ' minutes')::interval)
      RETURNING id`;
    if (!vzal) continue;
    clenove ??= await nactiZaklad(teamId);
    await prepocitejClenyDynamicke(teamId, Number(g.id), pravidla, clenove);
    hotovo += 1;
  }
  return hotovo;
}

/** Noční přepočet dynamických skupin všech podniků (cron), ať kupony a slevy skupin nejedou na starém stavu. */
export async function obnovVsechnyDynamickeSkupiny(): Promise<number> {
  await zajistiClenove();
  const tymy = await sql`SELECT DISTINCT team_id FROM client_groups WHERE rules IS NOT NULL` as any[];
  let n = 0;
  for (const t of tymy) {
    try { n += await obnovDynamickeSkupiny(Number(t.team_id), { force: true }); }
    catch (e) { console.error('[skupiny] noční přepočet selhal', t.team_id, e); }
  }
  return n;
}

/** Jedna skupina: smaže ty, kdo už pravidla nesplňují, a doplní nové. */
export async function prepocitejClenyDynamicke(teamId: number, groupId: number, pravidla: PravidlaSkupiny, clenove?: ClenFiltrovany[]): Promise<number> {
  const zdroj: ClenFiltrovany[] = clenove ?? await nactiZaklad(teamId);
  const ids = vyberPodlePravidel(zdroj, pravidla, kontextFiltru());
  await sql`DELETE FROM client_group_members WHERE group_id = ${groupId} AND team_id = ${teamId} AND NOT (customer_id = ANY(${ids}))`;
  if (ids.length) {
    await sql`
      INSERT INTO client_group_members (group_id, customer_id, team_id)
      SELECT ${groupId}, m.customer_id, ${teamId} FROM client_memberships m
      WHERE m.team_id = ${teamId} AND m.customer_id = ANY(${ids})
      ON CONFLICT (group_id, customer_id) DO NOTHING`;
  }
  return ids.length;
}

export interface PoznamkaHosta { id: number; body: string; created_at: string; created_by: number | null; autor: string | null }

export async function poznamkyHosta(teamId: number, customerId: number): Promise<PoznamkaHosta[]> {
  await zajistiClenove();
  const rows = await sql`
    SELECT n.id, n.body, n.created_at, n.created_by, us.name AS autor
    FROM client_member_notes n LEFT JOIN users us ON us.id = n.created_by
    WHERE n.team_id = ${teamId} AND n.customer_id = ${customerId}
    ORDER BY n.created_at DESC, n.id DESC LIMIT 50` as any[];
  return rows.map(r => ({ id: Number(r.id), body: String(r.body), created_at: String(r.created_at), created_by: r.created_by == null ? null : Number(r.created_by), autor: r.autor ? String(r.autor) : null }));
}
