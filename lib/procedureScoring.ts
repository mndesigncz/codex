// Automatic scoring of a completed procedure run. The employer sets per-step
// weights once; from then on points award themselves and only need editing
// when the employer disagrees with the outcome.

import { parseSteps, stepPenalty, stepPlus, type Step } from './steps';

/** Why a step was skipped. Excused reasons don't cost points. */
export const SKIP_REASONS: { id: string; label: string; excused: boolean }[] = [
  { id: 'not_needed', label: 'Nebylo potřeba', excused: true },
  { id: 'missing', label: 'Chybělo zboží / vybavení', excused: true },
  { id: 'no_time', label: 'Nestíhal/a jsem', excused: false },
  { id: 'other', label: 'Jiný důvod', excused: false },
];

export function skipReasonLabel(id?: string | null): string {
  return SKIP_REASONS.find(r => r.id === id)?.label ?? (id || 'Bez důvodu');
}

export function isExcused(id?: string | null): boolean {
  return SKIP_REASONS.find(r => r.id === id)?.excused === true;
}

export type SkipReasons = Record<string, { reason: string; note?: string }>;

export function normalizeSkipReasons(raw: any): SkipReasons {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: SkipReasons = {};
  for (const [k, v] of Object.entries(raw)) {
    const idx = parseInt(k);
    if (!Number.isFinite(idx) || idx < 0) continue;
    const reason = String((v as any)?.reason ?? '').slice(0, 30);
    if (!reason) continue;
    const note = String((v as any)?.note ?? '').trim().slice(0, 200);
    out[String(idx)] = note ? { reason, note } : { reason };
  }
  return out;
}

export interface RunScore {
  points: number;
  /** Something worth the employer's eye: missed key step or unexcused skip. */
  flagged: boolean;
  done: number;
  missed: number;
  excusedSkips: number;
  unexcusedSkips: number;
  summary: string;
}

/**
 * The whole automatic-points arithmetic in one place.
 *   + basePoints for completing the run at all (team points_config)
 *   + per-step plus for every done step (by weight)
 *   − per-step penalty for every step that was neither done nor excused
 * An excused skip (not needed / missing supplies) costs nothing.
 */
export function scoreRun(
  items: any,
  checked: number[],
  skipped: number[],
  skipReasons: SkipReasons,
  basePoints: number,
): RunScore {
  const steps: Step[] = parseSteps(items);
  let points = basePoints;
  let done = 0, missed = 0, excusedSkips = 0, unexcusedSkips = 0;
  let flagged = false;

  steps.forEach((step, i) => {
    if (checked.includes(i)) {
      done++;
      points += stepPlus(step);
      return;
    }
    const skip = skipReasons[String(i)];
    const isSkip = skipped.includes(i);
    if (isSkip && skip && isExcused(skip.reason)) {
      excusedSkips++;
      return; // excused — no penalty
    }
    if (isSkip) unexcusedSkips++;
    else missed++;
    points -= stepPenalty(step);
    if (step.weight === 'key') flagged = true;
  });
  if (unexcusedSkips > 0) flagged = true;

  const parts = [`${done}/${steps.length} kroků`];
  if (excusedSkips) parts.push(`${excusedSkips}× omluvené přeskočení`);
  if (unexcusedSkips) parts.push(`${unexcusedSkips}× přeskočeno bez omluvy`);
  if (missed) parts.push(`${missed}× nedokončeno`);
  return {
    points, flagged, done, missed, excusedSkips, unexcusedSkips,
    summary: `auto: ${parts.join(', ')}`,
  };
}
