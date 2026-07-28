// Employee rewards / leveling system — shared config + helpers.
// Points are earned from work signals (tasks, procedures, closings) plus
// per-shift ratings from the employer. Cumulative career points map to levels;
// each level carries employer-defined perks (free text).

export interface RewardLevel {
  name: string;
  minPoints: number;
  perks: string; // free-text description of the benefit at this level
}

export interface PointsConfig {
  task: number;       // per completed task
  procedure: number;  // per completed procedure run
  closing: number;    // per completed cash closing
  ratingStar: number; // points per star of a shift rating (1–5)
  // Automatic per-shift signals — penalties are stored as negative numbers.
  taskMissed: number;       // per task due that day and left undone
  procedureSkipped: number; // per explicitly skipped procedure step
  procedureMissed: number;  // per step that was never touched at all
  closingMissing: number;   // worked a shift but filed no closing
  closingBalanced: number;  // closing cash difference is exactly zero
}

export const DEFAULT_POINTS: PointsConfig = {
  task: 5,
  procedure: 10,
  closing: 15,
  ratingStar: 4,
  taskMissed: -5,
  procedureSkipped: -2,
  procedureMissed: -4,
  closingMissing: -10,
  closingBalanced: 3,
};

export const DEFAULT_LEVELS: RewardLevel[] = [
  { name: 'Nováček', minPoints: 0, perks: '' },
  { name: 'Barista', minPoints: 150, perks: 'Sleva 10 % na vlastní nákup' },
  { name: 'Mistr', minPoints: 500, perks: 'Sleva 20 % + přednostní výběr směn' },
  { name: 'Legenda', minPoints: 1200, perks: 'Sleva 30 % + bonus k výplatě' },
];

export function normalizeLevels(raw: any): RewardLevel[] {
  const arr = Array.isArray(raw) ? raw : [];
  const cleaned = arr
    .map((l: any) => ({
      name: String(l?.name ?? '').trim().slice(0, 60) || 'Úroveň',
      minPoints: Math.max(0, Math.round(Number(l?.minPoints) || 0)),
      perks: String(l?.perks ?? '').trim().slice(0, 500),
    }))
    .filter((l: RewardLevel) => l.name);
  if (!cleaned.length) return DEFAULT_LEVELS;
  cleaned.sort((a, b) => a.minPoints - b.minPoints);
  // Guarantee an entry-level starting at 0 so everyone has a level.
  if (cleaned[0].minPoints > 0) cleaned[0] = { ...cleaned[0], minPoints: 0 };
  return cleaned;
}

export function normalizePoints(raw: any): PointsConfig {
  const r = raw && typeof raw === 'object' ? raw : {};
  // Reward keys stay non-negative; penalty keys must accept negative values.
  const num = (v: any, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : d);
  const signed = (v: any, d: number) =>
    (Number.isFinite(Number(v)) ? Math.max(-100, Math.min(100, Math.round(Number(v)))) : d);
  return {
    task: num(r.task, DEFAULT_POINTS.task),
    procedure: num(r.procedure, DEFAULT_POINTS.procedure),
    closing: num(r.closing, DEFAULT_POINTS.closing),
    ratingStar: num(r.ratingStar, DEFAULT_POINTS.ratingStar),
    taskMissed: signed(r.taskMissed, DEFAULT_POINTS.taskMissed),
    procedureSkipped: signed(r.procedureSkipped, DEFAULT_POINTS.procedureSkipped),
    procedureMissed: signed(r.procedureMissed, DEFAULT_POINTS.procedureMissed),
    closingMissing: signed(r.closingMissing, DEFAULT_POINTS.closingMissing),
    closingBalanced: signed(r.closingBalanced, DEFAULT_POINTS.closingBalanced),
  };
}

export interface AutoPointLine { label: string; points: number; }
export interface AutoPoints { total: number; lines: AutoPointLine[]; }

// Shape of the shift drill-in the review API builds; only the fields the
// automatic rules look at are required, so callers can pass the full summary.
export interface AutoPointsInput {
  hadShift?: boolean;
  tasks?: { state?: string }[];
  procedures?: { skipped?: number[]; missing?: number[] }[];
  closing?: { difference?: number | null } | null;
}

// Derives the points the system awards on its own from what the shift shows.
// Lines worth zero points are dropped so the employer only sees real signals.
export function computeAutoPoints(summary: AutoPointsInput, pt: PointsConfig): AutoPoints {
  const lines: AutoPointLine[] = [];
  const push = (label: string, points: number) => { if (points) lines.push({ label, points }); };

  const missedTasks = (summary.tasks ?? []).filter(t => t?.state === 'missed').length;
  push(`Nesplněné úkoly (${missedTasks}×)`, missedTasks * pt.taskMissed);

  const procs = summary.procedures ?? [];
  const skippedSteps = procs.reduce((a, p) => a + (Array.isArray(p?.skipped) ? p.skipped.length : 0), 0);
  push(`Přeskočené kroky v postupech (${skippedSteps}×)`, skippedSteps * pt.procedureSkipped);
  const missedSteps = procs.reduce((a, p) => a + (Array.isArray(p?.missing) ? p.missing.length : 0), 0);
  push(`Kroky, které vůbec neudělali (${missedSteps}×)`, missedSteps * pt.procedureMissed);

  if (summary.hadShift && !summary.closing) push('Chybí uzávěrka za směnu', pt.closingMissing);
  if (summary.closing && summary.closing.difference === 0) push('Kasa sedí na korunu', pt.closingBalanced);

  return { total: lines.reduce((a, l) => a + l.points, 0), lines };
}

export interface LevelStanding {
  levelIndex: number;
  level: RewardLevel;
  next: RewardLevel | null;
  pointsIntoLevel: number;   // points earned past the current level's threshold
  pointsForNext: number;     // span between current and next level (0 if maxed)
  pctToNext: number;         // 0–100
}

export function standingForPoints(levels: RewardLevel[], points: number): LevelStanding {
  const lv = levels.length ? levels : DEFAULT_LEVELS;
  let idx = 0;
  for (let i = 0; i < lv.length; i++) if (points >= lv[i].minPoints) idx = i;
  const level = lv[idx];
  const next = idx < lv.length - 1 ? lv[idx + 1] : null;
  const pointsIntoLevel = Math.max(0, points - level.minPoints);
  const pointsForNext = next ? next.minPoints - level.minPoints : 0;
  const pctToNext = next && pointsForNext > 0
    ? Math.min(100, Math.round((pointsIntoLevel / pointsForNext) * 100))
    : 100;
  return { levelIndex: idx, level, next, pointsIntoLevel, pointsForNext, pctToNext };
}
