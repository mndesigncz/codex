// Společné pro routy /api/navic (kolo 9, N1): tvar řádku, načtení se jmény,
// založení a zrušení odměny (body → point_awards kind 'navic', prémie →
// wage_adjustments source 'navic') a oznámení. Čistá pravidla jsou v lib/navic.ts.
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { clenoveSOpravnenim } from '@/lib/opravneniDb';
import { typNaUcet } from '@/lib/opravneni';
import { jeUcetTabletu, resolveActingUser } from '@/lib/kioskActing';
import { jeClenem } from '@/lib/tenant';
import { oznameniNovyZapis, oznameniRozhodnuti, rozsahTerminu, type NabidkaNavic, type Navic, type StavNavic } from '@/lib/navic';

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
export function tvarNabidky(r: any): NabidkaNavic {
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
    recurrence: (['kdykoli', 'jednou', 'denne', 'dny', 'tydne', 'mesicne', 'interval'].includes(String(r.recurrence)) ? String(r.recurrence) : 'kdykoli') as NabidkaNavic['recurrence'],
    recDays: Array.isArray(r.rec_days) ? r.rec_days.map(Number).filter((d: number) => d >= 1 && d <= 7) : [],
    recInterval: r.rec_interval == null ? null : Number(r.rec_interval),
    capacity: r.capacity == null ? null : Number(r.capacity),
    requirePhoto: r.require_photo === true,
    targetUsers: Array.isArray(r.target_users) ? r.target_users.map(Number).filter((d: number) => d > 0) : [],
    createdAt: r.created_at ? new Date(r.created_at).toISOString() : '',
  };
}

/**
 * Kdo má volitelný úkol v termínu (kolo 11): zápisy z položky v rozsahu termínu
 * (po lidech) a zábory „Beru si". Obsazeno = různí lidé s platným zápisem nebo
 * záborem (vzato / hotovo). Bez tabulky záborů (před migrací) jen zápisy.
 */
export async function obsazenostTerminu(teamId: number, n: NabidkaNavic, termin: string): Promise<{
  zapisy: Map<number, { status: StavNavic; id: number }[]>;
  zabory: Map<number, 'vzato' | 'hotovo'>;
  jmena: Map<number, string>;
  obsazeno: number;
}> {
  const { od, do: doDne } = rozsahTerminu(n, termin);
  const zapisy = new Map<number, { status: StavNavic; id: number }[]>();
  const zabory = new Map<number, 'vzato' | 'hotovo'>();
  const jmena = new Map<number, string>();
  const rows = await sql`
    SELECT w.id, w.user_id, w.status, u.name FROM extra_work w LEFT JOIN users u ON u.id = w.user_id
    WHERE w.team_id = ${teamId} AND w.offer_id = ${n.id} AND w.day >= ${od} AND w.day <= ${doDne}
    ORDER BY w.created_at`;
  for (const r of rows as any[]) {
    const uid = Number(r.user_id);
    const st = (['ceka', 'uznano', 'odmitnuto'].includes(String(r.status)) ? String(r.status) : 'ceka') as StavNavic;
    zapisy.set(uid, [...(zapisy.get(uid) ?? []), { status: st, id: Number(r.id) }]);
    jmena.set(uid, String(r.name ?? ''));
  }
  try {
    const zr = await sql`
      SELECT c.user_id, c.status, u.name FROM extra_claims c LEFT JOIN users u ON u.id = c.user_id
      WHERE c.team_id = ${teamId} AND c.offer_id = ${n.id} AND c.termin = ${termin} AND c.status IN ('vzato', 'hotovo')`;
    for (const r of zr as any[]) {
      zabory.set(Number(r.user_id), r.status === 'hotovo' ? 'hotovo' : 'vzato');
      jmena.set(Number(r.user_id), String(r.name ?? ''));
    }
  } catch (e) {
    if (!predMigraci(e)) throw e;
  }
  const lide = new Set<number>();
  for (const [uid, z] of zapisy) if (z.some(x => x.status !== 'odmitnuto')) lide.add(uid);
  for (const uid of zabory.keys()) lide.add(uid);
  return { zapisy, zabory, jmena, obsazeno: lide.size };
}

/** Po zápisu z volitelného úkolu: zábor člověka v termínu je hotový (s odkazem na zápis). */
export async function zaborHotovo(teamId: number, offerId: number, termin: string, userId: number, workId: number): Promise<void> {
  try {
    await sql`
      INSERT INTO extra_claims (team_id, offer_id, termin, user_id, status, work_id, updated_at)
      VALUES (${teamId}, ${offerId}, ${termin}, ${userId}, 'hotovo', ${workId}, NOW())
      ON CONFLICT (offer_id, termin, user_id) DO UPDATE SET status = 'hotovo', work_id = ${workId}, updated_at = NOW()`;
  } catch (e) {
    if (!predMigraci(e)) console.error('navic: zábor hotovo', e);
  }
}

/**
 * Za koho jedná tablet u „navíc" a úkolů za body: jako resolveActingUser (jen
 * odpíchnutý), a navíc kdo z tohoto podniku odešel za poslední 3 hodiny — navíc
 * se zapisuje a úkoly za body se dodělávají právě po odchodu (souhrn na tabletu).
 * Mimo tablet vždy volající.
 */
export async function kdoJednaNavic(c: { meId: number; teamId: number; role: { typ: string } }, actingAs: unknown, req: Request): Promise<number> {
  const ucet = typNaUcet(c.role.typ as any);
  const actingId = await resolveActingUser(c.meId, ucet, c.teamId, actingAs, req);
  const chceZa = Number(actingAs);
  if (ucet !== 'kiosk' || actingId !== c.meId || !Number.isInteger(chceZa) || chceZa <= 0 || chceZa === c.meId) return actingId;
  if (!c.teamId || !(await jeUcetTabletu(c.meId, c.teamId)) || !(await jeClenem(chceZa, c.teamId))) return actingId;
  try {
    const [r] = await sql`
      SELECT 1 AS ok FROM time_entries
      WHERE employee_id = ${chceZa} AND (team_id = ${c.teamId} OR team_id IS NULL)
        AND clock_out IS NOT NULL AND clock_out >= NOW() - INTERVAL '3 hours'
      LIMIT 1`;
    return r ? chceZa : actingId;
  } catch {
    return actingId;
  }
}
