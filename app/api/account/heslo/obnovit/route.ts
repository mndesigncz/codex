// Zapomenuté heslo, krok 2: nové heslo s tokenem z e-mailu. Token je
// jednorázový a krátkodobý; v databázi je jen jeho otisk.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';
import { hit, clear } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';
import { hashTokenu, jePlatny, vypadaJakoToken, hesloStaci } from '@/lib/jednorazovyToken';
import { klicPoctadla } from '@/lib/ucetEmail';

export const dynamic = 'force-dynamic';

const NEPLATNY = 'Odkaz už neplatí. Požádejte o nový.';

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const token = b?.token;
  const heslo = b?.password;
  // Hádání tokenů přes tenhle endpoint: 256 bitů je nehádatelných, ale ať se za to neplatí bcryptem.
  const ip = await hit(`reset-potvrzeni-ip:${klientIp(request.headers)}`, 20, 15 * 60, { failClosed: true });
  if (!ip.ok) return NextResponse.json({ error: 'Příliš mnoho pokusů. Zkuste to později.' }, { status: 429 });
  if (!vypadaJakoToken(token)) return NextResponse.json({ error: NEPLATNY }, { status: 400 });
  if (!hesloStaci(heslo)) return NextResponse.json({ error: 'Heslo musí mít alespoň 8 znaků.' }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const hash = hashTokenu(token);
  let radek: any;
  try {
    [radek] = await sql`SELECT user_id, expires_at, used_at FROM password_resets WHERE token_hash = ${hash}`;
  } catch {
    return NextResponse.json({ error: NEPLATNY }, { status: 400 });
  }
  if (!jePlatny(radek)) return NextResponse.json({ error: NEPLATNY }, { status: 400 });

  // Token se spotřebuje PŘED změnou hesla a jen jednou: dva souběžné požadavky se stejným
  // odkazem neprojdou oba (UPDATE … WHERE used_at IS NULL vrátí řádek jen tomu prvnímu).
  const [spotrebovan] = await sql`UPDATE password_resets SET used_at = NOW() WHERE token_hash = ${hash} AND used_at IS NULL RETURNING user_id`;
  if (!spotrebovan) return NextResponse.json({ error: NEPLATNY }, { status: 400 });
  const userId = Number(spotrebovan.user_id);
  const [u] = await sql`SELECT email, role FROM users WHERE id = ${userId}`;
  if (!u) return NextResponse.json({ error: NEPLATNY }, { status: 400 });

  await sql`UPDATE users SET password_hash = ${await bcrypt.hash(heslo, 12)} WHERE id = ${userId}`;
  // Ostatní nevyužité odkazy téhož účtu přestanou platit a zamčené přihlášení se uvolní.
  try { await sql`UPDATE password_resets SET used_at = NOW() WHERE user_id = ${userId} AND used_at IS NULL`; } catch { /* nevadí */ }
  await clear(`login:${String(u.email).toLowerCase()}`);
  await clear(klicPoctadla('reset', String(u.email).toLowerCase()));
  return NextResponse.json({ ok: true, role: String(u.role) });
}
