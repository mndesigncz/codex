import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';
import { clenovePodniku } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Připnutá oznámení čte každý člen (i tablet); psát, upravovat a vidět
// archiv smí jen ten, kdo nástěnku spravuje (oznameni.spravovat).
async function ctx(klic: string | null = null) {
  const c = await pozaduj(klic);
  if (jeOdpoved(c)) return c;
  return { meId: c.meId, teamId: c.teamId, opr: c.role.opravneni };
}

// GET — pinned announcements for the team (everyone incl. kiosk).
export async function GET() {
  const c = await ctx();
  if (jeOdpoved(c)) return c;
  try {
    // Připnutá vždycky všechna, odepnutá jen posledních deset.
    //
    // Dřív to bylo jedno `ORDER BY created_at DESC LIMIT 10` přes obojí,
    // takže deset čerstvě odepnutých vzkazů vytlačilo připnuté oznámení,
    // které má tým pořád vidět — ze správy nástěnky prostě zmizelo.
    const pinned = await sql`
      SELECT a.id, a.content, a.pinned, a.created_at AS "createdAt",
             u.name AS "authorName", u.avatar AS "authorAvatar"
      FROM announcements a
      LEFT JOIN users u ON u.id = a.author_id
      WHERE a.team_id = ${c.teamId} AND a.pinned = TRUE
      ORDER BY a.created_at DESC`;
    if (!c.opr.has('oznameni.spravovat')) return NextResponse.json({ announcements: pinned });

    const archived = await sql`
      SELECT a.id, a.content, a.pinned, a.created_at AS "createdAt",
             u.name AS "authorName", u.avatar AS "authorAvatar"
      FROM announcements a
      LEFT JOIN users u ON u.id = a.author_id
      WHERE a.team_id = ${c.teamId} AND a.pinned = FALSE
      ORDER BY a.created_at DESC
      LIMIT 10`;
    return NextResponse.json({ announcements: [...pinned, ...archived] });
  } catch {
    // table not migrated yet
    return NextResponse.json({ announcements: [] });
  }
}

// POST (oznameni.spravovat) — pin a new announcement; notifies the whole team.
export async function POST(req: NextRequest) {
  const c = await ctx('oznameni.spravovat');
  if (jeOdpoved(c)) return c;

  const b = await req.json().catch(() => ({}));
  const content = String(b.content ?? '').trim();
  if (!content) return NextResponse.json({ error: 'Napiš text oznámení.' }, { status: 400 });
  if (content.length > 1000) return NextResponse.json({ error: 'Oznámení je moc dlouhé (max 1000 znaků).' }, { status: 400 });

  const [row] = await sql`
    INSERT INTO announcements (team_id, author_id, content)
    VALUES (${c.teamId}, ${c.meId}, ${content})
    RETURNING id, content, pinned, created_at AS "createdAt"`;

  try {
    // Kolo 62: příjemci podle členství, ne zrcadla — člen přepnutý do jiného
    // podniku oznámení dostane; role (a tím odkaz v push) je z TOHOTO podniku.
    const members = await clenovePodniku(c.teamId, { role: 'lide', krome: c.meId });
    const body = content.length > 120 ? content.slice(0, 117) + '…' : content;
    // Odkaz podle typu účtu příjemce — ten určuje, které rozhraní se mu otevře.
    const emp = members.filter(m => m.role === 'employer').map(m => m.id);
    const ees = members.filter(m => m.role !== 'employer').map(m => m.id);
    if (ees.length) await notifyUsers(ees, { title: '📌 Nové oznámení', body, type: 'info', link: '/employee/shifts' });
    if (emp.length) await notifyUsers(emp, { title: '📌 Nové oznámení', body, type: 'info', link: '/employer/overview' });

    // Optionally mirror the announcement into the team chat, so it also lives
    // where the conversation happens.
    if (b.postToChat === true) {
      try {
        const [conv] = await sql`SELECT id FROM conversations WHERE team_id = ${c.teamId} AND type = 'team' LIMIT 1`;
        if (conv) {
          await sql`
            INSERT INTO chat_messages (conversation_id, sender_id, content)
            VALUES (${conv.id}, ${c.meId}, ${'📌 ' + content})`;
        }
      } catch { /* chat mirror is best-effort */ }
    }
  } catch { /* best-effort */ }

  return NextResponse.json({ ok: true, announcement: row });
}

// DELETE ?id= (oznameni.spravovat) — unpin/remove an announcement.
// PATCH — edit the text or unpin/pin: { id, content?, pinned? }. oznameni.spravovat.
export async function PATCH(req: NextRequest) {
  const c = await ctx('oznameni.spravovat');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  try {
    if (typeof b.content === 'string' && b.content.trim()) {
      await sql`UPDATE announcements SET content = ${b.content.trim().slice(0, 2000)} WHERE id = ${id} AND team_id = ${c.teamId}`;
    }
    if (typeof b.pinned === 'boolean') {
      await sql`UPDATE announcements SET pinned = ${b.pinned} WHERE id = ${id} AND team_id = ${c.teamId}`;
    }
    const [row] = await sql`SELECT id, content, pinned, created_at AS "createdAt" FROM announcements WHERE id = ${id} AND team_id = ${c.teamId}`;
    if (!row) return NextResponse.json({ error: 'Oznámení nenalezeno' }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: 'Uložení se nepodařilo' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const c = await ctx('oznameni.spravovat');
  if (jeOdpoved(c)) return c;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  await sql`DELETE FROM announcements WHERE id = ${id} AND team_id = ${c.teamId}`;
  return NextResponse.json({ ok: true });
}
