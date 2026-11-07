// Druhý faktor správy platformy v databázi: klíč TOTP (šifrovaně) a poslední použitý krok.
//
// Tabulka `admin_totp` (DDL v app/api/init/route.ts): jeden řádek na správce.
// Klíč se ukládá přes lib/secretBox (AES-256-GCM, APP_SECRET_KEY) — výpis
// databáze ani záloha z něj kód nevyrobí. `confirmed_at` je NULL, dokud správce
// při prvním přihlášení neopíše kód z aplikace; do té doby se klíč smí vyměnit.
// `last_step` je krok posledního přijatého kódu: starší ani stejný už neprojde.
//
// Nouzový reset (ztracený telefon): smazat řádek — viz docs/SPUSTENI.md, Správa platformy.

import { neon } from '@neondatabase/serverless';
import { seal, open } from '@/lib/secretBox';

const sql = neon(process.env.DATABASE_URL!);

export interface TotpSpravce {
  klic: string;
  potvrzeno: boolean;
}

/** Klíč správce, nebo null (nenastaveno, nejde rozšifrovat). */
export async function nactiTotp(userId: number): Promise<TotpSpravce | null> {
  const [r] = await sql`SELECT secret_enc, confirmed_at FROM admin_totp WHERE user_id = ${userId}`;
  if (!r) return null;
  const klic = open(String(r.secret_enc));
  if (!klic) return null;
  return { klic, potvrzeno: r.confirmed_at != null };
}

/**
 * Nový klíč čekající na potvrzení. Potvrzený klíč se tudy NEPŘEPÍŠE — jen ručním
 * resetem. Vrací false, když už potvrzený existuje.
 */
export async function ulozCekajiciTotp(userId: number, klic: string): Promise<boolean> {
  const zasifrovano = seal(klic);
  // Bez klíče šifrování by seal vrátil čitelný text; to tady nepřipadá v úvahu.
  if (!zasifrovano || !zasifrovano.startsWith('enc:')) throw new Error('Chybí APP_SECRET_KEY / NEXTAUTH_SECRET pro šifrování.');
  const r = await sql`
    INSERT INTO admin_totp (user_id, secret_enc, confirmed_at, last_step, created_at)
    VALUES (${userId}, ${zasifrovano}, NULL, NULL, NOW())
    ON CONFLICT (user_id) DO UPDATE SET secret_enc = EXCLUDED.secret_enc, last_step = NULL, created_at = NOW()
      WHERE admin_totp.confirmed_at IS NULL
    RETURNING user_id`;
  return r.length > 0;
}

/**
 * Zapíše použitý krok (a při prvním kódu potvrdí klíč). Atomicky: když už
 * prošel stejný nebo novější krok, vrátí false — kód se nepoužije dvakrát.
 */
export async function pouzijKrok(userId: number, krok: number): Promise<boolean> {
  const r = await sql`
    UPDATE admin_totp SET last_step = ${krok}, confirmed_at = COALESCE(confirmed_at, NOW())
    WHERE user_id = ${userId} AND (last_step IS NULL OR last_step < ${krok})
    RETURNING user_id`;
  return r.length > 0;
}

/** E-mail účtu pro zobrazení a pro aktéra v historii zásahů. */
export async function emailUctu(userId: number): Promise<string> {
  try {
    const [u] = await sql`SELECT email FROM users WHERE id = ${userId}`;
    return String(u?.email ?? '').trim().toLowerCase();
  } catch {
    return '';
  }
}
