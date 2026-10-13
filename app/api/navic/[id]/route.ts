import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { typNaUcet } from '@/lib/opravneni';
import { resolveActingUser } from '@/lib/kioskActing';
import { audit } from '@/lib/audit';
import { pragueToday } from '@/lib/pragueTime';
import { normalizujBody, normalizujPoznamku, normalizujPremii, prechodDovolen, uznaniPlatne, validujZapis, type StavNavic } from '@/lib/navic';
import { menaPodniku } from '@/lib/menaPodniku';
import { nactiNavic, oznamRozhodnuti, predMigraci, tvarNavic, zalozOdmenu, zrusOdmenu } from '../_spolecne';

// PATCH /api/navic/[id]
//   { status: 'uznano', points?, bonusCzk?, note? } — uznat (navic.uznat); body → point_awards
//     kind 'navic', prémie → wage_adjustments source 'navic'. Už uznaný zápis jde uznat znovu
//     s jinou odměnou (stará se zruší).
//   { status: 'odmitnuto', note? } — odmítnout s důvodem; už uznanému se odměna vrátí.
//   { text, day?, shiftId?, closingId?, taskId?, offerId?, photoUrl? } — úprava vlastního
//     čekajícího zápisu (navic.zapsat; na tabletu actingAs).
// DELETE /api/navic/[id] — autor svůj čekající zápis; uznávající kterýkoli (odměna se zruší).

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const chyba = (text: string, status: number) => NextResponse.json({ error: text }, { status });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return chyba('Neplatné číslo zápisu.', 400);
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  const opr = c.role.opravneni;
  const smiUznat = opr.has('navic.uznat');
  const ucet = typNaUcet(c.role.typ);
  const actingId = await resolveActingUser(c.meId, ucet, c.teamId, b?.actingAs, req);
  let row: any;
  try { row = await nactiNavic(id, c.teamId); } catch (e) { if (predMigraci(e)) return chyba('Zápis nenalezen.', 404); throw e; }
  if (!row) return chyba('Zápis nenalezen.', 404);
  const puvodni = tvarNavic(row);

  // ---- rozhodnutí ----
  if (typeof b?.status === 'string') {
    if (!smiUznat) return chyba('Uznávat navíc smí jen ten, kdo na to má oprávnění.', 403);
    const na = b.status as StavNavic;
    if (na !== 'uznano' && na !== 'odmitnuto') return chyba('Neznámý stav.', 400);
    // Totéž uznání znovu (jiná odměna) je dovolené; totéž odmítnutí ne.
    if (!prechodDovolen(puvodni.status, na) && !(na === 'uznano' && puvodni.status === 'uznano')) return chyba('Tohle rozhodnutí už platí.', 409);
    const pozn = normalizujPoznamku(b.note);
    if (pozn === false) return chyba('Poznámka je moc dlouhá (nejvýš 300 znaků).', 400);
    let body: number | null = null;
    let premie: number | null = null;
    if (na === 'uznano') {
      const bodyRaw = normalizujBody(b.points ?? puvodni.pointsProposed ?? null);
      const premieRaw = normalizujPremii(b.bonusCzk);
      if (bodyRaw === false) return chyba('Body musí být celé číslo 0–500.', 400);
      if (premieRaw === false) return chyba('Prémie musí být celé číslo (nejvýš 5 000).', 400);
      body = bodyRaw; premie = premieRaw;
      if (!uznaniPlatne(body, premie)) return chyba('Zadej body nebo prémii (0 = uznáno bez odměny).', 400);
    }
    const mena = await menaPodniku(c.teamId);
    try {
      // Stará odměna pryč (opakované uznání s jinou částkou, nebo odmítnutí uznaného).
      await zrusOdmenu(c.teamId, row.award_id ? Number(row.award_id) : null, row.adjustment_id ? Number(row.adjustment_id) : null);
      let awardId: number | null = null;
      let adjustmentId: number | null = null;
      if (na === 'uznano') {
        const o = await zalozOdmenu({ teamId: c.teamId, userId: puvodni.userId, points: body, bonusCzk: premie, reason: puvodni.text, day: puvodni.day, givenBy: c.meId, navicId: id });
        awardId = o.awardId; adjustmentId = o.adjustmentId;
      }
      await sql`
        UPDATE extra_work SET status = ${na}, points = ${na === 'uznano' ? body : null}, bonus_czk = ${na === 'uznano' ? premie : null},
          award_id = ${awardId}, adjustment_id = ${adjustmentId}, decided_by = ${c.meId}, decided_at = NOW(), decision_note = ${pozn}, updated_at = NOW()
        WHERE id = ${id} AND team_id = ${c.teamId}`;
      const item = tvarNavic(await nactiNavic(id, c.teamId));
      audit(c.teamId, c.meId, na === 'uznano' ? 'navic.uznano' : 'navic.odmitnuto', 'extra_work', id,
        `${item.userName}: ${na === 'uznano' ? `${body ?? 0} b${premie ? ` + ${mena.money(premie)}` : ''}` : pozn ?? 'bez důvodu'} · ${puvodni.text.slice(0, 80)}`);
      await oznamRozhodnuti(item, c.meId, mena.money);
      return NextResponse.json({ ok: true, item });
    } catch (e) {
      console.error('navic PATCH rozhodnutí', e);
      return chyba('Rozhodnutí se neuložilo.', 500);
    }
  }

  // ---- úprava vlastního čekajícího zápisu ----
  const autor = puvodni.userId === actingId || puvodni.reportedBy === c.meId;
  if (!autor && !smiUznat) return chyba('Cizí zápis upravit nejde.', 403);
  if (puvodni.status !== 'ceka' && !smiUznat) return chyba('Rozhodnutý zápis už upravit nejde.', 409);
  const v = validujZapis({ ...b, day: b?.day ?? puvodni.day }, pragueToday(), smiUznat);
  if (!v.ok) return chyba(v.chyba, 400);
  const z = v.zapis;
  try {
    await sql`
      UPDATE extra_work SET text = ${z.text}, day = ${z.day}, shift_id = ${z.shiftId}, closing_id = ${z.closingId}, task_id = ${z.taskId},
        offer_id = ${z.offerId}, photo_url = ${z.photoUrl}, updated_at = NOW()
      WHERE id = ${id} AND team_id = ${c.teamId}`;
    const item = tvarNavic(await nactiNavic(id, c.teamId));
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error('navic PATCH úprava', e);
    return chyba('Úprava se neuložila.', 500);
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return chyba('Neplatné číslo zápisu.', 400);
  const opr = c.role.opravneni;
  const smiUznat = opr.has('navic.uznat');
  const ucet = typNaUcet(c.role.typ);
  const actingId = await resolveActingUser(c.meId, ucet, c.teamId, req.nextUrl.searchParams.get('actingAs'), req);
  let row: any;
  try { row = await nactiNavic(id, c.teamId); } catch (e) { if (predMigraci(e)) return chyba('Zápis nenalezen.', 404); throw e; }
  if (!row) return chyba('Zápis nenalezen.', 404);
  const z = tvarNavic(row);
  const autor = z.userId === actingId || z.reportedBy === c.meId;
  if (!smiUznat) {
    if (!autor) return chyba('Cizí zápis smazat nejde.', 403);
    if (z.status !== 'ceka') return chyba('Rozhodnutý zápis už smazat nejde — řekni vedení.', 409);
  }
  try {
    await zrusOdmenu(c.teamId, row.award_id ? Number(row.award_id) : null, row.adjustment_id ? Number(row.adjustment_id) : null);
    await sql`DELETE FROM extra_work WHERE id = ${id} AND team_id = ${c.teamId}`;
    audit(c.teamId, c.meId, 'navic.smazano', 'extra_work', id, `${z.userName}: ${z.text.slice(0, 120)}`);
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error('navic DELETE', e);
    return chyba('Zápis se nepodařilo smazat.', 500);
  }
}
