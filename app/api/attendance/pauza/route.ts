import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { notifyUsers } from '@/lib/push';
import { denSmeny } from '@/lib/staleShifts';
import { parseDbTime, pragueHM } from '@/lib/pragueTime';
import { PAUZA_MIN, POVINNA_PAUZA_PO_MS, rozdelProPauzu } from '@/lib/dochazkaPrehled';

// Pauza na směně (kolo 8, R8-1) — vlastní pauza z Píchaček; tablet má svou cestu v balíku 2.
//
// Pauza je mezera mezi dvěma záznamy, takže výpočet hodin se nikde nemění (lib/dochazkaPrehled:
// přestávka = odchod a nový příchod):
//   start      zavře běžící záznam A a založí záznam B se zdrojem 'break' a break_after = A, zatím
//              s odchodem rovným příchodu (nulová délka — nikde se nepočítá; Píchačky z něj poznají „na pauze");
//   end        B dostane příchod teď a odchod NULL — od té chvíle je to obyčejný běžící záznam;
//   odchod     odchod rovnou z pauzy: B se smaže, směna skončila odchodem A;
//   doplnit    odchod po víc než 6 h bez pauzy, „Ano, měl/a jsem 30 min": směna se rozdělí v polovině na A a B
//              s mezerou (lib rozdelProPauzu) a zapíše se do auditu — je to zásah do mzdových dat;
//   bez_pauzy  odchod bez pauzy: zavře A, připíše poznámku a dá vědět vedoucím (dochazka.zobrazit).

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function otevrenyZaznam(meId: number, teamId: number) {
  const [open] = await sql`
    SELECT id, clock_in, note, source FROM time_entries
    WHERE employee_id = ${meId} AND clock_out IS NULL AND (team_id = ${teamId} OR team_id IS NULL)
    ORDER BY clock_in DESC LIMIT 1`;
  return open ?? null;
}

async function otevrenaPauza(meId: number, teamId: number) {
  try {
    const [p] = await sql`
      SELECT id, clock_in, break_after FROM time_entries
      WHERE employee_id = ${meId} AND team_id = ${teamId} AND source = 'break' AND clock_out = clock_in
        AND clock_in >= NOW() - INTERVAL '12 hours'
      ORDER BY clock_in DESC LIMIT 1`;
    return p ?? null;
  } catch { return null; }
}

/** Konec automatické směny a připomínka uzávěrky — stejně jako odchod v POST /api/attendance. */
async function poOdchodu(teamId: number, meId: number, zacatek: Date): Promise<{ closingDone: boolean }> {
  const shiftDay = await denSmeny(teamId, meId, zacatek);
  try { await sql`UPDATE shifts SET end_time = ${pragueHM()} WHERE employee_id = ${meId} AND date = ${shiftDay} AND auto_created = TRUE`; } catch { /* not migrated */ }
  let closingDone = true;
  try {
    const [cl] = await sql`SELECT id FROM cash_closings WHERE created_by = ${meId} AND COALESCE(shift_date, date) = ${shiftDay}`;
    closingDone = !!cl;
  } catch { /* ignore */ }
  return { closingDone };
}

