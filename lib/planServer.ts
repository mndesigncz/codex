// Server-side plan lookups. Kept out of lib/plan.ts so client bundles that
// import the plan matrix never pull in the DB driver.

import { neon } from '@neondatabase/serverless';
import { planInfoOf, PlanInfo, PLAN_ENFORCED } from './plan';

const sql = neon(process.env.DATABASE_URL!);

export async function teamPlanInfo(teamId: number): Promise<PlanInfo> {
  try {
    const [row] = await sql`SELECT plan, trial_ends_at FROM teams WHERE id = ${teamId}`;
    return planInfoOf(row);
  } catch {
    // Pre-migration DB: grandfathered Pro, never lock a working shop out.
    return planInfoOf(null);
  }
}

/** Is a Pro feature available to this team right now? */
export async function teamIsPro(teamId: number): Promise<boolean> {
  if (!PLAN_ENFORCED) return true;
  return (await teamPlanInfo(teamId)).effective === 'pro';
}

export const PRO_ONLY_MSG =
  'Tahle funkce je součástí plánu Pro. Odemkneš ji v Nastavení → Předplatné.';
