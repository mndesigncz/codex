// Zapomenuté odpíchnutí — a hlavně to, co zapomenutí NENÍ.
//
// Původní pravidlo znělo „otevřeno přes 12 hodin ⇒ zavřít, a to v čase, kdy
// měla směna podle plánu skončit". V čajovně, která otevírá v osm a zavírá po
// půlnoci, to znamenalo tohle: člověk, který si v osm ráno píchl příchod a ve
// tři čtvrtě na dvanáct večer ještě obsluhoval, dostal směnu ukončenou —
// a zpětně posunutou na plánovaných šestnáct hodin. Přišel o skoro šest
// odpracovaných hodin a směna skončila bez uzávěrky.
//
// Teď to stojí na dvou pravidlech:
//   1. Večer se pracuje. Uklízet zapomenuté odchody smí až noc, kdy v podniku
//      prokazatelně nikdo není.
//   2. Odhad konce se nikdy nebere z plánu, když existuje stopa po skutečnosti.
//      Uzávěrka vyplněná v 1:12 je důkaz, že člověk byl v podniku do 1:12.

import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { pragueHourOf } from '@/lib/pragueTime';

const sql = neon(process.env.DATABASE_URL!);

/** Od kolika ráno platí, že v podniku už nikdo nepracuje (pražský čas). */
export const NIGHT_SWEEP_FROM_HOUR = 5;
/** Do kolika se noční úklid ještě smí spustit — pak už je zase provoz. */
export const NIGHT_SWEEP_TO_HOUR = 11;

/** Takhle dlouho nikdo nepracuje, ať je kolik chce hodin. Poslední pojistka
 *  pro tým, kterému noční cron neproběhl. */
export const ABSURD_AFTER_MS = 20 * 3600 * 1000;

/** Nejkratší otevřený záznam, který v noci ještě považujeme za zapomenutý —
 *  pod tři hodiny to může být někdo, kdo si právě píchl ranní příchod. */
const NIGHT_MIN_OPEN_MS = 3 * 3600 * 1000;

/**
 * Je otevřený záznam zapomenuté odpíchnutí, nebo se pořád pracuje?
 *
 * Jediná spolehlivá odpověď na „zapomněl, nebo tam ještě je" je denní doba.
 * Ve tři čtvrtě na dvanáct večer se v čajovně pracuje; v šest ráno ne.
 */
export function isForgottenClockOut(clockIn: Date | string, now: Date = new Date()): boolean {
  const inTs = new Date(clockIn);
  if (Number.isNaN(inTs.getTime())) return false;
  const openMs = now.getTime() - inTs.getTime();
  if (openMs > ABSURD_AFTER_MS) return true;

  const hour = pragueHourOf(now);
  if (hour == null) return false;
  const inNightWindow = hour >= NIGHT_SWEEP_FROM_HOUR && hour < NIGHT_SWEEP_TO_HOUR;
  if (!inNightWindow) return false;
  if (openMs < NIGHT_MIN_OPEN_MS) return false;
  // Ráno smíme uklidit jen to, co začalo jiný den — ne někoho, kdo si právě
  // píchl příchod na ranní.
  return pragueDateOf(inTs) !== pragueDateOf(now);
}

/** "YYYY-MM-DD" of a moment in Europe/Prague. */
export function pragueDateOf(d: Date): string {
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/Prague' });
}

/** Current Prague UTC offset as "+01:00" / "+02:00" (DST-aware). */
function pragueOffset(at: Date): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Europe/Prague', timeZoneName: 'longOffset',
  }).formatToParts(at);
  const tz = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  const off = tz.replace('GMT', '');
  return /^[+-]\d{2}:\d{2}$/.test(off) ? off : '+01:00';
}

