// Povinné před uzávěrkou — dotazy do databáze a společný kontext uzávěrky.
//
// Čistá pravidla (řazení, zámek, osádka, obchodní den) jsou v
// lib/povinnePredUzaverkou.ts. Tady je to, co musí sedět mezi formulářem a
// serverem do písmene: KDO zavírá, ZA KTERÝ DEN, KTEROU SMĚNU a S KÝM. Dřív si
// formulář počítal den a osádku sám a server jinak — noční směna po půlnoci
// viděla „nic neblokuje" a pak dostala 400. Teď POST /api/closings i
// GET /api/closings/povinne volají totéž `urciKontextUzaverky`.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { maOpravneni, type Kontext } from '@/lib/opravneniDb';
import { clenPodniku } from '@/lib/tenant';
import { pragueToday, dayPlus, NIGHT_CUTOFF_HOUR } from '@/lib/pragueTime';
import { windowOf } from '@/lib/shiftWindow';
import { denUzaverkyPro } from '@/lib/staleShifts';
import {
  sestavStav, ukolProPosadku, type PovinnaPolozka, type StavPovinnych, type TypPovinne,
} from '@/lib/povinnePredUzaverkou';

const sql = neon(process.env.DATABASE_URL!);

export interface KontextUzaverky {
  /** Za koho se zavírá (tablet a uzaverky.za_jineho vybírají, jinak volající). */
  actorId: number;
  /** Obchodní den uzávěrky (`denUzaverkyPro`). */
  shiftDate: string;
  /** Vlastní směna toho člověka ten den, nebo null (pak se nic neblokuje). */
  shift: { id: number; start_time: string; end_time: string } | null;
  eventId: number | null;
  /** Kdo směnu odpracoval s ním (překryv časů), vždy včetně něj. */
  posadka: number[];
  /** Které druhy povinných věcí se u tohohle odesílání hlídají (viz níž). */
  typy: TypPovinne[];
}

/** Vstup z formuláře — POST posílá tělo, GET query parametry; obojí stejně pojmenované. */
export interface VstupUzaverky { date?: unknown; employeeId?: unknown; shiftId?: unknown; eventId?: unknown }

/**
 * Kdo, kdy, která směna, jaká akce a s kým. Vrací hotovou chybovou odpověď,
 * když vstup nedává smysl (za jiného bez práva, budoucí datum, cizí akce).
 * Vytaženo z POST /api/closings beze změny pravidel.
 */
