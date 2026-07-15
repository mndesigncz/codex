import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function meId() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return parseInt((session.user as any).id);
}

export async function GET() {
  const id = await meId();
  if (!id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const [user] = await sql`
    SELECT id, name, email, avatar, phone, job_title, shift_preference, role
    FROM users WHERE id = ${id}`;
  if (!user) return NextResponse.json({ error: 'Uživatel nenalezen' }, { status: 404 });

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      phone: user.phone,
      jobTitle: user.job_title,
      shiftPreference: user.shift_preference,
      role: user.role,
    },
  });
}

export async function PATCH(request: Request) {
  const id = await meId();
  if (!id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const body = await request.json();
  const { name, avatar, phone, jobTitle, shiftPreference, currentPassword, newPassword } = body;

  // Password change flow
  if (currentPassword !== undefined || newPassword !== undefined) {
    if (!currentPassword || !newPassword) {
      return NextResponse.json({ error: 'Zadejte současné i nové heslo.' }, { status: 400 });
    }
    if (String(newPassword).length < 8) {
      return NextResponse.json({ error: 'Nové heslo musí mít alespoň 8 znaků.' }, { status: 400 });
    }
    const [user] = await sql`SELECT password_hash FROM users WHERE id = ${id}`;
    if (!user) return NextResponse.json({ error: 'Uživatel nenalezen' }, { status: 404 });

    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) {
      return NextResponse.json({ error: 'Současné heslo není správné.' }, { status: 400 });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${id}`;
    return NextResponse.json({ ok: true, message: 'Heslo bylo změněno.' });
  }

  // Profile update flow (only provided fields)
  if (name !== undefined && String(name).trim() === '') {
    return NextResponse.json({ error: 'Jméno nesmí být prázdné.' }, { status: 400 });
  }

  await sql`
    UPDATE users SET
      name = COALESCE(${name ?? null}, name),
      avatar = COALESCE(${avatar ?? null}, avatar),
      phone = COALESCE(${phone ?? null}, phone),
      job_title = COALESCE(${jobTitle ?? null}, job_title),
      shift_preference = COALESCE(${shiftPreference ?? null}, shift_preference)
    WHERE id = ${id}`;

  const [updated] = await sql`
    SELECT id, name, email, avatar, phone, job_title, shift_preference, role
    FROM users WHERE id = ${id}`;

  return NextResponse.json({
    ok: true,
    user: {
      id: updated.id,
      name: updated.name,
      email: updated.email,
      avatar: updated.avatar,
      phone: updated.phone,
      jobTitle: updated.job_title,
      shiftPreference: updated.shift_preference,
      role: updated.role,
    },
  });
}
