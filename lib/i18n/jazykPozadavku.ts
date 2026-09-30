// Jazyk požadavku a jazyk podniku pro serverové routy (bez Reactu, ať routa netáhne klientské moduly).
//
// Jazyk požadavku = cookie `managero-lang` (nastavuje přepínač), jinak čeština.
// Jazyk podniku = `teams.default_lang`; před migrací sloupce a při chybě čeština.
import { cookies } from 'next/headers';
import { neon } from '@neondatabase/serverless';
import { COOKIE_JAZYKA, VYCHOZI, cistyJazyk, type Jazyk } from './config.ts';

export async function jazykPozadavku(): Promise<Jazyk> {
  try {
    const c = await cookies();
    return cistyJazyk(c.get(COOKIE_JAZYKA)?.value) ?? VYCHOZI;
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
