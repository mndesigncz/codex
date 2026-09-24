import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
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

// PATCH: schválit návrh (postupy.schvalovat), nebo upravit postup
// (postupy.upravit). Brána pustí kohokoli s jedním z nich, akce se ověří níž.
export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await pozaduj(['postupy.upravit', 'postupy.schvalovat']);
  if (jeOdpoved(c)) return c;
  const me = { id: c.meId, teamId: c.teamId };
  const zakazano = () => NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id, team_id FROM procedures WHERE id = ${id}`;
  if (!existing || Number(existing.team_id) !== me.teamId) {
    return NextResponse.json({ error: 'Postup nenalezen' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));

  // Approving an employee proposal is its own lightweight action.
  if (body.approve === true) {
    if (!c.role.opravneni.has('postupy.schvalovat')) return zakazano();
    try {
      const [row] = await sql`
        UPDATE procedures SET approved = TRUE
        WHERE id = ${id} AND team_id = ${me.teamId}
        RETURNING id, submitted_by`;
      if (!row) return NextResponse.json({ error: 'Postup nenalezen' }, { status: 404 });
      if (row.submitted_by) {
        try {
          await notifyUser(row.submitted_by, {
            title: 'Tvůj postup byl schválen ✓',
            body: 'Návrh postupu je schválený a platí pro celý tým.',
            type: 'info',
            link: '/employee/shifts?view=procedures',
          });
        } catch { /* best-effort */ }
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Schválení není dostupné — spusť /api/init.' }, { status: 400 });
    }
  }
  if (!c.role.opravneni.has('postupy.upravit')) return zakazano();
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
          remind_at = ${remindAt}, remind_days = ${JSON.stringify(remindDays)}, remind_anchor = ${remindAnchor},
          require_before_closing = ${body.requireBeforeClosing === true}
      WHERE id = ${id}
      RETURNING id, name, description, icon, color, items, remind_at AS "remindAt", remind_days AS "remindDays", remind_anchor AS "remindAnchor", require_before_closing AS "requireBeforeClosing"`;
  } catch {
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
  }

  return NextResponse.json({ procedure: updated });
}

// DELETE: smazat postup (postupy.mazat)
export async function DELETE(_request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const c = await pozaduj('postupy.mazat');
  if (jeOdpoved(c)) return c;
  const me = { id: c.meId, teamId: c.teamId };

  const id = parseInt(params.id);
  const [existing] = await sql`SELECT id, team_id FROM procedures WHERE id = ${id}`;
  if (!existing || Number(existing.team_id) !== me.teamId) {
    return NextResponse.json({ error: 'Postup nenalezen' }, { status: 404 });
  }

  await sql`DELETE FROM procedures WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