export async function urciKontextUzaverky(c: Kontext, b: VstupUzaverky): Promise<KontextUzaverky | NextResponse> {
  const tablet = c.role.typ === 'kiosk';
  const today = pragueToday();
  // Datum z formuláře je návrh. Pole má vždycky hodnotu, takže „bez data"
  // odsud nikdy nepřijde — a po půlnoci v něm stojí zítřek jen proto, že
  // tak šly hodiny. Obchodní den se spočítá níž, až víme, za koho se zavírá.
  const zvoleno = typeof b.date === 'string' && b.date ? b.date : null;
  // Za jiného zavírá tablet (výběrem směny) i člen s uzaverky.za_jineho.
  const smiZaJineho = c.role.opravneni.has('uzaverky.za_jineho');

  // The kiosk AND the employer can submit ON BEHALF of a chosen team member —
  // the closing is attributed to them (author, one-per-day, notifications).
  let actorId = c.meId;
  const wantEmployeeId = parseInt(String(b.employeeId ?? ''));
  if (tablet && !Number.isFinite(wantEmployeeId)) {
    return NextResponse.json({ error: 'Vyber, kdo uzávěrku odesílá.' }, { status: 400 });
  }
  if (smiZaJineho && Number.isFinite(wantEmployeeId) && wantEmployeeId !== c.meId) {
    // Kolo 62: členství nebo zrcadlo; tablet helper bez volby vyloučí sám.
    const emp = await clenPodniku(wantEmployeeId, c.teamId);
    if (!emp) {
      return NextResponse.json({ error: 'Zaměstnanec není ve vašem týmu.' }, { status: 400 });
    }
    // Tablet jedná za člověka, který se u něj vybral — uzávěrku za něj
    // odešle jen tehdy, když ji ten člověk smí odeslat i sám (oponentura
    // c4). Jinak by Kuchař bez uzaverky.vytvorit uzávěrku odeslal přes
    // tablet. Každý dnešní zaměstnanec i vedení to oprávnění má.
    if (tablet && !(await maOpravneni(wantEmployeeId, c.teamId, 'uzaverky.vytvorit'))) {
      return NextResponse.json({ error: 'Tenhle člověk podle své role uzávěrku odesílat nesmí.' }, { status: 403 });
    }
    actorId = wantEmployeeId;
  }

  // No closing a day that hasn't happened yet.
  if (zvoleno && zvoleno > today) {
    return NextResponse.json({ error: 'Uzávěrku nelze vyplnit pro budoucí datum.' }, { status: 400 });
  }

  // Ke kterému dni uzávěrka patří — jedním pravidlem s příchodem
  // (`denUzaverky`). Sobotní směna zavřená v 0:20 patří sobotě.
  const shiftDate = await denUzaverkyPro(c.teamId, actorId, zvoleno, new Date());
  // Somebody who worked twice that day says WHICH shift they are closing;
  // without that we would always resolve to the first one and the second
  // closing would look like a duplicate of the first.
  const pickedShiftId = parseInt(String(b.shiftId ?? ''));
  let shift: any = null;
  if (Number.isFinite(pickedShiftId)) {
    const [picked] = await sql`
      SELECT id, start_time, end_time FROM shifts
      WHERE id = ${pickedShiftId} AND employee_id = ${actorId} AND date = ${shiftDate}`;
    if (picked) shift = picked;
  }
  if (!shift) {
    [shift] = await sql`
      SELECT id, start_time, end_time FROM shifts
      WHERE employee_id = ${actorId} AND date = ${shiftDate}
      ORDER BY start_time ASC LIMIT 1`;
  }

  // A closing may belong to an off-site event — it lives BESIDE the shop's
  // closing for the day (one per person per event), never instead of it.
  let eventId: number | null = null;
  if (b.eventId !== undefined && b.eventId !== null && b.eventId !== '') {
    const wantEvent = parseInt(String(b.eventId));
    if (Number.isFinite(wantEvent)) {
      try {
        const [ev] = await sql`SELECT id, date FROM events WHERE id = ${wantEvent} AND team_id = ${c.teamId}`;
        if (!ev) return NextResponse.json({ error: 'Akce nenalezena.' }, { status: 400 });
        // Uzávěrka za akci se nehlídá povinnými věcmi — bez kontroly data by
        // stačilo poslat id libovolné staré akce a zámek by se obešel. Akce
        // musí být v den uzávěrky; po půlnoci noční směny formulář ukazuje
        // akce kalendářního dne, proto i den po obchodním.
        const denAkce = String(ev.date ?? '').slice(0, 10);
        if (denAkce !== shiftDate && denAkce !== dayPlus(shiftDate, 1)) {
          return NextResponse.json({ error: 'Tahle akce se v den uzávěrky nekoná.' }, { status: 400 });
        }
        eventId = wantEvent;
      } catch {
        return NextResponse.json({ error: 'Akce nejsou dostupné — spusť /api/init.' }, { status: 400 });
      }
    }
  }

  // The closing covers the whole SHIFT, so record everyone who worked it. The
  // time window comes from an explicitly passed shift, otherwise the author's
  // own. A window is only usable when it doesn't wrap past midnight — for an
  // overnight shift we fall back to everybody scheduled that day.
  let windowShift: any = shift;
  if (Number.isFinite(pickedShiftId)) {
    try {
      const [s] = await sql`SELECT id, start_time, end_time FROM shifts WHERE id = ${pickedShiftId} AND date = ${shiftDate} AND team_id = ${c.teamId}`;
      if (s) windowShift = s;
    } catch { /* ignore — keep the author's own shift */ }
  }
  // Who else worked this shift: real-time overlap of the spans, so a night
  // shift (18:00–02:00) pairs correctly with 20:00–02:00 instead of falling
  // back to "everyone rostered that day".
  const posadka: number[] = [actorId];
  try {
    const mineWindow = windowShift ? windowOf({ ...windowShift, date: shiftDate }) : null;
    const crew = await sql`
      SELECT DISTINCT s.employee_id AS id, s.start_time, s.end_time
      FROM shifts s JOIN users u ON u.id = s.employee_id
      WHERE s.team_id = ${c.teamId} AND s.date = ${shiftDate}`;
    for (const r of crew as any[]) {
      const id = Number(r.id);
      if (!Number.isFinite(id) || posadka.includes(id)) continue;
      // Without a shift of our own there is no window to compare against, so
      // there is nothing to prove anybody shared it — claiming the whole day's
      // roster would file other people's work under this closing.
      if (!mineWindow) continue;
      const theirs = windowOf({ ...r, date: shiftDate });
      // Unknown times can't be told apart — keep them on the shift.
      if (theirs && !(mineWindow.start < theirs.end && theirs.start < mineWindow.end)) continue;
      posadka.push(id);
    }
  } catch { /* shifts table issue — the author alone owns the closing */ }

  // Návod potvrzuje přečtení každý na svém účtu — tablet to za vybraného
  // člověka neumí (GuideReader tam tlačítko nemá, POST /api/guides/[id]
  // kiosk odmítá). Kdyby tablet návody hlídal, uzávěrka by tam šla odemknout
  // jen z cizího telefonu a kdo žádný nemá, zůstal by zamčený natrvalo.
  const typy: TypPovinne[] = tablet ? ['postup', 'ukol'] : ['postup', 'ukol', 'navod'];

  return { actorId, shiftDate, shift: shift ?? null, eventId, posadka, typy };
}

/**
 * Povinné věci pro jeden den a jednoho člověka. Každý zdroj má vlastní try:
 * když selže (typicky sloupec před migrací), jde do `neznamo` a NEBLOKUJE —
 * stejně jako dřív u postupů. Funkce nikdy nevyhodí.
 *
 * - `actorId` null = bez návodů (souhrn dne za podnik nemá „čtenáře").
 * - `posadka` null = úkoly bez filtru osádky.
 * - `typy` omezí zdroje (detail staré uzávěrky nechce dnešní stav návodů).
 */
