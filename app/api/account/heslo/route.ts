// Zapomenuté heslo, krok 1: žádost o odkaz. Odpověď je VŽDY stejná, ať je
// e-mail v aplikaci, nebo ne; e-mail se posílá až po odeslání odpovědi
// (`after`), aby se existence účtu nedala poznat ani podle doby odpovědi.

import { NextResponse, after } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';
import { normalizujEmail, vypadaJakoEmail } from '@/lib/emailAdresa';
import { novyToken, vyprseni, RESET_PLATNOST_MIN, cestaObnoveniHesla } from '@/lib/jednorazovyToken';
import { najdiUcet, klicPoctadla } from '@/lib/ucetEmail';
import { sendPasswordResetEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const ODPOVED = { ok: true, message: 'Pokud je e-mail v aplikaci, poslali jsme na něj odkaz pro nové heslo.' };

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const email = normalizujEmail(b?.email);
  // Tvar e-mailu je jediné, co se prozrazuje: špatně napsaná adresa je chyba uživatele, ne únik.
  if (!vypadaJakoEmail(email)) return NextResponse.json({ error: 'E-mail nevypadá správně.' }, { status: 400 });
  // Limit podle IP PŘED čímkoli dalším (bcrypt tu není, ale e-maily stojí peníze a dají se zneužít ke spamu).
  const ip = await hit(`reset-ip:${klientIp(request.headers)}`, 10, 60 * 60);
  if (!ip.ok) return NextResponse.json({ error: 'Příliš mnoho žádostí. Zkuste to později.' }, { status: 429 });
  // Limit na adresu: další žádosti se tváří stejně, ale neodejdou (nikdo nespamuje cizí schránku).
  const adr = await hit(klicPoctadla('reset', email), 3, 60 * 60);

  after(async () => {
    if (!adr.ok) return;
    try {
      const ucet = await najdiUcet(email);
      if (!ucet) return;
      const { token, hash } = novyToken();
      const sql = neon(process.env.DATABASE_URL!);
      await sql`
        INSERT INTO password_resets (token_hash, user_id, expires_at)
        VALUES (${hash}, ${ucet.id}, ${vyprseni(RESET_PLATNOST_MIN).toISOString()})`;
      await sendPasswordResetEmail(ucet.email, ucet.name, cestaObnoveniHesla(ucet.role, token));
    } catch (e) {
      // Před migrací tabulka neexistuje; uživateli se nic neprozradí, do logu ano.
      console.error('reset hesla: žádost selhala', e);
    }
  });
  return NextResponse.json(ODPOVED);
}
