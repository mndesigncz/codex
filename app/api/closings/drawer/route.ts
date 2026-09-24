// What the previous shift left in the drawer — the number "Kasa na začátku"
// should start from. Deliberately tiny: one amount + who left it, no history,
// so even the kiosk and employees can prefill from the TEAM's last closing
// (their own list only contains their own rows and misses alternating shifts).

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { cashLeft } from '@/lib/closing';
import { pragueToday } from '@/lib/pragueTime';
import { zavreneDnyTydne, smenaBezUzaverky } from '@/lib/staleShifts';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  // Stav kasy potřebuje jen ten, kdo vyplňuje uzávěrku (kolo 67). Dřív
  // stačilo mít users.team_id — i host.
  const c = await pozaduj('uzaverky.vytvorit');
  if (jeOdpoved(c)) return c;
  const u = { team_id: c.teamId };

  let row: any = null;
  try {
    [row] = await sql`
      SELECT COALESCE(cc.shift_date, cc.date) AS date, cc.shift_label, cc.closing_cash, cc.final_removal, us.name AS author_name
      FROM cash_closings cc LEFT JOIN users us ON us.id = cc.created_by
      WHERE cc.team_id = ${u.team_id} AND cc.covered_by IS NULL AND cc.event_id IS NULL
      ORDER BY COALESCE(cc.shift_date, cc.date) DESC, cc.created_at DESC LIMIT 1`;
  } catch {
    try {
      [row] = await sql`
        SELECT cc.date, cc.shift_label, cc.closing_cash, us.name AS author_name
        FROM cash_closings cc LEFT JOIN users us ON us.id = cc.created_by
        WHERE cc.team_id = ${u.team_id}
        ORDER BY cc.date DESC, cc.created_at DESC LIMIT 1`;
    } catch { /* table missing */ }
  }
  if (!row) return NextResponse.json({ drawer: null });

  // Dny MEZI poslední uzávěrkou a dneškem, kdy někdo pracoval, ale nikdo
  // nezavřel. Bez tohohle se sobota, za kterou uzávěrka chybí, potichu
  // propíše do pondělka: pondělí začne s pátečním stavem kasy, a co se
  // v sobotu utržilo, vypadá jako pondělní přebytek — „tržba, která tam
  // nemá být". Formulář to musí říct dřív, než člověk začne počítat.
  let gapDays: string[] = [];
  try {
    const od = String(row.date);
    const dnes = pragueToday();
    if (od < dnes) {
      const zavreno = await zavreneDnyTydne(u.team_id);
      const smeny = await sql`
        SELECT DISTINCT s.date, s.auto_created
        FROM shifts s JOIN users us ON us.id = s.employee_id
        WHERE s.team_id = ${u.team_id} AND s.date > ${od} AND s.date < ${dnes}
          AND NOT EXISTS (
            SELECT 1 FROM cash_closings cc
            WHERE cc.team_id = ${u.team_id} AND COALESCE(cc.shift_date, cc.date) = s.date
          )
        ORDER BY s.date ASC`;
      const dny = new Set<string>();
      for (const r of smeny as any[]) {
        if (smenaBezUzaverky(r, zavreno)) continue;
        dny.add(String(r.date));
      }
      gapDays = Array.from(dny).sort();
    }
  } catch { /* před migrací — bez varování, ne bez zásuvky */ }

  return NextResponse.json({
    gapDays,
    drawer: {
      date: row.date,
      shiftLabel: row.shift_label ?? null,
      authorName: row.author_name ?? null,
      amount: cashLeft({ closing_cash: Number(row.closing_cash) || 0, final_removal: row.final_removal ?? null }),
      finalRemoval: Number(row.final_removal) || 0,
    },
  });
}
