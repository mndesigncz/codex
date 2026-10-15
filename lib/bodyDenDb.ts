// Automatické body po dnech (kolo 91): denní strop a přednost ručního hodnocení.
//
// Pravidla jsou v lib/bodyRezim.ts (ucinnyDen); tady se jen sečtou automatické
// body člověka za každý den ze stejných zdrojů, ze kterých je skládá totalPoints():
//   + základ za splněný úkol (pražský den dokončení)
//   + základ za neprázdný dokončený průběh postupu (pražský den dokončení)
//   + základ za uzávěrku (obchodní den uzávěrky)
//   ± automatické řádky shift_review_items (created_by NULL, ne ruční), plus a srážka zvlášť
//   ± automatické body z hodnocení směny (shift_reviews.auto_points), pokud ho vedení nenechalo nahradit
// Ruční body vedení (ruční řádky, body z hodnocení směny), pochvaly, Navíc / Úkoly za body
// a tresty do stropu nepatří — jsou to vědomá rozhodnutí; počítají se vždy celé.
//
// Výsledek je OPRAVA k totalPoints (≤ 0): kolik strop a ruční hodnocení z automatických
// bodů ubraly. Data se nemažou ani nepřepisují — strop platí při každém počítání znovu,
// takže žebříček, odměny, profil i výdělek sedí na jednom místě (lib/pointsBalance).

import { neon } from '@neondatabase/serverless';
import { normalizePoints, type PointsConfig } from './rewardLevels';
import { dayPlus } from './pragueTime';
import { nastaveniRezimu, ucinnyDen, type DenBodu, type NastaveniRezimu, type UcinnyDen } from './bodyRezim';

const sql = neon(process.env.DATABASE_URL!);

export interface UpravaClena {
  /** Součet úprav přes dny (≤ 0). */
  uprava: number;
  /** Kolik dní narazilo na strop. */
  zastropovano: number;
  /** Kolik dní nahradilo ruční hodnocení. */
  nahrazeno: number;
}

/**
 * Automatické body po dnech pro členy týmu. `od` (YYYY-MM-DD) omezí dny jako žebříček
 * „tento měsíc“. `vse` = i dny bez úpravy (náhled přepočtu potřebuje všechny), jinak jen
 * dny, kterých se strop nebo ruční hodnocení můžou týkat. Před migrací (chybí sloupec) [].
 */
export async function nactiDny(
  teamId: number, uids: number[], pt: Pick<PointsConfig, 'task' | 'procedure' | 'closing'>,
  od: string | null, strop: number, vse = false, bezHodnoceni = false,
): Promise<DenBodu[]> {
  if (uids.length === 0) return [];
  const odCas = od ? `${od}T00:00:00` : null;
  const s = Math.max(0, Math.round(strop) || 0);
  try {
    const rows = await sql`
      WITH prispevky AS (
        SELECT completed_by AS uid,
               to_char((completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') AS den,
               ${pt.task}::int AS plus, 0 AS minus
        FROM tasks
        WHERE completed_by = ANY(${uids}) AND status = 'done' AND (team_id = ${teamId} OR team_id IS NULL)
          AND (${odCas}::text IS NULL OR completed_at >= ${odCas}::timestamp)
        UNION ALL
        SELECT user_id, to_char((completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD'),
               ${pt.procedure}::int, 0
        FROM procedure_runs
        WHERE user_id = ANY(${uids}) AND status = 'completed' AND (team_id = ${teamId} OR team_id IS NULL)
          AND (COALESCE(total_items, 0) = 0 OR (jsonb_typeof(checked_items) = 'array' AND checked_items <> '[]'::jsonb))
          AND (${odCas}::text IS NULL OR completed_at >= ${odCas}::timestamp)
        UNION ALL
        SELECT created_by, date, ${pt.closing}::int, 0
        FROM cash_closings
        WHERE created_by = ANY(${uids}) AND covered_by IS NULL AND (team_id = ${teamId} OR team_id IS NULL)
          AND (${od}::text IS NULL OR date >= ${od})
        UNION ALL
        SELECT employee_id, work_date,
               CASE WHEN srazka IS NOT NULL THEN points - LEAST(srazka, 0) WHEN points > 0 THEN points ELSE 0 END,
               CASE WHEN srazka IS NOT NULL THEN LEAST(srazka, 0) WHEN points < 0 THEN points ELSE 0 END
        FROM shift_review_items
        WHERE team_id = ${teamId} AND employee_id = ANY(${uids}) AND created_by IS NULL AND COALESCE(rucne, FALSE) = FALSE
          AND kind IN ('task', 'procedure', 'closing')
          AND (${od}::text IS NULL OR work_date >= ${od})
        UNION ALL
        SELECT employee_id, work_date, GREATEST(COALESCE(auto_points, 0), 0), LEAST(COALESCE(auto_points, 0), 0)
        FROM shift_reviews
        WHERE team_id = ${teamId} AND employee_id = ANY(${uids}) AND NOT ${bezHodnoceni}::boolean
          AND (${od}::text IS NULL OR work_date >= ${od})
      ),
      rucne AS (
        SELECT DISTINCT employee_id AS uid, work_date AS den FROM shift_reviews
        WHERE team_id = ${teamId} AND employee_id = ANY(${uids}) AND nahradit_auto = TRUE
          AND (COALESCE(points, 0) <> 0 OR COALESCE(rating, 0) > 0)
          AND (${od}::text IS NULL OR work_date >= ${od})
      )
      SELECT p.uid, p.den, SUM(p.plus)::int AS plus, SUM(p.minus)::int AS minus,
             BOOL_OR(r.uid IS NOT NULL) AS nahrazeno
      FROM prispevky p LEFT JOIN rucne r ON r.uid = p.uid AND r.den = p.den
      GROUP BY p.uid, p.den
      HAVING ${vse}::boolean OR BOOL_OR(r.uid IS NOT NULL) OR (${s}::int > 0 AND SUM(p.plus) > ${s}::int)`;
    return (rows as any[]).map(r => ({
      uid: Number(r.uid), den: r.den == null ? null : String(r.den),
      plus: Number(r.plus) || 0, minus: Number(r.minus) || 0, nahrazeno: r.nahrazeno === true,
    }));
  } catch {
    return []; // před migrací (srazka / rucne / nahradit_auto) — bez stropu, jako dřív
  }
}

