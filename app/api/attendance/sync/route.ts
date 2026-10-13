import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';
import { jeClenem } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { notifyUsers } from '@/lib/push';
import { sIdempotenci } from '@/lib/idempotence';
import { denSmeny } from '@/lib/staleShifts';
import { parseDbTime, pragueDayOf, pragueHM } from '@/lib/pragueTime';
import { hlaskaZamku, zamekDne } from '@/lib/dochazkaZaznamy';
import { MAX_FRONTA, overPolozkuSync, type PolozkaSync } from '@/lib/kioskOffline';
import type { ZamekObdobi } from '@/lib/dochazkaPrehled';

// Píchnutí z tabletu doručená po výpadku internetu (kolo 8, R8-2).
//
// Tablet za barem si bez Wi-Fi ukládá příchody a odchody do fronty (lib/kioskOffline, components/kiosk/
// KioskShiftGate) — PIN ověří proti otisku z posledního připojení, čas vezme ze svých hodin. Po připojení
// pošle frontu sem: POST { pichnuti: [{ klic, employeeId, action, cas, pinOvereno }] }.
//
//  - jen účet tabletu (typ role 'kiosk' s dochazka.tablet): vedení má ruční záznam s důvodem, zaměstnanec Píchačky;
//  - každý kus nejvýš jednou (lib/idempotence, stejný klíč → stejná odpověď), nejvýš MAX_FRONTA kusů;
//  - kdo má PIN, musí mít `pinOvereno` (tablet PIN ověřil) — jinak se kus odmítne;
//  - čas starší než den nebo v budoucnosti se odmítne (lib/kioskOffline.overPolozkuSync), uzavřené výplatní období taky;
//  - záznam dostane `offline = TRUE` (chip „offline" v Záznamech docházky) a vedení se dozví, kolik píchnutí dorazilo.
// Odpověď říká ke každému klíči, jak dopadl — tablet z fronty smaže doručené i odmítnuté, zbytek zkusí znovu.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function zamkyKolemDne(teamId: number, den: string): Promise<ZamekObdobi[]> {
  try {
    const rows = await sql`
      SELECT id, period_from, period_to FROM payroll_locks
      WHERE team_id = ${teamId} AND period_from <= ${den} AND period_to >= ${den}`;
    return (rows as any[]).map(r => ({ id: Number(r.id), od: String(r.period_from), do: String(r.period_to) }));
  } catch { return []; }
}

async function ensureShift(teamId: number, employeeId: number, date: string, start: string, end: string) {
  try {
    const [sh] = await sql`SELECT id FROM shifts WHERE employee_id = ${employeeId} AND date = ${date} AND team_id = ${teamId} LIMIT 1`;
    if (sh) return;
    await sql`INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type, auto_created)
              VALUES (${teamId}, ${employeeId}, ${date}, ${start}, ${end}, 'auto', TRUE)`;
  } catch { /* best-effort */ }
}

const hm = (d: Date) => pragueHM(d);

/** Jedno píchnutí z fronty; vrací odpověď jako samostatná routa, ať ji lib/idempotence umí uložit. */
async function zapis(teamId: number, p: PolozkaSync): Promise<NextResponse> {
  const den = pragueDayOf(p.cas);
  const z = zamekDne(await zamkyKolemDne(teamId, den), den);
  if (z) return NextResponse.json({ error: hlaskaZamku(z) }, { status: 409 });
  const casIso = p.cas.toISOString();
  const [open] = await sql`
    SELECT id, clock_in FROM time_entries
    WHERE employee_id = ${p.employeeId} AND clock_out IS NULL AND (team_id = ${teamId} OR team_id IS NULL)
    ORDER BY clock_in DESC LIMIT 1`;
  if (p.action === 'in') {
    if (open) {
      const otevrenoOd = parseDbTime(open.clock_in)?.getTime() ?? 0;
      // Zapomenutý odchod z dřívějška nesmí blokovat dnešní příchod: zavře se v čase nového příchodu
      // (stejně jako online, jen bez hádání „rozumného" času — tablet tenhle příchod viděl).
      if (p.cas.getTime() - otevrenoOd > 60 * 60 * 1000) {
        await sql`UPDATE time_entries SET clock_out = ${casIso} WHERE id = ${open.id}`;
      } else {
        return NextResponse.json({ error: 'Příchod už je zaznamenaný.' }, { status: 409 });
      }
    }
    let row: any;
    try {
      [row] = await sql`
        INSERT INTO time_entries (team_id, employee_id, clock_in, source, offline)
        VALUES (${teamId}, ${p.employeeId}, ${casIso}, 'kiosk', TRUE)
        RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
    } catch {
      [row] = await sql`
        INSERT INTO time_entries (team_id, employee_id, clock_in, source)
        VALUES (${teamId}, ${p.employeeId}, ${casIso}, 'kiosk')
        RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
    }
    const denSmenyPrichodu = await denSmeny(teamId, p.employeeId, p.cas);
    await ensureShift(teamId, p.employeeId, denSmenyPrichodu, hm(p.cas), hm(p.cas));
    return NextResponse.json({ ok: true, action: 'in', entry: row });
  }
  // odchod
  if (!open) return NextResponse.json({ error: 'Žádný otevřený příchod k odpíchnutí.' }, { status: 409 });
  const od = parseDbTime(open.clock_in) ?? p.cas;
  if (p.cas.getTime() <= od.getTime()) return NextResponse.json({ error: 'Odchod musí být po příchodu.' }, { status: 409 });
  let row: any;
  try {
    [row] = await sql`
      UPDATE time_entries SET clock_out = ${casIso}, offline = TRUE WHERE id = ${open.id}
      RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
  } catch {
    [row] = await sql`
      UPDATE time_entries SET clock_out = ${casIso} WHERE id = ${open.id}
      RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
  }
  const shiftDay = await denSmeny(teamId, p.employeeId, od);
  try { await sql`UPDATE shifts SET end_time = ${hm(p.cas)} WHERE employee_id = ${p.employeeId} AND date = ${shiftDay} AND auto_created = TRUE`; } catch { /* not migrated */ }
  return NextResponse.json({ ok: true, action: 'out', entry: row });
}

