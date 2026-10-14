// Společné pro routy /api/tresty (kolo 10): tvar řádku, načtení se jmény,
// založení a zrušení trestu (body dolů → point_awards kind 'trest' záporně,
// krácení prémie → wage_adjustments source 'trest' záporně), strop krácení
// a oznámení. Čistá pravidla jsou v lib/tresty.ts.
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { clenoveSOpravnenim } from '@/lib/opravneniDb';
import { oznameniTrest, oznameniVyjadreni, oznameniZruseni, stropKraceni, type StavTrestu, type Trest, type ZdrojTrestu } from '@/lib/tresty';

const sql = neon(process.env.DATABASE_URL!);

/** Tabulka ještě není (před migrací) → 42P01; sloupec chybí → 42703. */
export const predMigraci = (e: unknown) => {
  const kod = (e as { code?: string } | null)?.code;
  return kod === '42P01' || kod === '42703';
};

const iso = (v: unknown): string | null => (v ? new Date(v as string).toISOString() : null);

/** Řádek z nactiTrest / GET → tvar pro klienta (lib/tresty Trest). */
export function tvarTrestu(r: any): Trest {
  const cele = (v: unknown): number | null => (v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const zdroj = String(r.source ?? 'rucne');
  return {
    id: Number(r.id),
    userId: Number(r.user_id),
    userName: String(r.user_name ?? ''),
    userAvatar: r.user_avatar ?? null,
    givenBy: cele(r.given_by),
    givenByName: r.given_by_name ?? null,
    day: String(r.day ?? '').slice(0, 10),
    shiftId: cele(r.shift_id),
    closingId: cele(r.closing_id),
    taskId: cele(r.task_id),
    typeId: cele(r.type_id),
    typeTitle: r.type_title ?? null,
    text: String(r.text ?? ''),
    photoUrl: r.photo_url ?? null,
    points: Math.max(0, Number(r.points) || 0),
    bonusCut: Math.max(0, Number(r.bonus_cut) || 0),
    status: (r.status === 'zruseno' ? 'zruseno' : 'plati') as StavTrestu,
    source: (['rucne', 'pozde', 'manko', 'vytka'].includes(zdroj) ? zdroj : 'rucne') as ZdrojTrestu,
    sourceKey: r.source_key ?? null,
    seenAt: iso(r.seen_at),
    response: r.response ?? null,
    responseAt: iso(r.response_at),
    disputed: r.disputed === true,
    disputeHandledAt: iso(r.dispute_handled_at),
    cancelledBy: cele(r.cancelled_by),
    cancelledByName: r.cancelled_by_name ?? null,
    cancelledAt: iso(r.cancelled_at),
    cancelNote: r.cancel_note ?? null,
    createdAt: iso(r.created_at) ?? '',
  };
}

export async function nactiTrest(id: number, teamId: number): Promise<any | null> {
  const [row] = await sql`
    SELECT p.id, p.user_id, p.given_by, p.day, p.shift_id, p.closing_id, p.task_id, p.type_id, p.type_title, p.text, p.photo_url,
      p.points, p.bonus_cut, p.status, p.source, p.source_key, p.award_id, p.adjustment_id, p.seen_at, p.response, p.response_at,
      p.disputed, p.dispute_handled_at, p.cancelled_by, p.cancelled_at, p.cancel_note, p.created_at,
      u.name AS user_name, u.avatar AS user_avatar, g.name AS given_by_name, x.name AS cancelled_by_name
    FROM penalties p
    LEFT JOIN users u ON u.id = p.user_id
    LEFT JOIN users g ON g.id = p.given_by
    LEFT JOIN users x ON x.id = p.cancelled_by
    WHERE p.id = ${id} AND p.team_id = ${teamId}`;
  return row ?? null;
}

/**
 * Kolik jde člověku ještě krátit z prémie za měsíc dne `day`: kladné úpravy mzdy
 * za ten měsíc (mimo tresty) minus krácení z jiných platných trestů téhož měsíce.
 * Bez tabulky úprav 0 (krátit není z čeho).
 */
export async function stropKraceniDb(teamId: number, userId: number, day: string, bezTrestu: number | null = null): Promise<{ strop: number; premie: number; uzKraceno: number }> {
  const od = `${day.slice(0, 7)}-01`;
  const doDne = `${day.slice(0, 7)}-31`;
  try {
    const [r] = await sql`
      SELECT COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND COALESCE(source, 'manual') <> 'trest'), 0)::int AS premie,
             COALESCE(-SUM(amount) FILTER (WHERE source = 'trest' AND (${bezTrestu}::int IS NULL OR source_ref IS DISTINCT FROM ${bezTrestu})), 0)::int AS kraceno
      FROM wage_adjustments
      WHERE team_id = ${teamId} AND user_id = ${userId} AND day >= ${od} AND day <= ${doDne}`;
    const premie = Number(r?.premie) || 0;
    const uzKraceno = Math.max(0, Number(r?.kraceno) || 0);
    return { strop: stropKraceni(premie, uzKraceno), premie, uzKraceno };
  } catch {
    return { strop: 0, premie: 0, uzKraceno: 0 };
  }
}

/**
 * Založí dopad trestu: body dolů do point_awards (kind 'trest', záporně — jdou do
 * Mého výdělku, žebříčku a profilu), krácení do wage_adjustments (source 'trest',
 * záporně — je ve výplatě). Vrací id obou řádků (null, když nic).
 */
export async function zalozTrest(o: { teamId: number; userId: number; points: number; bonusCut: number; reason: string; day: string; givenBy: number | null; trestId: number }): Promise<{ awardId: number | null; adjustmentId: number | null }> {
  let awardId: number | null = null;
  let adjustmentId: number | null = null;
  const duvod = `Trest: ${o.reason}`.slice(0, 200);
  if (o.points > 0) {
    try {
      const [a] = await sql`
        INSERT INTO point_awards (team_id, user_id, points, reason, given_by, kind, auto_key)
        VALUES (${o.teamId}, ${o.userId}, ${-o.points}, ${duvod}, ${o.givenBy}, 'trest', ${`trest:${o.trestId}`})
        RETURNING id`;
      awardId = Number(a.id);
    } catch {
      // Před migrací kind/auto_key (kolo 8): bez nich, ať body nepropadnou.
      const [a] = await sql`
        INSERT INTO point_awards (team_id, user_id, points, reason, given_by)
        VALUES (${o.teamId}, ${o.userId}, ${-o.points}, ${duvod}, ${o.givenBy})
        RETURNING id`;
      awardId = Number(a.id);
    }
  }
  if (o.bonusCut > 0) {
    const [w] = await sql`
      INSERT INTO wage_adjustments (team_id, user_id, day, amount, note, source, source_ref, created_by)
      VALUES (${o.teamId}, ${o.userId}, ${o.day}, ${-o.bonusCut}, ${duvod}, 'trest', ${o.trestId}, ${o.givenBy})
      RETURNING id`;
    adjustmentId = Number(w.id);
  }
  return { awardId, adjustmentId };
}

/** Zruší dopad trestu (zrušení nebo úprava s jinou výší). */
export async function zrusDopad(teamId: number, awardId: number | null, adjustmentId: number | null): Promise<void> {
  if (awardId) await sql`DELETE FROM point_awards WHERE id = ${awardId} AND team_id = ${teamId}`;
  if (adjustmentId) await sql`DELETE FROM wage_adjustments WHERE id = ${adjustmentId} AND team_id = ${teamId}`;
}

const ODKAZ_ZAMESTNANEC = '/employee/shifts?view=rewards&arg=tresty';
const ODKAZ_VEDENI = '/employer/overview?view=rewards&arg=tresty';

/** Nový nebo upravený trest: oznámit člověku (ne tomu, kdo ho dal, i kdyby šlo o něj). */
export async function oznamTrest(t: Trest, kdoId: number | null, kc: (n: number) => string): Promise<void> {
  if (t.userId === kdoId) return;
  try {
    const o = oznameniTrest(t, kc);
    await notifyUser(t.userId, { title: o.title, body: o.body, link: ODKAZ_ZAMESTNANEC, type: 'tresty', category: 'general' });
  } catch (e) {
    console.error('tresty: oznámení o trestu', e);
  }
}

export async function oznamZruseni(t: Trest, kdoId: number | null): Promise<void> {
  if (t.userId === kdoId) return;
  try {
    const o = oznameniZruseni(t);
    await notifyUser(t.userId, { title: o.title, body: o.body, link: ODKAZ_ZAMESTNANEC, type: 'tresty', category: 'general' });
  } catch (e) {
    console.error('tresty: oznámení o zrušení', e);
  }
}

/** Člověk se vyjádřil: oznámit tomu, kdo trest dal, a ostatním, kdo smí udělovat. */
export async function oznamVyjadreni(teamId: number, t: Trest, nesouhlas: boolean, vyjadreni: string): Promise<void> {
  try {
    const ids = new Set((await clenoveSOpravnenim(teamId, 'tresty.udelit')).filter(id => id !== t.userId));
    if (t.givenBy && t.givenBy !== t.userId) ids.add(t.givenBy);
    if (!ids.size) return;
    const o = oznameniVyjadreni(t.userName, nesouhlas, vyjadreni);
    await notifyUsers([...ids], { title: o.title, body: o.body, link: ODKAZ_VEDENI, type: 'tresty', category: 'general' });
  } catch (e) {
    console.error('tresty: oznámení o vyjádření', e);
  }
}

/** Řádek penalty_types → tvar pro klienta (lib/tresty DruhTrestu). */
export function tvarDruhu(r: any) {
  return {
    id: Number(r.id),
    title: String(r.title ?? ''),
    description: r.description ?? null,
    points: Number(r.points) || 0,
    bonusCut: r.bonus_cut == null ? null : Number(r.bonus_cut),
    active: r.active !== false,
    createdAt: iso(r.created_at) ?? '',
  };
}
