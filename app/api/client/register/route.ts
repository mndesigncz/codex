// Registrace hosta. Na rozdíl od vedení nevzniká tým — host se k podnikům
// přidá členstvím. Stejný limit pokusů jako u přihlášení.

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { sql } from '@/lib/client';
import { hit } from '@/lib/rateLimit';

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
  const gate = await hit(`client-register:${email}`, 5, 15 * 60);
  if (!gate.ok) return NextResponse.json({ error: 'Příliš mnoho pokusů. Zkus to za čtvrt hodiny.' }, { status: 429 });

  const [existing] = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (existing) return NextResponse.json({ error: 'Tenhle e-mail už je zaregistrovaný. Přihlas se.' }, { status: 409 });
  const hash = await bcrypt.hash(password, 12);
  const [u] = await sql`
    INSERT INTO users (name, email, password_hash, role, avatar, job_title)
    VALUES (${name}, ${email}, ${hash}, 'customer', '👤', 'Host')
    RETURNING id, name, email`;
  return NextResponse.json({ ok: true, user: u });
}
