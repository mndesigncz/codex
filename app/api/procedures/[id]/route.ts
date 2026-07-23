import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { sanitizeSteps } from '@/lib/steps';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// 'HH:MM' (24h) or null.
function parseRemindAt(v: any): string | null {
  return typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : null;
}

// Weekdays 0=Mon..6=Sun, de-duped and sorted; [] means "every day".
function parseRemindDays(v: any): number[] {
  if (!Array.isArray(v)) return [];
  return Array.from(
    new Set(v.map((n: any) => parseInt(n)).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)),
  ).sort((a, b) => a - b);
}

async function currentUser() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const id = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${id}`;
  return { id, role, teamId: u?.team_id as number | null };
}

// PATCH (employer): update a procedure
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id, team_id FROM procedures WHERE id = ${id}`;
  if (!existing || existing.team_id !== me.teamId) {
    return NextResponse.json({ error: 'Postup nenalezen' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const description = body.description ? String(body.description).trim() : null;
  const icon = body.icon ? String(body.icon) : 'check';
  const color = body.color ? String(body.color) : 'lime';
  const items = sanitizeSteps(body.items);

  const remindAnchor = ['open', 'close', 'time'].includes(body.remindAnchor) ? body.remindAnchor : 'time';
  const remindAt = remindAnchor === 'time' ? parseRemindAt(body.remindAt) : null;
  const remindDays = parseRemindDays(body.remindDays);

  if (!name) return NextResponse.json({ error: 'Zadejte název postupu' }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: 'Přidejte alespoň jeden krok' }, { status: 400 });

  let updated: any;
  try {
    [updated] = await sql`
      UPDATE procedures
      SET name = ${name}, description = ${description}, icon = ${icon}, color = ${color}, items = ${JSON.stringify(items)},
          remind_at = ${remindAt}, remind_days = ${JSON.stringify(remindDays)}, remind_anchor = ${remindAnchor}
      WHERE id = ${id}
      RETURNING id, name, description, icon, color, items, remind_at AS "remindAt", remind_days AS "remindDays", remind_anchor AS "remindAnchor"`;
  } catch {
    [updated] = await sql`
      UPDATE procedures
      SET name = ${name}, description = ${description}, icon = ${icon}, color = ${color}, items = ${JSON.stringify(items)},
          remind_at = ${remindAt}, remind_days = ${JSON.stringify(remindDays)}
      WHERE id = ${id}
      RETURNING id, name, description, icon, color, items, remind_at AS "remindAt", remind_days AS "remindDays"`;
  }

  return NextResponse.json({ procedure: updated });
}

// DELETE (employer): delete a procedure
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id, team_id FROM procedures WHERE id = ${id}`;
  if (!existing || existing.team_id !== me.teamId) {
    return NextResponse.json({ error: 'Postup nenalezen' }, { status: 404 });
  }

  await sql`DELETE FROM procedures WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
