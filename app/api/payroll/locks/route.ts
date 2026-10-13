import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';

// Uzavřené výplatní období (kolo 8, R8-1): „Uzavřít období" zamkne třeba září — Výplatní listina a Můj
// výdělek ukážou zámek a nástroj Docházky má varovat, že úpravu odemkne vedoucí. Tvrdé odmítnutí úprav
// zamčeného dne patří do app/api/attendance (balík 2); tady je jen záznam o zámku. Zamyká a odemyká, kdo
// smí měnit sazby (finance.sazby_upravit).

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const JE_DEN = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const c = await pozaduj('finance.sazby_upravit');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const od = String(b.od ?? '').slice(0, 10);
  const doD = String(b.do ?? '').slice(0, 10);
  if (!JE_DEN.test(od) || !JE_DEN.test(doD) || od > doD) return NextResponse.json({ error: 'Chybí období.' }, { status: 400 });
  let row: any;
  try {
    [row] = await sql`
      INSERT INTO payroll_locks (team_id, period_from, period_to, locked_by)
      VALUES (${c.teamId}, ${od}, ${doD}, ${c.meId})
      ON CONFLICT (team_id, period_from, period_to) DO UPDATE SET locked_by = EXCLUDED.locked_by, locked_at = NOW()
      RETURNING id, period_from AS od, period_to AS "do", locked_by AS "lockedBy", locked_at AS "lockedAt"`;
  } catch {
    return NextResponse.json({ error: 'Období se nepodařilo uzavřít — databáze ještě není připravená.' }, { status: 503 });
  }
  await audit(c.teamId, c.meId, 'vyplata.obdobi_uzavreno', 'team', c.teamId, `${od} – ${doD}`);
  return NextResponse.json({ ok: true, lock: row });
}

export async function DELETE(req: NextRequest) {
  const c = await pozaduj('finance.sazby_upravit');
  if (jeOdpoved(c)) return c;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id.' }, { status: 400 });
  try {
    const done = await sql`DELETE FROM payroll_locks WHERE id = ${id} AND team_id = ${c.teamId} RETURNING period_from, period_to`;
    if (!done.length) return NextResponse.json({ error: 'Zámek nenalezen.' }, { status: 404 });
    await audit(c.teamId, c.meId, 'vyplata.obdobi_otevreno', 'team', c.teamId, `${done[0].period_from} – ${done[0].period_to}`);
  } catch {
    return NextResponse.json({ error: 'Odemknutí se nepodařilo.' }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
