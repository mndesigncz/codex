// The employer's answer to "kdo to změnil?" — recent audit entries, newest first.
import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const LABELS: Record<string, string> = {
  'closing.delete': 'Smazána uzávěrka',
  'inventory.delete': 'Smazána položka skladu',
  'schedule.clearMonth': 'Vymazán měsíc rozvrhu',
  'team.settings': 'Změna nastavení týmu',
  'supplier.create': 'Přidán dodavatel',
  'supplier.delete': 'Smazán dodavatel',
  'reward.create': 'Přidána odměna',
  'reward.approved': 'Schválena odměna',
  'reward.declined': 'Zamítnuta odměna',
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'employer') {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ entries: [] });
  try {
    const rows = await sql`
      SELECT a.*, us.name AS user_name, us.avatar AS user_avatar
      FROM audit_log a LEFT JOIN users us ON us.id = a.user_id
      WHERE a.team_id = ${u.team_id}
      ORDER BY a.created_at DESC LIMIT 100`;
    return NextResponse.json({
      entries: (rows as any[]).map(r => ({
        id: r.id,
        label: LABELS[r.action] ?? r.action,
        detail: r.detail ?? null,
        userName: r.user_name ?? 'Systém',
        userAvatar: r.user_avatar ?? '⚙️',
        createdAt: r.created_at,
      })),
    });
  } catch { return NextResponse.json({ entries: [] }); }
}
