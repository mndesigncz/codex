// Tarif vynucený na serveru (spuštění, balík S).
//
// Dřív hlídalo většinu placených funkcí jen rozhraní: zámek v aplikaci se
// dal obejít přímým voláním API. Teď každá routa placené funkce zavolá
//
//   const zamek = await pozadujTarif(teamId, 'pro');
//   if (zamek) return zamek;           // 402 „Tahle funkce je v tarifu Pro…"
//
// Pravidla (která funkce je v jakém tarifu) jsou z ceníku (lib/plan.ts
// PLAN_FEATURES) a ze zámků v rozhraní; seznam rout je v ROUTY_TARIFU níž
// a test k90-bezpecnost-tarif.ts projde, že každá z nich kontrolu opravdu má.
//
// Co se NEzamyká: čtení dřívějších dat (podnik po skončení zkušební doby
// vidí, co nasbíral), mazání a obsluha závazků vůči hostům (uplatnění poukazu
// a kuponu, razítko, rezervace, smazání hosta kvůli GDPR). Zkušební doba
// a ruční tarif od správce platí jako Pro/Max podle lib/plan.ts planInfoOf.
//
// Výpadek databáze NIKOHO nezamkne: když tarif nejde zjistit, routa pokračuje
// (bez databáze stejně nic neudělá). Výsledek se drží 10 s v paměti isolátu,
// ať kontrola nestojí dotaz při každém kliknutí; po koupi tarifu se odemkne
// nejpozději za 10 s (a hned, když se zavolá zapomenTarif).

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { planInfoOf, PLAN_ENFORCED, type PlanId } from './plan';
import { staciTarifu, hlaskaTarifu, type PotrebnyTarif } from './tarifPravidla';

export { hlaskaTarifu, type PotrebnyTarif };

const TTL_MS = 10_000;
const cache = new Map<number, { at: number; effective: PlanId }>();

/** Zahodí zapamatovaný tarif (po změně předplatného ve webhooku). */
export function zapomenTarif(teamId: number): void { cache.delete(teamId); }

/** Tarif, který podnik právě má; null = nejde zjistit (výpadek), pak se nic nezamyká. */
async function ucinnyTarif(teamId: number): Promise<PlanId | null> {
  const c = cache.get(teamId);
  if (c && Date.now() - c.at < TTL_MS) return c.effective;
  const sql = neon(process.env.DATABASE_URL!);
  let row: Record<string, unknown> | undefined;
  try {
    [row] = await sql`
      SELECT plan, plan_override, trial_ends_at, subscription_status, subscription_interval, current_period_end,
             cancel_at_period_end, trial_end, max_offer_until, stripe_subscription_id, had_subscription
      FROM teams WHERE id = ${teamId}`;
  } catch {
    // Před migrací sloupců předplatného: aspoň plán a starý trial.
    try { [row] = await sql`SELECT plan, trial_ends_at FROM teams WHERE id = ${teamId}`; } catch { return null; }
  }
  if (!row) return null;
  const effective = planInfoOf(row).effective;
  if (cache.size > 5000) cache.clear();
  cache.set(teamId, { at: Date.now(), effective });
  return effective;
}

/**
 * Brána placené funkce. null = smí se pokračovat; jinak hotová odpověď 402
 * se srozumitelnou hláškou a odkazem, kde se tarif mění.
 */
export async function pozadujTarif(teamId: number | null | undefined, potreba: PotrebnyTarif): Promise<NextResponse | null> {
  if (!PLAN_ENFORCED || teamId == null || !Number.isFinite(teamId)) return null;
  const effective = await ucinnyTarif(Number(teamId));
  if (effective == null || staciTarifu(effective, potreba)) return null;
  return NextResponse.json({ error: hlaskaTarifu(potreba), tarif: potreba }, { status: 402 });
}
