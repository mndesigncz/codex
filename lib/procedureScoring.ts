// Automatic scoring of a completed procedure run. The employer sets per-step
// weights once; from then on points award themselves and only need editing
// when the employer disagrees with the outcome.

import { parseSteps, stepPenalty, stepPlus, type Step } from './steps.ts';

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
  /** Součet srážek za nedokončené a neomluveně přeskočené kroky (kladné číslo; u prázdného průběhu 0). */
  penalty: number;
  summary: string;
}

/**
 * The whole automatic-points arithmetic in one place. The result goes into the
 * per-item ledger (shift_review_items) as an ADJUSTMENT on top of the base:
 * the base for completing the run is already counted once per completed run in
 * totalPoints() (lib/pointsBalance.ts: `procedures × pt.procedure`), so it must
 * not be part of this number too (k89: it was, and every run paid its base twice).
 *   + completion bonus: up to `bonusMax` (the team's „body za postup“),
 *     proportional to the weighted share of steps done — a 38-step closing list
 *     and a 13-step opening list are each worth at most the same bonus, not
 *     one point per checkbox (k89: a 38-step list used to pay +40)
 *   − per-step penalty for every step that was neither done nor excused
 * A run "completed" with no step ticked at all scores 0 and is flagged (and
 * totalPoints skips its base too — see the procedure_runs count there).
 * An excused skip (not needed / missing supplies) costs nothing and does not
 * lower the bonus share either.
 */
export function scoreRun(
  items: any,
  checked: number[],
  skipped: number[],
  skipReasons: SkipReasons,
  bonusMax: number,
): RunScore {
  const steps: Step[] = parseSteps(items);
  let penalty = 0;
  let plusDone = 0, plusCounted = 0;
  let done = 0, missed = 0, excusedSkips = 0, unexcusedSkips = 0;
  let flagged = false;

  steps.forEach((step, i) => {
    if (checked.includes(i)) {
      done++;
      plusDone += stepPlus(step);
      plusCounted += stepPlus(step);
      return;
    }
    const skip = skipReasons[String(i)];
    const isSkip = skipped.includes(i);
    if (isSkip && skip && isExcused(skip.reason)) {
      excusedSkips++;
      return; // excused — no penalty, not counted against the bonus
    }
    plusCounted += stepPlus(step);
    if (isSkip) unexcusedSkips++;
    else missed++;
    penalty += stepPenalty(step);
    if (step.weight === 'key') flagged = true;
  });
  if (unexcusedSkips > 0) flagged = true;

  const max = Number.isFinite(bonusMax) && bonusMax > 0 ? bonusMax : 0;
  const bonus = plusCounted > 0 ? Math.round(max * plusDone / plusCounted) : 0;
  // „Dokončeno“ bez jediného odškrtnutého kroku = 0 bodů (rozhodnutí majitele, k89):
  // ani základ (ten totalPoints u prázdného průběhu nepočítá), ani srážky — jen vlajka,
  // ať si toho vedení v hodnocení směny všimne.
  const empty = steps.length > 0 && done === 0;
  if (empty) flagged = true;
  const points = empty ? 0 : bonus - penalty;

  const parts = [`${done}/${steps.length} kroků`];
  if (excusedSkips) parts.push(`${excusedSkips}× omluvené přeskočení`);
  if (unexcusedSkips) parts.push(`${unexcusedSkips}× přeskočeno bez omluvy`);
  if (missed) parts.push(`${missed}× nedokončeno`);
  return {
    points, flagged, done, missed, excusedSkips, unexcusedSkips,
    penalty: empty ? 0 : penalty,
    summary: `auto: ${parts.join(', ')}`,
  };
}
