// Společné pro routy /api/navic (kolo 9, N1): tvar řádku, načtení se jmény,
// založení a zrušení odměny (body → point_awards kind 'navic', prémie →
// wage_adjustments source 'navic') a oznámení. Čistá pravidla jsou v lib/navic.ts.
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { clenoveSOpravnenim } from '@/lib/opravneniDb';
import { oznameniNovyZapis, oznameniRozhodnuti, type Navic, type StavNavic } from '@/lib/navic';

const sql = neon(process.env.DATABASE_URL!);

/** Tabulka ještě není (před migrací) → 42P01; sloupec chybí → 42703. */
export const predMigraci = (e: unknown) => {
  const kod = (e as { code?: string } | null)?.code;
  return kod === '42P01' || kod === '42703';
};

/** Řádek z SELECT_NAVIC → tvar pro klienta (lib/navic Navic). */
export function tvarNavic(r: any): Navic {
  const cele = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    userName: String(r.user_name ?? ''),
    userAvatar: r.user_avatar ?? null,
    reportedBy: cele(r.reported_by),
    reportedByName: r.reported_by_name ?? null,
    day: String(r.day ?? '').slice(0, 10),
    shiftId: cele(r.shift_id),
    closingId: cele(r.closing_id),
    taskId: cele(r.task_id),
    offerId: cele(r.offer_id),
    offerTitle: r.offer_title ?? null,
    text: String(r.text ?? ''),
    photoUrl: r.photo_url ?? null,
    pointsProposed: cele(r.points_proposed),
    status: (['ceka', 'uznano', 'odmitnuto'].includes(String(r.status)) ? String(r.status) : 'ceka') as StavNavic,
    points: cele(r.points),
    bonusCzk: cele(r.bonus_czk),
    decidedBy: cele(r.decided_by),
    decidedByName: r.decided_by_name ?? null,
    decidedAt: r.decided_at ? new Date(r.decided_at).toISOString() : null,
    decisionNote: r.decision_note ?? null,
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
  };
}

export async function nactiNavic(id: number, teamId: number): Promise<any | null> {
  const [row] = await sql`
    SELECT w.id, w.user_id, w.reported_by, w.day, w.shift_id, w.closing_id, w.task_id, w.offer_id, w.text, w.photo_url,
      w.points_proposed, w.status, w.points, w.bonus_czk, w.award_id, w.adjustment_id, w.decided_by, w.decided_at,
      w.decision_note, w.created_at,
      u.name AS user_name, u.avatar AS user_avatar, r.name AS reported_by_name, d.name AS decided_by_name, o.title AS offer_title
    FROM extra_work w
    LEFT JOIN users u ON u.id = w.user_id
    LEFT JOIN users r ON r.id = w.reported_by
    LEFT JOIN users d ON d.id = w.decided_by
    LEFT JOIN extra_offers o ON o.id = w.offer_id
    WHERE w.id = ${id} AND w.team_id = ${teamId}`;
  return row ?? null;
}

/**
 * Založí odměnu k uznanému zápisu: body do point_awards (kind 'navic', ať jdou do
 * Mého výdělku, žebříčku a profilu), prémii do wage_adjustments (source 'navic',
 * ať je ve výplatě). Vrací id obou řádků (null, když nic).
 */
export async function zalozOdmenu(o: { teamId: number; userId: number; points: number | null; bonusCzk: number | null; reason: string; day: string; givenBy: number | null; navicId: number }): Promise<{ awardId: number | null; adjustmentId: number | null }> {
  let awardId: number | null = null;
  let adjustmentId: number | null = null;
  const duvod = `Navíc: ${o.reason}`.slice(0, 200);
  if (o.points && o.points > 0) {
    try {
      const [a] = await sql`
        INSERT INTO point_awards (team_id, user_id, points, reason, given_by, kind, auto_key)
        VALUES (${o.teamId}, ${o.userId}, ${o.points}, ${duvod}, ${o.givenBy}, 'navic', ${`navic:${o.navicId}`})
        RETURNING id`;
      awardId = Number(a.id);
    } catch {
      // Před migrací kind/auto_key (kolo 8): bez nich, ať body nepropadnou.
      const [a] = await sql`
        INSERT INTO point_awards (team_id, user_id, points, reason, given_by)
        VALUES (${o.teamId}, ${o.userId}, ${o.points}, ${duvod}, ${o.givenBy})
        RETURNING id`;
      awardId = Number(a.id);
    }
  }
  if (o.bonusCzk && o.bonusCzk > 0) {
    const [w] = await sql`
      INSERT INTO wage_adjustments (team_id, user_id, day, amount, note, source, source_ref, created_by)
      VALUES (${o.teamId}, ${o.userId}, ${o.day}, ${o.bonusCzk}, ${duvod}, 'navic', ${o.navicId}, ${o.givenBy})
      RETURNING id`;
    adjustmentId = Number(w.id);
  }
  return { awardId, adjustmentId };
}

/** Zruší odměnu (po odmítnutí už uznaného nebo po smazání zápisu). */
export async function zrusOdmenu(teamId: number, awardId: number | null, adjustmentId: number | null): Promise<void> {
  if (awardId) await sql`DELETE FROM point_awards WHERE id = ${awardId} AND team_id = ${teamId}`;
  if (adjustmentId) await sql`DELETE FROM wage_adjustments WHERE id = ${adjustmentId} AND team_id = ${teamId}`;
}

/** Nový zápis čeká: oznámit těm, kdo smí uznávat (bez autora samotného). */
export async function oznamUznavajicim(teamId: number, autorId: number, jmeno: string, text: string): Promise<void> {
  try {
    const ids = (await clenoveSOpravnenim(teamId, 'navic.uznat')).filter(id => id !== autorId);
    if (!ids.length) return;
    const o = oznameniNovyZapis(jmeno, text);
    await notifyUsers(ids, { title: o.title, body: o.body, link: '/employer/overview?view=rewards&arg=navic', type: 'navic', category: 'general' });
  } catch (e) {
    console.error('navic: oznámení uznávajícím', e);
  }
}

/** Rozhodnuto: oznámit člověku, kterého se to týká (ne tomu, kdo rozhodl, i kdyby šlo o něj). */
export async function oznamRozhodnuti(z: Navic, rozhodlId: number | null, kc: (n: number) => string): Promise<void> {
  if (z.userId === rozhodlId) return;
  try {
    const o = oznameniRozhodnuti(z, kc);
    await notifyUser(z.userId, { title: o.title, body: o.body, link: '/employee/shifts?view=rewards&arg=navic', type: 'navic', category: 'general' });
  } catch (e) {
    console.error('navic: oznámení o rozhodnutí', e);
  }
}


/** Řádek extra_offers → tvar pro klienta (lib/navic NabidkaNavic). */
export function tvarNabidky(r: any) {
  return {
    id: Number(r.id),
    title: String(r.title ?? ''),
    description: r.description ?? null,
    points: Number(r.points) || 0,
    bonusCzk: r.bonus_czk == null ? null : Number(r.bonus_czk),
    autoApprove: r.auto_approve === true,
    active: r.active !== false,
    validFrom: r.valid_from ? String(r.valid_from).slice(0, 10) : null,
    validTo: r.valid_to ? String(r.valid_to).slice(0, 10) : null,
    maxPerDay: r.max_per_day == null ? null : Number(r.max_per_day),
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
  };
}
