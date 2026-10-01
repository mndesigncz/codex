// Jazyk požadavku a jazyk podniku pro serverové routy (bez Reactu, ať routa netáhne klientské moduly).
//
// Jazyk požadavku = cookie `managero-lang` (nastavuje přepínač), jinak země
// návštěvníka z hlavičky Vercelu (`x-vercel-ip-country`, jazykZeZeme), jinak čeština.
// Jazyk podniku = `teams.default_lang`; před migrací sloupce a při chybě čeština.
import { cookies, headers } from 'next/headers';
import { neon } from '@neondatabase/serverless';
import { COOKIE_JAZYKA, VYCHOZI, cistyJazyk, jazykZeZeme, type Jazyk } from './config.ts';

export async function jazykPozadavku(): Promise<Jazyk> {
  try {
    const c = await cookies();
    const zvoleny = cistyJazyk(c.get(COOKIE_JAZYKA)?.value);
    if (zvoleny) return zvoleny;
    const h = await headers();
    return jazykZeZeme(h.get('x-vercel-ip-country')) ?? VYCHOZI;
  } catch {
    return VYCHOZI; // mimo požadavek (build) cookie není
  }
}

/** Jazyk podniku (e-maily dodavatelům a pozvaným, Stripe zákazník). Nikdy nevyhazuje. */
export async function jazykPodniku(teamId: number | null | undefined): Promise<Jazyk> {
  if (!teamId) return VYCHOZI;
  try {
    const sql = neon(process.env.DATABASE_URL!);
    const [t] = await sql`SELECT default_lang FROM teams WHERE id = ${teamId}`;
    return cistyJazyk(t?.default_lang) ?? VYCHOZI;
  } catch {
    return VYCHOZI;
  }
}
