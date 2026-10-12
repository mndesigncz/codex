import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { jeClenem } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { notifyUser } from '@/lib/push';

// Pochvaly s body (kolo 5 UX, vzor Bonusly / Connecteam „recognition"): vedení dá člověku body
// kdykoli s důvodem — ne až při hodnocení směny (to je jedno na den a nese hvězdy). Body se
// počítají do zůstatku stejně jako hodnocení (lib/pointsBalance → awards), zaměstnanec pochvalu
// vidí ve zpětné vazbě (GET /api/rewards → items kind 'award') a dostane oznámení.
// Kdo smí hodnotit směny (hodnoceni.hodnotit), smí i chválit; seznam vidí, kdo vidí hodnocení.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const MAX_BODU = 500;

export interface PochvalaRadek {
  id: number; userId: number; name: string; avatar: string | null;
  points: number; reason: string | null; givenBy: string | null; createdAt: string;
}

// GET ?userId=&limit= → { awards: PochvalaRadek[] } — poslední pochvaly v podniku (nebo jednoho člověka).
export async function GET(req: NextRequest) {
  const c = await pozaduj('hodnoceni.zobrazit');
  if (jeOdpoved(c)) return c;
  const q = req.nextUrl.searchParams;
  const userId = q.get('userId') ? parseInt(q.get('userId')!) : null;
  const limit = Math.max(1, Math.min(100, parseInt(q.get('limit') ?? '') || 30));
  try {
    const rows = await sql`
      SELECT a.id, a.user_id, a.points, a.reason, a.created_at, u.name, u.avatar, g.name AS given_by
      FROM point_awards a
      JOIN users u ON u.id = a.user_id
      LEFT JOIN users g ON g.id = a.given_by
      WHERE a.team_id = ${c.teamId} AND (${userId}::int IS NULL OR a.user_id = ${userId})
      ORDER BY a.created_at DESC LIMIT ${limit}`;
    const awards: PochvalaRadek[] = rows.map((r: any) => ({
      id: r.id, userId: r.user_id, name: String(r.name ?? ''), avatar: r.avatar ?? null,
      points: r.points ?? 0, reason: r.reason ?? null, givenBy: r.given_by ?? null,
      createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at ?? ''),
    }));
    return NextResponse.json({ awards });
  } catch {
    return NextResponse.json({ awards: [], notMigrated: true });
  }
}

// POST { userId, points, reason } → { award }
export async function POST(req: NextRequest) {
  const c = await pozaduj('hodnoceni.hodnotit');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const userId = parseInt(b.userId);
  const points = Math.round(Number(b.points));
  const reason = String(b.reason ?? '').trim().slice(0, 200) || null;
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Chybí člověk.' }, { status: 400 });
  if (!Number.isFinite(points) || points < 1 || points > MAX_BODU) {
    return NextResponse.json({ error: `Body musí být 1 až ${MAX_BODU}.` }, { status: 400 });
  }
  if (!(await jeClenem(userId, c.teamId))) return NextResponse.json({ error: 'Člověk není v podniku.' }, { status: 404 });
  let row: any;
  try {
    [row] = await sql`
      INSERT INTO point_awards (team_id, user_id, points, reason, given_by)
      VALUES (${c.teamId}, ${userId}, ${points}, ${reason}, ${c.meId})
      RETURNING id, user_id AS "userId", points, reason, created_at AS "createdAt"`;
  } catch {
    return NextResponse.json({ error: 'Pochvala se nepodařila uložit — databáze ještě není připravená.' }, { status: 503 });
  }
  audit(c.teamId, c.meId, 'points.award', 'user', userId, `+${points}${reason ? ` · ${reason}` : ''}`);
  try {
    await notifyUser(userId, {
      title: 'Pochvala od vedení',
      body: `+${points} bodů${reason ? ` — ${reason}` : ''}.`,
      type: 'success',
      link: '/employee/shifts?view=rewards',
    });
  } catch { /* best-effort */ }
  return NextResponse.json({ award: row });
}

// DELETE ?id= — omyl se dá vzít zpět (body zmizí ze zůstatku, zapíše se do historie).
export async function DELETE(req: NextRequest) {
  const c = await pozaduj('hodnoceni.hodnotit');
  if (jeOdpoved(c)) return c;
  const id = parseInt(req.nextUrl.searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id.' }, { status: 400 });
  try {
    const done = await sql`DELETE FROM point_awards WHERE id = ${id} AND team_id = ${c.teamId} RETURNING id, user_id, points`;
    if (!done.length) return NextResponse.json({ error: 'Pochvala nenalezena.' }, { status: 404 });
    audit(c.teamId, c.meId, 'points.award_delete', 'user', Number(done[0].user_id), `${done[0].points}`);
  } catch {
    return NextResponse.json({ error: 'Smazání se nepodařilo.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
