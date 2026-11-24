// Cron: 3.–10. den v měsíci ráno pošle účetním podklady za minulý měsíc (vercel.json `17 5 3-10 * *`).
// Běží denně osm dní, aby se po výpadku (e-mail, databáze, nasazení) měsíc dohnal; poslat
// se ale smí jen jednou — 4.–10. den běh projde jen podniky, kterým to zatím neodešlo.
//
// Jen podniky se zapnutým `accountant_auto` a vyplněným e-mailem, v tarifu Pro a výš.
// Idempotentní přes `accountant_last_sent` („RRRR-MM"): ten se zapíše PŘED odesláním
// podmíněným UPDATE (souběžný běh ho nepošle podruhé); když odeslání selže, vrátí se zpět,
// ať to další běh zkusí znovu. Výplaty jen s `accountant_payroll` (zapnout ho smí jen finance.mzdy).

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { checkCron } from '@/lib/cronAuth';
import { zapisBehCronu } from '@/lib/cronSouhrn';
import { pragueToday } from '@/lib/pragueTime';
import { teamIsPro } from '@/lib/planServer';
import { mesicProAutomat, obdobiMesice } from '@/lib/ucetniExport';
import { posliUcetni } from '@/lib/ucetniServer';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const sql = neon(process.env.DATABASE_URL!);

export async function GET(request: Request) {
  const auth = checkCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const dnes = pragueToday();
  let tymy: any[] = [];
  try {
    tymy = await sql`
      SELECT id, accountant_last_sent, accountant_payroll FROM teams
      WHERE accountant_auto = TRUE AND accountant_email IS NOT NULL AND accountant_email <> '' AND blocked_at IS NULL` as any[];
  } catch {
    zapisBehCronu('ucetni', { ok: true, teams: 0, premigrace: true });
    return NextResponse.json({ ok: true, teams: 0 });
  }
  let odeslano = 0, preskoceno = 0, chyby = 0;
  for (const t of tymy) {
    const teamId = Number(t.id);
    const mesic = mesicProAutomat(dnes, t.accountant_last_sent);
    if (!mesic) { preskoceno++; continue; }
    if (!(await teamIsPro(teamId))) { preskoceno++; continue; }
    const obdobi = obdobiMesice(mesic)!;
    const predtim = t.accountant_last_sent ?? null;
    // Zámek běhu: jen jeden běh přepíše „naposledy odesláno" z předchozí hodnoty.
    const zamceno = await sql`
      UPDATE teams SET accountant_last_sent = ${mesic}
      WHERE id = ${teamId} AND accountant_last_sent IS NOT DISTINCT FROM ${predtim}
      RETURNING id` as any[];
    if (!zamceno.length) { preskoceno++; continue; }
    try {
      const r = await posliUcetni(teamId, obdobi.od, obdobi.do, t.accountant_payroll === true, null);
      if (r.ok) { odeslano++; continue; }
      chyby++;
    } catch (e) {
      console.error('ucetni/cron', teamId, e instanceof Error ? e.message : '');
      chyby++;
    }
    try { await sql`UPDATE teams SET accountant_last_sent = ${predtim} WHERE id = ${teamId} AND accountant_last_sent = ${mesic}`; } catch { /* zkusí se příště */ }
  }
  const souhrn = { ok: true, teams: tymy.length, odeslano, preskoceno, chyby };
  zapisBehCronu('ucetni', souhrn);
  return NextResponse.json(souhrn);
}
