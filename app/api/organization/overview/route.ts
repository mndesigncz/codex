// Čísla za všechny podniky organizace — pro vedení, které jich má víc.
//
// Každý podnik se počítá stejně, jako se počítá sám o sobě (Finance,
// Uzávěrky, Docházka, Sklad), jen vedle sebe. Nic nového se nevymýšlí:
// tržby z uzávěrek podle obchodního dne, mzdy z docházky × sazba přes
// lib/wages, sklad přes teamStock. Kdo co smí vidět, rozhoduje čistá
// funkce v lib/prehledOrganizace.ts a je otestovaná.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { clenstviUzivatele, organizaceTymu, pocetClenu } from '@/lib/tenant';
import { procNejde, souhrn, hraniceMesice, type RadekPodniku } from '@/lib/prehledOrganizace';
import { pozaduj, jeOdpoved, roleClena } from '@/lib/opravneniDb';
import { wagesTotal } from '@/lib/wages';
import { teamStock } from '@/lib/production';
import { zavreneDnyTydne, smenaBezUzaverky } from '@/lib/staleShifts';
import { pragueToday } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

const ZPRAVA: Record<string, string> = {
  bez_organizace: 'Tenhle podnik není v žádné organizaci.',
  vypnuto: 'Přehled za všechny podniky je v nastavení organizace vypnutý.',
  jeden_podnik: 'Přehled organizace máš povolený jen v jednom podniku — není co sčítat.',
};

/** Co smí člověk v kterém podniku přehledu vidět (kolo 67). */
interface Pravo { teamId: number; trzby: boolean; mzdy: boolean }

export async function GET(req: NextRequest) {
  // Kolo 67: místo „vedení" oprávnění organizace.prehled — v aktivním
  // podniku kvůli otevření obrazovky a v KAŽDÉM sčítaném podniku zvlášť:
  // role v jedné pobočce neotevírá čísla ostatních. Tržby a mzdy podniku
  // navíc jen s finance.trzby a finance.mzdy v tom podniku.
  const c = await pozaduj('organizace.prehled');
  if (jeOdpoved(c)) return c;
  const meId = c.meId;

  const org = await organizaceTymu(c.teamId);
  const clenstvi = await clenstviUzivatele(meId);
  const prava: Pravo[] = [];
  if (org) {
    for (const m of clenstvi) {
      if (m.organizationId !== org.id) continue;
      const r = await roleClena(meId, m.teamId);
      if (!r?.opravneni.has('organizace.prehled')) continue;
      prava.push({ teamId: m.teamId, trzby: r.opravneni.has('finance.trzby'), mzdy: r.opravneni.has('finance.mzdy') });
    }
  }
  const viditelne = prava.map(p => p.teamId);
  const duvod = procNejde(org, viditelne);
  if (duvod) return NextResponse.json({ available: false, reason: duvod, message: ZPRAVA[duvod] }, { status: 200 });

  const month = String(new URL(req.url).searchParams.get('month') ?? pragueToday().slice(0, 7));
  const hranice = hraniceMesice(month);
  if (!hranice) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  const [od, do_] = hranice;
  const dnes = pragueToday();

  const radky: RadekPodniku[] = [];
  for (const { teamId, trzby, mzdy } of prava) {
    const radek: RadekPodniku = {
      teamId, name: '', currency: 'CZK', revenue: 0, wages: 0, closings: 0,
      missingClosings: 0, pendingApproval: 0, members: 0, onShiftNow: 0, stockAlerts: 0,
    };
    try {
      const [t] = await sql`SELECT name, COALESCE(currency, 'CZK') AS currency FROM teams WHERE id = ${teamId}`;
      radek.name = String(t?.name ?? `Podnik ${teamId}`); radek.currency = String(t?.currency ?? 'CZK');
    } catch { radek.name = `Podnik ${teamId}`; }

    try {
      // Počty uzávěrek jdou všem s přehledem; součet peněz jen s finance.trzby.
      const [r] = await sql`
        SELECT COALESCE(SUM(cash_revenue + card_revenue), 0)::bigint AS revenue,
               COUNT(*) FILTER (WHERE covered_by IS NULL)::int AS closings,
               COUNT(*) FILTER (WHERE approved = FALSE)::int AS pending
        FROM cash_closings
        WHERE team_id = ${teamId} AND covered_by IS NULL AND event_id IS NULL
          AND COALESCE(shift_date, date) >= ${od} AND COALESCE(shift_date, date) <= ${do_}`;
      radek.revenue = trzby ? (Number(r?.revenue) || 0) : 0; radek.closings = Number(r?.closings) || 0; radek.pendingApproval = Number(r?.pending) || 0;
    } catch { /* před migrací */ }

    if (mzdy) try {
      // Sazba z členství v podniku ZÁZNAMU; bez členství ze zrcadla, ale jen
      // když zrcadlo ukazuje na TENTO podnik — jinak by člověk odebraný z A
      // a přepnutý do B dostal v A sazbu z B. Člen s členstvím bez sazby má 0.
      // Stejný výraz jako Finance, ať dávají totéž číslo (kolo 62).
      const entries = await sql`
        SELECT te.clock_in, te.clock_out,
               CASE WHEN m.user_id IS NOT NULL THEN COALESCE(m.hourly_rate, 0)
                    WHEN us.team_id = te.team_id THEN COALESCE(us.hourly_rate, 0) ELSE 0 END AS rate
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

    // Stejné číslo jako limit plánu: členství NEBO zrcadlo, bez tabletu (kolo 62).
    try { radek.members = await pocetClenu(teamId); } catch { /* ignore */ }
    try {
      const [o] = await sql`SELECT COUNT(DISTINCT employee_id)::int AS n FROM time_entries WHERE team_id = ${teamId} AND clock_out IS NULL`;
      radek.onShiftNow = Number(o?.n) || 0;
    } catch { /* ignore */ }
    try {
      radek.stockAlerts = Array.from((await teamStock(teamId)).values()).filter(i => i.status !== 'ok').length;
    } catch { /* ignore */ }
    radky.push(radek);
  }

  // Kde tržby nebo mzdy vidět nesmí, jde null — ne nula, která by tvrdila,
  // že podnik nic neutržil. Celek se pak nesečte (byl by neúplný).
  const skryteTrzby = prava.some(p => !p.trzby);
  const skryteMzdy = prava.some(p => !p.mzdy);
  const total: any = souhrn(radky);
  if (skryteTrzby) total.revenue = null;
  if (skryteMzdy) total.wages = null;
  if (skryteTrzby || skryteMzdy) total.laborPct = null;
  const teams = radky.map((r, i) => ({
    ...r,
    revenue: prava[i].trzby ? r.revenue : null,
    wages: prava[i].mzdy ? r.wages : null,
  }));
  return NextResponse.json({ available: true, month, organization: { id: org!.id, name: org!.name }, teams, total });
}
