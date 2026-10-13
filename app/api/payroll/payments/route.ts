import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { jeClenem } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { notifyUser } from '@/lib/push';
import { menaPodniku } from '@/lib/menaPodniku';
import { pragueToday } from '@/lib/pragueTime';

// Označení „Vyplaceno" (kolo 8, R8-1): částka, způsob (hotově / na účet), den a období, za které se platí.
// Výplatní listina pak u člověka ukáže „Vyplaceno 15. 10." a odečte částku z „Doplatit"; zaměstnanec vidí
// v Mém výdělku, kolik za září dostal. Zapisuje, kdo smí měnit sazby (finance.sazby_upravit) — jako prémie.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const JE_DEN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_CASTKA = 10_000_000;

export async function POST(req: NextRequest) {
  const c = await pozaduj('finance.sazby_upravit');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const userId = parseInt(b.userId);
  const amount = Math.round(Number(b.amount));
  const od = String(b.od ?? '').slice(0, 10);
  const doD = String(b.do ?? '').slice(0, 10);
  const paidAt = String(b.paidAt ?? pragueToday()).slice(0, 10);
  const method = b.method === 'ucet' ? 'ucet' : 'hotove';
  const note = String(b.note ?? '').trim().slice(0, 200) || null;
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Chybí člověk.' }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_CASTKA) return NextResponse.json({ error: 'Částka musí být kladná.' }, { status: 400 });
  if (!JE_DEN.test(od) || !JE_DEN.test(doD) || od > doD) return NextResponse.json({ error: 'Chybí období výplaty.' }, { status: 400 });
  if (!JE_DEN.test(paidAt)) return NextResponse.json({ error: 'Chybí den výplaty.' }, { status: 400 });
  if (!(await jeClenem(userId, c.teamId))) return NextResponse.json({ error: 'Člověk není v podniku.' }, { status: 404 });
  let row: any;
  try {
    [row] = await sql`
      INSERT INTO payroll_payments (team_id, user_id, period_from, period_to, amount, method, paid_at, note, created_by)
      VALUES (${c.teamId}, ${userId}, ${od}, ${doD}, ${amount}, ${method}, ${paidAt}, ${note}, ${c.meId})
      RETURNING id, amount, method, paid_at AS "paidAt", period_from AS od, period_to AS "do", note`;
  } catch {
    return NextResponse.json({ error: 'Výplatu se nepodařilo zapsat — databáze ještě není připravená.' }, { status: 503 });
  }
  const mena = await menaPodniku(c.teamId);
  await audit(c.teamId, c.meId, 'vyplata.oznacena', 'user', userId, `${mena.money(amount)} ${method === 'ucet' ? 'na účet' : 'hotově'} · ${od} – ${doD} · ${paidAt}${note ? ` · ${note}` : ''}`);
  // Člověk se o výplatě dozví hned — jako o prémii.
  try {
    await notifyUser(userId, {
      title: 'Výplata je vyplacená',
      body: `${mena.money(amount)} ${method === 'ucet' ? 'na účet' : 'v hotovosti'} za období ${od} – ${doD}.${note ? ` ${note}` : ''}`,
      type: 'info',
      link: '/employee/shifts?view=my-shifts',
    });
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true, payment: row });
}

export async function DELETE(req: NextRequest) {
  const c = await pozaduj('finance.sazby_upravit');
  if (jeOdpoved(c)) return c;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id.' }, { status: 400 });
  try {
    const done = await sql`DELETE FROM payroll_payments WHERE id = ${id} AND team_id = ${c.teamId} RETURNING user_id, amount, period_from, period_to`;
    if (!done.length) return NextResponse.json({ error: 'Záznam nenalezen.' }, { status: 404 });
    await audit(c.teamId, c.meId, 'vyplata.zrusena', 'user', Number(done[0].user_id), `${done[0].amount} · ${done[0].period_from} – ${done[0].period_to}`);
  } catch {
    return NextResponse.json({ error: 'Zrušení se nepodařilo.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
