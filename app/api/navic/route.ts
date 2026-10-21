import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { typNaUcet } from '@/lib/opravneni';
import { jeUcetTabletu, resolveActingUser } from '@/lib/kioskActing';
import { jeClenem } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { pragueToday } from '@/lib/pragueTime';
import {
  jeStavNavic, limitNabidkyVycerpan, nabidkaPlatna, normalizujBody, terminNabidky, urcenoPro, normalizujPoznamku, normalizujPremii, posunDni, uznaniPlatne, validujZapis,
} from '@/lib/navic';
import { menaPodniku } from '@/lib/menaPodniku';
import { kdoJednaNavic, nactiNavic, obsazenostTerminu, oznamRozhodnuti, oznamUznavajicim, predMigraci, tvarNabidky, tvarNavic, zaborHotovo, zalozOdmenu } from './_spolecne';

// „Navíc" (kolo 9, N1): co člověk na směně udělal nad rámec povinností.
//
// GET  ?scope=mine|team&status=&month=RRRR-MM&userId=&day=&closingId=&shiftId=
//      → { items, nabidka (platné položky), smi }
//      mine (výchozí) = zápisy vybraného člověka (na tabletu actingAs), team = celý
//      podnik (navic.zobrazit_tym). Bez month/day/closingId/shiftId posledních 60 dní.
// POST { text, day?, shiftId?, closingId?, taskId?, offerId?, photoUrl?, userId?, actingAs?, uznat? }
//      zápis za sebe (navic.zapsat; tablet za vybraného), nebo za jiného člena
//      (navic.uznat). Položka nabídky s auto_approve, nebo `uznat` od toho, kdo smí
//      uznávat, založí zápis rovnou jako uznaný (body → point_awards, prémie →
//      wage_adjustments). Jinak čeká a uznávající dostanou oznámení.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const chyba = (text: string, status: number) => NextResponse.json({ error: text }, { status });

const OKNO_DNI = 60;
const MAX_RADKU = 500;

