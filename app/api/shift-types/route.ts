import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { ciselnikPodniku } from '@/lib/tenant';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Typy směn čte každý člen — zaměstnanec podle nich vyplňuje dostupnost
// (AvailabilitySubmit). Zakládat a měnit je patří k nastavení rozvrhu.

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

// GET — typy směn podniku; se sdílenými číselníky (kolo 60) i typy zdrojového
// podniku organizace, vlastní první. Časy „od otevření / do zavření" se
// překládají až při generování proti otevírací době KAŽDÉHO podniku, takže
// jedna definice sedí všem.
export async function GET() {
  const ctx = await pozaduj(null);
  if (jeOdpoved(ctx)) return ctx;

  // Zdroj vidí jen své řádky, ale má vědět, že úprava se propíše do celé
  // organizace — proto chip „sdíleno". Název zdroje pro „Spravuje: …" vidí
  // každý člen organizace i v seznamu podniků, takže tím nic neprozrazujeme.
  const { tymy, jsemZdroj, spravuje } = await ciselnikPodniku(ctx.teamId, 'typySmen');
  let rows: any[];
  try {
    rows = await sql`
      SELECT id, team_id, name, start_time, end_time, color, position, starts_at_open, ends_at_close
      FROM shift_types WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${ctx.teamId}) DESC, position ASC, id ASC`;
  } catch {
    rows = await sql`
      SELECT id, team_id, name, start_time, end_time, color, position
      FROM shift_types WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${ctx.teamId}) DESC, position ASC, id ASC`;
  }
  return NextResponse.json({
    shiftTypes: rows.map(r => {
      const zOrganizace = Number(r.team_id) !== ctx.teamId;
      return { ...mapRow(r), zOrganizace, sdileno: !zOrganizace && jsemZdroj, spravuje: zOrganizace ? spravuje : null };
    }),
  });
}

// POST (employer) — { name, startTime, endTime, color? }
export async function POST(req: Request) {
  const ctx = await pozaduj('rozvrh.nastaveni');
  if (jeOdpoved(ctx)) return ctx;

  const body = await req.json();
  const name: string = (body.name ?? '').trim();
  const startTime: string = body.startTime;
  const endTime: string = body.endTime;
  const color: string = body.color ?? '#C8F542';

  if (!name) return NextResponse.json({ error: 'Chybí název směny' }, { status: 400 });
  if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
    return NextResponse.json({ error: 'Neplatný čas' }, { status: 400 });
  }

  const [{ max }] = await sql`SELECT COALESCE(MAX(position), -1) AS max FROM shift_types WHERE team_id = ${ctx.teamId}`;
  const position = Number(max) + 1;
  const startsAtOpen = !!body.startsAtOpen;
  const endsAtClose = !!body.endsAtClose;

  let row: any;
  try {
    [row] = await sql`
      INSERT INTO shift_types (team_id, name, start_time, end_time, color, position, starts_at_open, ends_at_close)
      VALUES (${ctx.teamId}, ${name}, ${startTime}, ${endTime}, ${color}, ${position}, ${startsAtOpen}, ${endsAtClose})
      RETURNING id, team_id, name, start_time, end_time, color, position, starts_at_open, ends_at_close`;
  } catch {
    [row] = await sql`
      INSERT INTO shift_types (team_id, name, start_time, end_time, color, position)
      VALUES (${ctx.teamId}, ${name}, ${startTime}, ${endTime}, ${color}, ${position})
      RETURNING id, team_id, name, start_time, end_time, color, position`;
  }
  return NextResponse.json({ shiftType: mapRow(row) });
}
