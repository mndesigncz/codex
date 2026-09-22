// Čísla za všechny podniky organizace — pro vedení, které jich má víc.
//
// Každý podnik se počítá stejně, jako se počítá sám o sobě (Finance,
// Uzávěrky, Docházka, Sklad), jen vedle sebe. Nic nového se nevymýšlí:
// tržby z uzávěrek podle obchodního dne, mzdy z docházky × sazba přes
// lib/wages, sklad přes teamStock. Kdo co smí vidět, rozhoduje čistá
// funkce v lib/prehledOrganizace.ts a je otestovaná.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { clenstviUzivatele, organizaceTymu } from '@/lib/tenant';
import { podnikyProPrehled, procNejde, souhrn, hraniceMesice, type RadekPodniku } from '@/lib/prehledOrganizace';
import { wagesTotal } from '@/lib/wages';
import { teamStock } from '@/lib/production';
import { zavreneDnyTydne, smenaBezUzaverky } from '@/lib/staleShifts';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

const ZPRAVA: Record<string, string> = {
  bez_organizace: 'Tenhle podnik není v žádné organizaci.',
  vypnuto: 'Přehled za všechny podniky je v nastavení organizace vypnutý.',
  jeden_podnik: 'V organizaci vidíš jako vedení jen jeden podnik — není co sčítat.',
};

export async function GET(req: NextRequest) {
  const s = await getServerSession(authOptions);
  if (!s?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if ((s.user as any).role !== 'employer') return NextResponse.json({ error: 'Přehled organizace vidí jen vedení.' }, { status: 403 });
  const meId = parseInt((s.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ error: 'Nejsi v žádném podniku.' }, { status: 400 });

  const org = await organizaceTymu(Number(u.team_id));
  const clenstvi = await clenstviUzivatele(meId);
  const viditelne = org ? podnikyProPrehled(clenstvi, org.id) : [];
  const duvod = procNejde(org, viditelne);
  if (duvod) return NextResponse.json({ available: false, reason: duvod, message: ZPRAVA[duvod] }, { status: 200 });

  const month = String(new URL(req.url).searchParams.get('month') ?? pragueToday().slice(0, 7));
  const hranice = hraniceMesice(month);
  if (!hranice) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  const [od, do_] = hranice;
  const dnes = pragueToday();

  const radky: RadekPodniku[] = [];
  for (const teamId of viditelne) {
    const radek: RadekPodniku = {
      teamId, name: '', currency: 'CZK', revenue: 0, wages: 0, closings: 0,
      missingClosings: 0, pendingApproval: 0, members: 0, onShiftNow: 0, stockAlerts: 0,
    };
    try {
      const [t] = await sql`SELECT name, COALESCE(currency, 'CZK') AS currency FROM teams WHERE id = ${teamId}`;
      radek.name = String(t?.name ?? `Podnik ${teamId}`); radek.currency = String(t?.currency ?? 'CZK');
    } catch { radek.name = `Podnik ${teamId}`; }

    try {
      const [r] = await sql`
        SELECT COALESCE(SUM(cash_revenue + card_revenue), 0)::bigint AS revenue,
               COUNT(*) FILTER (WHERE covered_by IS NULL)::int AS closings,
               COUNT(*) FILTER (WHERE approved = FALSE)::int AS pending
        FROM cash_closings
        WHERE team_id = ${teamId} AND covered_by IS NULL AND event_id IS NULL
          AND COALESCE(shift_date, date) >= ${od} AND COALESCE(shift_date, date) <= ${do_}`;
      radek.revenue = Number(r?.revenue) || 0; radek.closings = Number(r?.closings) || 0; radek.pendingApproval = Number(r?.pending) || 0;
    } catch { /* před migrací */ }

    try {
      // Sazba z členství v TOMHLE podniku; starší účty ji mají jen na users.
      const entries = await sql`
        SELECT te.clock_in, te.clock_out, COALESCE(m.hourly_rate, us.hourly_rate, 0) AS rate
        FROM time_entries te
        JOIN users us ON us.id = te.employee_id
        LEFT JOIN team_members m ON m.user_id = te.employee_id AND m.team_id = te.team_id
        WHERE te.team_id = ${teamId} AND te.clock_out IS NOT NULL
          AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM') = ${month}`;
      radek.wages = wagesTotal((entries as any[]).map(e => ({
        ms: new Date(e.clock_out).getTime() - new Date(e.clock_in).getTime(), rate: Number(e.rate) || 0,
      }))).total;
    } catch { /* před migrací */ }

    try {
      const zavreno = await zavreneDnyTydne(teamId);
      const dny = await sql`
        SELECT DISTINCT s.date, s.auto_created FROM shifts s
        WHERE s.team_id = ${teamId} AND s.date >= ${od} AND s.date <= ${do_} AND s.date < ${dnes}
          AND NOT EXISTS (
            SELECT 1 FROM cash_closings cc
            WHERE cc.team_id = ${teamId} AND COALESCE(cc.shift_date, cc.date) = s.date)`;
      radek.missingClosings = new Set((dny as any[]).filter(d => !smenaBezUzaverky(d, zavreno)).map(d => String(d.date))).size;
    } catch { /* před migrací */ }

    try {
      const [m] = await sql`SELECT COUNT(*)::int AS n FROM team_members WHERE team_id = ${teamId}`;
      radek.members = Number(m?.n) || 0;
    } catch {
      try { const [m] = await sql`SELECT COUNT(*)::int AS n FROM users WHERE team_id = ${teamId} AND role IN ('employer','employee')`; radek.members = Number(m?.n) || 0; } catch { /* ignore */ }
    }
    try {
      const [o] = await sql`SELECT COUNT(DISTINCT employee_id)::int AS n FROM time_entries WHERE team_id = ${teamId} AND clock_out IS NULL`;
      radek.onShiftNow = Number(o?.n) || 0;
    } catch { /* ignore */ }
    try {
      radek.stockAlerts = Array.from((await teamStock(teamId)).values()).filter(i => i.status !== 'ok').length;
    } catch { /* ignore */ }
    radky.push(radek);
  }

  return NextResponse.json({ available: true, month, organization: { id: org!.id, name: org!.name }, teams: radky, total: souhrn(radky) });
}