export async function GET(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const opr = c.role.opravneni;
  const smiZapsat = opr.has('navic.zapsat');
  const smiTym = opr.has('navic.zobrazit_tym');
  const smiUznat = opr.has('navic.uznat');
  const smiNabidku = opr.has('navic.nabidka');
  if (!smiZapsat && !smiTym) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
  const q = req.nextUrl.searchParams;
  const ucet = typNaUcet(c.role.typ);
  const actingId = await kdoJednaNavic(c, q.get('actingAs'), req);
  const scope = q.get('scope') === 'team' && smiTym ? 'team' : 'mine';
  const stav = q.get('status');
  if (stav && !jeStavNavic(stav)) return chyba('Neznámý stav.', 400);
  const mesic = /^\d{4}-\d{2}$/.test(q.get('month') ?? '') ? q.get('month')! : null;
  const den = /^\d{4}-\d{2}-\d{2}$/.test(q.get('day') ?? '') ? q.get('day')! : null;
  const cislo = (k: string): number | null => { const n = Number(q.get(k)); return Number.isInteger(n) && n > 0 ? n : null; };
  const userId = scope === 'team' ? cislo('userId') : actingId;
  const closingId = cislo('closingId');
  const shiftId = cislo('shiftId');
  const dnes = pragueToday();
  // Bez užšího filtru posledních 60 dní — jinak by seznam rostl donekonečna.
  const odDne = mesic || den || closingId || shiftId ? null : posunDni(dnes, -OKNO_DNI);
  const mesicOd = mesic ? `${mesic}-01` : null;
  const mesicDo = mesic ? `${mesic}-31` : null;
  try {
    const rows = await sql`
      SELECT w.id, w.user_id, w.reported_by, w.day, w.shift_id, w.closing_id, w.task_id, w.offer_id, w.text, w.photo_url,
        w.points_proposed, w.status, w.points, w.bonus_czk, w.decided_by, w.decided_at, w.decision_note, w.created_at,
        u.name AS user_name, u.avatar AS user_avatar, r.name AS reported_by_name, d.name AS decided_by_name, o.title AS offer_title
      FROM extra_work w
      LEFT JOIN users u ON u.id = w.user_id
      LEFT JOIN users r ON r.id = w.reported_by
      LEFT JOIN users d ON d.id = w.decided_by
      LEFT JOIN extra_offers o ON o.id = w.offer_id
      WHERE w.team_id = ${c.teamId}
        AND (${userId}::int IS NULL OR w.user_id = ${userId})
        AND (${stav}::text IS NULL OR w.status = ${stav})
        AND (${den}::text IS NULL OR w.day = ${den})
        AND (${closingId}::int IS NULL OR w.closing_id = ${closingId})
        AND (${shiftId}::int IS NULL OR w.shift_id = ${shiftId})
        AND (${mesicOd}::text IS NULL OR (w.day >= ${mesicOd} AND w.day <= ${mesicDo}))
        AND (${odDne}::text IS NULL OR w.day >= ${odDne})
      ORDER BY (w.status = 'ceka') DESC, w.created_at DESC
      LIMIT ${MAX_RADKU}`;
    const nabidkaRows = await sql`
      SELECT id, title, description, points, bonus_czk, auto_approve, active, valid_from, valid_to, max_per_day, recurrence, rec_days, rec_interval, capacity, require_photo, target_users, created_at
      FROM extra_offers WHERE team_id = ${c.teamId} AND archived_at IS NULL AND active = TRUE
      ORDER BY points DESC, title ASC`;
    // Jen co se dá dnes vzít a je určené tomu, čí zápisy se čtou (na tabletu vybraný člověk).
    const komu = userId ?? actingId;
    const nabidka = nabidkaRows.map(tvarNabidky).filter(n => terminNabidky(n, dnes) != null && urcenoPro(n, komu));
    return NextResponse.json({ items: rows.map(tvarNavic), nabidka, smi: { uznat: smiUznat, nabidka: smiNabidku, tym: smiTym, zapsat: smiZapsat } });
  } catch (e) {
    // Před migrací: prázdný seznam, ne 500 — widgety ukážou prázdný stav.
    if (predMigraci(e)) return NextResponse.json({ items: [], nabidka: [], smi: { uznat: smiUznat, nabidka: smiNabidku, tym: smiTym, zapsat: smiZapsat } });
    console.error('navic GET', e);
    return chyba('Zápisy navíc se nenačetly.', 500);
  }
}


