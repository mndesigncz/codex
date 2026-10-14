import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { pragueToday } from '@/lib/pragueTime';
import { MAX_DELKA_VYJADRENI, normalizujPoznamku, normalizujText, trestText, validujTrest, VETA_BEZ_PREMIE } from '@/lib/tresty';
import { menaPodniku } from '@/lib/menaPodniku';
import { nactiTrest, oznamTrest, oznamVyjadreni, oznamZruseni, predMigraci, stropKraceniDb, tvarTrestu, zalozTrest, zrusDopad } from '../_spolecne';

// PATCH /api/tresty/[id]
//   { seen: true }                       — člověk potvrdí „Beru na vědomí" (jen ten, koho se trest týká)
//   { response, disagree? }              — člověk se vyjádří; disagree = nesouhlasí (vedení dostane oznámení a frontu)
//   { status: 'zruseno', note? }         — zrušit (tresty.udelit): body i krácení se vrátí, záznam zůstane
//   { disputeHandled: true }             — po nesouhlasu trest platí dál (tresty.udelit), zmizí z fronty
//   { text?, day?, points?, bonusCut?, typeId?, shiftId?, closingId?, taskId?, photoUrl? }
//                                        — úprava platného trestu (tresty.udelit); dopad se přepočítá a člověk
//                                          potvrzuje znovu

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const chyba = (text: string, status: number, navic?: Record<string, unknown>) => NextResponse.json({ error: text, ...navic }, { status });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return chyba('Neplatné číslo trestu.', 400);
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  const smiUdelit = c.role.opravneni.has('tresty.udelit');
  const smiTym = c.role.opravneni.has('tresty.zobrazit_tym');
  let row: any;
  try { row = await nactiTrest(id, c.teamId); } catch (e) { if (predMigraci(e)) return chyba('Trest nenalezen.', 404); throw e; }
  if (!row) return chyba('Trest nenalezen.', 404);
  const puvodni = tvarTrestu(row);
  const muj = puvodni.userId === c.meId;
  if (!muj && !smiTym && !smiUdelit) return chyba('Trest nenalezen.', 404);

  // ---- člověk: potvrzení ----
  if (b?.seen === true) {
    if (!muj) return chyba('Potvrdit může jen ten, koho se trest týká.', 403);
    await sql`UPDATE penalties SET seen_at = COALESCE(seen_at, NOW()), updated_at = NOW() WHERE id = ${id} AND team_id = ${c.teamId}`;
    return NextResponse.json({ ok: true, item: tvarTrestu(await nactiTrest(id, c.teamId)) });
  }

  // ---- člověk: vyjádření ----
  if (b?.response !== undefined) {
    if (!muj) return chyba('Vyjádřit se může jen ten, koho se trest týká.', 403);
    if (puvodni.status !== 'plati') return chyba('Zrušený trest už nevyžaduje vyjádření.', 409);
    const t = normalizujText(b.response, MAX_DELKA_VYJADRENI);
    if (t === null) return chyba('Napiš své vyjádření.', 400);
    if (t === false) return chyba('Vyjádření je moc dlouhé (nejvýš 500 znaků) nebo moc krátké.', 400);
    const nesouhlas = b.disagree === true;
    await sql`
      UPDATE penalties SET response = ${t}, response_at = NOW(), disputed = ${nesouhlas}, dispute_handled_at = NULL,
        seen_at = COALESCE(seen_at, NOW()), updated_at = NOW()
      WHERE id = ${id} AND team_id = ${c.teamId}`;
    const item = tvarTrestu(await nactiTrest(id, c.teamId));
    audit(c.teamId, c.meId, 'tresty.vyjadreni', 'penalty', id, `${nesouhlas ? 'nesouhlasí' : 'vyjádření'}: ${t.slice(0, 120)}`);
    await oznamVyjadreni(c.teamId, item, nesouhlas, t);
    return NextResponse.json({ ok: true, item });
  }

  if (!smiUdelit) return chyba('Upravovat tresty smí jen ten, kdo je uděluje.', 403);
  const mena = await menaPodniku(c.teamId);

  // ---- vedení: zrušení ----
  if (b?.status === 'zruseno') {
    if (puvodni.status === 'zruseno') return chyba('Trest už je zrušený.', 409);
    const pozn = normalizujPoznamku(b.note);
    if (pozn === false) return chyba('Poznámka je moc dlouhá (nejvýš 300 znaků).', 400);
    try {
      await zrusDopad(c.teamId, row.award_id ? Number(row.award_id) : null, row.adjustment_id ? Number(row.adjustment_id) : null);
      await sql`
        UPDATE penalties SET status = 'zruseno', award_id = NULL, adjustment_id = NULL, cancelled_by = ${c.meId}, cancelled_at = NOW(),
          cancel_note = ${pozn}, dispute_handled_at = CASE WHEN disputed THEN NOW() ELSE dispute_handled_at END, updated_at = NOW()
        WHERE id = ${id} AND team_id = ${c.teamId}`;
      const item = tvarTrestu(await nactiTrest(id, c.teamId));
      audit(c.teamId, c.meId, 'tresty.zrusit', 'penalty', id, `${item.userName}: ${trestText(puvodni, mena.money)}${pozn ? ` · ${pozn}` : ''}`);
      await oznamZruseni(item, c.meId);
      return NextResponse.json({ ok: true, item });
    } catch (e) {
      console.error('tresty PATCH zrušení', e);
      return chyba('Zrušení se neuložilo.', 500);
    }
  }
  if (b?.status !== undefined) return chyba('Neznámý stav.', 400);
  if (puvodni.status === 'zruseno') return chyba('Zrušený trest už upravit nejde.', 409);

  // ---- vedení: po nesouhlasu trest platí dál ----
  if (b?.disputeHandled === true) {
    await sql`UPDATE penalties SET dispute_handled_at = NOW(), updated_at = NOW() WHERE id = ${id} AND team_id = ${c.teamId}`;
    const item = tvarTrestu(await nactiTrest(id, c.teamId));
    audit(c.teamId, c.meId, 'tresty.ponechat', 'penalty', id, `${item.userName}: trest platí i po vyjádření`);
    return NextResponse.json({ ok: true, item });
  }

  // ---- vedení: úprava ----
  const v = validujTrest({
    userId: puvodni.userId,
    text: b?.text ?? puvodni.text,
    day: b?.day ?? puvodni.day,
    points: b?.points ?? puvodni.points,
    bonusCut: b?.bonusCut ?? puvodni.bonusCut,
    typeId: b?.typeId === undefined ? puvodni.typeId : b.typeId,
    shiftId: b?.shiftId === undefined ? puvodni.shiftId : b.shiftId,
    closingId: b?.closingId === undefined ? puvodni.closingId : b.closingId,
    taskId: b?.taskId === undefined ? puvodni.taskId : b.taskId,
    photoUrl: b?.photoUrl === undefined ? puvodni.photoUrl : b.photoUrl,
  }, pragueToday());
  if (!v.ok) return chyba(v.chyba, 400);
  const z = v.trest;
  try {
    let typeTitle = puvodni.typeTitle;
    if (z.typeId !== puvodni.typeId) {
      typeTitle = null;
      if (z.typeId) {
        const [t] = await sql`SELECT title FROM penalty_types WHERE id = ${z.typeId} AND team_id = ${c.teamId}`;
        if (!t) return chyba('Položka sazebníku už neexistuje.', 404);
        typeTitle = String(t.title);
      }
    }
    // Strop se hlídá, jen když se krácení zvyšuje nebo trest stěhuje do jiného měsíce: snížit
    // nebo nechat dřívější krácení (z doby před typem prémie) jde vždy.
    if (z.bonusCut > 0 && (z.bonusCut > puvodni.bonusCut || z.day.slice(0, 7) !== puvodni.day.slice(0, 7))) {
      const s = await stropKraceniDb(c.teamId, puvodni.userId, z.day, id);
      if (z.bonusCut > s.strop) {
        return chyba(s.strop > 0
          ? `Krátit jde nejvýš ${mena.money(s.strop)} — víc nenárokových prémií ten měsíc nemá.`
          : VETA_BEZ_PREMIE, 409, { strop: s.strop });
      }
    }
    const zmenaDopadu = z.points !== puvodni.points || z.bonusCut !== puvodni.bonusCut || z.day !== puvodni.day;
    let awardId: number | null = row.award_id ? Number(row.award_id) : null;
    let adjustmentId: number | null = row.adjustment_id ? Number(row.adjustment_id) : null;
    if (zmenaDopadu) {
      await zrusDopad(c.teamId, awardId, adjustmentId);
      const o = await zalozTrest({ teamId: c.teamId, userId: puvodni.userId, points: z.points, bonusCut: z.bonusCut, reason: z.text, day: z.day, givenBy: c.meId, trestId: id });
      awardId = o.awardId; adjustmentId = o.adjustmentId;
    }
    await sql`
      UPDATE penalties SET text = ${z.text}, day = ${z.day}, points = ${z.points}, bonus_cut = ${z.bonusCut}, type_id = ${z.typeId},
        type_title = ${typeTitle}, shift_id = ${z.shiftId}, closing_id = ${z.closingId}, task_id = ${z.taskId}, photo_url = ${z.photoUrl},
        award_id = ${awardId}, adjustment_id = ${adjustmentId},
        seen_at = CASE WHEN ${zmenaDopadu} THEN NULL ELSE seen_at END, updated_at = NOW()
      WHERE id = ${id} AND team_id = ${c.teamId}`;
    const item = tvarTrestu(await nactiTrest(id, c.teamId));
    audit(c.teamId, c.meId, 'tresty.upravit', 'penalty', id, `${item.userName}: ${trestText(item, mena.money)} · ${z.text.slice(0, 80)}`);
    if (zmenaDopadu) await oznamTrest(item, c.meId, mena.money);
    return NextResponse.json({ ok: true, item });
  } catch (e) {
    console.error('tresty PATCH úprava', e);
    return chyba('Úprava se neuložila.', 500);
  }
}
