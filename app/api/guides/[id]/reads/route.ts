// Kdo návod přečetl a kdo ne.
//
// Vedení dosud vidělo u povinného čtení jen číslo („3×"). Z čísla se nedá
// zjistit, komu připomenout — a povinné čtení, u kterého nejde zjistit, kdo
// chybí, je jen odznak. Odsud jdou obě skupiny jménem.
//
// Čte jen ten, kdo řídí povinné čtení (navody.povinne_cteni): kdo co
// přečetl je informace o lidech, ne o návodu.

import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await pozaduj('navody.povinne_cteni');
  if (jeOdpoved(c)) return c;
  const me = { team_id: c.teamId };

  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  // Návod musí patřit týmu — jinak by šlo číst docházku cizího podniku.
  const [guide] = await sql`SELECT id FROM guides WHERE id = ${id} AND team_id = ${me.team_id}`;
  if (!guide) return NextResponse.json({ error: 'Návod nenalezen' }, { status: 404 });

  try {
    // Tablet se nepočítá: potvrzení čtení je osobní a sdílený účet ho nemá
    // jak udělat (API mu to zakazuje), takže by navždy visel mezi nepřečtenými.
    // Kolo 62: lidé podle členství NEBO zrcadla, pozice z členství v tomhle
    // podniku — člen přepnutý jinam by zmizel z „nepřečteno" a povinné čtení
    // by se u něj nikdy nevymáhalo.
    const rows = await sql`
      SELECT u.id, u.name, u.avatar, COALESCE(m.job_title, u.job_title) AS "jobTitle",
             gr.read_at AS "readAt"
      FROM users u
      LEFT JOIN team_members m ON m.user_id = u.id AND m.team_id = ${me.team_id}
      LEFT JOIN guide_reads gr ON gr.user_id = u.id AND gr.guide_id = ${id}
      WHERE (m.user_id IS NOT NULL OR u.team_id = ${me.team_id})
        AND COALESCE(m.role, u.role) IN ('employer', 'employee')
      ORDER BY (gr.read_at IS NULL) DESC, u.name ASC`;
    const lidi = (rows as any[]).map(r => ({
      id: Number(r.id), name: String(r.name ?? ''), avatar: r.avatar ?? '👤',
      jobTitle: r.jobTitle ?? null, readAt: r.readAt ?? null,
    }));
    return NextResponse.json({
      read: lidi.filter(p => p.readAt != null),
      unread: lidi.filter(p => p.readAt == null),
    });
  } catch {
    return NextResponse.json({ read: [], unread: [] });
  }
}
