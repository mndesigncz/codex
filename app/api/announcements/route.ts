import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { notifyUsers } from '@/lib/push';
import { clenovePodniku } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { resolveActingUser } from '@/lib/kioskActing';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Připnutá oznámení čte každý člen (i tablet); psát, upravovat a vidět
// archiv smí jen ten, kdo nástěnku spravuje (oznameni.spravovat).
//
// Kolo 8: oznámení může vyžadovat potvrzení („Rozumím"). Potvrzení se
// zapisují do announcement_reads; vedení vidí „Přečteno 5 z 8", kdo
// potvrdil a kdy, a může zbylým připomenout pushem. Na tabletu se
// potvrzuje za člověka vybraného PINem (actingAs jako u úkolů).
async function ctx(klic: string | null = null) {
  const c = await pozaduj(klic);
  if (jeOdpoved(c)) return c;
  return { meId: c.meId, teamId: c.teamId, opr: c.role.opravneni, typ: c.role.typ };
}

/** Lidé, kteří mají oznámení potvrzovat: členové podniku bez tabletu. */
const ctenari = (teamId: number) => clenovePodniku(teamId, { role: 'lide' });

// GET — pinned announcements for the team (everyone incl. kiosk).
// ?actingAs= (tablet): stav potvrzení za člověka u tabletu; ?cteni=<id> (oznameni.spravovat): kdo potvrdil a kdo ne.
export async function GET(req: NextRequest) {
  const c = await ctx();
  if (jeOdpoved(c)) return c;
  const q = new URL(req.url).searchParams;
  const spravuje = c.opr.has('oznameni.spravovat');
  const cteni = parseInt(q.get('cteni') ?? '');
  if (Number.isFinite(cteni)) {
    if (!spravuje) return NextResponse.json({ error: 'Na tohle nemáš v tomto podniku oprávnění.' }, { status: 403 });
    try {
      const [a] = await sql`SELECT id FROM announcements WHERE id = ${cteni} AND team_id = ${c.teamId}`;
      if (!a) return NextResponse.json({ error: 'Oznámení nenalezeno' }, { status: 404 });
      const lide = await ctenari(c.teamId);
      const reads = await sql`SELECT user_id, acked_at FROM announcement_reads WHERE announcement_id = ${cteni} AND acked_at IS NOT NULL`;
      const kdy = new Map<number, string>(reads.map((r: any) => [Number(r.user_id), String(r.acked_at)]));
      const potvrdili = lide.filter(m => kdy.has(m.id)).map(m => ({ id: m.id, name: m.name, avatar: m.avatar ?? null, at: kdy.get(m.id) }))
        .sort((x, y) => String(y.at).localeCompare(String(x.at)));
      const ceka = lide.filter(m => !kdy.has(m.id)).map(m => ({ id: m.id, name: m.name, avatar: m.avatar ?? null }));
      return NextResponse.json({ id: cteni, potvrdili, ceka });
    } catch {
      return NextResponse.json({ error: 'Stav přečtení se nepodařilo načíst' }, { status: 500 });
    }
  }
  // Za koho se čte: na tabletu člověk vybraný PINem, jinak já.
  const ctenar = await resolveActingUser(c.meId, c.typ, c.teamId, q.get('actingAs'), req);
  try {
    // Připnutá vždycky všechna, odepnutá jen posledních deset.
    //
    // Dřív to bylo jedno `ORDER BY created_at DESC LIMIT 10` přes obojí,
    // takže deset čerstvě odepnutých vzkazů vytlačilo připnuté oznámení,
    // které má tým pořád vidět — ze správy nástěnky prostě zmizelo.
    const pinned = await sql`
      SELECT a.id, a.content, a.pinned, a.created_at AS "createdAt", a.require_ack AS "requireAck",
             u.name AS "authorName", u.avatar AS "authorAvatar",
             (r.acked_at IS NOT NULL) AS acked,
             (SELECT COUNT(*)::int FROM announcement_reads x WHERE x.announcement_id = a.id AND x.acked_at IS NOT NULL) AS "ackCount"
      FROM announcements a
      LEFT JOIN users u ON u.id = a.author_id
      LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = ${ctenar}
      WHERE a.team_id = ${c.teamId} AND a.pinned = TRUE
      ORDER BY a.created_at DESC`;
    // Kolik lidí má potvrzovat — jen pro správu nástěnky (ostatní počet nepotřebují).
    const memberCount = spravuje && pinned.some((a: any) => a.requireAck) ? (await ctenari(c.teamId)).length : null;
    const sPoctem = (rows: any[]) => rows.map(a => ({ ...a, ctenar, ...(memberCount != null ? { memberCount } : {}) }));
    if (!spravuje) return NextResponse.json({ announcements: sPoctem(pinned) });

    const archived = await sql`
      SELECT a.id, a.content, a.pinned, a.created_at AS "createdAt", a.require_ack AS "requireAck",
             u.name AS "authorName", u.avatar AS "authorAvatar",
             (r.acked_at IS NOT NULL) AS acked,
             (SELECT COUNT(*)::int FROM announcement_reads x WHERE x.announcement_id = a.id AND x.acked_at IS NOT NULL) AS "ackCount"
      FROM announcements a
      LEFT JOIN users u ON u.id = a.author_id
      LEFT JOIN announcement_reads r ON r.announcement_id = a.id AND r.user_id = ${ctenar}
      WHERE a.team_id = ${c.teamId} AND a.pinned = FALSE
      ORDER BY a.created_at DESC
      LIMIT 10`;
    return NextResponse.json({ announcements: sPoctem([...pinned, ...archived]) });
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
  const requireAck = b.requireAck === true;

  const [row] = await sql`
    INSERT INTO announcements (team_id, author_id, content, require_ack)
    VALUES (${c.teamId}, ${c.meId}, ${content}, ${requireAck})
    RETURNING id, content, pinned, created_at AS "createdAt", require_ack AS "requireAck"`;

  try {
    // Kolo 62: příjemci podle členství, ne zrcadla — člen přepnutý do jiného
    // podniku oznámení dostane; role (a tím odkaz v push) je z TOHOTO podniku.
    const members = await clenovePodniku(c.teamId, { role: 'lide', krome: c.meId });
    const body = content.length > 120 ? content.slice(0, 117) + '…' : content;
    const title = requireAck ? '📌 Nové oznámení — potvrď přečtení' : '📌 Nové oznámení';
    // Odkaz podle typu účtu příjemce — ten určuje, které rozhraní se mu otevře.
    const emp = members.filter(m => m.role === 'employer').map(m => m.id);
    const ees = members.filter(m => m.role !== 'employer').map(m => m.id);
    if (ees.length) await notifyUsers(ees, { title, body, type: 'info', link: '/employee/shifts' });
    if (emp.length) await notifyUsers(emp, { title, body, type: 'info', link: '/employer/overview' });

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

// PUT — potvrzení „Rozumím": { id, actingAs? }. Každý člen za sebe; tablet za člověka vybraného PINem.
export async function PUT(req: NextRequest) {
  const c = await ctx();
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  const kdo = await resolveActingUser(c.meId, c.typ, c.teamId, b.actingAs, req);
  if (c.typ === 'kiosk' && kdo === c.meId) return NextResponse.json({ error: 'Vyber, kdo oznámení potvrzuje.' }, { status: 400 });
  try {
    const [a] = await sql`SELECT id FROM announcements WHERE id = ${id} AND team_id = ${c.teamId}`;
    if (!a) return NextResponse.json({ error: 'Oznámení nenalezeno' }, { status: 404 });
    await sql`
      INSERT INTO announcement_reads (announcement_id, user_id, read_at, acked_at)
      VALUES (${id}, ${kdo}, NOW(), NOW())
      ON CONFLICT (announcement_id, user_id) DO UPDATE SET acked_at = COALESCE(announcement_reads.acked_at, NOW())`;
    await audit(c.teamId, kdo, 'oznameni.potvrzeno', 'announcement', id);
    return NextResponse.json({ ok: true, id, acked: true });
  } catch {
    return NextResponse.json({ error: 'Potvrzení se nepodařilo uložit' }, { status: 500 });
  }
}

// DELETE ?id= (oznameni.spravovat) — unpin/remove an announcement.
// PATCH — edit the text or unpin/pin: { id, content?, pinned?, requireAck?, remind? }. oznameni.spravovat.
// `remind: true` pošle push těm, kdo oznámení ještě nepotvrdili.
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
    if (typeof b.requireAck === 'boolean') {
      await sql`UPDATE announcements SET require_ack = ${b.requireAck} WHERE id = ${id} AND team_id = ${c.teamId}`;
    }
    const [row] = await sql`SELECT id, content, pinned, created_at AS "createdAt", require_ack AS "requireAck" FROM announcements WHERE id = ${id} AND team_id = ${c.teamId}`;
    if (!row) return NextResponse.json({ error: 'Oznámení nenalezeno' }, { status: 404 });
    if (b.remind === true) {
      const reads = await sql`SELECT user_id FROM announcement_reads WHERE announcement_id = ${id} AND acked_at IS NOT NULL`;
      const potvrdili = new Set(reads.map((r: any) => Number(r.user_id)));
      const lide = (await ctenari(c.teamId)).filter(m => !potvrdili.has(m.id) && m.id !== c.meId);
      const body = String(row.content).length > 120 ? String(row.content).slice(0, 117) + '…' : String(row.content);
      const emp = lide.filter(m => m.role === 'employer').map(m => m.id);
      const ees = lide.filter(m => m.role !== 'employer').map(m => m.id);
      if (ees.length) await notifyUsers(ees, { title: '📌 Připomínka: potvrď přečtení oznámení', body, type: 'info', link: '/employee/shifts' });
      if (emp.length) await notifyUsers(emp, { title: '📌 Připomínka: potvrď přečtení oznámení', body, type: 'info', link: '/employer/overview' });
      await audit(c.teamId, c.meId, 'oznameni.pripomenuto', 'announcement', id, `${lide.length} lidí`);
      return NextResponse.json({ ...row, reminded: lide.length });
    }
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
  try { await sql`DELETE FROM announcement_reads WHERE announcement_id = ${id}`; } catch { /* před migrací */ }
  return NextResponse.json({ ok: true });
}
