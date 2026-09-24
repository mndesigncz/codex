import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { sanitizeSteps } from '@/lib/steps';
import { notifyUsers } from '@/lib/push';
import { pragueToday } from '@/lib/pragueTime';
import { pozaduj, jeOdpoved, clenoveSOpravnenim } from '@/lib/opravneniDb';

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

// GET: list the team's procedures
export async function GET() {
  const c = await pozaduj('postupy.zobrazit');
  if (jeOdpoved(c)) return c;
  const me = { id: c.meId, teamId: c.teamId };

  let procedures: any[];
  try {
    procedures = await sql`
      SELECT id, name, description, icon, color, items,
             remind_at AS "remindAt", remind_days AS "remindDays", remind_anchor AS "remindAnchor",
             require_before_closing AS "requireBeforeClosing",
             approved, submitted_by AS "submittedBy"
      FROM procedures WHERE team_id = ${me.teamId} ORDER BY created_at ASC`;
  } catch {
   try {
    procedures = await sql`
      SELECT id, name, description, icon, color, items,
             remind_at AS "remindAt", remind_days AS "remindDays", remind_anchor AS "remindAnchor"
      FROM procedures WHERE team_id = ${me.teamId} ORDER BY created_at ASC`;
   } catch {
    procedures = await sql`
      SELECT id, name, description, icon, color, items,
             remind_at AS "remindAt", remind_days AS "remindDays"
      FROM procedures WHERE team_id = ${me.teamId} ORDER BY created_at ASC`;
   }
  }

  // Neschválené návrhy vidí jen ten, kdo je smí schválit — nikdo jiný
  // neschválený postup nespouští. Dřívější kód chtěl pustit i autora, ale
  // testoval p.submitted_by, zatímco sloupec se vrací jako "submittedBy",
  // takže autor svůj návrh v seznamu nikdy neviděl. Převod na oprávnění
  // (kolo 67) chování nemění; zda autorovi návrh ukázat, je samostatné
  // rozhodnutí (UI pro spouštění s neschváleným postupem nepočítá).
  const schvaluje = c.role.opravneni.has('postupy.schvalovat');
  procedures = (procedures as any[]).filter((p: any) => p.approved !== false || schvaluje);

  // Does the current user work today? (kiosk = shared device, always yes.)
  // Tablet je typ účtu, ne oprávnění — pro sdílené zařízení „směna" nemá smysl.
  const today = pragueToday();
  let hasShiftToday = c.role.typ === 'kiosk';
  if (!hasShiftToday) {
    try {
      const [sh] = await sql`SELECT id FROM shifts WHERE employee_id = ${me.id} AND date = ${today} LIMIT 1`;
      hasShiftToday = !!sh;
    } catch { /* ignore */ }
  }

  // Today's opening hours (for open/close-anchored reminders).
  let openingToday: { open: string; close: string; closed: boolean } = { open: '08:00', close: '20:00', closed: false };
  try {
    const [team] = await sql`SELECT opening_hours FROM teams WHERE id = ${me.teamId}`;
    const oh = team?.opening_hours;
    const wd = String((new Date(today + 'T00:00:00').getDay() + 6) % 7);
    if (oh && oh[wd]) openingToday = oh[wd];
  } catch { /* ignore */ }

  return NextResponse.json({ procedures, hasShiftToday, openingToday });
}

// POST: založit postup (postupy.vytvorit), nebo jen navrhnout
// (postupy.navrhnout) — návrh čeká na schválení.
export async function POST(request: Request) {
  const c = await pozaduj(['postupy.vytvorit', 'postupy.navrhnout']);
  if (jeOdpoved(c)) return c;
  const me = { id: c.meId, teamId: c.teamId };
  const isProposal = !c.role.opravneni.has('postupy.vytvorit');

  const body = await request.json().catch(() => ({}));
  const name = String(body.name ?? '').trim();
  const description = body.description ? String(body.description).trim() : null;
  const icon = body.icon ? String(body.icon) : 'check';
  const color = body.color ? String(body.color) : 'lime';
  const items = sanitizeSteps(body.items);

  const remindAnchor = ['open', 'close', 'time'].includes(body.remindAnchor) ? body.remindAnchor : 'time';
  // For open/close anchors the fixed time is irrelevant.
  const remindAt = remindAnchor === 'time' ? parseRemindAt(body.remindAt) : null;
  const remindDays = parseRemindDays(body.remindDays);

  if (!name) return NextResponse.json({ error: 'Zadejte název postupu' }, { status: 400 });
  if (items.length === 0) return NextResponse.json({ error: 'Přidejte alespoň jeden krok' }, { status: 400 });

  let created: any;
  try {
    [created] = await sql`
      INSERT INTO procedures (team_id, name, description, icon, color, items, remind_at, remind_days, remind_anchor, require_before_closing, created_by, approved, submitted_by)
      VALUES (${me.teamId}, ${name}, ${description}, ${icon}, ${color}, ${JSON.stringify(items)}, ${remindAt}, ${JSON.stringify(remindDays)}, ${remindAnchor}, ${body.requireBeforeClosing === true && !isProposal}, ${me.id}, ${!isProposal}, ${isProposal ? me.id : null})
      RETURNING id, name, description, icon, color, items, remind_at AS "remindAt", remind_days AS "remindDays", remind_anchor AS "remindAnchor", require_before_closing AS "requireBeforeClosing", approved, submitted_by AS "submittedBy"`;
  } catch {
    [created] = await sql`
      INSERT INTO procedures (team_id, name, description, icon, color, items, remind_at, remind_days, created_by)
      VALUES (${me.teamId}, ${name}, ${description}, ${icon}, ${color}, ${JSON.stringify(items)}, ${remindAt}, ${JSON.stringify(remindDays)}, ${me.id})
      RETURNING id, name, description, icon, color, items, remind_at AS "remindAt", remind_days AS "remindDays"`;
  }

  if (isProposal) {
    try {
      // Kolo 62: podle členství, ne zrcadla. Kolo 67: návrh dostane ten,
      // kdo ho smí schválit.
      const employers = await clenoveSOpravnenim(me.teamId, 'postupy.schvalovat');
      const [author] = await sql`SELECT name FROM users WHERE id = ${me.id}`;
      await notifyUsers(employers, {
        title: '📋 Návrh postupu ke schválení',
        body: `${author?.name ?? 'Zaměstnanec'} navrhuje postup „${name}".`,
        type: 'info',
        link: '/employer/overview?view=procedures',
      });
    } catch { /* best-effort */ }
  }

  return NextResponse.json({ procedure: created });
}
