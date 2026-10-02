// Atomické počítadlo kusů a denního limitu kuponu. Každá rezervace je JEDEN
// UPDATE ... WHERE s podmínkou, takže dva souběžné požadavky nezískají poslední
// kus oba (čtení počtu a vložení zvlášť by to dovolilo). Zrcadlo podmínek
// v čisté podobě je v lib/kuponyPravidla.ts (jeVolnyKus, denniLimitOk) a testuje se.

import { sql } from './client';

/** Vezme jeden kus z limitu. false = kusy došly (nebo kupon neexistuje). */
export async function rezervujKus(couponId: number): Promise<boolean> {
  const r = await sql`
    UPDATE client_coupons SET issued = issued + 1
    WHERE id = ${couponId} AND (max_total IS NULL OR issued < max_total)
    RETURNING id`;
  return r.length > 0;
}

/** Vrátí kus (neúspěšné vydání, zrušený kód). */
export async function vratKus(couponId: number): Promise<void> {
  await sql`UPDATE client_coupons SET issued = GREATEST(0, issued - 1) WHERE id = ${couponId}`;
}

/** Zapíše uplatnění do denního počítadla; false = denní limit je vyčerpán. `today` je pražský den. */
export async function rezervujDenniUplatneni(couponId: number, today: string): Promise<boolean> {
  const r = await sql`
    UPDATE client_coupons SET
      daily_count = CASE WHEN daily_day = ${today} THEN daily_count + 1 ELSE 1 END,
      daily_day = ${today}
    WHERE id = ${couponId}
      AND (daily_limit IS NULL OR daily_day IS DISTINCT FROM ${today} OR daily_count < daily_limit)
    RETURNING id`;
  return r.length > 0;
}

/** Vrátí denní uplatnění (uplatnění se nepovedlo). */
export async function vratDenniUplatneni(couponId: number, today: string): Promise<void> {
  await sql`UPDATE client_coupons SET daily_count = GREATEST(0, daily_count - 1) WHERE id = ${couponId} AND daily_day = ${today}`;
}
