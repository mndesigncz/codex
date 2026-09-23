import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { tymyCiselniku } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function context() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  return { meId, role, teamId: u?.team_id as number | undefined };
}

/**
 * Řádek s tímhle id sice není můj, ale vidím ho ze zdrojového podniku
 * organizace (kolo 60). Zápis dál nesmí projít — jen ať hláška říká, kdo ho
 * spravuje, místo matoucího „nenalezena".
 */
async function spravujeJinyPodnik(id: number, teamId: number): Promise<string | null> {
  const tymy = await tymyCiselniku(teamId, 'typySmen');
  if (tymy.length < 2) return null;
  try {
    const [r] = await sql`
      SELECT t.name FROM shift_types s JOIN teams t ON t.id = s.team_id
      WHERE s.id = ${id} AND s.team_id = ANY(${tymy}) AND s.team_id <> ${teamId}`;
    return r ? String(r.name ?? 'jiný podnik') : null;
  } catch { return null; }
}

function mapRow(r: any) {
  return {
    id: r.id,
    name: r.name,
    startTime: r.start_time,
    endTime: r.end_time,
    color: r.color,
    position: r.position,
    startsAtOpen: !!r.starts_at_open,
    endsAtClose: !!r.ends_at_close,
  };
}

// PATCH (employer) — { name?, startTime?, endTime?, color? }
export async function PATCH(req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const id = parseInt(params.id);
  if (!id) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [existing] = await sql`SELECT * FROM shift_types WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  if (!existing) {
    const cizi = await spravujeJinyPodnik(id, ctx.teamId);
    if (cizi) return NextResponse.json({ error: `Tohle spravuje podnik ${cizi} — upraví to jeho vedení.` }, { status: 403 });
    return NextResponse.json({ error: 'Směna nenalezena' }, { status: 404 });
  }

  const body = await req.json();
  const name: string = body.name != null ? String(body.name).trim() : existing.name;
  const startTime: string = body.startTime ?? existing.start_time;
  const endTime: string = body.endTime ?? existing.end_time;
  const color: string = body.color ?? existing.color;

  if (!name) return NextResponse.json({ error: 'Chybí název směny' }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: 'Neplatný čas' }, { status: 400 });
  }

  const startsAtOpen = body.startsAtOpen != null ? !!body.startsAtOpen : !!existing.starts_at_open;
  const endsAtClose = body.endsAtClose != null ? !!body.endsAtClose : !!existing.ends_at_close;

  let row: any;
  try {
    [row] = await sql`
      UPDATE shift_types
      SET name = ${name}, start_time = ${startTime}, end_time = ${endTime}, color = ${color},
          starts_at_open = ${startsAtOpen}, ends_at_close = ${endsAtClose}
      WHERE id = ${id} AND team_id = ${ctx.teamId}
      RETURNING id, team_id, name, start_time, end_time, color, position, starts_at_open, ends_at_close`;
  } catch {
    [row] = await sql`
      UPDATE shift_types
      SET name = ${name}, start_time = ${startTime}, end_time = ${endTime}, color = ${color}
      WHERE id = ${id} AND team_id = ${ctx.teamId}
      RETURNING id, team_id, name, start_time, end_time, color, position`;
  }
  return NextResponse.json({ shiftType: mapRow(row) });
}

// DELETE (employer)
export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const ctx = await context();
  if (!ctx) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (ctx.role !== 'employer') return NextResponse.json({ error: 'Pouze pro zaměstnavatele' }, { status: 403 });
  if (!ctx.teamId) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });

  const id = parseInt(params.id);
  if (!id) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  const [existing] = await sql`SELECT id FROM shift_types WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  if (!existing) {
    const cizi = await spravujeJinyPodnik(id, ctx.teamId);
    if (cizi) return NextResponse.json({ error: `Tohle spravuje podnik ${cizi} — smaže to jeho vedení.` }, { status: 403 });
    // Už smazaný typ: mazání zůstává idempotentní jako dosud.
    return NextResponse.json({ ok: true });
  }

  // Pevné dny ve vlastním podniku se s typem ruší jako dosud.
  await sql`DELETE FROM fixed_assignments WHERE shift_type_id = ${id} AND team_id = ${ctx.teamId}`;
  // Záměrná výjimka z „zápis jen s team_id = můj" (kolo 60): řádek typu je
  // ověřený jako můj a id je globální SERIAL, takže `shift_type_id = id` jsou
  // přesně pevné dny, které na něj ukazují — i v ostatních podnicích
  // organizace, které ho měly sdílený. Bez tohohle by jim zůstal ukazatel do
  // prázdna. Jejich řádky nemažeme, jen odpojíme typ; podnik si pak den
  // přiřadí znovu.
  await sql`UPDATE fixed_assignments SET shift_type_id = NULL WHERE shift_type_id = ${id}`;
  await sql`DELETE FROM shift_types WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  return NextResponse.json({ ok: true });
}
