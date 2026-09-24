// Kolik si člověk za tuhle směnu vydělal a kolik dostane bodů — pro
// uzávěrku, ještě než ji odešle.
//
// Sazba je citlivá: vlastní mzdu vidí, kdo má finance.moje_mzda, cizí jen
// ten, kdo má finance.mzdy (kolo 67; dřív „zaměstnanec sebe, vedení
// kohokoli z týmu" — pro tyto dvě role se nic nemění). Tablet je sdílená obrazovka za barem, na které se střídají lidi
// a stojí u ní hosté — tam se sazba neukazuje vůbec.

import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { mzdaZaSmenu, bodyZaSmenu } from '@/lib/mzdaSmeny';
import { jeClenem } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const meId = c.meId;
  const u = { team_id: c.teamId };
  const ma = (k: string) => c.role.opravneni.has(k);
  // Tablet je sdílená obrazovka — tady rozhoduje typ účtu, ne oprávnění:
  // sazba se na ní neukáže, ani kdyby jeho role něco z financí nesla.
  if (c.role.typ === 'kiosk') return NextResponse.json({ available: false, reason: 'kiosk' });

  const { searchParams } = new URL(req.url);
  const den = String(searchParams.get('date') ?? '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) return NextResponse.json({ error: 'Neplatné datum' }, { status: 400 });

  // S finance.mzdy se smí podívat na kohokoli z týmu (uzávěrku odesílá i za
  // ně); ostatní jen na sebe — parametr se u nich ignoruje, ne odmítá.
  let employeeId = meId;
  const want = parseInt(searchParams.get('employeeId') ?? '');
  if (ma('finance.mzdy') && Number.isFinite(want) && want !== meId) {
    // Kolo 62: členství nebo zrcadlo — přepnutý člen tu dřív dostal odmítnutí.
    if (!(await jeClenem(want, Number(u.team_id)))) return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu.' }, { status: 400 });
    employeeId = want;
  }
  // Vlastní výdělek jde v roli vypnout (finance.moje_mzda) — pak ani tady.
  if (employeeId === meId && !ma('finance.moje_mzda') && !ma('finance.mzdy')) {
    return NextResponse.json({ available: false });
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
