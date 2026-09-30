import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { obalZHlavicek } from '@/lib/obal';

export const dynamic = 'force-dynamic';

// Vlastní upozornění (user_id = já) — nevážou se na podnik ani roli, čtou je
// i hosté. Brána oprávnění tu proto záměrně není.

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ notifications: [], unread: 0 });
  const meId = parseInt((session.user as any).id);
  const sql = neon(process.env.DATABASE_URL!);
  // V nativní aplikaci se oznámení o předplatném a platbě neukazují vůbec (Apple 3.1.1):
  // nesla by výzvu k zaplacení a odkaz do pokladny, která v obalu není.
  const vObalu = obalZHlavicek(request.headers) !== null;
  const notifications = vObalu
    ? await sql`
      SELECT id, title, body, type, link, is_read, created_at
      FROM notifications WHERE user_id = ${meId} AND type <> 'billing'
      ORDER BY created_at DESC LIMIT 30`
    : await sql`
      SELECT id, title, body, type, link, is_read, created_at
      FROM notifications WHERE user_id = ${meId}
      ORDER BY created_at DESC LIMIT 30`;
  const unread = notifications.filter((n: any) => !n.is_read).length;
  return NextResponse.json({ notifications, unread });
}

// PATCH: mark all (or one via {id}) as read
export async function PATCH(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const meId = parseInt((session.user as any).id);
  const sql = neon(process.env.DATABASE_URL!);
  const body = await request.json().catch(() => ({}));
  if (body.id) {
    await sql`UPDATE notifications SET is_read = TRUE WHERE id = ${body.id} AND user_id = ${meId}`;
  } else {
    await sql`UPDATE notifications SET is_read = TRUE WHERE user_id = ${meId}`;
  }
  return NextResponse.json({ ok: true });
}
