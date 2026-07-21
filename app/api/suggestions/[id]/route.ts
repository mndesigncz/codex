import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const s = await getServerSession(authOptions);
  if (!s?.user) return null;
  const meId = parseInt((s.user as any).id);
  const role = (s.user as any).role as string;
  const [u] = await sql`SELECT team_id, name FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | null, name: u?.name as string };
}

const STATUSES = ['new', 'planned', 'done', 'declined'] as const;
const STATUS_LABEL: Record<string, string> = {
  planned: 'Naplánováno k realizaci',
  done: 'Hotovo ✓',
  declined: 'Prozatím zamítnuto',
  new: 'Znovu otevřeno',
};

// PATCH — two actions on one endpoint:
//   { toggleVote: true }  → anyone on the team adds/removes their +1
//   { status }            → employer moves the suggestion along the pipeline
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId || c.role === 'kiosk') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [s] = await sql`SELECT id, author_id FROM suggestions WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!s) return NextResponse.json({ error: 'Podnět nenalezen' }, { status: 404 });

  const b = await req.json().catch(() => ({}));

  // Toggle the current user's vote.
  if (b.toggleVote) {
    const [existing] = await sql`SELECT 1 FROM suggestion_votes WHERE suggestion_id = ${id} AND user_id = ${c.meId}`;
    if (existing) {
      await sql`DELETE FROM suggestion_votes WHERE suggestion_id = ${id} AND user_id = ${c.meId}`;
    } else {
      await sql`INSERT INTO suggestion_votes (suggestion_id, user_id) VALUES (${id}, ${c.meId}) ON CONFLICT DO NOTHING`;
    }
    const [{ votes }] = await sql`SELECT COUNT(*)::int AS votes FROM suggestion_votes WHERE suggestion_id = ${id}`;
    return NextResponse.json({ ok: true, votes, hasVoted: !existing });
  }

  // Change status — employer only.
  const status = String(b.status ?? '');
  if (STATUSES.includes(status as any)) {
    if (c.role !== 'employer') return NextResponse.json({ error: 'Jen vedení může měnit stav.' }, { status: 403 });
    await sql`UPDATE suggestions SET status = ${status} WHERE id = ${id} AND team_id = ${c.teamId}`;
    // Let the author know their idea moved (unless they changed it themselves).
    if (s.author_id && s.author_id !== c.meId && STATUS_LABEL[status]) {
      try {
        await notifyUser(s.author_id, {
          title: 'Tvůj podnět má nový stav',
          body: STATUS_LABEL[status],
          type: status === 'declined' ? 'warning' : 'info',
        });
      } catch { /* best-effort */ }
    }
    return NextResponse.json({ ok: true, status });
  }

  return NextResponse.json({ error: 'Neplatná akce' }, { status: 400 });
}

// DELETE — the author can remove their own; an employer can remove any.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 400 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [s] = await sql`SELECT author_id FROM suggestions WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!s) return NextResponse.json({ ok: true });
  if (c.role !== 'employer' && s.author_id !== c.meId) {
    return NextResponse.json({ error: 'Můžeš smazat jen svůj podnět.' }, { status: 403 });
  }
  await sql`DELETE FROM suggestion_votes WHERE suggestion_id = ${id}`;
  await sql`DELETE FROM suggestions WHERE id = ${id} AND team_id = ${c.teamId}`;
  return NextResponse.json({ ok: true });
}
