// Kontrola zdraví pro hlídání dostupnosti (UptimeRobot, Better Stack, Vercel
// Checks). Veřejná a bez přihlášení, proto vrací jen ano/ne: žádné hodnoty
// proměnných, žádná data podniků. 200 = aplikace běží a databáze odpovídá,
// 503 = databáze nedostupná nebo chybí povinné nastavení.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { stavNastaveni } from '@/lib/zdravi';

export const dynamic = 'force-dynamic';

async function databaze(): Promise<'ok' | 'chyba' | 'chybi'> {
  if (!process.env.DATABASE_URL) return 'chybi';
  try {
    const sql = neon(process.env.DATABASE_URL);
    const dotaz = sql`SELECT 1 AS ok`;
    const limit = new Promise<never>((_, odmitni) => setTimeout(() => odmitni(new Error('timeout')), 3000));
    await Promise.race([dotaz, limit]);
    return 'ok';
  } catch {
    return 'chyba';
  }
}

export async function GET() {
  const db = await databaze();
  const nastaveni = stavNastaveni(process.env);
  const ok = db === 'ok' && nastaveni.povinneChybi.length === 0;
  return NextResponse.json(
    {
      ok,
      databaze: db,
      verze: (process.env.VERCEL_GIT_COMMIT_SHA ?? '').slice(0, 7) || null,
      prostredi: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
      cas: new Date().toISOString(),
      povinneChybi: nastaveni.povinneChybi,
      funkce: nastaveni.funkce,
    },
    { status: ok ? 200 : 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
