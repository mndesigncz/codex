// One event: edits, crew→shifts sync, checklist, packing with real stock
// movements, publicity, money outcome. Employer only, except checklist ticks.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser, notifyUsers } from '@/lib/push';
import { audit } from '@/lib/audit';
import { normalizeChecklist, normalizePacking, normalizeCrew, normalizeEventMenu, normalizePhotos } from '@/lib/events';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function me() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  const [u] = await sql`SELECT id, role, team_id, name FROM users WHERE id = ${id}`;
  return u ?? null;
}

const TIME_RE = /^\d{2}:\d{2}$/;

/** Hosté, kteří akci sledují nebo jdou — dozví se o změně termínu i zrušení. */
async function notifyFollowers(eventId: number, teamId: number, payload: { title: string; body: string }) {
  try {
    const rows = await sql`SELECT customer_id FROM client_event_follows WHERE event_id = ${eventId}`;
    const ids = (rows as any[]).map(r => Number(r.customer_id));
    if (!ids.length) return;
    const [prof] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${teamId}`;
    await notifyUsers(ids, { ...payload, type: 'info', category: 'general', link: prof?.slug ? `/client/${prof.slug}` : '/client' });
  } catch { /* sledující bez migrace — nevadí */ }
}

const czDate = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' });

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const u = await me();
  if (!u?.team_id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const id = parseInt(params.id);
  const [ev] = await sql`SELECT * FROM events WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!ev) return NextResponse.json({ error: 'Akce nenalezena' }, { status: 404 });
  const b = await req.json().catch(() => ({}));

  // Checklist ticks are for the whole crew; everything else is the employer's.
  if (b.checklist !== undefined && u.role !== 'employer') {
    await sql`UPDATE events SET checklist = ${JSON.stringify(normalizeChecklist(b.checklist))}::jsonb WHERE id = ${id}`;
    return NextResponse.json({ ok: true });
  }
  if (u.role !== 'employer') return NextResponse.json({ error: 'Akce upravuje vedení.' }, { status: 403 });

  // ---- plain fields, one statement each ----
  if (b.title !== undefined) await sql`UPDATE events SET title = ${String(b.title).trim().slice(0, 160)} WHERE id = ${id}`;
  if (b.description !== undefined) await sql`UPDATE events SET description = ${b.description ? String(b.description).trim().slice(0, 2000) : null} WHERE id = ${id}`;
  if (b.kind !== undefined) await sql`UPDATE events SET kind = ${String(b.kind).slice(0, 20)} WHERE id = ${id}`;
  if (b.date !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(String(b.date))) {
    await sql`UPDATE events SET date = ${b.date} WHERE id = ${id}`;
    await sql`UPDATE shifts SET date = ${b.date} WHERE event_id = ${id} AND team_id = ${u.team_id}`;
    if (ev.public === true && String(b.date) !== String(ev.date)) {
      await notifyFollowers(id, u.team_id, { title: `📅 ${ev.title} — nový termín`, body: `Akce se přesouvá na ${czDate(String(b.date))}.` });
    }
  }
  if (b.startTime !== undefined) await sql`UPDATE events SET start_time = ${TIME_RE.test(String(b.startTime)) ? b.startTime : null} WHERE id = ${id}`;
  if (b.endTime !== undefined) await sql`UPDATE events SET end_time = ${TIME_RE.test(String(b.endTime)) ? b.endTime : null} WHERE id = ${id}`;
  if (b.location !== undefined) await sql`UPDATE events SET location = ${b.location ? String(b.location).trim().slice(0, 300) : null} WHERE id = ${id}`;
  if (b.offsite !== undefined) await sql`UPDATE events SET offsite = ${b.offsite === true} WHERE id = ${id}`;
  if (b.capacity !== undefined) await sql`UPDATE events SET capacity = ${Number.isFinite(parseInt(b.capacity)) ? parseInt(b.capacity) : null} WHERE id = ${id}`;
  if (b.notes !== undefined) await sql`UPDATE events SET notes = ${b.notes ? String(b.notes).trim().slice(0, 1000) : null} WHERE id = ${id}`;
  if (b.status !== undefined && ['planned', 'confirmed', 'done', 'cancelled'].includes(b.status)) {
    await sql`UPDATE events SET status = ${b.status} WHERE id = ${id}`;
    if (b.status === 'cancelled') {
      // A cancelled event takes its shifts with it.
      await sql`DELETE FROM shifts WHERE event_id = ${id} AND team_id = ${u.team_id}`;
      if (ev.public === true) {
        await notifyFollowers(id, u.team_id, { title: `❌ ${ev.title} se ruší`, body: `Akce plánovaná na ${czDate(String(ev.date))} se konat nebude. Omlouváme se.` });
      }
      const crew = normalizeCrew(ev.crew);
      if (crew.length) {
        await notifyUsers(crew, {
          title: '❌ Akce zrušena', body: `„${ev.title}" (${ev.date}) se ruší — směna z akce byla odebrána.`,
          type: 'warning', category: 'shift', link: '/employee/shifts?view=my-shifts',
        }).catch(() => {});
      }
    }
  }
  if (b.revenue !== undefined) await sql`UPDATE events SET revenue = ${b.revenue === null || b.revenue === '' ? null : Math.round(Number(b.revenue) || 0)} WHERE id = ${id}`;
  if (b.costs !== undefined) await sql`UPDATE events SET costs = ${b.costs === null || b.costs === '' ? null : Math.round(Number(b.costs) || 0)} WHERE id = ${id}`;
  if (b.checklist !== undefined) await sql`UPDATE events SET checklist = ${JSON.stringify(normalizeChecklist(b.checklist))}::jsonb WHERE id = ${id}`;

  // ---- publicity: customers see it on the shared page ----
  if (b.public !== undefined) {
    await sql`UPDATE events SET public = ${b.public === true} WHERE id = ${id}`;
  }

  // ---- crew sync: shifts appear/disappear with assignment ----
  if (b.crew !== undefined) {
    const next = normalizeCrew(b.crew);
    const prev = normalizeCrew(ev.crew);
    await sql`UPDATE events SET crew = ${JSON.stringify(next)}::jsonb WHERE id = ${id}`;
    const added = next.filter(x => !prev.includes(x));
    const removed = prev.filter(x => !next.includes(x));
    const start = ev.start_time ?? '18:00';
    const end = ev.end_time ?? '22:00';
    for (const empId of added) {
      const [member] = await sql`SELECT id FROM users WHERE id = ${empId} AND team_id = ${u.team_id}`;
      if (!member) continue;
      try {
        await sql`
          INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type, event_id)
          VALUES (${u.team_id}, ${empId}, ${ev.date}, ${start}, ${end}, 'event', ${id})`;
      } catch {
        await sql`
          INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type)
          VALUES (${u.team_id}, ${empId}, ${ev.date}, ${start}, ${end}, 'event')`;
      }
    }
    if (removed.length) {
      try { await sql`DELETE FROM shifts WHERE event_id = ${id} AND team_id = ${u.team_id} AND employee_id = ANY(${removed})`; } catch {}
    }
    if (added.length) {
      await notifyUsers(added.filter(x => x !== u.id), {
        title: `📅 Jsi na akci: ${ev.title}`,
        body: `${new Date(ev.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}${ev.start_time ? ` od ${ev.start_time}` : ''}${ev.location ? ` · ${ev.location}` : ''}. Směna je v rozvrhu.`,
        type: 'shift', category: 'shift', link: '/employee/shifts?view=my-shifts',
      }).catch(() => {});
    }
  }

  // ---- packing list with real stock movements ----
  if (b.packing !== undefined) {
    await sql`UPDATE events SET packing = ${JSON.stringify(normalizePacking(b.packing))}::jsonb WHERE id = ${id}`;
  }
  if (b.packAction === 'checkout' || b.packAction === 'return') {
    const packing = normalizePacking((await sql`SELECT packing FROM events WHERE id = ${id}`)[0]?.packing);
    const updated = [];
    for (const line of packing) {
      if (b.packAction === 'checkout' && line.itemId && !line.packed && line.qty > 0) {
        try {
          const [cur] = await sql`SELECT quantity FROM inventory_items WHERE id = ${line.itemId} AND team_id = ${u.team_id}`;
          if (cur) {
            const newQty = Math.max(0, (Number(cur.quantity) || 0) - line.qty);
            await sql`UPDATE inventory_items SET quantity = ${newQty}, updated_by = ${u.id}, updated_at = NOW() WHERE id = ${line.itemId}`;
            try {
              await sql`
                INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
                VALUES (${line.itemId}, ${u.id}, ${Number(cur.quantity) || 0}, ${newQty}, ${'Akce: ' + ev.title}, NOW())`;
            } catch {}
            line.packed = true;
          }
        } catch { /* one broken line must not stop the trip */ }
      }
      if (b.packAction === 'return' && line.itemId && line.packed && line.returned == null) {
        const back = Math.max(0, Math.min(line.qty, Math.round(Number((b.returns ?? {})[String(line.itemId)] ?? line.qty))));
        try {
          const [cur] = await sql`SELECT quantity FROM inventory_items WHERE id = ${line.itemId} AND team_id = ${u.team_id}`;
          if (cur) {
            const newQty = (Number(cur.quantity) || 0) + back;
            await sql`UPDATE inventory_items SET quantity = ${newQty}, updated_by = ${u.id}, updated_at = NOW() WHERE id = ${line.itemId}`;
            try {
              await sql`
                INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
                VALUES (${line.itemId}, ${u.id}, ${Number(cur.quantity) || 0}, ${newQty}, ${'Návrat z akce: ' + ev.title}, NOW())`;
            } catch {}
            line.returned = back;
          }
        } catch { /* keep going */ }
      }
      updated.push(line);
    }
    await sql`UPDATE events SET packing = ${JSON.stringify(updated)}::jsonb WHERE id = ${id}`;
    audit(u.team_id, u.id, b.packAction === 'checkout' ? 'event.checkout' : 'event.return', 'event', id, ev.title);
  }

  // ---- obsah pro hosty: fotky a menu akce ----
  if (b.photos !== undefined) {
    // Uložit se smí jen vlastní nahrané soubory — id se ověřuje proti uploads
    // týmu, ať do galerie nejde podstrčit cizí obrázek.
    const want = normalizePhotos(b.photos);
    const wantIds = want.map(x => parseInt(x.split('/').pop()!)).filter(n => Number.isFinite(n));
    const owned = wantIds.length
      ? await sql`SELECT id FROM uploads WHERE team_id = ${u.team_id} AND id = ANY(${wantIds})`
      : [] as any[];
    const ownedSet = new Set((owned as any[]).map(r => Number(r.id)));
    const photos = want.filter(x => ownedSet.has(parseInt(x.split('/').pop()!)));
    await sql`UPDATE events SET photos = ${JSON.stringify(photos)}::jsonb WHERE id = ${id}`;
  }
  if (b.menu !== undefined) {
    // Menu akce = odkazy do nabídky podniku: celé tabule ({boardId}), jednotlivé
    // položky ({itemId}) a u výjezdů volné řádky. Cizí ani smazané odkazy se
    // neuloží (ověřuje se vlastnictví přes boards týmu).
    const want = normalizeEventMenu(b.menu);
    const wantIds = want.map(l => l.itemId).filter((x): x is number => x != null);
    const wantBoards = want.map(l => l.boardId).filter((x): x is number => x != null);
    const [owned, ownedBoards] = await Promise.all([
      wantIds.length ? sql`
          SELECT mi.id FROM menu_items mi
          JOIN menu_sections ms ON ms.id = mi.section_id
          JOIN menu_boards mb ON mb.id = ms.board_id
          WHERE mb.team_id = ${u.team_id} AND mi.id = ANY(${wantIds})` : Promise.resolve([] as any[]),
      wantBoards.length ? sql`
          SELECT id FROM menu_boards WHERE team_id = ${u.team_id} AND id = ANY(${wantBoards})` : Promise.resolve([] as any[]),
    ]);
    const ownedSet = new Set((owned as any[]).map(r => Number(r.id)));
    const ownedBoardSet = new Set((ownedBoards as any[]).map(r => Number(r.id)));
    const menu = want
      .filter(l => l.boardId != null ? ownedBoardSet.has(l.boardId) : l.itemId != null ? ownedSet.has(l.itemId) : true)
      .map(l => l.boardId != null ? { boardId: l.boardId } : l.itemId != null ? { itemId: l.itemId } : l);
    await sql`UPDATE events SET menu = ${JSON.stringify(menu)}::jsonb WHERE id = ${id}`;
  }
  if (b.posPlaceId !== undefined) {
    // Kasa akce: jiná provozovna Storyous pro výjezd s vlastním terminálem.
    const v = b.posPlaceId ? String(b.posPlaceId).slice(0, 60) : null;
    try { await sql`UPDATE events SET pos_place_id = ${v} WHERE id = ${id}`; } catch { /* před migrací */ }
  }

  // ---- rozkřiknout členům: novinka na stránce podniku + push všem členům ----
  if (b.announceMembers === true && ev.public === true) {
    const [prof] = await sql`SELECT slug FROM client_profiles WHERE team_id = ${u.team_id} AND enabled = TRUE`;
    if (!prof?.slug) return NextResponse.json({ error: 'Nejdřív zapni stránku pro hosty (Vzhled).' }, { status: 400 });
    const when = `${czDate(String(ev.date))}${ev.start_time ? ` od ${ev.start_time}` : ''}${ev.location ? ` · ${ev.location}` : ''}`;
    const title = `📅 ${ev.title}`;
    const members = await sql`SELECT customer_id FROM client_memberships WHERE team_id = ${u.team_id}`;
    const ids = (members as any[]).map(r => Number(r.customer_id));
    try {
      await sql`INSERT INTO client_broadcasts (team_id, title, body, recipients, sent_by) VALUES (${u.team_id}, ${title}, ${when}, ${ids.length}, ${u.id})`;
    } catch { /* novinky bez migrace — push stačí */ }
    if (ids.length) await notifyUsers(ids, { title, body: when, type: 'info', category: 'general', link: `/client/${prof.slug}` }).catch(() => {});
    audit(u.team_id, u.id, 'event.announce', 'event', id, `${ev.title} → ${ids.length} členům`);
  }

  // ---- publish: tell the whole team ----
  if (b.publishToTeam === true) {
    const members = await sql`
      SELECT id, role FROM users WHERE team_id = ${u.team_id} AND id <> ${u.id} AND role <> 'kiosk'`;
    const ees = (members as any[]).filter(m => m.role !== 'employer').map(m => m.id);
    const emp = (members as any[]).filter(m => m.role === 'employer').map(m => m.id);
    const body = `${new Date(ev.date + 'T00:00:00').toLocaleDateString('cs-CZ', { weekday: 'long', day: 'numeric', month: 'long' })}${ev.start_time ? ` od ${ev.start_time}` : ''}${ev.location ? ` · ${ev.location}` : ''}`;
    if (ees.length) await notifyUsers(ees, { title: `📅 ${ev.title}`, body, type: 'info', link: '/employee/shifts' }).catch(() => {});
    if (emp.length) await notifyUsers(emp, { title: `📅 ${ev.title}`, body, type: 'info', link: '/employer/overview?view=events' }).catch(() => {});
  }

  const [fresh] = await sql`SELECT * FROM events WHERE id = ${id}`;
  return NextResponse.json({ ok: true, event: fresh });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const u = await me();
  if (!u?.team_id || u.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const id = parseInt(params.id);
  const [ev] = await sql`SELECT title, date FROM events WHERE id = ${id} AND team_id = ${u.team_id}`;
  if (!ev) return NextResponse.json({ error: 'Akce nenalezena' }, { status: 404 });
  try { await sql`DELETE FROM shifts WHERE event_id = ${id} AND team_id = ${u.team_id}`; } catch {}
  await sql`DELETE FROM events WHERE id = ${id} AND team_id = ${u.team_id}`;
  audit(u.team_id, u.id, 'event.delete', 'event', id, `${ev.title} · ${ev.date}`);
  return NextResponse.json({ ok: true });
}
