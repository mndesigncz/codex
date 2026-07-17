import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function employer() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  if (role !== 'employer') return { forbidden: true } as const;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, teamId: u?.team_id as number | null };
}

// GET — the team's kiosk account (if any).
export async function GET() {
  const c = await employer();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if ('forbidden' in c) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ kiosk: null });
  const [k] = await sql`SELECT id, email, name FROM users WHERE team_id = ${c.teamId} AND role = 'kiosk' LIMIT 1`;
  return NextResponse.json({ kiosk: k ?? null });
}

// POST — create or update the team's kiosk login.
export async function POST(req: NextRequest) {
  const c = await employer();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if ('forbidden' in c) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  if (!email || password.length < 4) {
    return NextResponse.json({ error: 'Zadejte e-mail a heslo (min. 4 znaky).' }, { status: 400 });
  }

  const [existing] = await sql`SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'kiosk' LIMIT 1`;
  const hash = await bcrypt.hash(password, 10);

  if (existing) {
    // Make sure the new e-mail isn't taken by someone else.
    const [clash] = await sql`SELECT id FROM users WHERE email = ${email} AND id <> ${existing.id}`;
    if (clash) return NextResponse.json({ error: 'Tento e-mail už používá jiný účet.' }, { status: 409 });
    await sql`UPDATE users SET email = ${email}, password_hash = ${hash} WHERE id = ${existing.id}`;
    return NextResponse.json({ ok: true, kiosk: { id: existing.id, email } });
  }

  const [clash] = await sql`SELECT id FROM users WHERE email = ${email}`;
  if (clash) return NextResponse.json({ error: 'Tento e-mail už používá jiný účet.' }, { status: 409 });

  const [k] = await sql`
    INSERT INTO users (name, email, password_hash, role, avatar, team_id)
    VALUES ('Tablet', ${email}, ${hash}, 'kiosk', '📟', ${c.teamId})
    RETURNING id, email`;
  return NextResponse.json({ ok: true, kiosk: k });
}

// PATCH — set or clear an employee's kiosk PIN.
export async function PATCH(req: NextRequest) {
  const c = await employer();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if ('forbidden' in c) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 400 });

  const b = await req.json().catch(() => ({}));
  const userId = parseInt(b.userId);
  if (!Number.isFinite(userId)) return NextResponse.json({ error: 'Neplatný uživatel' }, { status: 400 });
  const pin = b.pin === null || b.pin === '' ? null : String(b.pin).replace(/\D/g, '').slice(0, 6);
  if (pin !== null && pin.length < 4) return NextResponse.json({ error: 'PIN musí mít 4–6 číslic.' }, { status: 400 });

  const [target] = await sql`SELECT id FROM users WHERE id = ${userId} AND team_id = ${c.teamId} AND role = 'employee'`;
  if (!target) return NextResponse.json({ error: 'Zaměstnanec nenalezen' }, { status: 404 });

  await sql`UPDATE users SET pin = ${pin} WHERE id = ${userId}`;
  return NextResponse.json({ ok: true });
}