export async function POST(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  if (c.role.typ === 'kiosk') return NextResponse.json({ error: 'Na tabletu se pauza zapisuje přes výběr člověka.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const akce = String(b.action ?? '');
  const ted = new Date();
  const tedIso = ted.toISOString();

  if (akce === 'start') {
    const open = await otevrenyZaznam(c.meId, c.teamId);
    if (!open) return NextResponse.json({ error: 'Nejsi na směně — pauzu nemáš odkud začít.' }, { status: 409 });
    try {
      await sql`UPDATE time_entries SET clock_out = ${tedIso} WHERE id = ${open.id}`;
      await sql`
        INSERT INTO time_entries (team_id, employee_id, clock_in, clock_out, source, break_after)
        VALUES (${c.teamId}, ${c.meId}, ${tedIso}, ${tedIso}, 'break', ${open.id})`;
    } catch {
      return NextResponse.json({ error: 'Pauzu se nepodařilo zapsat — databáze ještě není připravená.' }, { status: 503 });
    }
    return NextResponse.json({ ok: true, action: 'start', pauzaOd: tedIso });
  }

  if (akce === 'end') {
    const p = await otevrenaPauza(c.meId, c.teamId);
    if (!p) return NextResponse.json({ error: 'Žádná pauza neběží.' }, { status: 409 });
    const [row] = await sql`
      UPDATE time_entries SET clock_in = ${tedIso}, clock_out = NULL WHERE id = ${p.id}
      RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
    return NextResponse.json({ ok: true, action: 'end', entry: row });
  }

  if (akce === 'odchod') {
    const p = await otevrenaPauza(c.meId, c.teamId);
    if (!p) return NextResponse.json({ error: 'Žádná pauza neběží.' }, { status: 409 });
    await sql`DELETE FROM time_entries WHERE id = ${p.id} AND employee_id = ${c.meId}`;
    const zacatek = parseDbTime(p.clock_in) ?? ted;
    return NextResponse.json({ ok: true, action: 'out', ...(await poOdchodu(c.teamId, c.meId, zacatek)) });
  }

  if (akce === 'doplnit' || akce === 'bez_pauzy') {
    const open = await otevrenyZaznam(c.meId, c.teamId);
    if (!open) return NextResponse.json({ error: 'Žádný otevřený příchod k odpíchnutí.' }, { status: 409 });
    const od = parseDbTime(open.clock_in) ?? ted;
    const odpracovano = ted.getTime() - od.getTime();
    let jmeno = '';
    try { jmeno = String((await sql`SELECT name FROM users WHERE id = ${c.meId}`)[0]?.name ?? ''); } catch { /* jen do textů */ }
    if (akce === 'doplnit') {
      const minut = Math.min(120, Math.max(5, Math.round(Number(b.minuty)) || PAUZA_MIN));
      const rozdel = rozdelProPauzu(od, ted.getTime(), minut);
      if (!rozdel) {
        await sql`UPDATE time_entries SET clock_out = ${tedIso} WHERE id = ${open.id}`;
        return NextResponse.json({ ok: true, action: 'out', rozdeleno: false, ...(await poOdchodu(c.teamId, c.meId, od)) });
      }
      try {
        await sql`UPDATE time_entries SET clock_out = ${rozdel.konecA.toISOString()} WHERE id = ${open.id}`;
        await sql`
          INSERT INTO time_entries (team_id, employee_id, clock_in, clock_out, source, break_after)
          VALUES (${c.teamId}, ${c.meId}, ${rozdel.zacatekB.toISOString()}, ${tedIso}, 'break', ${open.id})`;
      } catch {
        await sql`UPDATE time_entries SET clock_out = ${tedIso} WHERE id = ${open.id}`;
        return NextResponse.json({ ok: true, action: 'out', rozdeleno: false, ...(await poOdchodu(c.teamId, c.meId, od)) });
      }
      await audit(c.teamId, c.meId, 'dochazka.pauza_doplnena', 'time_entry', Number(open.id), `${jmeno || `#${c.meId}`}: ${minut} min, směna ${Math.round(odpracovano / 360_000) / 10} h`);
      return NextResponse.json({ ok: true, action: 'out', rozdeleno: true, ...(await poOdchodu(c.teamId, c.meId, od)) });
    }
    // bez_pauzy
    const poznamka = 'Bez pauzy (po 6 h)';
    const nova = open.note ? `${String(open.note).slice(0, 270)} · ${poznamka}` : poznamka;
    await sql`UPDATE time_entries SET clock_out = ${tedIso}, note = ${nova} WHERE id = ${open.id}`;
    if (odpracovano > POVINNA_PAUZA_PO_MS) {
      await audit(c.teamId, c.meId, 'dochazka.bez_pauzy', 'time_entry', Number(open.id), `${jmeno || `#${c.meId}`}: ${Math.round(odpracovano / 360_000) / 10} h`);
      try {
        const vedouci = (await clenoveSOpravnenim(c.teamId, 'dochazka.zobrazit')).filter(id => id !== c.meId);
        await notifyUsers(vedouci, {
          title: 'Odchod bez pauzy',
          body: `${jmeno || 'Zaměstnanec'} odpracoval/a ${Math.round(odpracovano / 360_000) / 10} h bez pauzy — zákoník chce 30 min nejdéle po 6 h.`,
          type: 'warning',
          category: 'shift',
          link: '/employer/overview?view=attendance',
        });
      } catch { /* best-effort */ }
    }
    return NextResponse.json({ ok: true, action: 'out', ...(await poOdchodu(c.teamId, c.meId, od)) });
  }

  return NextResponse.json({ error: 'Neznámá akce.' }, { status: 400 });
}
