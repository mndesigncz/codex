// Registrace hosta. Na rozdíl od vedení nevzniká tým — host se k podnikům
// přidá členstvím. Stejný limit pokusů jako u přihlášení.

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql, customerByCard } from '@/lib/client';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const name = String(b.name ?? '').trim().slice(0, 80);
  const email = String(b.email ?? '').trim().toLowerCase().slice(0, 120);
  const password = String(b.password ?? '');
  if (!name || !email || !password) return NextResponse.json({ error: 'Vyplň jméno, e-mail a heslo.' }, { status: 400 });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'E-mail nevypadá správně.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Heslo musí mít alespoň 8 znaků.' }, { status: 400 });
  // Limit podle IP jde PŘED dotazem na existenci účtu i před bcryptem: samotné
  // počítadlo per e-mail nezastaví skript, který zkouší tisíce různých adres
  // (výčet účtů podle 409 + bcrypt cost 12 za každý pokus + spam řádků v users).
  const ipGate = await hit(`client-register-ip:${klientIp(request.headers)}`, 10, 60 * 60);
  if (!ipGate.ok) return NextResponse.json({ error: 'Příliš mnoho registrací z tohoto připojení. Zkus to za hodinu.' }, { status: 429 });
  const gate = await hit(`client-register:${email}`, 5, 15 * 60);
  if (!gate.ok) return NextResponse.json({ error: 'Příliš mnoho pokusů. Zkus to za čtvrt hodiny.' }, { status: 429 });

  const [existing] = await sql`SELECT id FROM users WHERE lower(email) = ${email} LIMIT 1`;
  if (existing) return NextResponse.json({ error: 'Tenhle e-mail už je zaregistrovaný. Přihlas se.' }, { status: 409 });
  const hash = await bcrypt.hash(password, 12);
  // Kód od kamaráda (kód jeho kartičky). Špatný kód registraci neshodí —
  // jen se nezapíše; odměna padá až při prvním členství ve společném podniku.
  let referredBy: number | null = null;
  if (b.ref) { try { referredBy = (await customerByCard(String(b.ref)))?.id ?? null; } catch { referredBy = null; } }
  // Souhlas s novinkami podniků je dobrovolný a bez zaškrtnutí NE (Apple 4.5.4, zákon 480/2004):
  // ukládá se jen výslovné `true`, ne „cokoli truthy“. Čas souhlasu se zapisuje, ať je co doložit.
  const novinky = b.novinky === true;
  const prefs = JSON.stringify(novinky ? { novinky: true, novinkyAt: new Date().toISOString() } : { novinky: false });
  let u: any;
  try {
    [u] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar, job_title, referred_by, notif_prefs, terms_accepted_at)
      VALUES (${name}, ${email}, ${hash}, 'customer', '👤', 'Host', ${referredBy}, ${prefs}::jsonb, NOW())
      RETURNING id, name, email`;
  } catch {
    // Před migrací (sloupce notif_prefs a terms_accepted_at ještě nejsou): registrace nesmí spadnout.
    [u] = await sql`
      INSERT INTO users (name, email, password_hash, role, avatar, job_title, referred_by)
      VALUES (${name}, ${email}, ${hash}, 'customer', '👤', 'Host', ${referredBy})
      RETURNING id, name, email`;
  }
  return NextResponse.json({ ok: true, user: u, referred: !!referredBy });
}
