// Zápis automatických bodů za úkol a uzávěrku podle způsobu počítání (kolo 91).
//
// Postup si řádek zapisuje sám v app/api/procedures/runs (stejný tvar). Úkol a uzávěrka
// dřív řádek neměly vůbec — platil jen základ z počtu v totalPoints(). Řádek vzniká jen
// tam, kde způsob počítání (nebo vlastní body u úkolu) dá jiný výsledek než základ,
// a u uzávěrky s povinnými věcmi vždy (poznámka „auto: 3/4 povinných“ je snímek pro
// pozdější přepočet zpětně). Všechno best-effort: body nikdy nezablokují splnění.

import { neon } from '@neondatabase/serverless';
import { normalizePoints } from './rewardLevels';
import { pragueToday } from './pragueTime';
import { bodyUkolu, bodyUzaverky, nastaveniRezimu, normalizujPrepis, ucinnePravidlo, type BodyVeci } from './bodyRezim';

const sql = neon(process.env.DATABASE_URL!);

async function pointsConfig(teamId: number): Promise<any> {
  try { const [t] = await sql`SELECT points_config FROM teams WHERE id = ${teamId}`; return t?.points_config ?? null; } catch { return null; }
}

/** Automatický řádek: vloží, nebo přepíše jen dosud automatický (ruční úpravu vedení nikdy). */
async function zapisAutoRadek(teamId: number, uid: number, den: string, kind: 'task' | 'closing', refId: number, v: BodyVeci): Promise<void> {
  await sql`
    INSERT INTO shift_review_items (team_id, employee_id, work_date, kind, ref_id, points, srazka, note, flagged, created_by)
    VALUES (${teamId}, ${uid}, ${den}, ${kind}, ${refId}, ${v.radek}, ${v.srazka}, ${v.summary}, ${v.flagged}, NULL)
    ON CONFLICT (employee_id, work_date, kind, ref_id) DO UPDATE
      SET points = EXCLUDED.points, srazka = EXCLUDED.srazka, note = EXCLUDED.note, flagged = EXCLUDED.flagged
      WHERE shift_review_items.created_by IS NULL AND COALESCE(shift_review_items.rucne, FALSE) = FALSE
        AND shift_review_items.note LIKE 'auto:%'`;
}

/**
 * Úkol právě splněný: body podle způsobu počítání (checklist, vlastní body úkolu).
 * Vrátí, kolik úkol vynesl (pro „+5 bodů“ při odškrtnutí), nebo null, když to nejde zjistit.
 */
export async function bodyZaSplnenyUkol(teamId: number, uid: number, task: { id: number; checklist?: unknown; body_rezim?: unknown }): Promise<number | null> {
  try {
    const raw = await pointsConfig(teamId);
    const pt = normalizePoints(raw);
    const p = ucinnePravidlo(nastaveniRezimu(raw).ukoly, normalizujPrepis(task.body_rezim), pt.task);
    const v = bodyUkolu(task.checklist, p, pt.task);
    if (v.radek !== 0 || v.srazka !== 0) {
      try { await zapisAutoRadek(teamId, uid, pragueToday(), 'task', Number(task.id), v); } catch { /* před migrací */ }
    }
    return v.body;
  } catch { return null; }
}

/** Úkol znovu otevřený: automatický řádek k němu (jen dosud automatický) zmizí se základem. */
export async function smazAutoRadekUkolu(teamId: number, taskId: number): Promise<void> {
  try {
    await sql`
      DELETE FROM shift_review_items
      WHERE team_id = ${teamId} AND kind = 'task' AND ref_id = ${taskId}
        AND created_by IS NULL AND COALESCE(rucne, FALSE) = FALSE AND note LIKE 'auto:%'`;
  } catch { /* před migrací */ }
}

/** Uzávěrka odeslaná: body podle povinných věcí dne (hotovo z celkem). */
export async function bodyZaUzaverku(teamId: number, uid: number, den: string, closingId: number, povinne: { hotovo: number; celkem: number }): Promise<void> {
  if (!(povinne.celkem > 0)) return;
  try {
    const raw = await pointsConfig(teamId);
    const pt = normalizePoints(raw);
    const p = ucinnePravidlo(nastaveniRezimu(raw).uzaverky, null, pt.closing);
    const v = bodyUzaverky(povinne.hotovo, povinne.celkem, p, pt.closing);
    await zapisAutoRadek(teamId, uid, den, 'closing', closingId, v);
  } catch { /* body nikdy neblokují uzávěrku */ }
}
