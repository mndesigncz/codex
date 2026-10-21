// Kdy byl člověk naposledy v aplikaci (users.naposledy_at) — pro retenci (lib/retenceDb.ts):
// zrušený podnik, do kterého se někdo přihlašuje nebo ho jen čte (rozvrh, chat), není opuštěný,
// i když v něm nikdo nic nezapsal; stejně tak účet hosta, který otevírá Managero client na webu.
//
// Zapisuje se z čtení relace (lib/auth.ts → stavUzivatele), tedy při otevření aplikace i bez
// nového přihlášení (relace platí 30 dní). Aby to nestálo zápis při každém požadavku, píše se
// nejvýš jednou za ZAPIS_KAZDYCH_MS v jednom isolátu a databáze sama zápis přeskočí, když je
// údaj čerstvý. Před migrací sloupce se chyba tiše spolkne — přihlášení kvůli tomu selhat nesmí.

import { neon } from '@neondatabase/serverless';

/** Jak často nejvýš zapsat „naposledy v aplikaci“ (6 hodin; retence počítá na dny). */
export const ZAPIS_KAZDYCH_MS = 6 * 60 * 60 * 1000;

const zapsano = new Map<number, number>();

/** Čistá část: má se zapsat? (`posledni` = kdy tenhle isolát zapisoval naposledy). */
export function maSeZapsat(posledni: number | undefined, ted: number): boolean {
  return posledni === undefined || ted - posledni >= ZAPIS_KAZDYCH_MS;
}

/** Zaznamená návštěvu. Nikdy nevyhazuje. */
export async function zaznamenejNavstevu(userId: number): Promise<void> {
  if (!Number.isFinite(userId) || userId <= 0) return;
  const ted = Date.now();
  if (!maSeZapsat(zapsano.get(userId), ted)) return;
  if (zapsano.size > 20_000) zapsano.clear();
  zapsano.set(userId, ted);
  try {
    const sql = neon(process.env.DATABASE_URL!);
    await sql`UPDATE users SET naposledy_at = NOW() WHERE id = ${userId} AND (naposledy_at IS NULL OR naposledy_at < NOW() - INTERVAL '6 hours')`;
  } catch { /* před migrací sloupec chybí */ }
}
