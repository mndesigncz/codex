// Host žádá o rezervaci. Vedení ji potvrdí nebo odmítne; do té doby je
// „požadavek". Termín musí být v otevírací době a v dosahu, který podnik dovolí.

import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, join, slotsFor } from '@/lib/client';
import { clenoveSOpravnenim } from '@/lib/opravneniDb';
import { notifyUsers } from '@/lib/push';

import { pragueToday, dayPlus } from '@/lib/pragueTime';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

/**
 * Nová rezervace čeká na potvrzení — dozví se o ní ten, kdo ji smí potvrdit
 * (rezervace.schvalovat), ne každý z vedení a ne celá obsluha.
 * Upozornění je best-effort: host svou akci provedl, i když push neodejde.
 */
async function upozorni(teamId: number, payload: { title: string; body?: string; link?: string; type?: string }) {
  try {
    const ids = await clenoveSOpravnenim(teamId, 'rezervace.schvalovat');
    if (ids.length) await notifyUsers(ids, { ...payload, category: 'general' });
  } catch { /* bez upozornění */ }
}

export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  if (!p.reservations_on) return NextResponse.json({ error: 'Podnik rezervace přes aplikaci nepřijímá.' }, { status: 400 });
  const b = await req.json().catch(() => ({}));
  const date = String(b.date ?? '');
  const time = String(b.time ?? '');
  const party = Math.max(1, Math.min(Number(p.max_party) || 8, parseInt(String(b.party ?? '2'), 10) || 2));
  const note = String(b.note ?? '').trim().slice(0, 300) || null;
  const today = pragueToday();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today || date > dayPlus(today, Number(p.lead_days) || 30)) {
    return NextResponse.json({ error: 'Vyber den od dneška do ' + (Number(p.lead_days) || 30) + ' dní dopředu.' }, { status: 400 });
  }
  const slots = slotsFor(p.opening_hours, date, Number(p.slot_minutes) || 30);
  if (!slots.includes(time)) return NextResponse.json({ error: 'V tenhle čas podnik nerezervuje.' }, { status: 400 });
  const teamId = Number(p.team_id);
  await join(me.id, teamId);
  const [dup] = await sql`
    SELECT id FROM client_reservations WHERE team_id = ${teamId} AND customer_id = ${me.id} AND date = ${date} AND time = ${time} AND status NOT IN ('cancelled','declined')`;
  if (dup) return NextResponse.json({ error: 'Na tenhle termín už rezervaci máš.' }, { status: 409 });
  // Dedup výš je rychlá cesta; skutečnou pojistku proti dvojkliku dělá
  // unikátní index (viz /api/init). Kolizi překládáme na klidné 409.
  let r: any;
  try {
    [r] = await sql`
      INSERT INTO client_reservations (team_id, customer_id, date, time, party, note)
      VALUES (${teamId}, ${me.id}, ${date}, ${time}, ${party}, ${note})
      RETURNING id, date, time, party, note, status`;
  } catch (e: any) {
    if (String(e?.message ?? '').toLowerCase().includes('unique') || e?.code === '23505') {
      return NextResponse.json({ error: 'Na tenhle termín už rezervaci máš.' }, { status: 409 });
    }
    throw e;
  }
  await upozorni(teamId, {
    title: 'Nová rezervace',
    body: `${me.name} · ${date.split('-').reverse().join('. ')} ${time} · ${party} ${party === 1 ? 'osoba' : party < 5 ? 'osoby' : 'osob'}`,
    link: '/employer/overview?mode=client&tab=reservations', type: 'info',
  });
  return NextResponse.json({ ok: true, reservation: r });
}