/** Úpravy po členech z dnů: strop a ruční hodnocení podle nastavení podniku. */
export function upravyZDnu(dny: DenBodu[], n: Pick<NastaveniRezimu, 'denniStrop' | 'stropOd'>): Map<number, UpravaClena> {
  const out = new Map<number, UpravaClena>();
  for (const d of dny) {
    const u = ucinnyDen(d, n);
    if (u.uprava === 0) continue;
    const m = out.get(d.uid) ?? { uprava: 0, zastropovano: 0, nahrazeno: 0 };
    m.uprava += u.uprava;
    if (u.zastropovano) m.zastropovano++;
    if (d.nahrazeno) m.nahrazeno++;
    out.set(d.uid, m);
  }
  return out;
}

/** Úpravy (strop + ruční hodnocení) pro členy týmu podle points_config podniku. */
export async function denniUpravy(teamId: number, uids: number[], pointsRaw: any, od: string | null = null): Promise<Map<number, UpravaClena>> {
  const pt = normalizePoints(pointsRaw);
  const n = nastaveniRezimu(pointsRaw);
  const dny = await nactiDny(teamId, uids, pt, od, n.denniStrop);
  return upravyZDnu(dny, n);
}

/** Jeden člověk a den — pro hodnocení směny a výhled v uzávěrce („Dnes 30 b (strop) — nasbíral 42“). */
export interface DenCloveka extends UcinnyDen {
  strop: number;
  stropPlati: boolean;
  nahrazeno: boolean;
  /** Automatické body dne bez ohledu na ruční hodnocení (co „by dostal automaticky“), po stropu. */
  automaticky: number;
}

/** Automatické body jednoho člověka a dne bez stropu (plus, minus, nahrazeno). */
export async function denSurovy(teamId: number, uid: number, den: string, pointsRaw: any, bezHodnoceni = false): Promise<DenBodu> {
  const pt = normalizePoints(pointsRaw);
  // Od předchozího dne: časy jsou v UTC, pražská půlnoc je o hodinu–dvě dřív.
  const dny = await nactiDny(teamId, [uid], pt, dayPlus(den, -1), 0, true, bezHodnoceni);
  return dny.find(x => x.den === den) ?? { uid, den, plus: 0, minus: 0, nahrazeno: false };
}

/**
 * `autoHodnoceni` = automatické body hodnocení směny spočítané právě teď (computeAutoPoints) —
 * okno hodnocení je ukazuje dřív, než se uloží; uložené auto_points se pak nepočítají dvakrát.
 */
export async function denCloveka(teamId: number, uid: number, den: string, pointsRaw: any, autoHodnoceni?: number): Promise<DenCloveka> {
  const n = nastaveniRezimu(pointsRaw);
  const cerstve = autoHodnoceni != null && Number.isFinite(autoHodnoceni);
  const d0 = await denSurovy(teamId, uid, den, pointsRaw, cerstve);
  const a = cerstve ? Math.round(autoHodnoceni as number) : 0;
  const d = { ...d0, plus: d0.plus + Math.max(0, a), minus: d0.minus + Math.min(0, a) };
  const u = ucinnyDen(d, n);
  const bezRucniho = ucinnyDen({ ...d, nahrazeno: false }, n);
  return {
    ...u, strop: n.denniStrop, stropPlati: n.denniStrop > 0 && (n.stropOd == null || den >= n.stropOd),
    nahrazeno: d.nahrazeno, automaticky: bezRucniho.efektivni,
  };
}