/** A Prague wall-clock "HH:MM" on a given day as an absolute Date. */
export function pragueMoment(dateStr: string, hhmm: string): Date | null {
  const t = String(hhmm).slice(0, 5);
  if (!/^\d{2}:\d{2}$/.test(t)) return null;
  const guess = new Date(`${dateStr}T${t}:00+01:00`);
  const d = new Date(`${dateStr}T${t}:00${pragueOffset(guess)}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** The planned end of the person's shift on the day the entry started. */
export async function plannedEndFor(employeeId: number, clockIn: Date): Promise<Date | null> {
  const day = pragueDateOf(clockIn);
  try {
    const [sh] = await sql`
      SELECT end_time FROM shifts
      WHERE employee_id = ${employeeId} AND date = ${day}
        AND end_time IS NOT NULL AND end_time <> ''
      ORDER BY end_time DESC LIMIT 1`;
    if (!sh?.end_time) return null;
    return pragueMoment(day, String(sh.end_time));
  } catch { return null; }
}

/** Konec otevírací doby v den, kdy směna začala (+ půl hodiny na úklid). */
async function shopCloseFor(teamId: number | null, clockIn: Date): Promise<Date | null> {
  if (!teamId) return null;
  const day = pragueDateOf(clockIn);
  try {
    const [t] = await sql`SELECT opening_hours FROM teams WHERE id = ${teamId}`;
    const oh = t?.opening_hours;
    if (!oh || typeof oh !== 'object') return null;
    // Klíč je den v týdnu od pondělí, stejně jako v rozvrhu.
    const wd = String((new Date(day + 'T12:00:00Z').getUTCDay() + 6) % 7);
    const rec = (oh as any)[wd];
    if (!rec || rec.closed || !rec.close) return null;
    const closeAt = pragueMoment(day, String(rec.close));
    if (!closeAt) return null;
    // Zavírací doba po půlnoci patří dalšímu dni.
    const end = closeAt.getTime() <= clockIn.getTime()
      ? new Date(closeAt.getTime() + 24 * 3600 * 1000) : closeAt;
    return new Date(end.getTime() + 30 * 60 * 1000);
  } catch { return null; }
}

/**
 * Kdy člověk doopravdy skončil — pokud po sobě nechal stopu.
 *
 * Plán směny je to poslední, na co se ptáme, protože ze všech odhadů jediný
 * systematicky zaokrouhluje dolů: kdo zůstal déle, přišel by o rozdíl. Napřed
 * se proto ptáme skutečnosti — uzávěrky, dokončeného postupu, odškrtnutého
 * úkolu — a bereme z toho ten nejpozdější čas.
 */
async function bestCloseTime(
  entry: { employee_id: number; team_id: number | null }, inTs: Date, now: Date,
): Promise<{ at: Date; why: string }> {
  const day = pragueDateOf(inTs);
  const candidates: { at: Date; why: string }[] = [];
  const add = (v: any, why: string) => {
    if (!v) return;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return;
    if (d.getTime() <= inTs.getTime() || d.getTime() > now.getTime()) return;
    candidates.push({ at: d, why });
  };

  try {
    const [cl] = await sql`
      SELECT created_at FROM cash_closings
      WHERE created_by = ${entry.employee_id} AND COALESCE(shift_date, date) = ${day}
      ORDER BY created_at DESC LIMIT 1`;
    add(cl?.created_at, 'podle vyplněné uzávěrky');
  } catch { /* volitelné */ }

  try {
    const [pr] = await sql`
      SELECT MAX(completed_at) AS at FROM procedure_runs
      WHERE user_id = ${entry.employee_id} AND completed_at IS NOT NULL
        AND completed_at >= ${inTs.toISOString()}`;
    add(pr?.at, 'podle dokončeného postupu');
  } catch { /* volitelné */ }

  try {
    const [tk] = await sql`
      SELECT MAX(completed_at) AS at FROM tasks
      WHERE completed_by = ${entry.employee_id} AND completed_at IS NOT NULL
        AND completed_at >= ${inTs.toISOString()}`;
    add(tk?.at, 'podle odškrtnutého úkolu');
  } catch { /* volitelné */ }

  add(await shopCloseFor(entry.team_id, inTs), 'podle konce otevírací doby');
  add(await plannedEndFor(entry.employee_id, inTs), 'podle konce plánované směny');

  if (!candidates.length) {
    // Vůbec žádná stopa. Osm hodin je poctivější odhad než „teď", protože
    // „teď" je noc, kdy člověk dávno spí.
    const guess = new Date(Math.min(inTs.getTime() + 8 * 3600 * 1000, now.getTime()));
    return { at: guess, why: 'odhadem, žádná stopa po konci směny' };
  }
  return candidates.reduce((a, b) => (b.at.getTime() > a.at.getTime() ? b : a));
}

/**
 * Uzavře jeden zapomenutý záznam nejpozdějším časem, který jde doložit, a
 * označí ho, aby vedení vidělo, že jde o odhad a podle čeho vznikl.
 */
export async function autoCloseEntry(entry: { id: number; employee_id: number; team_id: number | null; clock_in: string | Date }, opts?: { notify?: boolean }) {
  const inTs = new Date(entry.clock_in);
  const now = new Date();
  const { at: closeAt, why } = await bestCloseTime(entry, inTs, now);

  const [row] = await sql`
    UPDATE time_entries
    SET clock_out = ${closeAt.toISOString()},
        note = ${`Zavřeno automaticky ${why} — zkontroluj čas.`}
    WHERE id = ${entry.id} AND clock_out IS NULL
    RETURNING id, clock_in AS "clockIn", clock_out AS "clockOut"`;
  if (!row) return null; // someone closed it meanwhile

  if (opts?.notify !== false && entry.team_id) {
    const hhmm = closeAt.toLocaleTimeString('cs-CZ', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit' });
    try {
      const [emp] = await sql`SELECT name FROM users WHERE id = ${entry.employee_id}`;
      const employers = await sql`
        SELECT id FROM users WHERE team_id = ${entry.team_id} AND role = 'employer' AND id <> ${entry.employee_id}`;
      let missingClosing = false;
      try {
        const [has] = await sql`
          SELECT 1 FROM cash_closings
          WHERE created_by = ${entry.employee_id}
            AND COALESCE(shift_date, date) = ${pragueDateOf(inTs)}`;
        missingClosing = !has;
      } catch { /* volitelné */ }
      await notifyUsers((employers as any[]).map(e => e.id), {
        title: '⏱️ Směna uzavřena automaticky',
        body: `${emp?.name ?? 'Zaměstnanec'} se zapomněl/a odpíchnout — směna uzavřena v ${hhmm} (${why}).`
          + (missingClosing ? ' K tomuhle dni navíc chybí uzávěrka.' : '')
          + ' Zkontroluj čas v docházce.',
        type: 'warning',
        category: 'shift',
        link: '/employer/overview?view=attendance',
      });
      await notifyUser(entry.employee_id, {
        title: '⏱️ Zapomenutý odchod',
        body: `Zapomněl/a jsi se odpíchnout — směnu jsme uzavřeli v ${hhmm}. Kdyby čas neseděl, řekni vedení.`,
        type: 'warning',
        category: 'shift',
        link: '/employee/shifts',
      });
    } catch { /* best-effort */ }
  }
  return row;
}
