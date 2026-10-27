// Přihlášení hosta kódem z e-mailu (audit C §3.6, §10): host u kasy nemusí pamatovat heslo.
// Jen pro existující účty hostů (role customer); účet podniku se kódem nepřihlásí nikdy.
//  · kód: 6 číslic z kryptografického generátoru, v databázi jen otisk (SHA-256 s tajemstvím),
//  · platí KOD_PLATNOST_MIN minut, jde použít jednou, nejvýš MAX_POKUSU špatných pokusů na kód,
//  · žádost odpoví vždy stejně, ať e-mail existuje, nebo ne (nejde zjistit, kdo je registrovaný),
//  · brzda: 5 kódů na e-mail za hodinu, 20 na IP za hodinu (lib/rateLimit, při výpadku zavřeno).
// Ověření kódu dělá NextAuth provider `host-kod` (lib/auth.ts) přes overKodPrihlaseni.

import { createHash, randomInt } from 'node:crypto';
import { sql } from '../client';
import { hit } from '../rateLimit';
import { normalizujEmail } from '../emailAdresa';
import { sendHostLoginCodeEmail } from '../email';

export const KOD_PLATNOST_MIN = 10;
export const MAX_POKUSU = 5;

let tabulka: Promise<void> | null = null;
function zajistiTabulku(): Promise<void> {
  if (!tabulka) {
    tabulka = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS client_login_kody (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL,
          hash TEXT NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          pokusy INTEGER NOT NULL DEFAULT 0,
          used_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_login_kody_email ON client_login_kody (email, created_at DESC)`;
    })().catch(e => { tabulka = null; throw e; });
  }
  return tabulka;
}

export function otiskKodu(email: string, kod: string): string {
  return createHash('sha256').update(`${normalizujEmail(email)}:${String(kod).trim()}:${process.env.NEXTAUTH_SECRET ?? ''}`).digest('hex');
}

/** Vypadá vstup jako náš kód (6 číslic)? Levné odmítnutí smetí. */
export function vypadaJakoKod(v: unknown): v is string { return typeof v === 'string' && /^\d{6}$/.test(v.trim()); }

/** Pošle kód, když účet hosta existuje. Vrací `false` jen při překročení limitu (jinak vždy „poslali jsme“). */
export async function posliKod(emailRaw: unknown, ip: string): Promise<{ ok: boolean }> {
  const email = normalizujEmail(emailRaw);
  if (!email || !email.includes('@') || email.length > 200) return { ok: true };
  const [a, b] = await Promise.all([hit(`host-kod:${email}`, 5, 3600, { failClosed: true }), hit(`host-kod-ip:${ip}`, 20, 3600, { failClosed: true })]);
  if (!a.ok || !b.ok) return { ok: false };
  await zajistiTabulku();
  let u: any;
  try { [u] = await sql`SELECT id, name FROM users WHERE lower(email) = ${email} AND role = 'customer' AND deleted_at IS NULL LIMIT 1`; }
  catch { [u] = await sql`SELECT id, name FROM users WHERE lower(email) = ${email} AND role = 'customer' LIMIT 1`; }
  if (!u) return { ok: true };
  const kod = String(randomInt(0, 1_000_000)).padStart(6, '0');
  // Starší nepoužité kódy téhož e-mailu přestanou platit: platí vždy jen poslední.
  await sql`UPDATE client_login_kody SET used_at = NOW() WHERE email = ${email} AND used_at IS NULL`;
  await sql`INSERT INTO client_login_kody (email, hash, expires_at) VALUES (${email}, ${otiskKodu(email, kod)}, NOW() + make_interval(mins => ${KOD_PLATNOST_MIN}::int))`;
  await sendHostLoginCodeEmail(email, String(u.name ?? ''), kod).catch(() => null);
  return { ok: true };
}

/** Ověří kód; při úspěchu ho spotřebuje a vrátí id hosta, jinak null (a započítá pokus). */
export async function overKodPrihlaseni(emailRaw: unknown, kodRaw: unknown): Promise<number | null> {
  const email = normalizujEmail(emailRaw);
  if (!email || !vypadaJakoKod(kodRaw)) return null;
  await zajistiTabulku();
  const [r] = await sql`
    SELECT id, hash, pokusy FROM client_login_kody
    WHERE email = ${email} AND used_at IS NULL AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1` as any[];
  if (!r || Number(r.pokusy) >= MAX_POKUSU) return null;
  if (r.hash !== otiskKodu(email, String(kodRaw))) {
    await sql`UPDATE client_login_kody SET pokusy = pokusy + 1 WHERE id = ${r.id}`;
    return null;
  }
  // Jednou: kdo prohraje závod (dvojklik), dostane null.
  const hotovo = await sql`UPDATE client_login_kody SET used_at = NOW() WHERE id = ${r.id} AND used_at IS NULL RETURNING id`;
  if (!hotovo.length) return null;
  let u: any;
  try { [u] = await sql`SELECT id FROM users WHERE lower(email) = ${email} AND role = 'customer' AND deleted_at IS NULL LIMIT 1`; }
  catch { [u] = await sql`SELECT id FROM users WHERE lower(email) = ${email} AND role = 'customer' LIMIT 1`; }
  return u ? Number(u.id) : null;
}
