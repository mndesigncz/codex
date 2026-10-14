import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { jeClenem } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { pragueToday } from '@/lib/pragueTime';
import { jeStavTrestu, posunDni, trestText, validujTrest, VETA_BEZ_PREMIE } from '@/lib/tresty';
import { menaPodniku } from '@/lib/menaPodniku';
import { nactiTrest, oznamTrest, predMigraci, stropKraceniDb, tvarDruhu, tvarTrestu, zalozTrest } from './_spolecne';

// „Tresty" (kolo 10): co člověk pokazil a co za to dostal.
//
// GET  ?scope=mine|team&status=&month=RRRR-MM&userId=&day=&closingId=&shiftId=
//      → { items, druhy (aktivní položky sazebníku), smi }
//      mine (výchozí) = vlastní tresty (každý člen), team = celý podnik
//      (tresty.zobrazit_tym). Bez month/day/closingId/shiftId posledních 90 dní
//      a k tomu každý nepotvrzený (starší se nesmí ztratit, dokud ho člověk nepotvrdí).
// GET  ?strop=1&userId=&day= (tresty.udelit) → { strop, premie, uzKraceno }:
//      kolik jde člověku ještě krátit z prémie za měsíc dne `day`.
// POST { userId, text, day?, shiftId?, closingId?, taskId?, typeId?, photoUrl?, points?, bonusCut?, sourceKey? }
//      (tresty.udelit). Body dolů → point_awards kind 'trest', krácení →
//      wage_adjustments source 'trest' (nejvýš do výše prémií za měsíc). Bez
//      points/bonusCut a s typeId se vezmou hodnoty ze sazebníku. Člověk dostane oznámení.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const chyba = (text: string, status: number, navic?: Record<string, unknown>) => NextResponse.json({ error: text, ...navic }, { status });

const OKNO_DNI = 90;
const MAX_RADKU = 500;

export async function GET(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const opr = c.role.opravneni;
  const smiTym = opr.has('tresty.zobrazit_tym');
  const smiUdelit = opr.has('tresty.udelit');
  const smiSazebnik = opr.has('tresty.sazebnik');
  const smi = { udelit: smiUdelit, sazebnik: smiSazebnik, tym: smiTym };
  const q = req.nextUrl.searchParams;
  const cislo = (k: string): number | null => { const n = Number(q.get(k)); return Number.isInteger(n) && n > 0 ? n : null; };

  if (q.get('strop') === '1') {
    if (!smiUdelit) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
    const userId = cislo('userId');
    const d = /^\d{4}-\d{2}-\d{2}$/.test(q.get('day') ?? '') ? q.get('day')! : pragueToday();
    if (!userId) return chyba('Chybí člověk.', 400);
    return NextResponse.json(await stropKraceniDb(c.teamId, userId, d, cislo('bez')));
  }

  const scope = q.get('scope') === 'team' && smiTym ? 'team' : 'mine';
  const stav = q.get('status');
  if (stav && !jeStavTrestu(stav)) return chyba('Neznámý stav.', 400);
  const mesic = /^\d{4}-\d{2}$/.test(q.get('month') ?? '') ? q.get('month')! : null;
  const den = /^\d{4}-\d{2}-\d{2}$/.test(q.get('day') ?? '') ? q.get('day')! : null;
  const userId = scope === 'team' ? cislo('userId') : c.meId;
  const closingId = cislo('closingId');
  const shiftId = cislo('shiftId');
  const dnes = pragueToday();
  const odDne = mesic || den || closingId || shiftId ? null : posunDni(dnes, -OKNO_DNI);
  const mesicOd = mesic ? `${mesic}-01` : null;
  const mesicDo = mesic ? `${mesic}-31` : null;
  try {
    const rows = await sql`
      SELECT p.id, p.user_id, p.given_by, p.day, p.shift_id, p.closing_id, p.task_id, p.type_id, p.type_title, p.text, p.photo_url,
        p.points, p.bonus_cut, p.status, p.source, p.source_key, p.seen_at, p.response, p.response_at, p.disputed,
        p.dispute_handled_at, p.cancelled_by, p.cancelled_at, p.cancel_note, p.created_at,
        u.name AS user_name, u.avatar AS user_avatar, g.name AS given_by_name, x.name AS cancelled_by_name
      FROM penalties p
      LEFT JOIN users u ON u.id = p.user_id
      LEFT JOIN users g ON g.id = p.given_by
      LEFT JOIN users x ON x.id = p.cancelled_by
      WHERE p.team_id = ${c.teamId}
        AND (${userId}::int IS NULL OR p.user_id = ${userId})
        AND (${stav}::text IS NULL OR p.status = ${stav})
        AND (${den}::text IS NULL OR p.day = ${den})
        AND (${closingId}::int IS NULL OR p.closing_id = ${closingId})
        AND (${shiftId}::int IS NULL OR p.shift_id = ${shiftId})
        AND (${mesicOd}::text IS NULL OR (p.day >= ${mesicOd} AND p.day <= ${mesicDo}))
        AND (${odDne}::text IS NULL OR p.day >= ${odDne} OR (p.status = 'plati' AND p.seen_at IS NULL))
      ORDER BY p.day DESC, p.created_at DESC
      LIMIT ${MAX_RADKU}`;
    const druhy = smiUdelit || smiSazebnik
      ? (await sql`
          SELECT id, title, description, points, bonus_cut, active, created_at
          FROM penalty_types WHERE team_id = ${c.teamId} AND archived_at IS NULL AND active = TRUE
          ORDER BY points DESC, title ASC`).map(tvarDruhu)
      : [];
    return NextResponse.json({ items: rows.map(tvarTrestu), druhy, smi });
  } catch (e) {
    if (predMigraci(e)) return NextResponse.json({ items: [], druhy: [], smi });
    console.error('tresty GET', e);
    return chyba('Tresty se nenačetly.', 500);
  }
}

