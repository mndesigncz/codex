import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { obalZHlavicek } from '@/lib/obal';
import { cistyDruhOznameni, cistyLimitOznameni } from '@/lib/oznameniOdkaz';

export const dynamic = 'force-dynamic';

// Vlastní upozornění (user_id = já) — nevážou se na podnik ani roli, čtou je
// i hosté. Brána oprávnění tu proto záměrně není.
//
// GET parametry (Centrum oznámení v Nastavení, kolo 6 B3; zvonek posílá bez nich):
//   limit=     kolik oznámení (výchozí 30, nejvýš 100)
//   unread=1   jen nepřečtená
//   type=      jen jeden druh (notifications.type)
//   before=    id — starší než tohle oznámení („Načíst starší")
//   souhrn=1   navíc `druhy`: počet podle druhu (se stejným filtrem nepřečtených)
// `unread` v odpovědi je počet VŠECH nepřečtených, ne jen v načtené dávce.

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ notifications: [], unread: 0 });
  const meId = parseInt((session.user as any).id);
  const sql = neon(process.env.DATABASE_URL!);
  // V nativní aplikaci se oznámení o předplatném a platbě neukazují vůbec (Apple 3.1.1):
  // nesla by výzvu k zaplacení a odkaz do pokladny, která v obalu není.
  const vObalu = obalZHlavicek(request.headers) !== null;
  const q = new URL(request.url).searchParams;
  const limit = cistyLimitOznameni(q.get('limit'));
  const jenNeprectena = q.get('unread') === '1';
  const druh = cistyDruhOznameni(q.get('type'));
  const predId = parseInt(q.get('before') ?? '', 10);
  const pred = Number.isFinite(predId) && predId > 0 ? predId : null;

  const [notifications, [pocet], druhy] = await Promise.all([
    sql`
      SELECT id, title, body, type, link, is_read, created_at
      FROM notifications
      WHERE user_id = ${meId}
        AND (${vObalu}::boolean = FALSE OR type <> 'billing')
        AND (${jenNeprectena}::boolean = FALSE OR is_read = FALSE)
        AND (${druh}::text IS NULL OR type = ${druh})
        AND (${pred}::int IS NULL OR id < ${pred})
      ORDER BY created_at DESC, id DESC LIMIT ${limit}`,
    sql`
      SELECT COUNT(*)::int AS n FROM notifications
      WHERE user_id = ${meId} AND is_read = FALSE AND (${vObalu}::boolean = FALSE OR type <> 'billing')`,
    q.get('souhrn') === '1'
      ? sql`
        SELECT type, COUNT(*)::int AS n FROM notifications
        WHERE user_id = ${meId}
          AND (${vObalu}::boolean = FALSE OR type <> 'billing')
          AND (${jenNeprectena}::boolean = FALSE OR is_read = FALSE)
        GROUP BY type ORDER BY COUNT(*) DESC`
      : Promise.resolve(null),
  ]);
  return NextResponse.json({
    notifications,
    unread: Number(pocet?.n ?? 0),
    limit,
    ...(druhy ? { druhy: Object.fromEntries((druhy as any[]).map(r => [String(r.type ?? 'info'), Number(r.n)])) } : {}),
  });
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