export async function POST(req: NextRequest) {
  const c = await pozaduj('dochazka.tablet');
  if (jeOdpoved(c)) return c;
  if (c.role.typ !== 'kiosk') return NextResponse.json({ error: 'Frontu píchnutí posílá jen tablet.' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const seznam = Array.isArray(b?.pichnuti) ? b.pichnuti : null;
  if (!seznam) return NextResponse.json({ error: 'Chybí seznam píchnutí.' }, { status: 400 });
  if (seznam.length > MAX_FRONTA) return NextResponse.json({ error: `Najednou nejvýš ${MAX_FRONTA} píchnutí.` }, { status: 400 });

  const ted = Date.now();
  const vysledky: { klic: string | null; ok: boolean; error?: string; action?: string; opakovani?: boolean }[] = [];
  // V pořadí podle času, ať odchod nepředběhne svůj příchod.
  const kZapisu: PolozkaSync[] = [];
  for (const raw of seznam as unknown[]) {
    const o = overPolozkuSync(raw, ted);
    if (o.ok) kZapisu.push(o.p);
    else vysledky.push({ klic: o.klic, ok: false, error: o.chyba });
  }
  kZapisu.sort((a, b2) => a.cas.getTime() - b2.cas.getTime());

  const jmena = new Map<number, string>();
  let doruceno = 0;
  for (const p of kZapisu) {
    if (!(await jeClenem(p.employeeId, c.teamId))) { vysledky.push({ klic: p.klic, ok: false, error: 'Zaměstnanec není ve vašem týmu' }); continue; }
    let maPin = false;
    try {
      const [u] = await sql`SELECT (pin_hash IS NOT NULL AND pin_hash <> '') OR (pin IS NOT NULL AND pin <> '') AS "maPin", name FROM users WHERE id = ${p.employeeId}`;
      maPin = u?.maPin === true;
      if (u?.name) jmena.set(p.employeeId, String(u.name));
    } catch { /* bez pin_hash rozhodne starý sloupec níž */ }
    if (maPin && !p.pinOvereno) { vysledky.push({ klic: p.klic, ok: false, error: 'PIN nebyl ověřený — píchnutí se nezapsalo.' }); continue; }
    const res = await sIdempotenci(c.teamId, req, { idempotencyKey: p.klic }, () => zapis(c.teamId, p));
    const data = await res.json().catch(() => ({})) as { error?: string; action?: string; opakovani?: boolean };
    if (res.status >= 200 && res.status < 300) { doruceno++; vysledky.push({ klic: p.klic, ok: true, action: data.action, opakovani: data.opakovani === true }); }
    else vysledky.push({ klic: p.klic, ok: false, error: data.error || 'Píchnutí se nepodařilo zapsat.' });
  }

  if (doruceno > 0) {
    const kdo = [...new Set(kZapisu.map(p => jmena.get(p.employeeId) ?? `#${p.employeeId}`))].join(', ');
    await audit(c.teamId, c.meId, 'dochazka.sync_offline', 'time_entry', null, `${doruceno}× po výpadku: ${kdo}`.slice(0, 300));
    try {
      const vedouci = await clenoveSOpravnenim(c.teamId, 'dochazka.zobrazit');
      await notifyUsers(vedouci, {
        title: 'Píchnutí doručená po výpadku',
        body: `Tablet byl bez internetu — dorazilo: ${doruceno} píchnutí s časem tabletu (${kdo}). V Docházce mají chip „offline".`,
        type: 'info',
        category: 'shift',
        link: '/employer/overview?view=attendance',
      });
    } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, doruceno, vysledky });
}