export async function chybejiciPredUzaverkou(o: {
  teamId: number; den: string; actorId: number | null; posadka: number[] | null; typy?: TypPovinne[];
}): Promise<StavPovinnych> {
  const typy = new Set<TypPovinne>(o.typy ?? ['postup', 'ukol', 'navod']);
  const vsechny: PovinnaPolozka[] = [];
  const neznamo: TypPovinne[] = [];

  // Postupy: stačí, když ho ten den dokončil kdokoli z podniku. Platí
  // obchodní den (pražský čas minus NIGHT_CUTOFF_HOUR, jako businessDayOf) —
  // postup dodělaný v 0:30 noční směny patří k večeru, který se zavírá — NEBO
  // kalendářní den: ranní „Otevření" v 5:40 je obchodně včerejšek, ale patří
  // k dnešní uzávěrce (a widget i /api/procedures/runs ho počítají k dnešku).
  // Neschválený návrh postupu neblokuje nikdy (widget to tak měl, brána ne).
  if (typy.has('postup')) {
    try {
      const rows = await sql`
        SELECT p.id, p.name, p.icon,
          EXISTS (
            SELECT 1 FROM procedure_runs r
            WHERE r.procedure_id = p.id AND r.team_id = ${o.teamId} AND r.status = 'completed'
              AND r.completed_at IS NOT NULL
              AND (
                to_char(((r.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague') - make_interval(hours => ${NIGHT_CUTOFF_HOUR}::int), 'YYYY-MM-DD') = ${o.den}
                OR to_char((r.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${o.den}
              )
          ) AS hotovo
        FROM procedures p
        WHERE p.team_id = ${o.teamId} AND p.require_before_closing = TRUE
          AND p.approved IS DISTINCT FROM FALSE`;
      for (const r of rows as any[]) {
        vsechny.push({
          typ: 'postup', id: Number(r.id), nazev: String(r.name ?? ''), ikona: r.icon ?? null, hotovo: r.hotovo === true,
          odkaz: { pohled: 'procedures', arg: String(r.id), href: '/employee/shifts?view=procedures' },
        });
      }
    } catch { neznamo.push('postup'); }
  }

  // Úkoly: výskyt s termínem právě na ten den (každý výskyt opakovaného úkolu
  // je vlastní řádek, takže o hotovo rozhoduje jen jeho status). Včerejší
  // nesplněný výskyt dnešek nezamyká. Osádku filtruje čistá funkce.
  if (typy.has('ukol')) {
    try {
      const rows = await sql`
        SELECT t.id, t.title, t.status, t.assigned_to, u.name AS assignee_name
        FROM tasks t LEFT JOIN users u ON u.id = t.assigned_to
        WHERE t.team_id = ${o.teamId} AND t.require_before_closing = TRUE AND t.due_date = ${o.den}`;
      for (const r of rows as any[]) {
        const kdo = r.assigned_to == null ? null : Number(r.assigned_to);
        if (!ukolProPosadku(kdo, o.posadka)) continue;
        vsechny.push({
          typ: 'ukol', id: Number(r.id), nazev: String(r.title ?? ''), ikona: 'check',
          kdo: kdo == null ? 'Kdokoli' : (r.assignee_name ?? null), kdoId: kdo,
          hotovo: r.status === 'done',
          odkaz: { pohled: 'tasks', arg: String(r.id), href: '/employee/shifts?view=tasks' },
        });
      }
    } catch { neznamo.push('ukol'); }
  }

  // Návody: osobní, ne denní — ten, kdo zavírá, musí mít přečtenou AKTUÁLNÍ
  // verzi. Potvrzení je jedno na člověka a návod (guide_reads), proto se
  // porovnává čas potvrzení s poslední úpravou: po změně obsahu je potřeba
  // potvrdit znovu (POST /api/guides/[id] čas potvrzení obnoví).
  if (typy.has('navod') && o.actorId != null) {
    try {
      const rows = await sql`
        SELECT g.id, g.title,
          EXISTS (
            SELECT 1 FROM guide_reads gr
            WHERE gr.guide_id = g.id AND gr.user_id = ${o.actorId}
              AND (g.updated_at IS NULL OR gr.read_at >= g.updated_at)
          ) AS hotovo
        FROM guides g
        WHERE g.team_id = ${o.teamId} AND g.require_before_closing = TRUE
          AND g.approved IS DISTINCT FROM FALSE`;
      for (const r of rows as any[]) {
        vsechny.push({
          typ: 'navod', id: Number(r.id), nazev: String(r.title ?? ''), ikona: 'book', hotovo: r.hotovo === true,
          odkaz: { pohled: 'guides', arg: String(r.id), href: '/employee/shifts?view=guides' },
        });
      }
    } catch { neznamo.push('navod'); }
  }

  return sestavStav(vsechny, neznamo);
}
