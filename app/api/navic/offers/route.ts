import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { pragueToday } from '@/lib/pragueTime';
import { nabidkaPlatna, validujNabidku } from '@/lib/navic';
import { menaPodniku } from '@/lib/menaPodniku';
import { predMigraci, tvarNabidky } from '../_spolecne';

// Nabídka „Co se dá udělat navíc" (kolo 9, N1): položky s body (a volitelně prémií),
// platností, limitem za den a automatickým uznáním.
//
// GET    → { offers } — správce nabídky (navic.nabidka) vidí všechny nearchivované
//          (i vypnuté a prošlé), ostatní s navic.zapsat jen platné dnes.
// POST   { title, description?, points, bonusCzk?, autoApprove?, active?, validFrom?, validTo?, maxPerDay? } (navic.nabidka)
// PATCH  { id, ...totéž } (navic.nabidka)
// DELETE ?id= → archivace (zápisy, které na položku ukazují, zůstanou i s jejím názvem)

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const chyba = (text: string, status: number) => NextResponse.json({ error: text }, { status });

export async function GET() {
  const c = await pozaduj(['navic.zapsat', 'navic.nabidka', 'navic.zobrazit_tym']);
  if (jeOdpoved(c)) return c;
  const spravce = c.role.opravneni.has('navic.nabidka');
  try {
    const rows = await sql`
      SELECT id, title, description, points, bonus_czk, auto_approve, active, valid_from, valid_to, max_per_day, created_at
      FROM extra_offers WHERE team_id = ${c.teamId} AND archived_at IS NULL
      ORDER BY active DESC, points DESC, title ASC`;
    const dnes = pragueToday();
    const vse = rows.map(tvarNabidky);
    return NextResponse.json({ offers: spravce ? vse : vse.filter(n => nabidkaPlatna(n, dnes)), smi: { nabidka: spravce } });
  } catch (e) {
    if (predMigraci(e)) return NextResponse.json({ offers: [], smi: { nabidka: spravce } });
    console.error('navic/offers GET', e);
    return chyba('Nabídka se nenačetla.', 500);
  }
}

export async function POST(req: NextRequest) {
  const c = await pozaduj('navic.nabidka');
  if (jeOdpoved(c)) return c;
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  const v = validujNabidku(b ?? {});
  if (!v.ok) return chyba(v.chyba, 400);
  const n = v.nabidka;
  try {
    const [row] = await sql`
      INSERT INTO extra_offers (team_id, title, description, points, bonus_czk, auto_approve, active, valid_from, valid_to, max_per_day, created_by)
      VALUES (${c.teamId}, ${n.title}, ${n.description}, ${n.points}, ${n.bonusCzk}, ${n.autoApprove}, ${n.active}, ${n.validFrom}, ${n.validTo}, ${n.maxPerDay}, ${c.meId})
      RETURNING id, title, description, points, bonus_czk, auto_approve, active, valid_from, valid_to, max_per_day, created_at`;
    const mena = await menaPodniku(c.teamId);
    audit(c.teamId, c.meId, 'navic.nabidka.pridat', 'extra_offer', Number(row.id), `${n.title} · ${n.points} b${n.bonusCzk ? ` + ${mena.money(n.bonusCzk)}` : ''}${n.autoApprove ? ' · uznává se samo' : ''}`);
    return NextResponse.json({ ok: true, offer: tvarNabidky(row) }, { status: 201 });
  } catch (e) {
    if (predMigraci(e)) return chyba('Nabídka navíc ještě není připravená — spusť /api/init.', 503);
    console.error('navic/offers POST', e);
    return chyba('Položka se neuložila.', 500);
  }
}

export async function PATCH(req: NextRequest) {
  const c = await pozaduj('navic.nabidka');
  if (jeOdpoved(c)) return c;
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  const id = Number(b?.id);
  if (!Number.isInteger(id) || id <= 0) return chyba('Neplatné číslo položky.', 400);
  try {
    const [stara] = await sql`SELECT id, title, description, points, bonus_czk, auto_approve, active, valid_from, valid_to, max_per_day, created_at
      FROM extra_offers WHERE id = ${id} AND team_id = ${c.teamId} AND archived_at IS NULL`;
    if (!stara) return chyba('Položka nenalezena.', 404);
    const puvodni = tvarNabidky(stara);
    // Neposlaná pole zůstávají, jak byla.
    const v = validujNabidku({
      title: b.title ?? puvodni.title, description: b.description === undefined ? puvodni.description : b.description,
      points: b.points ?? puvodni.points, bonusCzk: b.bonusCzk === undefined ? puvodni.bonusCzk : b.bonusCzk,
      autoApprove: b.autoApprove ?? puvodni.autoApprove, active: b.active ?? puvodni.active,
      validFrom: b.validFrom === undefined ? puvodni.validFrom : b.validFrom, validTo: b.validTo === undefined ? puvodni.validTo : b.validTo,
      maxPerDay: b.maxPerDay === undefined ? puvodni.maxPerDay : b.maxPerDay,
    });
    if (!v.ok) return chyba(v.chyba, 400);
    const n = v.nabidka;
    const [row] = await sql`
      UPDATE extra_offers SET title = ${n.title}, description = ${n.description}, points = ${n.points}, bonus_czk = ${n.bonusCzk},
        auto_approve = ${n.autoApprove}, active = ${n.active}, valid_from = ${n.validFrom}, valid_to = ${n.validTo}, max_per_day = ${n.maxPerDay}
      WHERE id = ${id} AND team_id = ${c.teamId}
      RETURNING id, title, description, points, bonus_czk, auto_approve, active, valid_from, valid_to, max_per_day, created_at`;
    audit(c.teamId, c.meId, 'navic.nabidka.upravit', 'extra_offer', id, `${n.title} · ${n.points} b${n.active ? '' : ' · vypnuto'}`);
    return NextResponse.json({ ok: true, offer: tvarNabidky(row) });
  } catch (e) {
    if (predMigraci(e)) return chyba('Položka nenalezena.', 404);
    console.error('navic/offers PATCH', e);
    return chyba('Položka se neuložila.', 500);
  }
}

export async function DELETE(req: NextRequest) {
  const c = await pozaduj('navic.nabidka');
  if (jeOdpoved(c)) return c;
  const id = Number(req.nextUrl.searchParams.get('id'));
  if (!Number.isInteger(id) || id <= 0) return chyba('Neplatné číslo položky.', 400);
  try {
    const done = await sql`UPDATE extra_offers SET archived_at = NOW(), active = FALSE WHERE id = ${id} AND team_id = ${c.teamId} AND archived_at IS NULL RETURNING title`;
    if (!done.length) return chyba('Položka nenalezena.', 404);
    audit(c.teamId, c.meId, 'navic.nabidka.smazat', 'extra_offer', id, String(done[0].title ?? ''));
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (predMigraci(e)) return chyba('Položka nenalezena.', 404);
    console.error('navic/offers DELETE', e);
    return chyba('Položku se nepodařilo smazat.', 500);
  }
}
