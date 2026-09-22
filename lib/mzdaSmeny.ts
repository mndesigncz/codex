// Co si člověk za směnu vydělal — a co za ni dostal bodů.
//
// Vedení tohle vidělo v Docházce a ve Financích; zaměstnanec nikde. Přitom
// uzávěrka je chvíle, kdy směna končí a člověk se přirozeně ptá „kolik to
// dneska bylo". Sazbu i odpracovaný čas aplikace zná, tak proč ho nechat
// počítat z hlavy.
//
// Aritmetika je z `lib/wages.ts` (jedno místo, jedno číslo) a sazebník bodů
// z `lib/rewardLevels.ts`. Tady se jen dotáhnou vstupy pro jednoho člověka
// a jeden obchodní den.
//
// Záznam docházky se páruje s dnem stejně jako jinde v uzávěrce: podle
// pražského data příchodu (viz `refEntry` v POST /api/closings a
// finance/advice). Otevřený záznam se počítá do TEĎ — v okamžiku uzávěrky
// je typicky ještě otevřený, protože odpíchnout se lidi chodí až po ní.

import { neon } from '@neondatabase/serverless';
import { earnedFor, MAX_SHIFT_HOURS } from './wages';
import { normalizePoints, type PointsConfig } from './rewardLevels';

const sql = neon(process.env.DATABASE_URL!);

export interface MzdaZaSmenu {
  /** Odpracováno v milisekundách (otevřený záznam do `now`). */
  ms: number;
  /** Hodinová sazba; 0 = nenastavená. */
  rate: number;
  /** Hrubá mzda za směnu podle `earnedFor`. */
  earned: number;
  /** Aspoň jeden záznam je ještě otevřený. */
  open: boolean;
  /** Záznam přesáhl MAX_SHIFT_HOURS — mzda vyjde 0 a NENÍ to pravda. */
  suspicious: boolean;
  /** Bez jediného záznamu docházky — mzda se nedá spočítat. */
  noEntries: boolean;
}

export async function mzdaZaSmenu(teamId: number, employeeId: number, den: string, now = new Date()): Promise<MzdaZaSmenu> {
  let rate = 0;
  try {
    const [u] = await sql`SELECT COALESCE(hourly_rate, 0) AS rate FROM users WHERE id = ${employeeId} AND team_id = ${teamId}`;
    rate = Math.max(0, Number(u?.rate) || 0);
  } catch { /* sloupec chybí → sazba 0 */ }

  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT clock_in, clock_out FROM time_entries
      WHERE employee_id = ${employeeId} AND team_id = ${teamId}
        AND to_char((clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${den}
      ORDER BY clock_in ASC`;
  } catch { /* před migrací */ }

  let ms = 0;
  let open = false;
  let suspicious = false;
  for (const r of rows) {
    const a = new Date(r.clock_in).getTime();
    const b = r.clock_out ? new Date(r.clock_out).getTime() : now.getTime();
    if (!r.clock_out) open = true;
    const d = Math.max(0, b - a);
    if (d / 3600000 >= MAX_SHIFT_HOURS) suspicious = true;
    ms += d;
  }
  return { ms, rate, earned: earnedFor(ms, rate), open, suspicious, noEntries: rows.length === 0 };
}

export interface BodyZaSmenu {
  tasks: number; procedures: number;
  taskPts: number; procPts: number;
  /** Body za samotnou uzávěrku — dostane je ten, kdo ji odešle. */
  closingPts: number;
  total: number;
  config: PointsConfig;
}

/** Sazebník bodů týmu — týmové nastavení, nebo výchozí. */
export async function sazebnikBodu(teamId: number): Promise<PointsConfig> {
  try {
    const [t] = await sql`SELECT points_config FROM teams WHERE id = ${teamId}`;
    return normalizePoints(t?.points_config);
  } catch { return normalizePoints(null); }
}

/**
 * Body, které člověk za tenhle den nasbíral úkoly a postupy — plus ty, které
 * dostane za uzávěrku samotnou. Je to výhled pro obrazovku, ne účetnictví:
 * žebříček si body počítá sám z celé historie (`lib/pointsBalance.ts`).
 */
export async function bodyZaSmenu(teamId: number, employeeId: number, den: string): Promise<BodyZaSmenu> {
  const config = await sazebnikBodu(teamId);
  let tasks = 0, procedures = 0;
  try {
    const [r] = await sql`
      SELECT COUNT(*)::int AS n FROM tasks
      WHERE completed_by = ${employeeId} AND status = 'done' AND team_id = ${teamId}
        AND to_char((completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${den}`;
    tasks = r?.n ?? 0;
  } catch { /* sloupec chybí */ }
  try {
    const [r] = await sql`
      SELECT COUNT(*)::int AS n FROM procedure_runs
      WHERE user_id = ${employeeId} AND status = 'completed' AND team_id = ${teamId}
        AND to_char((completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${den}`;
    procedures = r?.n ?? 0;
  } catch { /* tabulka chybí */ }
  const taskPts = tasks * config.task;
  const procPts = procedures * config.procedure;
  const closingPts = config.closing;
  return { tasks, procedures, taskPts, procPts, closingPts, total: taskPts + procPts + closingPts, config };
}
