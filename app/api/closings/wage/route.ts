// Kolik si člověk za tuhle směnu vydělal a kolik dostane bodů — pro
// uzávěrku, ještě než ji odešle.
//
// Sazba je citlivá: dnes ji z API dostane jen vedení, a to má zůstat.
// Tady se proto vrací JEN vlastní mzda (zaměstnanec sebe, vedení kohokoli
// z týmu). Tablet je sdílená obrazovka za barem, na které se střídají lidi
// a stojí u ní hosté — tam se sazba neukazuje vůbec.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { mzdaZaSmenu, bodyZaSmenu } from '@/lib/mzdaSmeny';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const role = String((session.user as any).role ?? '');
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ available: false });
  if (role === 'kiosk') return NextResponse.json({ available: false, reason: 'kiosk' });

  const { searchParams } = new URL(req.url);
  const den = String(searchParams.get('date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) return NextResponse.json({ error: 'Neplatné datum' }, { status: 400 });

  // Vedení se smí podívat na kohokoli z týmu (uzávěrku odesílá i za ně);
  // zaměstnanec jen na sebe — parametr se u něj ignoruje, ne odmítá.
  let employeeId = meId;
  const want = parseInt(searchParams.get('employeeId') ?? '');
  if (role === 'employer' && Number.isFinite(want) && want !== meId) {
    const [emp] = await sql`SELECT id FROM users WHERE id = ${want} AND team_id = ${u.team_id}`;
    if (!emp) return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu.' }, { status: 400 });
    employeeId = want;
  }

  const [mzda, body] = await Promise.all([
    mzdaZaSmenu(u.team_id, employeeId, den),
    bodyZaSmenu(u.team_id, employeeId, den),
  ]);
  return NextResponse.json({
    available: true,
    employeeId,
    wage: { ms: mzda.ms, rate: mzda.rate, earned: mzda.earned, open: mzda.open, suspicious: mzda.suspicious, noEntries: mzda.noEntries },
    points: { tasks: body.tasks, procedures: body.procedures, taskPts: body.taskPts, procPts: body.procPts, closingPts: body.closingPts, total: body.total },
  });
}
