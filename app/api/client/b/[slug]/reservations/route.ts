// Host žádá o rezervaci. Vedení ji potvrdí nebo odmítne; do té doby je
// „požadavek". Termín musí být v otevírací době a v dosahu, který podnik dovolí.

import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug, join, slotsFor } from '@/lib/client';
import { clenoveSOpravnenim } from '@/lib/opravneniDb';
import { notifyUser, notifyUsers } from '@/lib/push';
import { autoPotvrdit, NEDORAZENI_LIMIT, nejdriveDnes, zpravaHostoviORezervaci } from '@/lib/clientSlots';
import { pragueToday, pragueHM, dayPlus } from '@/lib/pragueTime';

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
    if (ids.length) await notifyUsers(ids, { ...payload, category: 'booking' });
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
  // Dnes jen s předstihem: v 15:00 se nedá rezervovat na 8:00 ani na 15:10 (stránka
  // takové časy nenabídne, tohle chytí starou záložku nebo ruční požadavek).
  if (date === today && time < nejdriveDnes(pragueHM())) {
    return NextResponse.json({ error: 'Na tenhle čas už je pozdě, vyber pozdější.' }, { status: 400 });
  }
  const teamId = Number(p.team_id);
  await join(me.id, teamId);
  const [dup] = await sql`
    SELECT id FROM client_reservations WHERE team_id = ${teamId} AND customer_id = ${me.id} AND date = ${date} AND time = ${time} AND status NOT IN ('cancelled','declined')`;
  if (dup) return NextResponse.json({ error: 'Na tenhle termín už rezervaci máš.' }, { status: 409 });
  // Malý podnik si zapne automatické potvrzování (Nastavení › Rezervace a objednávky):
  // rezervace vznikne rovnou potvrzená, větší skupiny než nastavená hranice dál čekají.
  // Kolo 8 (R8-7): host, který už dvakrát nedorazil, se sám nepotvrdí — vedení ho potvrdí ručně.
  let nedorazeni = 0;
  try {
    const [n] = await sql`SELECT COUNT(*)::int AS n FROM client_reservations WHERE team_id = ${teamId} AND customer_id = ${me.id} AND status = 'no_show'` as any[];
    nedorazeni = Number(n?.n) || 0;
  } catch { /* před migrací stavu */ }
  const status = autoPotvrdit(p, party, nedorazeni) ? 'confirmed' : 'requested';
  const cekaKvuliNedorazeni = status === 'requested' && nedorazeni >= NEDORAZENI_LIMIT && autoPotvrdit(p, party);
  // Dedup výš je rychlá cesta; skutečnou pojistku proti dvojkliku dělá
  // unikátní index (viz /api/init). Kolizi překládáme na klidné 409.
  let r: any;
  try {
    [r] = await sql`
      INSERT INTO client_reservations (team_id, customer_id, date, time, party, note, status)
      VALUES (${teamId}, ${me.id}, ${date}, ${time}, ${party}, ${note}, ${status})
      RETURNING id, date, time, party, note, status`;
  } catch (e: any) {
    if (String(e?.message ?? '').toLowerCase().includes('unique') || e?.code === '23505') {
      return NextResponse.json({ error: 'Na tenhle termín už rezervaci máš.' }, { status: 409 });
    }
    throw e;
  }
  // Host dostane stejné „Rezervace potvrzena“ jako po ručním potvrzení.
  if (status === 'confirmed') notifyUser(me.id, zpravaHostoviORezervaci('confirmed', date, time)).catch(() => {});
  await upozorni(teamId, {
    // Vedoucí musí poznat, že nemusí nic dělat — a naopak proč tahle čeká, když se jinak potvrzují samy.
    title: status === 'confirmed' ? 'Nová rezervace (potvrzena automaticky)' : cekaKvuliNedorazeni ? `Nová rezervace čeká — host už ${nedorazeni}× nedorazil` : 'Nová rezervace',
    body: `${me.name} · ${date.split('-').reverse().join('. ')} ${time} · ${party} ${party === 1 ? 'osoba' : party < 5 ? 'osoby' : 'osob'}`,
    link: '/employer/overview?mode=client&tab=reservations', type: 'info',
  });
  return NextResponse.json({ ok: true, reservation: r });
}

/**
 * Kolo 8 (R8-7): host odpoví na připomínku „Potvrdit" — podnik pak u rezervace vidí „host potvrdil".
 * Zrušení má svou routu (/api/client/reservations/[id]); tady jen potvrzení vlastní potvrzené
 * rezervace v tomhle podniku, která ještě nezačala. Druhé potvrzení nic nemění (idempotentní).
 */
export async function PATCH(req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  const b = await req.json().catch(() => ({}));
  if (b?.action !== 'confirm') return NextResponse.json({ error: 'Rezervaci jde tady jen potvrdit.' }, { status: 400 });
  const id = parseInt(String(b.id), 10);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: 'Chybí rezervace.' }, { status: 400 });
  const teamId = Number(p.team_id);
  const [r] = await sql`
    SELECT id, date, time, status, guest_confirmed_at FROM client_reservations
    WHERE id = ${id} AND team_id = ${teamId} AND customer_id = ${me.id}` as any[];
  if (!r) return NextResponse.json({ error: 'Rezervace nenalezena' }, { status: 404 });
  if (String(r.status) !== 'confirmed' || String(r.date) < pragueToday()) {
    return NextResponse.json({ error: 'Tuhle rezervaci už potvrdit nejde.' }, { status: 400 });
  }
  if (!r.guest_confirmed_at) {
    await sql`UPDATE client_reservations SET guest_confirmed_at = NOW(), updated_at = NOW() WHERE id = ${id} AND team_id = ${teamId}`;
  }
  return NextResponse.json({ ok: true, id, guestConfirmed: true });
}
