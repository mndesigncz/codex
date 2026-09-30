// Žádost o smazání účtu z webu bez přihlášení (Google Play vyžaduje odkaz
// na smazání i mimo aplikaci). NIC se nesmaže na základě samotného e-mailu:
// na adresu účtu se pošle odkaz a smazání proběhne až po jeho potvrzení
// (app/smazat-ucet/potvrdit). Cizí člověk tak cizí účet smazat nemůže.
// Odpověď je stejná, ať účet existuje, nebo ne.

import { NextResponse, after } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';
import { normalizujEmail, vypadaJakoEmail } from '@/lib/emailAdresa';
import { novyToken, vyprseni, SMAZANI_PLATNOST_MIN } from '@/lib/jednorazovyToken';
import { najdiUcet, klicPoctadla } from '@/lib/ucetEmail';
import { sendAccountDeleteEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const ODPOVED = { ok: true, message: 'Pokud je e-mail v aplikaci, poslali jsme na něj odkaz pro potvrzení smazání.' };

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const email = normalizujEmail(b?.email);
  if (!vypadaJakoEmail(email)) return NextResponse.json({ error: 'E-mail nevypadá správně.' }, { status: 400 });
  const ip = await hit(`smazani-zadost-ip:${klientIp(request.headers)}`, 10, 60 * 60);
  if (!ip.ok) return NextResponse.json({ error: 'Příliš mnoho žádostí. Zkuste to později.' }, { status: 429 });
  const adr = await hit(klicPoctadla('smazani-zadost', email), 3, 60 * 60);

  after(async () => {
    if (!adr.ok) return;
    try {
      const ucet = await najdiUcet(email);
      if (!ucet) return;
      const { token, hash } = novyToken();
      const sql = neon(process.env.DATABASE_URL!);
      await sql`
        INSERT INTO account_delete_requests (token_hash, user_id, expires_at)
        VALUES (${hash}, ${ucet.id}, ${vyprseni(SMAZANI_PLATNOST_MIN).toISOString()})`;
      await sendAccountDeleteEmail(ucet.email, ucet.name, `/smazat-ucet/potvrdit?token=${encodeURIComponent(token)}`);
    } catch (e) {
      console.error('žádost o smazání účtu selhala', e);
    }
  });
  return NextResponse.json(ODPOVED);
}
