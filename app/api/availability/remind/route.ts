// Připomenout dostupnost (kolo 7, R7-1): vedení vidí ve widgetu Dostupnost týmu, kdo na měsíc
// nezadal, a jedním klepnutím mu pošle upozornění — místo psaní každému zvlášť do chatu.
//
// Oprávnění rozvrh.generovat: kdo skládá rozvrh, dostupnost potřebuje (dostupnost.upravit je
// o vyplňování za člověka). Příjemci = stejná populace, ze které widget počítá „Chybí"
// (vedení i zaměstnanci podniku, ne tablet), bez záznamu v availability_requests na měsíc
// a bez toho, kdo připomíná. Ochrana: jednou za 20 hodin na podnik a měsíc (teams.
// availability_reminded_at/_month), atomicky jedním UPDATE — dvojí klepnutí nepošle dvakrát.
// Automatický cron není (rozhodnutí kola 7).

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';
import { audit } from '@/lib/audit';
import { idClenu } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { dbTimeDayHM, dbTimeHM, parseDbTime, pragueDayOf, pragueToday } from '@/lib/pragueTime';
import { fmtMesic } from '@/lib/i18n/format';
import { komuPripomenout, mesicProPripominku } from '@/lib/rozvrhPrehled';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// POST { month: 'RRRR-MM' } → { notified, ztlumeno }; 429 { error, remindedAt }, když už se připomínalo.
export async function POST(req: Request) {
  const c = await pozaduj('rozvrh.generovat');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const month = mesicProPripominku(b?.month, pragueToday());
  if (!month) return NextResponse.json({ error: 'Připomenout jde jen dostupnost na tento nebo příští měsíc.' }, { status: 400 });

  const clenove = await idClenu(c.teamId);
  const odevzdane = await sql`
    SELECT employee_id FROM availability_requests WHERE team_id = ${c.teamId} AND month = ${month}`;
  const komu = komuPripomenout(clenove, (odevzdane as any[]).map(r => Number(r.employee_id)), c.meId);
  // Nikomu nic nechybí: nic se neposílá a ochrana se nespotřebuje.
  if (komu.length === 0) return NextResponse.json({ notified: 0, ztlumeno: 0 });

  // Hodiny musí sedět s PRIPOMINKA_DOSTUPNOSTI_H v lib/rozvrhPrehled.ts.
  const [zapsano] = await sql`
    UPDATE teams SET availability_reminded_at = NOW(), availability_reminded_month = ${month}
    WHERE id = ${c.teamId}
      AND (availability_reminded_month IS NULL OR availability_reminded_month <> ${month}
           OR availability_reminded_at IS NULL OR availability_reminded_at < NOW() - INTERVAL '20 hours')
    RETURNING id`;
  if (!zapsano) {
    const [tm] = await sql`SELECT availability_reminded_at FROM teams WHERE id = ${c.teamId}`;
    const kdy = parseDbTime(tm?.availability_reminded_at ?? null);
    const dnes = kdy && pragueDayOf(kdy) === pragueToday();
    return NextResponse.json({
      error: kdy ? (dnes ? `Připomenuto dnes v ${dbTimeHM(kdy)}.` : `Připomenuto ${dbTimeDayHM(kdy)}.`) : 'Připomenuto nedávno.',
      remindedAt: kdy ? kdy.toISOString() : null,
    }, { status: 429 });
  }

  const nazev = fmtMesic(month, { jazyk: 'cs' });
  const { doruceno, ztlumeno } = await notifyUsers(komu, {
    title: '🗓 Zadej dostupnost',
    body: `Vedení skládá rozvrh na ${nazev} a čeká na tvou dostupnost.`,
    type: 'info',
    category: 'shift',
    link: '/employee/shifts?view=availability',
  });
  await audit(c.teamId, c.meId, 'rozvrh.pripomenout_dostupnost', 'availability', null, `${month}: ${komu.length}`);
  return NextResponse.json({ notified: doruceno, ztlumeno });
}
