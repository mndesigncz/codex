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
}

export const DEFAULT_POINTS: PointsConfig = {
  task: 5,
  procedure: 10,
  closing: 15,
  ratingStar: 4,
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
  const num = (v: any, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : d);
  return {
    task: num(r.task, DEFAULT_POINTS.task),
    procedure: num(r.procedure, DEFAULT_POINTS.procedure),
    closing: num(r.closing, DEFAULT_POINTS.closing),
    ratingStar: num(r.ratingStar, DEFAULT_POINTS.ratingStar),
  };
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
