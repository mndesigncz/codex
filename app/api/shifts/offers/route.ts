import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id, name FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | null, name: u?.name as string };
}

const today = () => new Date().toISOString().split('T')[0];

// GET — the team's shift-swap board: every open offer plus anything the current
// user is involved in. Employers see claimed offers awaiting their approval.
export async function GET() {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ offers: [], meId: c?.meId ?? null, isEmployer: false });
  try {
    const rows = await sql`
      SELECT o.id, o.shift_id AS "shiftId", o.offered_by AS "offeredBy", o.claimed_by AS "claimedBy",
             o.status, o.note, o.created_at AS "createdAt",
             s.date, s.start_time AS "startTime", s.end_time AS "endTime", s.type,
             ob.name AS "offeredByName", ob.avatar AS "offeredByAvatar",
             cb.name AS "claimedByName", cb.avatar AS "claimedByAvatar"
      FROM shift_offers o
      JOIN shifts s ON s.id = o.shift_id
      LEFT JOIN users ob ON ob.id = o.offered_by
      LEFT JOIN users cb ON cb.id = o.claimed_by
      WHERE o.team_id = ${c.teamId}
        AND (o.status IN ('open','claimed') OR o.offered_by = ${c.meId} OR o.claimed_by = ${c.meId})
      ORDER BY s.date ASC`;
    return NextResponse.json({ offers: rows, meId: c.meId, isEmployer: c.role === 'employer' });
  } catch {
    return NextResponse.json({ offers: [], meId: c.meId, isEmployer: c.role === 'employer' });
  }
}

// POST — offer one of MY upcoming shifts to the team.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejsi v žádném týmu.' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const shiftId = parseInt(b.shiftId);
  if (!Number.isFinite(shiftId)) return NextResponse.json({ error: 'Neplatná směna.' }, { status: 400 });

  const [shift] = await sql`SELECT id, employee_id, date FROM shifts WHERE id = ${shiftId}`;
  if (!shift) return NextResponse.json({ error: 'Směna nenalezena.' }, { status: 404 });
  if (shift.employee_id !== c.meId) return NextResponse.json({ error: 'Můžeš nabídnout jen svou směnu.' }, { status: 403 });
  if (shift.date < today()) return NextResponse.json({ error: 'Minulou směnu nabídnout nelze.' }, { status: 400 });

  const [dupe] = await sql`SELECT id FROM shift_offers WHERE shift_id = ${shiftId} AND status IN ('open','claimed')`;
  if (dupe) return NextResponse.json({ error: 'Tato směna už je v burze.' }, { status: 409 });

  const note = String(b.note ?? '').slice(0, 500) || null;
  const [row] = await sql`
    INSERT INTO shift_offers (team_id, shift_id, offered_by, note)
    VALUES (${c.teamId}, ${shiftId}, ${c.meId}, ${note})
    RETURNING id`;

  // Let colleagues know a shift is up for grabs.
  try {
    const mates = await sql`
      SELECT id FROM users WHERE team_id = ${c.teamId} AND role IN ('employee','employer') AND id <> ${c.meId}`;
    await notifyUsers(mates.map((m: any) => m.id), {
      title: '🔄 Volná směna v burze',
      body: `${c.name ?? 'Kolega'} nabízí směnu ${shift.date}. Vezmi si ji, pokud můžeš.`,
      type: 'shift', category: 'shift',
    });
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, id: row.id });
}

// PATCH — claim / cancel / approve / reject one offer.
export async function PATCH(req: NextRequest) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Nejsi v žádném týmu.' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  const action = String(b.action ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID.' }, { status: 400 });

  const [o] = await sql`
    SELECT o.*, s.date, s.employee_id AS shift_owner FROM shift_offers o
    JOIN shifts s ON s.id = o.shift_id
    WHERE o.id = ${id} AND o.team_id = ${c.teamId}`;
  if (!o) return NextResponse.json({ error: 'Nabídka nenalezena.' }, { status: 404 });

  if (action === 'claim') {
    if (o.status !== 'open') return NextResponse.json({ error: 'Tuto směnu už si někdo vzal.' }, { status: 409 });
    if (o.offered_by === c.meId) return NextResponse.json({ error: 'Nemůžeš si vzít vlastní směnu.' }, { status: 400 });
    await sql`UPDATE shift_offers SET claimed_by = ${c.meId}, status = 'claimed' WHERE id = ${id}`;
    try {
      await notifyUser(o.offered_by, {
        title: 'Někdo si bere tvou směnu',
        body: `${c.name ?? 'Kolega'} si chce vzít směnu ${o.date}. Čeká na schválení vedení.`,
        type: 'shift', category: 'shift',
      });
      const employers = await sql`SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'employer'`;
      await notifyUsers(employers.map((e: any) => e.id), {
        title: '🔄 Výměna směny ke schválení',
        body: `${c.name ?? 'Kolega'} si bere směnu ${o.date} — schval ji ve Směnách.`,
        type: 'shift', category: 'shift',
      });
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true });
  }

  if (action === 'cancel') {
    // The offerer withdraws (only before it's approved).
    if (o.offered_by !== c.meId) return NextResponse.json({ error: 'Můžeš zrušit jen vlastní nabídku.' }, { status: 403 });
    if (o.status === 'approved') return NextResponse.json({ error: 'Schválenou výměnu nelze zrušit.' }, { status: 400 });
    await sql`UPDATE shift_offers SET status = 'cancelled' WHERE id = ${id}`;
    if (o.claimed_by) {
      try { await notifyUser(o.claimed_by, { title: 'Nabídka stažena', body: `Kolega stáhl směnu ${o.date} z burzy.`, type: 'shift', category: 'shift' }); } catch {}
    }
    return NextResponse.json({ ok: true });
  }

  // Employer decisions on a claimed offer.
  if (action === 'approve' || action === 'reject') {
    if (c.role !== 'employer') return NextResponse.json({ error: 'Jen vedení může schvalovat výměny.' }, { status: 403 });
    if (o.status !== 'claimed' || !o.claimed_by) return NextResponse.json({ error: 'Není co schvalovat.' }, { status: 400 });

    if (action === 'reject') {
      await sql`UPDATE shift_offers SET status = 'open', claimed_by = NULL WHERE id = ${id}`;
      try { await notifyUser(o.claimed_by, { title: 'Výměna zamítnuta', body: `Vedení zamítlo převzetí směny ${o.date}.`, type: 'shift', category: 'shift' }); } catch {}
      return NextResponse.json({ ok: true });
    }

    // Approve: actually reassign the shift to the person who claimed it.
    await sql`UPDATE shifts SET employee_id = ${o.claimed_by} WHERE id = ${o.shift_id}`;
    await sql`UPDATE shift_offers SET status = 'approved' WHERE id = ${id}`;
    try {
      await notifyUser(o.claimed_by, { title: '✅ Směna je tvoje', body: `Vedení schválilo převzetí směny ${o.date}.`, type: 'shift', category: 'shift' });
      await notifyUser(o.offered_by, { title: 'Směna předána', body: `Tvá směna ${o.date} byla předána kolegovi.`, type: 'shift', category: 'shift' });
    } catch { /* best-effort */ }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Neplatná akce.' }, { status: 400 });
}
