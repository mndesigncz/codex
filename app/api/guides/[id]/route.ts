import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function ctx() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id ?? null };
}

// Parse a stored checklist (JSONB may arrive as array or string) into string[].
function parseChecklist(raw: any): string[] {
  let arr: any = raw;
  if (typeof raw === 'string') {
    try {
      arr = JSON.parse(raw);
    } catch {
      arr = [];
    }
  }
  if (!Array.isArray(arr)) return [];
  return arr.map((s) => String(s ?? '')).filter((s) => s.trim().length > 0);
}

// Normalize an incoming checklist into a clean string[] of step texts.
function normalizeChecklist(input: any): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((s) => String(s ?? '').trim())
    .filter((s) => s.length > 0)
    .slice(0, 100);
}

// GET — single guide full content (team members only)
export async function GET(_request: Request, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const id = parseInt(params.id);
  const [g] = await sql`
    SELECT g.id, g.title, g.content, g.checklist, g.category_id, g.updated_at, g.created_at, u.name AS author
    FROM guides g
    LEFT JOIN users u ON u.id = g.created_by
    WHERE g.id = ${id} AND g.team_id = ${c.teamId}`;

  if (!g) return NextResponse.json({ error: 'Návod nenalezen' }, { status: 404 });

  return NextResponse.json({
    guide: {
      id: g.id,
      title: g.title,
      content: g.content,
      checklist: parseChecklist(g.checklist),
      categoryId: g.category_id,
      updatedAt: g.updated_at,
      createdAt: g.created_at,
      author: g.author,
    },
  });
}

// PATCH (employer) — update title/content/category, bump updated_at
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id, category_id FROM guides WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!existing) return NextResponse.json({ error: 'Návod nenalezen' }, { status: 404 });

  const body = await request.json();

  // Mark/unmark as required reading for the whole team.
  if (body.requireRead !== undefined) {
    try {
      await sql`UPDATE guides SET require_read = ${body.requireRead === true} WHERE id = ${id} AND team_id = ${c.teamId}`;
      if (body.requireRead === true) {
        const members = await sql`SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'employee'`;
        const [g2] = await sql`SELECT title FROM guides WHERE id = ${id}`;
        const { notifyUsers } = await import('@/lib/push');
        await notifyUsers((members as any[]).map(m => m.id), {
          title: '📖 Povinné čtení',
          body: `Návod „${g2?.title ?? ''}" je povinný — přečti a potvrď.`,
          type: 'info',
          link: '/employee/shifts?view=guides',
        });
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Není dostupné — spusť /api/init.' }, { status: 400 });
    }
  }

  // Approving an employee proposal.
  if (body.approve === true) {
    try {
      const [row] = await sql`
        UPDATE guides SET approved = TRUE
        WHERE id = ${id} AND team_id = ${c.teamId}
        RETURNING id, submitted_by, title`;
      if (!row) return NextResponse.json({ error: 'Návod nenalezen' }, { status: 404 });
      if (row.submitted_by) {
        try {
          await notifyUser(row.submitted_by, {
            title: 'Tvůj návod byl schválen ✓',
            body: `„${row.title}" je teď vidět pro celý tým.`,
            type: 'info',
            link: '/employee/shifts?view=guides',
          });
        } catch { /* best-effort */ }
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Schválení není dostupné — spusť /api/init.' }, { status: 400 });
    }
  }
  const { title, content, categoryId, checklist } = body;

  const nextTitle = title !== undefined && String(title).trim() ? String(title).trim() : null;
  const nextContent = content !== undefined ? content : null;
  // categoryId: explicit null clears; a value sets; undefined keeps existing.
  const nextCategory =
    categoryId === undefined
      ? existing.category_id
      : categoryId === null || categoryId === ''
      ? null
      : parseInt(categoryId);
  // checklist: undefined keeps existing; anything else is normalized (empty array clears).
  const nextChecklist = checklist === undefined ? null : JSON.stringify(normalizeChecklist(checklist));

  const [g] = await sql`
    UPDATE guides SET
      title = COALESCE(${nextTitle}, title),
      content = COALESCE(${nextContent}, content),
      category_id = ${nextCategory},
      checklist = COALESCE(${nextChecklist}::jsonb, checklist),
      updated_at = NOW()
    WHERE id = ${id} AND team_id = ${c.teamId}
    RETURNING id, title, content, checklist, category_id, updated_at`;

  return NextResponse.json({
    guide: {
      id: g.id,
      title: g.title,
      content: g.content,
      checklist: parseChecklist(g.checklist),
      categoryId: g.category_id,
      updatedAt: g.updated_at,
    },
  });
}

// DELETE (employer)
export async function DELETE(_request: Request, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id FROM guides WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!existing) return NextResponse.json({ error: 'Návod nenalezen' }, { status: 404 });

  await sql`DELETE FROM guides WHERE id = ${id} AND team_id = ${c.teamId}`;
  return NextResponse.json({ ok: true });
}

// POST — the reader confirms they read a required guide: { markRead: true }.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role === 'kiosk') return NextResponse.json({ error: 'Potvrzení čtení je osobní — přihlas se svým účtem.' }, { status: 403 });
  const id = parseInt(params.id);
  const b = await request.json().catch(() => ({}));
  if (b.markRead !== true) return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });
  const [g] = await sql`SELECT id FROM guides WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!g) return NextResponse.json({ error: 'Návod nenalezen' }, { status: 404 });
  try {
    await sql`
      INSERT INTO guide_reads (guide_id, user_id) VALUES (${id}, ${c.meId})
      ON CONFLICT (guide_id, user_id) DO NOTHING`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Potvrzení není dostupné — spusť /api/init.' }, { status: 400 });
  }
}