export async function POST(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const opr = c.role.opravneni;
  const smiZapsat = opr.has('navic.zapsat');
  const smiUznat = opr.has('navic.uznat');
  if (!smiZapsat && !smiUznat) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  const ucet = typNaUcet(c.role.typ);
  // Tablet: odpíchnutý, nebo kdo odešel za poslední 3 hodiny (kdoJednaNavic).
  const actingId = await kdoJednaNavic(c, b?.actingAs, req);
  // Za koho se zapisuje: sám za sebe (i tablet za vybraného), nebo vedení za člena.
  const cilovy = Number.isInteger(Number(b?.userId)) && Number(b.userId) > 0 ? Number(b.userId) : actingId;
  if (cilovy !== actingId && !smiUznat) return chyba('Zapsat navíc za jiného člověka smí jen ten, kdo navíc uznává.', 403);
  if (cilovy === actingId && !smiZapsat) return chyba('Na tohle nemáš v tomto podniku oprávnění.', 403);
  if (!(await jeClenem(cilovy, c.teamId))) return chyba('Člověk není v podniku.', 404);
  const dnes = pragueToday();
  const v = validujZapis(b ?? {}, dnes, smiUznat);
  if (!v.ok) return chyba(v.chyba, 400);
  const z = v.zapis;
  // Vazby musí být z tohoto podniku — cizí číslo se tiše nepřipne.
  if (z.shiftId) {
    const [s] = await sql`SELECT id FROM shifts WHERE id = ${z.shiftId} AND team_id = ${c.teamId}`;
    if (!s) return chyba('Směna nenalezena.', 404);
  }
  if (z.closingId) {
    const [u] = await sql`SELECT id FROM cash_closings WHERE id = ${z.closingId} AND team_id = ${c.teamId}`;
    if (!u) return chyba('Uzávěrka nenalezena.', 404);
  }
  if (z.taskId) {
    const [t] = await sql`SELECT id FROM tasks WHERE id = ${z.taskId} AND team_id = ${c.teamId}`;
    if (!t) return chyba('Úkol nenalezen.', 404);
  }
  // Nabídka: platná položka, limit za den, body a případné automatické uznání z ní.
  let nabidka: ReturnType<typeof tvarNabidky> | null = null;
  let termin: string | null = null;
  if (z.offerId) {
    try {
      const [o] = await sql`SELECT id, title, description, points, bonus_czk, auto_approve, active, valid_from, valid_to, max_per_day, recurrence, rec_days, rec_interval, capacity, require_photo, target_users, created_at
        FROM extra_offers WHERE id = ${z.offerId} AND team_id = ${c.teamId} AND archived_at IS NULL`;
      if (!o) return chyba('Položka nabídky už neexistuje.', 404);
      nabidka = tvarNabidky(o);
      if (!nabidkaPlatna(nabidka, dnes)) return chyba('Tahle položka nabídky teď neplatí.', 400);
      // Kolo 11: volitelný úkol — termín podle dne zápisu, komu je určený, limit na člověka a kapacita v termínu.
      termin = terminNabidky(nabidka, z.day);
      if (!termin) return chyba('Tenhle úkol se ten den dělat nedá.', 400);
      if (!urcenoPro(nabidka, cilovy) && !smiUznat) return chyba('Tenhle úkol je určený jiným lidem.', 403);
      const obs = await obsazenostTerminu(c.teamId, nabidka, termin);
      const moje = (obs.zapisy.get(cilovy) ?? []).map(x => ({ offerId: nabidka!.id, status: x.status }));
      if (limitNabidkyVycerpan(nabidka, moje)) {
        return chyba(nabidka.recurrence === 'kdykoli' || nabidka.recurrence === 'denne' || nabidka.recurrence === 'dny' || nabidka.recurrence === 'interval'
          ? `Tohle už máš dnes zapsané (limit ${nabidka.maxPerDay}× za den).`
          : `Tohle už máš v tomhle termínu zapsané (limit ${nabidka.maxPerDay}×).`, 409);
      }
      const mamZabor = obs.zabory.has(cilovy) || moje.some(x => x.status !== 'odmitnuto');
      if (nabidka.capacity != null && !mamZabor && obs.obsazeno >= nabidka.capacity) {
        const kdo = [...obs.zabory.keys(), ...obs.zapisy.keys()].filter((v, i, a) => a.indexOf(v) === i && v !== cilovy).map(id => obs.jmena.get(id)).filter(Boolean).slice(0, 3).join(', ');
        return chyba(kdo ? `Úkol už je obsazený (${kdo}).` : 'Úkol už je obsazený.', 409);
      }
      if (nabidka.requirePhoto && !z.photoUrl && !(b?.uznat && smiUznat)) return chyba('K tomuhle úkolu je potřeba fotka.', 400);
    } catch (e) {
      if (predMigraci(e)) return chyba('Nabídka navíc se ještě připravuje. Zkus to za chvíli znovu.', 503);
      throw e;
    }
  }
  // Rovnou uznat: nabídka s auto_approve, nebo uznávající s { uznat: { points, bonusCzk, note } }.
  let uznat: { points: number | null; bonusCzk: number | null; note: string | null; kym: number | null } | null = null;
  if (b?.uznat && typeof b.uznat === 'object') {
    if (!smiUznat) return chyba('Uznávat navíc smí jen ten, kdo na to má oprávnění.', 403);
    const body = normalizujBody(b.uznat.points ?? nabidka?.points ?? null);
    const premie = normalizujPremii(b.uznat.bonusCzk ?? nabidka?.bonusCzk ?? null);
    const pozn = normalizujPoznamku(b.uznat.note);
    if (body === false) return chyba('Body musí být celé číslo 0–500.', 400);
    if (premie === false) return chyba('Prémie musí být celé číslo (nejvýš 5 000).', 400);
    if (pozn === false) return chyba('Poznámka je moc dlouhá.', 400);
    if (!uznaniPlatne(body, premie)) return chyba('Zadej body nebo prémii (0 = uznáno bez odměny).', 400);
    uznat = { points: body, bonusCzk: premie, note: pozn, kym: c.meId };
  } else if (nabidka?.autoApprove) {
    uznat = { points: nabidka.points, bonusCzk: nabidka.bonusCzk, note: null, kym: null };
  }
  const reportedBy = cilovy === actingId && ucet !== 'kiosk' ? null : c.meId;
  const mena = await menaPodniku(c.teamId);
  try {
    const [row] = await sql`
      INSERT INTO extra_work (team_id, user_id, reported_by, day, shift_id, closing_id, task_id, offer_id, text, photo_url, points_proposed, status, points, bonus_czk, decided_by, decided_at, decision_note)
      VALUES (${c.teamId}, ${cilovy}, ${reportedBy}, ${z.day}, ${z.shiftId}, ${z.closingId}, ${z.taskId}, ${z.offerId}, ${z.text}, ${z.photoUrl},
        ${nabidka ? nabidka.points : null}, ${uznat ? 'uznano' : 'ceka'}, ${uznat?.points ?? null}, ${uznat?.bonusCzk ?? null},
        ${uznat?.kym ?? null}, ${uznat ? new Date().toISOString() : null}, ${uznat?.note ?? null})
      RETURNING id`;
    const id = Number(row.id);
    if (nabidka && termin) await zaborHotovo(c.teamId, nabidka.id, termin, cilovy, id);
    if (uznat) {
      const odmena = await zalozOdmenu({ teamId: c.teamId, userId: cilovy, points: uznat.points, bonusCzk: uznat.bonusCzk, reason: z.text, day: z.day, givenBy: uznat.kym, navicId: id });
      await sql`UPDATE extra_work SET award_id = ${odmena.awardId}, adjustment_id = ${odmena.adjustmentId} WHERE id = ${id}`;
    }
    const item = tvarNavic(await nactiNavic(id, c.teamId));
    audit(c.teamId, c.meId, 'navic.zapis', 'extra_work', id, `${item.userName}: ${z.text.slice(0, 120)}${uznat ? ` · uznáno ${uznat.points ?? 0} b${uznat.bonusCzk ? ` + ${mena.money(uznat.bonusCzk)}` : ''}` : ''}`);
    if (uznat) {
      if (uznat.kym) audit(c.teamId, c.meId, 'navic.uznano', 'extra_work', id, `${item.userName}: ${uznat.points ?? 0} b${uznat.bonusCzk ? ` + ${mena.money(uznat.bonusCzk)}` : ''}`);
      await oznamRozhodnuti(item, uznat.kym ?? c.meId, mena.money);
    } else {
      await oznamUznavajicim(c.teamId, cilovy, item.userName, z.text);
    }
    return NextResponse.json({ ok: true, item }, { status: 201 });
  } catch (e) {
    if (predMigraci(e)) return chyba('Zápis navíc se ještě připravuje. Zkus to za chvíli znovu.', 503);
    console.error('navic POST', e);
    return chyba('Zápis se neuložil.', 500);
  }
}
