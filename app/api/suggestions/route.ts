import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Kontext volajícího z brány oprávnění (aktivní podnik z databáze).
async function ctx() {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  let name = '';
  try { const [u] = await sql`SELECT name FROM users WHERE id = ${c.meId}`; name = String(u?.name ?? ''); } catch { /* jméno je jen do upozornění */ }
  return { meId: c.meId, teamId: c.teamId, name, opr: c.role.opravneni };
}

// GET — the whole team's suggestions, newest-relevant first, with vote counts
// and whether the current user has voted. Kdo nemá napady.pridat (tablet),
// dostane prázdný seznam jako dřív, ne chybu — nástěnka se u něj nemá lámat.
export async function GET() {
  const c = await ctx();
  if (jeOdpoved(c)) return c;
  if (!c.opr.has('napady.pridat')) return NextResponse.json({ suggestions: [], isEmployer: false, meId: c.meId });
  // `isEmployer` řídí v UI správu podnětů (stav, do plánování, mazání cizích).
  const spravuje = c.opr.has('napady.spravovat');
  try {
    const rows = await sql`
      SELECT s.id, s.title, s.content, s.status, s.author_id AS "authorId",
             s.created_at AS "createdAt",
             u.name AS "authorName", u.avatar AS "authorAvatar",
             COUNT(v.user_id)::int AS votes,
             BOOL_OR(v.user_id = ${c.meId}) AS "hasVoted"
      FROM suggestions s
      LEFT JOIN users u ON u.id = s.author_id
      LEFT JOIN suggestion_votes v ON v.suggestion_id = s.id
      WHERE s.team_id = ${c.teamId}
      GROUP BY s.id, u.name, u.avatar
      ORDER BY
        CASE s.status WHEN 'new' THEN 0 WHEN 'planned' THEN 1 WHEN 'done' THEN 2 ELSE 3 END,
        COUNT(v.user_id) DESC,
        s.created_at DESC`;
    return NextResponse.json({
      suggestions: rows,
      isEmployer: spravuje,
      meId: c.meId,
    });
  } catch {
    // table not migrated yet
    return NextResponse.json({ suggestions: [], isEmployer: spravuje, meId: c.meId });
  }
}

// POST — podnět podá kdokoli s napady.pridat; dozví se o něm ti, kdo podněty spravují.
export async function POST(req: NextRequest) {
  const c = await ctx();
  if (jeOdpoved(c)) return c;
  if (!c.opr.has('napady.pridat')) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const b = await req.json().catch(() => ({}));
  const title = String(b.title ?? '').trim();
  const content = String(b.content ?? '').trim();
  if (!title) return NextResponse.json({ error: 'Napiš krátký název podnětu.' }, { status: 400 });
  if (title.length > 160) return NextResponse.json({ error: 'Název je moc dlouhý (max 160 znaků).' }, { status: 400 });
  if (content.length > 2000) return NextResponse.json({ error: 'Popis je moc dlouhý (max 2000 znaků).' }, { status: 400 });

  const [row] = await sql`
    INSERT INTO suggestions (team_id, author_id, title, content)
    VALUES (${c.teamId}, ${c.meId}, ${title}, ${content || null})
    RETURNING id, title, content, status, author_id AS "authorId", created_at AS "createdAt"`;

  // Upozornit ty, kdo podněty spravují (kromě autora samotného).
  try {
    // Kolo 62: podle členství — provozovatel přepnutý jinam podnět dostane.
    // Kolo 67: příjemce určuje napady.spravovat, ne typ účtu.
    const employers = (await clenoveSOpravnenim(c.teamId, 'napady.spravovat')).filter(id => id !== c.meId);
    if (employers.length) {
      await notifyUsers(employers, {
        title: '💡 Nový podnět na vylepšení',
        body: `${c.name ?? 'Někdo'}: ${title.length > 100 ? title.slice(0, 97) + '…' : title}`,
        type: 'info',
        link: '/employer/overview?view=suggestions',
      });
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, suggestion: row });
}
