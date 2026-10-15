// Ověření e-mailu — databáze a odeslání (logika v lib/overeniEmailu.ts).

import { neon } from '@neondatabase/serverless';
import { novyToken, hashTokenu, jePlatny, vyprseni, type RadekTokenu } from './jednorazovyToken';
import { sendEmailVerification } from './email';
import { OVERENI_PLATNOST_MIN, cestaOvereniEmailu, nabizetOvereni, stavOvereni, tokenSediKUctu, type StavOvereni } from './overeniEmailu';

const sql = () => neon(process.env.DATABASE_URL!);

/**
 * Založí odkaz a pošle ho. Nikdy nevyhazuje: registrace ani obrazovka kvůli
 * e-mailu nespadne. Vrací, jestli e-mail opravdu odešel.
 */
export async function posliOvereni(userId: number): Promise<{ odeslano: boolean; duvod?: string }> {
  if (!nabizetOvereni()) return { odeslano: false, duvod: 'nenabizi' };
  try {
    const db = sql();
    const [u] = await db`SELECT email, name, email_verified_at FROM users WHERE id = ${userId}`;
    if (!u) return { odeslano: false, duvod: 'ucet' };
    if (u.email_verified_at) return { odeslano: false, duvod: 'overeno' };
    const { token, hash } = novyToken();
    await db`
      INSERT INTO email_verifications (token_hash, user_id, email, expires_at)
      VALUES (${hash}, ${userId}, ${String(u.email)}, ${vyprseni(OVERENI_PLATNOST_MIN).toISOString()})`;
    const r = await sendEmailVerification(String(u.email), String(u.name ?? ''), cestaOvereniEmailu(token));
    if (!r.sent) console.error('ověření e-mailu: neodešlo', r.error);
    return r.sent ? { odeslano: true } : { odeslano: false, duvod: 'email' };
  } catch (e) {
    // Před migrací tabulka ani sloupec nejsou — nic se nenabídne, nic nespadne.
    console.error('ověření e-mailu: založení selhalo', e);
    return { odeslano: false, duvod: 'db' };
  }
}

export async function stavOvereniUctu(userId: number): Promise<{ stav: StavOvereni; email: string | null }> {
  const nabizi = nabizetOvereni();
  try {
    const db = sql();
    const [u] = await db`
      SELECT u.email, u.email_verified_at,
             EXISTS (SELECT 1 FROM email_verifications v WHERE v.user_id = u.id) AS zahajeno
      FROM users u WHERE u.id = ${userId}`;
    if (!u) return { stav: 'nenabizi', email: null };
    return { stav: stavOvereni({ overenoAt: u.email_verified_at, zahajeno: !!u.zahajeno, nabizi }), email: String(u.email) };
  } catch {
    return { stav: 'nenabizi', email: null };
  }
}

/** Potvrzení z odkazu: jednorázové, 48 h, e-mail účtu se nesměl změnit. */
export async function potvrdOvereni(token: string): Promise<boolean> {
  const db = sql();
  const hash = hashTokenu(token);
  const [r] = await db`SELECT user_id, email, expires_at, used_at FROM email_verifications WHERE token_hash = ${hash}`;
  if (!jePlatny(r as RadekTokenu | undefined)) return false;
  const [spotrebovan] = await db`UPDATE email_verifications SET used_at = NOW() WHERE token_hash = ${hash} AND used_at IS NULL RETURNING user_id`;
  if (!spotrebovan) return false;
  const userId = Number(spotrebovan.user_id);
  const [u] = await db`SELECT email FROM users WHERE id = ${userId}`;
  if (!u || !tokenSediKUctu(r.email, u.email)) return false;
  await db`UPDATE users SET email_verified_at = COALESCE(email_verified_at, NOW()) WHERE id = ${userId}`;
  // Starší neotevřené odkazy téhož účtu už nejsou potřeba.
  try { await db`UPDATE email_verifications SET used_at = NOW() WHERE user_id = ${userId} AND used_at IS NULL`; } catch { /* nevadí */ }
  return true;
}
