// Změna hesla odhlásí ostatní zařízení, současné zůstane (spuštění, balík S).
// Logika porovnání je v lib/authVerze.ts; tady jen zápis do databáze a přepis
// cookie relace zařízení, které heslo právě změnilo.

import { cookies } from 'next/headers';
import { decode, encode } from 'next-auth/jwt';
import { neon } from '@neondatabase/serverless';
import { zneplatniStav } from './auth';
import { verzeRelace } from './authVerze';

// Názvy cookie, pod kterými NextAuth 4 drží relaci (https / http).
const NAZVY = ['__Secure-next-auth.session-token', 'next-auth.session-token'] as const;
// Stejná platnost jako výchozí relace NextAuth (30 dní).
const PLATNOST_S = 30 * 24 * 60 * 60;

/**
 * Zvýší `session_version` účtu: všechny dosavadní relace přestanou platit.
 * Vrací novou verzi, nebo null, když sloupec ještě není (před /api/init) —
 * pak se nic neodvolává a nic se nerozbije.
 */
export async function zvysVerziRelace(userId: number): Promise<number | null> {
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const [r] = await sql`UPDATE users SET session_version = COALESCE(session_version, 0) + 1 WHERE id = ${userId} RETURNING session_version`;
    zneplatniStav(userId);
    return r ? verzeRelace(r.session_version) : null;
  } catch (e) {
    console.error('relace: verzi se nepodařilo zvýšit', e);
    return null;
  }
}

/**
 * Současné zařízení dostane token s novou verzí, ať ho změna hesla neodhlásí.
 * Jen v route handleru (cookie se tam dají zapsat). Rozdělená cookie (velký
 * token, `.0`/`.1`) se nepřepisuje — zařízení se pak přihlásí znovu, nic horšího.
 */
export async function ponechSoucasneZarizeni(verze: number): Promise<boolean> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return false;
  try {
    const jar = await cookies();
    const nazev = NAZVY.find(n => jar.get(n)?.value);
    if (!nazev) return false;
    const token = await decode({ token: jar.get(nazev)!.value, secret });
    if (!token) return false;
    const novy = await encode({ token: { ...token, sv: verze }, secret, maxAge: PLATNOST_S });
    jar.set(nazev, novy, { httpOnly: true, sameSite: 'lax', path: '/', secure: nazev.startsWith('__Secure-'), maxAge: PLATNOST_S });
    return true;
  } catch (e) {
    console.error('relace: cookie současného zařízení se nepodařilo přepsat', e);
    return false;
  }
}
