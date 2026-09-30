// Potvrzení smazání účtu odkazem z e-mailu. Smaže POST, ne otevření odkazu:
// náhledy odkazů v e-mailových klientech a antivirové skenery odkazy
// otevírají (GET), a účet by zmizel bez vědomí člověka.
//
// Účet vlastníka podniku se tudy nesmaže: potřebuje výslovné rozhodnutí
// o podniku (a platební údaje předplatného), a to se dělá v aplikaci po přihlášení.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';
import { hashTokenu, jePlatny, vypadaJakoToken } from '@/lib/jednorazovyToken';
import { smazUcet } from '@/lib/smazaniUctuDb';

export const dynamic = 'force-dynamic';

const NEPLATNY = 'Odkaz už neplatí. Požádejte o nový na stránce Smazání účtu.';

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const token = b?.token;
  const ip = await hit(`smazani-potvrzeni-ip:${klientIp(request.headers)}`, 20, 15 * 60, { failClosed: true });
  if (!ip.ok) return NextResponse.json({ error: 'Příliš mnoho pokusů. Zkuste to později.' }, { status: 429 });
  if (!vypadaJakoToken(token)) return NextResponse.json({ error: NEPLATNY }, { status: 400 });

  const sql = neon(process.env.DATABASE_URL!);
  const hash = hashTokenu(token);
  let radek: any;
  try {
    [radek] = await sql`SELECT user_id, expires_at, used_at FROM account_delete_requests WHERE token_hash = ${hash}`;
  } catch {
    return NextResponse.json({ error: NEPLATNY }, { status: 400 });
  }
  if (!jePlatny(radek)) return NextResponse.json({ error: NEPLATNY }, { status: 400 });
  const [spotrebovan] = await sql`UPDATE account_delete_requests SET used_at = NOW() WHERE token_hash = ${hash} AND used_at IS NULL RETURNING user_id`;
  if (!spotrebovan) return NextResponse.json({ error: NEPLATNY }, { status: 400 });

  try {
    const r = await smazUcet(Number(spotrebovan.user_id), { smazatPodnik: false, zDuvodu: 'web' });
    if (!r.ok) {
      // Odkaz se vrátí do hry, když se smazání nepovedlo z důvodu, který člověk může napravit.
      try { await sql`UPDATE account_delete_requests SET used_at = NULL WHERE token_hash = ${hash}`; } catch { /* nevadí */ }
      if (r.kod === 'VLASTNIK_S_CLENY' || r.kod === 'VLASTNIK_PODNIKU') {
        return NextResponse.json({ error: 'Tenhle účet vlastní podnik. Smažte ho v aplikaci: Nastavení, Účet, Smazat účet. Tam potvrdíte i smazání podniku.', kod: r.kod }, { status: 409 });
      }
      return NextResponse.json({ error: r.zprava, kod: r.kod }, { status: r.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('smazání účtu z webu selhalo', e);
    try { await sql`UPDATE account_delete_requests SET used_at = NULL WHERE token_hash = ${hash}`; } catch { /* nevadí */ }
    return NextResponse.json({ error: 'Účet se nepodařilo smazat. Zkuste to znovu, nebo napište podpoře.' }, { status: 500 });
  }
}
