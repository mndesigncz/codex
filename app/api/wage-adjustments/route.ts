import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { jeClenem } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { notifyUser } from '@/lib/push';

// Prémie a srážky k mzdě (kolo 5 UX, vzor 7shifts / Homebase „bonuses & deductions"): vedení zapíše
// částku ke dni a člověku, docházka ji přičte k výplatě (GET /api/attendance → adjustments) a člověk
// ji vidí v Mém výdělku. Čtení jde přes /api/attendance (jedna adresa pro hodiny, sazby i úpravy);
// tahle route jen zapisuje a maže. Zápis chce finance.sazby_upravit — kdo smí měnit sazbu, smí i
// přidat prémii; samotné finance.mzdy je jen na čtení.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const MAX_CASTKA = 1_000_000;

export async function POST(req: NextRequest) {
  const c = await pozaduj('finance.sazby_upravit');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const userId = parseInt(b.userId);
  const amount = Math.round(Number(b.amount));
  const day = String(b.day ?? '').slice(0, 10);
  const note = String(b.note ?? '').trim().slice(0, 200) || null;
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Chybí člověk.' }, { status: 400 });
  if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > MAX_CASTKA) return NextResponse.json({ error: 'Částka musí být nenulová (prémie +, srážka −).' }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return NextResponse.json({ error: 'Chybí den.' }, { status: 400 });
  if (!(await jeClenem(userId, c.teamId))) return NextResponse.json({ error: 'Člověk není v podniku.' }, { status: 404 });
  let row: any;
  try {
    [row] = await sql`
      INSERT INTO wage_adjustments (team_id, user_id, day, amount, note, source, created_by)
      VALUES (${c.teamId}, ${userId}, ${day}, ${amount}, ${note}, 'manual', ${c.meId})
      RETURNING id, user_id AS "userId", day, amount, note, source`;
  } catch {
    return NextResponse.json({ error: 'Prémie se nepodařilo uložit — databáze ještě není připravená.' }, { status: 503 });
  }
  audit(c.teamId, c.meId, amount > 0 ? 'wage.bonus' : 'wage.deduction', 'user', userId, `${amount} (${day})${note ? ` · ${note}` : ''}`);
  // Člověk se o prémii dozví hned — jako o schválené odměně.
  try {
    await notifyUser(userId, {
      title: amount > 0 ? 'Prémie k výplatě' : 'Srážka z výplaty',
      body: `${amount > 0 ? '+' : ''}${amount} za ${day}${note ? ` — ${note}` : ''}.`,
      type: 'info',
      link: '/employee/shifts',
    });
  } catch { /* best-effort */ }
  return NextResponse.json({ adjustment: row });
}

export async function DELETE(req: NextRequest) {
  const c = await pozaduj('finance.sazby_upravit');
  if (jeOdpoved(c)) return c;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id.' }, { status: 400 });
  try {
    const done = await sql`DELETE FROM wage_adjustments WHERE id = ${id} AND team_id = ${c.teamId} RETURNING id, user_id, amount, day`;
    if (!done.length) return NextResponse.json({ error: 'Záznam nenalezen.' }, { status: 404 });
    audit(c.teamId, c.meId, 'wage.adjustment_delete', 'user', Number(done[0].user_id), `${done[0].amount} (${done[0].day})`);
  } catch {
    return NextResponse.json({ error: 'Smazání se nepodařilo.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
