// Vyřízení nahlášení vedením: odstranit obsah, označit za vyřízené, zamítnout.
// Smí jen ten, kdo smí odebírat členy (tym.odebrat), a jen u nahlášení svého podniku.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { stavPoAkci } from '@/lib/moderace';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  const reportId = parseInt(id);
  if (!Number.isInteger(reportId) || reportId <= 0) return NextResponse.json({ error: 'Neplatné nahlášení.' }, { status: 400 });
  const c = await pozaduj('tym.odebrat');
  if (jeOdpoved(c)) return c;
  const body = await request.json().catch(() => ({}));
  const novyStav = stavPoAkci(body?.akce);
  if (!novyStav) return NextResponse.json({ error: 'Neznámá akce.' }, { status: 400 });
  try {
    const [r] = await sql`SELECT id, kind, ref_id, status FROM content_reports WHERE id = ${reportId} AND team_id = ${c.teamId}`;
    if (!r) return NextResponse.json({ error: 'Nahlášení nenalezeno.' }, { status: 404 });
    if (novyStav === 'removed') {
      // Smaže se jen obsah TOHOHLE podniku; u zprávy se ověří vlákno podniku.
      if (r.kind === 'zprava') {
        await sql`DELETE FROM chat_messages WHERE id = ${r.ref_id} AND conversation_id IN (SELECT id FROM conversations WHERE team_id = ${c.teamId})`;
      } else if (r.kind === 'napad') {
        await sql`DELETE FROM suggestion_votes WHERE suggestion_id = ${r.ref_id} AND suggestion_id IN (SELECT id FROM suggestions WHERE team_id = ${c.teamId})`;
        await sql`DELETE FROM suggestions WHERE id = ${r.ref_id} AND team_id = ${c.teamId}`;
      }
    }
    await sql`UPDATE content_reports SET status = ${novyStav}, resolved_by = ${c.meId}, resolved_at = NOW() WHERE id = ${reportId} AND team_id = ${c.teamId}`;
    await audit(c.teamId, c.meId, 'nahlaseni.vyreseno', 'content_report', reportId, novyStav);
    return NextResponse.json({ ok: true, status: novyStav });
  } catch (e) {
    console.error('vyřízení nahlášení selhalo', e);
    return NextResponse.json({ error: 'Nahlášení se nepodařilo vyřídit.' }, { status: 500 });
  }
}
