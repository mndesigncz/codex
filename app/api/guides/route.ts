import { NextResponse } from 'next/server';
import { normalizeSteps } from '@/lib/guideSteps';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUsers, notifyUser } from '@/lib/push';

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

function excerpt(content: string) {
  const flat = String(content || '').replace(/\s+/g, ' ').trim();
  return flat.length > 120 ? flat.slice(0, 120).trimEnd() + '…' : flat;
}

// Krok návodu může nést i surovinu s množstvím — normalizace je sdílená,
// aby se editor, čtečka i uložení shodly na tvaru. Starý checklist jako pole
// řetězců projde beze změny.
const normalizeChecklist = normalizeSteps;

function checklistLength(raw: any): number {
  if (Array.isArray(raw)) return raw.length;
  if (typeof raw === 'string') {
    try {
      const p = JSON.parse(raw);
      return Array.isArray(p) ? p.length : 0;
    } catch {
      return 0;
    }
  }
  return 0;
}

// GET — list team's guides (optionally ?categoryId=)
export async function GET(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!c.teamId) return NextResponse.json({ guides: [] });

  const { searchParams } = new URL(request.url);
  const categoryId = searchParams.get('categoryId');

  let rows: any[];
  try {
    rows = categoryId
      ? await sql`
          SELECT g.id, g.title, g.category_id, g.content, g.checklist, g.updated_at, g.approved, g.submitted_by, g.product_id,
                 g.require_read,
                 (SELECT COUNT(*)::int FROM guide_reads gr WHERE gr.guide_id = g.id) AS read_count,
                 EXISTS (SELECT 1 FROM guide_reads gr2 WHERE gr2.guide_id = g.id AND gr2.user_id = ${c.meId}) AS my_read
          FROM guides g
          WHERE g.team_id = ${c.teamId} AND g.category_id = ${parseInt(categoryId)}
          ORDER BY g.updated_at DESC`
      : await sql`
          SELECT g.id, g.title, g.category_id, g.content, g.checklist, g.updated_at, g.approved, g.submitted_by, g.product_id,
                 g.require_read,
                 (SELECT COUNT(*)::int FROM guide_reads gr WHERE gr.guide_id = g.id) AS read_count,
                 EXISTS (SELECT 1 FROM guide_reads gr2 WHERE gr2.guide_id = g.id AND gr2.user_id = ${c.meId}) AS my_read
          FROM guides g
          WHERE g.team_id = ${c.teamId}
          ORDER BY g.updated_at DESC`;
  } catch {
    rows = categoryId
      ? await sql`
          SELECT id, title, category_id, content, checklist, updated_at
          FROM guides
          WHERE team_id = ${c.teamId} AND category_id = ${parseInt(categoryId)}
          ORDER BY updated_at DESC`
      : await sql`
          SELECT id, title, category_id, content, checklist, updated_at
          FROM guides
          WHERE team_id = ${c.teamId}
          ORDER BY updated_at DESC`;
  }
  // Pending proposals: employer sees them (to approve), the author sees their own.
  rows = rows.filter((g: any) => g.approved !== false || c.role === 'employer' || g.submitted_by === c.meId);

  const guides = rows.map((g: any) => ({
    id: g.id,
    title: g.title,
    categoryId: g.category_id,
    updatedAt: g.updated_at,
    approved: g.approved !== false,
    submittedBy: g.submitted_by ?? null,
    requireRead: g.require_read === true,
    readCount: Number(g.read_count) || 0,
    myRead: g.my_read === true,
    excerpt: excerpt(g.content),
    hasChecklist: checklistLength(g.checklist) > 0,
    productId: g.product_id ?? null,
  }));

  return NextResponse.json({ guides });
}

// POST (employer) — create guide
export async function POST(request: Request) {
  const c = await ctx();
  if (!c) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (c.role === 'kiosk') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  // Employees may PROPOSE a guide — it waits for the employer's approval.
  const isProposal = c.role !== 'employer';
  if (!c.teamId) return NextResponse.json({ error: 'Tým nenalezen' }, { status: 404 });

  const body = await request.json();
  const { title, content, categoryId, checklist } = body;
  const productId = body.productId ? String(body.productId).trim().slice(0, 120) : null;
  const productName = body.productName ? String(body.productName).trim().slice(0, 160) : null;
  if (!title || !String(title).trim()) return NextResponse.json({ error: 'Název je povinný' }, { status: 400 });

  const steps = normalizeChecklist(checklist);

  let guide: any;
  try {
    [guide] = await sql`
    INSERT INTO guides (team_id, category_id, title, content, checklist, created_by, updated_at, approved, submitted_by)
    VALUES (
      ${c.teamId},
      ${categoryId ? parseInt(categoryId) : null},
      ${String(title).trim()},
      ${content || ''},
      ${JSON.stringify(steps)},
      ${c.meId},
      NOW(),
      ${!isProposal},
      ${isProposal ? c.meId : null}
    )
    RETURNING id, title, category_id, content, checklist, updated_at`;
    if (productId && guide?.id) {
      // Sloupce jsou novější — když chybí, návod se uloží i tak, jen bez vazby.
      try {
        await sql`UPDATE guides SET product_id = ${productId}, product_name = ${productName} WHERE id = ${guide.id}`;
      } catch { /* migrace ještě neproběhla */ }
    }
  } catch {
    // approval columns not migrated yet — insert the old shape (auto-approved)
    [guide] = await sql`
    INSERT INTO guides (team_id, category_id, title, content, checklist, created_by, updated_at)
    VALUES (
      ${c.teamId},
      ${categoryId ? parseInt(categoryId) : null},
      ${String(title).trim()},
      ${content || ''},
      ${JSON.stringify(steps)},
      ${c.meId},
      NOW()
    )
    RETURNING *`;
  }


  if (isProposal) {
    try {
      const employers = await sql`SELECT id FROM users WHERE team_id = ${c.teamId} AND role = 'employer'`;
      const [author] = await sql`SELECT name FROM users WHERE id = ${c.meId}`;
      await notifyUsers((employers as any[]).map(e => e.id), {
        title: '📖 Návrh návodu ke schválení',
        body: `${author?.name ?? 'Zaměstnanec'} navrhuje návod „${String(title).trim()}".`,
        type: 'info',
        link: '/employer/overview?view=guides',
      });
    } catch { /* best-effort */ }
  }

  return NextResponse.json({
    guide: {
      id: guide.id,
      title: guide.title,
      categoryId: guide.category_id,
      updatedAt: guide.updated_at,
      excerpt: excerpt(guide.content),
      hasChecklist: checklistLength(guide.checklist) > 0,
    },
  });
}
