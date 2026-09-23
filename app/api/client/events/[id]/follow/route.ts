// Host a veřejná akce: 🔔 sledovat (připomínka den předem, zprávy o změně
// termínu a zrušení) a ✋ přijdu (počítá se do zájmu, vidí ho i vedení).
// Jeden řádek na dvojici host × akce; „přijdu" v sobě sledování nese taky.

import { NextRequest, NextResponse } from 'next/server';
import { sql, customer } from '@/lib/client';

export const dynamic = 'force-dynamic';

/** Akce, na kterou se host smí přihlásit: veřejná, nezrušená, u zapnutého podniku. */
async function publicEvent(id: number) {
  const [ev] = await sql`
    SELECT e.id, e.team_id, e.title FROM events e
    JOIN client_profiles p ON p.team_id = e.team_id AND p.enabled = TRUE
    WHERE e.id = ${id} AND e.public = TRUE AND e.status <> 'cancelled'`;
  return ev ?? null;
}

async function counts(eventId: number) {
  const [c] = await sql`
    SELECT COUNT(*)::int AS followers, COUNT(*) FILTER (WHERE going)::int AS going
    FROM client_event_follows WHERE event_id = ${eventId}`;
  return { followers: Number(c?.followers) || 0, going: Number(c?.going) || 0 };
}

export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se, ať ti akce neuteče.' }, { status: 401 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná akce' }, { status: 400 });
  const ev = await publicEvent(id);
  if (!ev) return NextResponse.json({ error: 'Akce nenalezena' }, { status: 404 });

  const b = await req.json().catch(() => ({}));
  const going = b.going === true;
  try {
    await sql`
      INSERT INTO client_event_follows (event_id, customer_id, going)
      VALUES (${id}, ${me.id}, ${going})
      ON CONFLICT (event_id, customer_id) DO UPDATE SET going = ${going}`;
  } catch {
    return NextResponse.json({ error: 'Sledování akcí bude dostupné po migraci.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true, myFollow: true, myGoing: going, ...(await counts(id)) });
}

export async function DELETE(_req: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const id = parseInt(params.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná akce' }, { status: 400 });
  try { await sql`DELETE FROM client_event_follows WHERE event_id = ${id} AND customer_id = ${me.id}`; } catch {}
  return NextResponse.json({ ok: true, myFollow: false, myGoing: false, ...(await counts(id).catch(() => ({ followers: 0, going: 0 }))) });
}
