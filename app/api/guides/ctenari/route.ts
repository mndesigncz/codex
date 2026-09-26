// Povinné čtení po návodech najednou — pro widget „Kdo nečetl" (kolo 69, balík B6b).
//
// Čtečka má /api/guides/{id}/reads po jednom návodu. Widget ale ukazuje
// všechny povinné návody naráz („3 z 8 přečetlo") a dotaz na každý návod
// zvlášť by z plochy udělal deset požadavků. Tady je to jeden dotaz se stejným
// pravidlem jako u čtečky: lidé podle členství NEBO zrcadla, jen vedení
// a zaměstnanci (tablet potvrzovat neumí, visel by navždy mezi nepřečtenými).
//
// Čte jen ten, kdo řídí povinné čtení (navody.povinne_cteni): kdo co přečetl,
// je informace o lidech, ne o návodu.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const c = await pozaduj('navody.povinne_cteni');
  if (jeOdpoved(c)) return c;
  const teamId = c.teamId;

  try {
    const [navody, lide, precteni] = await Promise.all([
      sql`SELECT id, title FROM guides
          WHERE team_id = ${teamId} AND require_read = true AND approved IS NOT FALSE
          ORDER BY updated_at DESC`,
      sql`SELECT u.id, u.name, u.avatar
          FROM users u
          LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${teamId}
          WHERE (m.user_id IS NOT NULL OR u.team_id = ${teamId})
            AND COALESCE(m.role, u.role) IN ('employer', 'employee')
          ORDER BY u.name ASC`,
      sql`SELECT gr.guide_id, gr.user_id
          FROM guide_reads gr
          JOIN guides g ON g.id = gr.guide_id
          WHERE g.team_id = ${teamId} AND g.require_read = true`,
    ]);
    const cetl = new Set((precteni as any[]).map(r => `${r.guide_id}:${r.user_id}`));
    const clenove = (lide as any[]).map(u => ({ id: Number(u.id), name: String(u.name ?? ''), avatar: u.avatar ?? null }));
    const guides = (navody as any[]).map(g => {
      const neprecetli = clenove.filter(u => !cetl.has(`${g.id}:${u.id}`));
      return { id: Number(g.id), title: String(g.title ?? ''), precetlo: clenove.length - neprecetli.length, celkem: clenove.length, neprecetli };
    });
    return NextResponse.json({ guides });
  } catch {
    // Prázdný seznam by se četl jako „všichni přečetli" — přesný opak. Radši chyba.
    return NextResponse.json({ error: 'Povinné čtení se nepodařilo načíst.' }, { status: 503 });
  }
}
