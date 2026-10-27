import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { pragueToday } from '@/lib/pragueTime';
import { cashDifference } from '@/lib/closing';
import { zpozdeniMin } from '@/lib/automatickeBody';
import { DNI_NAVRHU, PRAH_MANKA, PRAH_POZDE_MIN, platnyKlicNavrhu, posunDni, type NavrhTrestu } from '@/lib/tresty';
import { predMigraci } from '../_spolecne';

// Návrhy trestů z dat (kolo 10). Nic se neukládá — vedení návrh buď udělí
// (POST /api/tresty se sourceKey), nebo zahodí (POST sem). Vyřízený návrh se
// už nenabídne (penalties.source_key, penalty_dismissed).
//
// GET  (tresty.udelit) → { navrhy, manka } za posledních DNI_NAVRHU dní:
//      pozde:<time_entry>  příchod o víc než PRAH_POZDE_MIN min po začátku plánované směny,
//      vytka:<item>        výtka u položky v hodnocení směny;
//      manka               kolik uzávěrek mělo manko aspoň PRAH_MANKA (měna podniku). Manko
//                          trestem není (§ 346b, § 252 zákoníku práce — jen dohoda
//                          o odpovědnosti), UI místo návrhu ukáže větu VETA_MANKO bez akce.
// POST { klic } (tresty.udelit) → zahodit návrh.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const chyba = (text: string, status: number) => NextResponse.json({ error: text }, { status });
const num = (v: unknown) => Number(v) || 0;

export async function GET() {
  const c = await pozaduj('tresty.udelit');
  if (jeOdpoved(c)) return c;
  const od = posunDni(pragueToday(), -DNI_NAVRHU);
  const navrhy: NavrhTrestu[] = [];

  let vyrizene = new Set<string>();
  try {
    const rows = await sql`
      SELECT source_key FROM penalties WHERE team_id = ${c.teamId} AND source_key IS NOT NULL AND day >= ${posunDni(od, -1)}
      UNION SELECT source_key FROM penalty_dismissed WHERE team_id = ${c.teamId}`;
    vyrizene = new Set(rows.map(r => String(r.source_key)));
  } catch (e) {
    if (predMigraci(e)) return NextResponse.json({ navrhy: [], manka: 0 });
    throw e;
  }

  // Pozdní příchody: plánovaná směna jako v GET /api/attendance (LATERAL, nejbližší začátek).
  try {
    const rows = await sql`
      SELECT te.id, te.employee_id, u.name, u.avatar,
        to_char(te.clock_in AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') AS den,
        to_char(te.clock_in AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague', 'HH24:MI') AS prichod,
        pl.id AS shift_id, pl.start_time AS plan_start, pl.date AS plan_date
      FROM time_entries te
      LEFT JOIN users u ON u.id = te.employee_id
      JOIN LATERAL (
        SELECT s.id, s.date, s.start_time FROM shifts s
        WHERE s.employee_id = te.employee_id AND s.team_id = ${c.teamId}
          AND s.auto_created IS NOT TRUE AND s.type <> 'auto'
          AND s.date ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND s.start_time ~ '^[0-9]{2}:[0-9]{2}'
          AND s.date = to_char(te.clock_in AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD')
        ORDER BY ABS(EXTRACT(EPOCH FROM ((te.clock_in AT TIME ZONE 'UTC' AT TIME ZONE 'Europe/Prague') - (s.date || ' ' || LEFT(s.start_time, 5))::timestamp)))
        LIMIT 1
      ) pl ON TRUE
      WHERE te.team_id = ${c.teamId}
        AND te.clock_in >= ((${od}::date)::timestamp AT TIME ZONE 'Europe/Prague')
      ORDER BY te.clock_in DESC
      LIMIT 400`;
    for (const r of rows as any[]) {
      const klic = `pozde:${r.id}`;
      if (vyrizene.has(klic)) continue;
      const min = zpozdeniMin(String(r.prichod ?? ''), String(r.plan_start ?? ''));
      if (min == null || min <= PRAH_POZDE_MIN) continue;
      navrhy.push({ klic, druh: 'pozde', userId: Number(r.employee_id), userName: String(r.name ?? ''), userAvatar: r.avatar ?? null,
        day: String(r.den), closingId: null, shiftId: r.shift_id ? Number(r.shift_id) : null, minuty: min, castka: null, poznamka: null });
    }
  } catch (e) {
    console.error('tresty/navrhy pozdě', e);
  }

  // Manko v uzávěrce: jen spočítat (pomocné řádky za kolegy ne) — návrh trestu z něj nevzniká.
  let manka = 0;
  try {
    const rows = await sql`
      SELECT cc.*
      FROM cash_closings cc
      WHERE cc.team_id = ${c.teamId} AND cc.covered_by IS NULL
        AND COALESCE(cc.shift_date, cc.date) >= ${od}
      ORDER BY COALESCE(cc.shift_date, cc.date) DESC
      LIMIT 200`;
    for (const r of rows as any[]) {
      if (vyrizene.has(`manko:${r.id}`)) continue;
      const diff = cashDifference({
        opening_cash: num(r.opening_cash), cash_revenue: num(r.cash_revenue), expenses: num(r.expenses), cash_removed: num(r.cash_removed),
        self_payout: num(r.self_payout), closing_cash: num(r.closing_cash), tips: num(r.tips), payout_from_register: r.payout_from_register ?? null,
        tips_in_drawer: r.tips_in_drawer ?? null, tips_card: num(r.tips_card),
      });
      if (diff > -PRAH_MANKA) continue;
      manka++;
    }
  } catch (e) {
    console.error('tresty/navrhy manko', e);
  }

  // Výtky z hodnocení směny.
  try {
    const rows = await sql`
      SELECT i.id, i.employee_id, i.work_date, i.note, u.name, u.avatar
      FROM shift_review_items i
      LEFT JOIN users u ON u.id = i.employee_id
      WHERE i.team_id = ${c.teamId} AND i.flagged = TRUE AND i.work_date >= ${od}
      ORDER BY i.work_date DESC
      LIMIT 200`;
    for (const r of rows as any[]) {
      const klic = `vytka:${r.id}`;
      if (vyrizene.has(klic)) continue;
      navrhy.push({ klic, druh: 'vytka', userId: Number(r.employee_id), userName: String(r.name ?? ''), userAvatar: r.avatar ?? null,
        day: String(r.work_date).slice(0, 10), closingId: null, shiftId: null, minuty: null, castka: null, poznamka: r.note ?? null });
    }
  } catch (e) {
    console.error('tresty/navrhy výtky', e);
  }

  navrhy.sort((a, b) => b.day.localeCompare(a.day) || a.userName.localeCompare(b.userName, 'cs'));
  return NextResponse.json({ navrhy, manka });
}

export async function POST(req: NextRequest) {
  const c = await pozaduj('tresty.udelit');
  if (jeOdpoved(c)) return c;
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  const klic = b?.klic;
  if (!platnyKlicNavrhu(klic)) return chyba('Návrh trestu nesedí.', 400);
  try {
    await sql`INSERT INTO penalty_dismissed (team_id, source_key, dismissed_by) VALUES (${c.teamId}, ${klic}, ${c.meId}) ON CONFLICT DO NOTHING`;
    audit(c.teamId, c.meId, 'tresty.navrh.zahodit', 'penalty', null, klic);
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (predMigraci(e)) return chyba('Tresty se ještě připravují. Zkus to za chvíli znovu.', 503);
    console.error('tresty/navrhy POST', e);
    return chyba('Návrh se nepodařilo zahodit.', 500);
  }
}