export async function POST(req: NextRequest) {
  const c = await pozaduj('tresty.udelit');
  if (jeOdpoved(c)) return c;
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  const v = validujTrest(b ?? {}, pragueToday());
  if (!v.ok) return chyba(v.chyba, 400);
  const z = v.trest;
  if (!(await jeClenem(z.userId, c.teamId))) return chyba('Člověk není v podniku.', 404);
  try {
    // Položka sazebníku: název se uloží s trestem (přežije archivaci), nezadané body a krácení z ní.
    let typeTitle: string | null = null;
    if (z.typeId) {
      const [t] = await sql`SELECT title, points, bonus_cut FROM penalty_types WHERE id = ${z.typeId} AND team_id = ${c.teamId} AND archived_at IS NULL`;
      if (!t) return chyba('Položka sazebníku už neexistuje.', 404);
      typeTitle = String(t.title);
      if (b?.points == null || b.points === '') z.points = Number(t.points) || 0;
      if (b?.bonusCut == null || b.bonusCut === '') z.bonusCut = Number(t.bonus_cut) || 0;
    }
    const mena = await menaPodniku(c.teamId);
    if (z.bonusCut > 0) {
      const s = await stropKraceniDb(c.teamId, z.userId, z.day);
      if (z.bonusCut > s.strop) {
        return chyba(s.strop > 0
          ? `Krátit jde nejvýš ${mena.money(s.strop)} — víc nenárokových prémií ten měsíc nemá.`
          : VETA_BEZ_PREMIE, 409, { strop: s.strop });
      }
    }
    if (z.sourceKey) {
      const [zahozen] = await sql`SELECT 1 AS x FROM penalty_dismissed WHERE team_id = ${c.teamId} AND source_key = ${z.sourceKey}`;
      if (zahozen) return chyba('Tenhle návrh už je zahozený.', 409);
    }
    let row: any;
    try {
      [row] = await sql`
        INSERT INTO penalties (team_id, user_id, given_by, day, shift_id, closing_id, task_id, type_id, type_title, text, photo_url,
          points, bonus_cut, status, source, source_key)
        VALUES (${c.teamId}, ${z.userId}, ${c.meId}, ${z.day}, ${z.shiftId}, ${z.closingId}, ${z.taskId}, ${z.typeId}, ${typeTitle},
          ${z.text}, ${z.photoUrl}, ${z.points}, ${z.bonusCut}, 'plati', ${z.source}, ${z.sourceKey})
        RETURNING id`;
    } catch (e) {
      if ((e as { code?: string })?.code === '23505') return chyba('Za tohle už trest je.', 409);
      throw e;
    }
    const id = Number(row.id);
    const o = await zalozTrest({ teamId: c.teamId, userId: z.userId, points: z.points, bonusCut: z.bonusCut, reason: z.text, day: z.day, givenBy: c.meId, trestId: id });
    if (o.awardId || o.adjustmentId) await sql`UPDATE penalties SET award_id = ${o.awardId}, adjustment_id = ${o.adjustmentId} WHERE id = ${id} AND team_id = ${c.teamId}`;
    const item = tvarTrestu(await nactiTrest(id, c.teamId));
    audit(c.teamId, c.meId, 'tresty.udelit', 'penalty', id, `${item.userName}: ${trestText(item, mena.money)} · ${z.text.slice(0, 80)}`);
    await oznamTrest(item, c.meId, mena.money);
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (e) {
    if (predMigraci(e)) return chyba('Tresty ještě nejsou připravené — spusť /api/init.', 503);
    console.error('tresty POST', e);
    return chyba('Trest se neuložil.', 500);
  }
}
