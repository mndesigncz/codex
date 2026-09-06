// Omezení pokusů pro věci, které jdou hádat: heslo, PIN na kiosku, join kód.
//
// Aplikace běží na serverless funkcích, takže počítadlo v paměti procesu
// nic neznamená — každý požadavek může obsloužit jiná instance. Pokusy se
// proto zapisují do databáze; je to jeden malý zápis navíc a funguje to i
// napříč instancemi a restarty.
//
// Záměrně se nerozlišuje „účet neexistuje" od „špatné heslo": obojí spadne
// do stejného kbelíku, takže se přes rychlost odpovědi nedá zjistit, které
// e-maily jsou v aplikaci registrované.

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export interface LimitResult {
  ok: boolean;
  /** Kolik pokusů ještě zbývá, než se okno zavře. */
  remaining: number;
  /** Za kolik sekund to půjde zkusit znovu (0, když se čekat nemusí). */
  retryAfter: number;
}

/**
 * Spotřebuje jeden pokus pro daný klíč.
 *
 * @param key    co se hlídá — např. `login:jan@example.cz` nebo `pin:15`
 * @param max    kolik neúspěchů se toleruje v okně
 * @param windowSec délka okna v sekundách
 */
export async function hit(key: string, max: number, windowSec: number): Promise<LimitResult> {
  const now = Date.now();
  try {
    const [row] = await sql`
      INSERT INTO auth_attempts (key, count, window_start)
      VALUES (${key}, 1, NOW())
      ON CONFLICT (key) DO UPDATE SET
        -- Staré okno se zahodí a počítá se od nuly.
        count = CASE
          WHEN auth_attempts.window_start < NOW() - (${windowSec} || ' seconds')::interval THEN 1
          ELSE auth_attempts.count + 1 END,
        window_start = CASE
          WHEN auth_attempts.window_start < NOW() - (${windowSec} || ' seconds')::interval THEN NOW()
          ELSE auth_attempts.window_start END
      RETURNING count, EXTRACT(EPOCH FROM (NOW() - window_start))::int AS age`;
    const count = Number(row?.count ?? 1);
    const age = Number(row?.age ?? 0);
    if (count > max) {
      return { ok: false, remaining: 0, retryAfter: Math.max(1, windowSec - age) };
    }
    return { ok: true, remaining: Math.max(0, max - count), retryAfter: 0 };
  } catch {
    // Tabulka ještě neexistuje (chybí migrace) nebo databáze zlobí. Přihlášení
    // kvůli tomu blokovat nebudeme — jen se ten pokus nepočítá.
    return { ok: true, remaining: max, retryAfter: 0 };
  }
}

/** Po úspěchu se počítadlo vynuluje, ať poctivce nebrzdí cizí pokusy. */
export async function clear(key: string): Promise<void> {
  try { await sql`DELETE FROM auth_attempts WHERE key = ${key}`; } catch { /* nevadí */ }
}
