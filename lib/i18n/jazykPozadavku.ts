// Jazyk požadavku a jazyk podniku pro serverové routy (bez Reactu, ať routa netáhne klientské moduly).
//
// Jazyk požadavku = cookie `managero-lang` (nastavuje přepínač), jinak jazyk
// prohlížeče (`Accept-Language`), jinak země návštěvníka z hlavičky Vercelu
// (`x-vercel-ip-country`), jinak čeština. Pořadí a důvody: jazykNavstevnika v config.ts.
// Jazyk podniku = `teams.default_lang`; před migrací sloupce a při chybě čeština.
import { cookies, headers } from 'next/headers';
import { neon } from '@neondatabase/serverless';
import { COOKIE_JAZYKA, VYCHOZI, cistyJazyk, jazykNavstevnika, type Jazyk } from './config.ts';

export async function jazykPozadavku(): Promise<Jazyk> {
  try {
    const c = await cookies();
    const h = await headers();
    return jazykNavstevnika({
      cookie: c.get(COOKIE_JAZYKA)?.value,
      acceptLanguage: h.get('accept-language'),
      zeme: h.get('x-vercel-ip-country'),
    });
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
