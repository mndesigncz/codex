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

const DEFAULT_NOTIF_PREFS = { messages: true, lowStock: true, shifts: true };

function serialize(u: any) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    avatar: u.avatar,
    phone: u.phone,
    jobTitle: u.job_title,
    shiftPreference: u.shift_preference,
    theme: u.theme ?? 'light',
    notifPrefs: { ...DEFAULT_NOTIF_PREFS, ...(u.notif_prefs ?? {}) },
    role: u.role,
  };
}

export async function GET() {
  const id = await meId();
  if (!id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  // notif_prefs fetched defensively so a pending migration can't 500 the account.
  let user: any;
  try {
    [user] = await sql`
      SELECT id, name, email, avatar, phone, job_title, shift_preference, theme, notif_prefs, role
      FROM users WHERE id = ${id}`;
  } catch {
    [user] = await sql`
      SELECT id, name, email, avatar, phone, job_title, shift_preference, theme, role
      FROM users WHERE id = ${id}`;
  }
  if (!user) return NextResponse.json({ error: 'Uživatel nenalezen' }, { status: 404 });

  return NextResponse.json({ user: serialize(user) });
}

export async function PATCH(request: Request) {
  const id = await meId();
  if (!id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { name, avatar, phone, jobTitle, shiftPreference, theme, notifPrefs, currentPassword, newPassword } = body;

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

  // Validation for provided fields
  if (name !== undefined && String(name).trim() === '') {
    return NextResponse.json({ error: 'Jméno nesmí být prázdné.' }, { status: 400 });
  }
  if (theme !== undefined && theme !== 'light' && theme !== 'dark') {
    return NextResponse.json({ error: 'Neplatný motiv vzhledu.' }, { status: 400 });
  }

  // Notification preferences — merged onto whatever is stored (partial updates ok).
  if (notifPrefs && typeof notifPrefs === 'object') {
    try {
      const [cur] = await sql`SELECT notif_prefs FROM users WHERE id = ${id}`;
      const merged = { ...DEFAULT_NOTIF_PREFS, ...(cur?.notif_prefs ?? {}), ...notifPrefs };
      await sql`UPDATE users SET notif_prefs = ${JSON.stringify(merged)}::jsonb WHERE id = ${id}`;
    } catch { /* column not migrated yet — ignore until /api/init runs */ }
  }

  // Profile update flow (only provided fields)
  await sql`
    UPDATE users SET
      name = COALESCE(${name ?? null}, name),
      avatar = COALESCE(${avatar ?? null}, avatar),
      phone = COALESCE(${phone ?? null}, phone),
      job_title = COALESCE(${jobTitle ?? null}, job_title),
      shift_preference = COALESCE(${shiftPreference ?? null}, shift_preference),
      theme = COALESCE(${theme ?? null}, theme)
    WHERE id = ${id}`;

  let updated: any;
  try {
    [updated] = await sql`
      SELECT id, name, email, avatar, phone, job_title, shift_preference, theme, notif_prefs, role
      FROM users WHERE id = ${id}`;
  } catch {
    [updated] = await sql`
      SELECT id, name, email, avatar, phone, job_title, shift_preference, theme, role
      FROM users WHERE id = ${id}`;
  }

  return NextResponse.json({ ok: true, user: serialize(updated) });
}
