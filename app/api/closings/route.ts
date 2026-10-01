import { NextResponse } from 'next/server';
import { pozaduj, jeOdpoved, clenoveSOpravnenim, type Kontext } from '@/lib/opravneniDb';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { cashDifference, czk, normalizeMovements, normalizeDenominations, normalizeHandover, ShiftPerson } from '@/lib/closing';
import { dayPlus, pragueToday } from '@/lib/pragueTime';
import { denSmeny, zavreneDnyTydne, smenaBezUzaverky } from '@/lib/staleShifts';
import { mzdaZaSmenu } from '@/lib/mzdaSmeny';
import { getConnection } from '@/lib/storyous';
import { eventWindowFromPos } from '@/lib/eventPos';
import { clenovePodniku, idClenu } from '@/lib/tenant';
import { urciKontextUzaverky, chybejiciPredUzaverkou, smiObejitPovinne } from '@/lib/povinnePredUzaverkouDb';
import { jeZamceno, zpravaZamceno } from '@/lib/povinnePredUzaverkou';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

// Kolo 67: co kdo u uzávěrek smí, říkají oprávnění z role v AKTIVNÍM
// podniku (z databáze). Typ účtu zůstává jen tam, kde jde o obrazovku:
// tablet je sdílený, nemá vlastní historii a vždy vybírá, za koho zavírá.
// Vedení má všechny klíče, Barista vytvorit + mazat_vlastni + předávku,
// Kiosk vytvorit + za_jineho — proto se pro ně chování nemění.
function prava(c: Kontext) {
  const ma = (k: string) => c.role.opravneni.has(k);
  const tablet = c.role.typ === 'kiosk';
  return {
    tablet,
    vse: ma('uzaverky.zobrazit_vse'),
    // „Za koho" + libovolné datum ve formuláři (dřív isEmployer). Tablet
    // zavírá za jiné taky, ale přes výběr směny, ne přes seznam lidí.
    zaJineho: ma('uzaverky.za_jineho') && !tablet,
    bezSchvaleni: ma('uzaverky.bez_schvaleni'),
    obejitPostupy: ma('uzaverky.obejit_postupy'),
    mzdy: ma('finance.mzdy'),
    mojeMzda: ma('finance.moje_mzda'),
    trzby: ma('finance.trzby'),
  };
}

// Mzdový snímek uzávěrky (sazba, výdělek, odpracovaný čas) je mzda: cizí
// jen s finance.mzdy, vlastní s finance.moje_mzda. Zbytek řádku jsou čísla
// kasy, která autor sám vyplnil nebo která vidí celé vedení uzávěrek.
function bezMzdy<T extends Record<string, any>>(r: T, meId: number, p: { mzdy: boolean; mojeMzda: boolean }): T {
  if (p.mzdy || (p.mojeMzda && Number(r.created_by) === meId)) return r;
  const { wage_rate: _a, wage_earned: _b, worked_ms: _c, ...rest } = r;
  return rest as T;
}

// Kolo 67 (oponentura): tržba z kasy patří k finance.trzby. Kdo má jen
// uzaverky.zobrazit_vse (systémová role Provozní, vlastní role bez financí),
// by jinak ze seznamu cizích uzávěrek sečetl denní i měsíční obrat, který mu
// kalendář i detail záměrně skrývají. Vlastní uzávěrku autor vyplnil sám,
// takže ji vidí celou. Vedení má finance.trzby, Barista a tablet cizí
// uzávěrky nevidí vůbec — pro dnešní role se tedy nic nemění.
const TRZBA_POLE = ['cash_revenue', 'card_revenue', 'tips', 'tips_card', 'closing_cash', 'expected', 'event_breakdown'] as const;
function bezTrzby<T extends Record<string, any>>(r: T, meId: number, sTrzbou: boolean): T {
  if (sTrzbou || Number(r.created_by) === meId) return r;
  const rest: Record<string, any> = { ...r };
  for (const k of TRZBA_POLE) delete rest[k];
  // Klient pozná, že čísla chybí záměrně, ne že je autor nevyplnil.
  rest.trzbaSkryta = true;
  return rest as T;
}

const num = (v: any) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? n : 0;
};

// Peněžní pole uzávěrky ořízneme na [0, strop]. Záporná ani absurdně velká
// částka není data — je to překlep, který by jinak tekl do měsíčních součtů,
// doporučení i porovnání s kasou (např. „closing_cash = miliarda").
const CASH_CAP = 100_000_000; // 100 mil. Kč na jednu uzávěrku je strop
const money = (v: any) => Math.min(Math.max(0, num(v)), CASH_CAP);
const count = (v: any) => Math.min(Math.max(0, num(v)), 1_000_000);

// cash_closings.shift_employees holds raw user ids; normalise whatever the
// column gives us (missing column ⇒ undefined, older rows ⇒ empty array).
const idsOf = (v: any): number[] => {
  if (!Array.isArray(v)) return [];
  const out: number[] = [];
  for (const raw of v) {
    const id = Number(raw);
    if (Number.isFinite(id) && !out.includes(id)) out.push(id);
  }
  return out;
};

// GET — list closings.
//   employer: every closing in the team, with full financial detail + author name.
//   employee: only their OWN closings (they entered the values themselves).
export async function GET() {
  // Seznam má každý člen — bez uzaverky.zobrazit_vse jen své (vlastní data).
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const p = prava(c);

  // Defensive: a not-yet-migrated column must not break the whole view.
  let payDailyCash = false;
  try {
    const [team] = await sql`SELECT pay_daily_cash FROM teams WHERE id = ${c.teamId}`;
    payDailyCash = !!team?.pay_daily_cash;
  } catch { /* column not migrated yet */ }

  let payoutFromRegister = true;
  try {
    const [team] = await sql`SELECT payout_from_register FROM teams WHERE id = ${c.teamId}`;
    payoutFromRegister = team?.payout_from_register !== false;
  } catch { /* column not migrated yet */ }

  let tipsInDrawer = false;
  try {
    const [team] = await sql`SELECT tips_in_drawer FROM teams WHERE id = ${c.teamId}`;
    tipsInDrawer = team?.tips_in_drawer === true;
  } catch { /* column not migrated yet */ }

  let requiresShift = true;
  try {
    const [team] = await sql`SELECT closing_requires_shift FROM teams WHERE id = ${c.teamId}`;
    requiresShift = team?.closing_requires_shift !== false;
  } catch { /* column not migrated yet */ }

  // The shared kiosk never sees financial history — it only submits.
  const rows = p.tablet
    ? []
    : p.vse
    ? await sql`
        SELECT cc.*, u.name AS author_name, u.avatar AS author_avatar, ev.title AS event_title
        FROM cash_closings cc
        LEFT JOIN users u ON u.id = cc.created_by
        LEFT JOIN events ev ON ev.id = cc.event_id
        WHERE cc.team_id = ${c.teamId}
        ORDER BY cc.date DESC, cc.created_at DESC`
    : await sql`
        SELECT cc.*, u.name AS author_name, u.avatar AS author_avatar, ev.title AS event_title
        FROM cash_closings cc
        LEFT JOIN users u ON u.id = cc.created_by
        LEFT JOIN events ev ON ev.id = cc.event_id
        WHERE cc.team_id = ${c.teamId} AND cc.created_by = ${c.meId}
        ORDER BY cc.date DESC, cc.created_at DESC`;

  // A closing belongs to the whole shift — resolve the stored ids into people
  // so the UI can render "Směna: Anna + Petr".
  // Kolo 62: jména podle id z uzávěrek samotných, ne ze seznamu členů —
  // člen přepnutý jinam (nebo bývalý) by se v historii ukázal jako „Neznámý".
  const peopleById = new Map<number, ShiftPerson>();
  if (rows.length) {
    try {
      const ids = [...new Set((rows as any[]).flatMap(r => idsOf(r.shift_employees)))];
      if (ids.length) {
        const team = await sql`SELECT id, name, avatar FROM users WHERE id = ANY(${ids})`;
        for (const u of team as any[]) peopleById.set(u.id, { id: u.id, name: u.name, avatar: u.avatar });
      }
    } catch { /* fall back to ids only */ }
  }
  const closings = (rows as any[]).map(r => ({
    ...bezTrzby(bezMzdy(r, c.meId, p), c.meId, p.trzby),
    movements: normalizeMovements(r.movements),
    denominations: normalizeDenominations(r.denominations),
    shiftEmployees: idsOf(r.shift_employees)
      .map(id => peopleById.get(id) ?? { id, name: 'Neznámý', avatar: null }),
  }));

  // Shifts the current user may still close: their own past/today shifts in
  // the last 14 days that don't yet have a closing. The kiosk gets the whole
  // team's unclosed recent shifts (it picks who is closing). Employers can
  // close any date, so they get an empty list (the UI shows a free date picker).
  //
  // "Unclosed" is per SHIFT, not per person: once anyone on the shift filed a
  // closing, everyone listed in its shift_employees is done. Older rows have no
  // shift_employees, so the created_by check still covers them.
  let eligibleShifts: any[] = [];
  const today = pragueToday();
  const zavrenoTyden = await zavreneDnyTydne(c.teamId);
  if (p.tablet) {
    const cutoff = pragueToday(-3);
    try {
      eligibleShifts = await sql`
        SELECT s.id, s.date, s.auto_created, s.start_time AS "startTime", s.end_time AS "endTime", s.type,
               u.id AS "employeeId", u.name AS "employeeName", u.avatar AS "employeeAvatar"
        FROM shifts s
        JOIN users u ON u.id = s.employee_id
        WHERE s.team_id = ${c.teamId}
          AND s.date <= ${today} AND s.date >= ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM cash_closings cc
            WHERE cc.team_id = ${c.teamId} AND COALESCE(cc.shift_date, cc.date) = s.date
              AND (cc.created_by = s.employee_id OR cc.shift_employees @> to_jsonb(s.employee_id))
          )
        ORDER BY s.date DESC, s.start_time ASC`;
    } catch {
      try {
        eligibleShifts = await sql`
          SELECT s.id, s.date, s.start_time AS "startTime", s.end_time AS "endTime", s.type,
                 u.id AS "employeeId", u.name AS "employeeName", u.avatar AS "employeeAvatar"
          FROM shifts s
          JOIN users u ON u.id = s.employee_id
          WHERE s.team_id = ${c.teamId}
            AND s.date <= ${today} AND s.date >= ${cutoff}
            AND NOT EXISTS (
              SELECT 1 FROM cash_closings cc
              WHERE cc.created_by = s.employee_id AND cc.date = s.date
            )
          ORDER BY s.date DESC, s.start_time ASC`;
      } catch { /* shifts table issue — leave empty */ }
    }
  } else if (!p.zaJineho) {
    const cutoff = pragueToday(-14);
    try {
      eligibleShifts = await sql`
        SELECT s.id, s.date, s.auto_created, s.start_time AS "startTime", s.end_time AS "endTime", s.type
        FROM shifts s
        WHERE s.employee_id = ${c.meId} AND s.team_id = ${c.teamId}
          AND s.date <= ${today} AND s.date >= ${cutoff}
          AND NOT EXISTS (
            SELECT 1 FROM cash_closings cc
            WHERE cc.team_id = ${c.teamId} AND COALESCE(cc.shift_date, cc.date) = s.date
              AND (cc.created_by = ${c.meId} OR cc.shift_employees @> to_jsonb(${c.meId}::int))
          )
        ORDER BY s.date DESC, s.start_time ASC`;
    } catch {
      try {
        eligibleShifts = await sql`
          SELECT s.id, s.date, s.start_time AS "startTime", s.end_time AS "endTime", s.type
          FROM shifts s
          WHERE s.employee_id = ${c.meId} AND s.team_id = ${c.teamId}
            AND s.date <= ${today} AND s.date >= ${cutoff}
            AND NOT EXISTS (
              SELECT 1 FROM cash_closings cc
              WHERE cc.created_by = ${c.meId} AND cc.date = s.date
            )
          ORDER BY s.date DESC`;
      } catch { /* shifts table issue — leave empty */ }
    }
  }

  // „Neděle v návrzích" — automatická směna na den, kdy je zavřeno, se
  // nenabízí k zavření. Viz smenaBezUzaverky.
  eligibleShifts = eligibleShifts.filter(s => !smenaBezUzaverky(s, zavrenoTyden));

  // For the employer's "submit on behalf" selector.
  let members: any[] = [];
  // Which team members were scheduled each recent day, and which of those days
  // still have NO closing at all — so the employer sees who was on shift and
  // where a closing is missing.
  let scheduledByDate: Record<string, any[]> = {};
  let missingClosings: { date: string; employees: any[] }[] = [];
  let missingToday: { date: string; employees: any[] } | null = null;
  if (p.zaJineho) {
    try {
      // Kolo 62: „odeslat za" nabízí členy podniku (členství nebo zrcadlo).
      members = (await clenovePodniku(c.teamId)).map(m => ({ id: m.id, name: m.name, avatar: m.avatar, aktivniJinde: m.aktivniJinde }));
    } catch { /* ignore */ }
  }
  // Chybějící uzávěrky týmu patří k přehledu všech uzávěrek.
  if (p.vse) {
    try {
      const cutoff = pragueToday(-30);
      const sched = await sql`
        SELECT DISTINCT s.date, s.auto_created, u.id, u.name, u.avatar
        FROM shifts s JOIN users u ON u.id = s.employee_id
        WHERE s.team_id = ${c.teamId} AND s.date >= ${cutoff} AND s.date <= ${today}
        ORDER BY s.date DESC, u.name ASC`;
      // Automatická směna na den, kdy je zavřeno, je příchod po půlnoci zapsaný
      // podle hodin na zdi z doby, než to příchod uměl líp. Uzávěrku za neděli,
      // ve které nikdo nepracoval, po nikom nechceme.
      const zavreno = await zavreneDnyTydne(c.teamId);
      for (const r of sched as any[]) {
        if (smenaBezUzaverky(r, zavreno)) continue;
        (scheduledByDate[r.date] ??= []).push({ id: r.id, name: r.name, avatar: r.avatar });
      }
      // Dates that had at least one shift but not a single closing row —
      // podle obchodního dne, ne podle dne odeslání formuláře.
      const closedDates = new Set(closings.map(r => String(r.shift_date ?? r.date)));
      // Kolo 69 (N9): „chybí" až do včerejška, stejně jako kalendář. Dřív tu
      // bylo `<= dnes`, takže dnešní běžící směna svítila jako chybějící
      // uzávěrka od chvíle, kdy začala. Dnešek bez uzávěrky jde zvlášť
      // (`missingToday`) — widget ho ukáže jen tomu, kdo si ho zapne.
      missingClosings = Object.keys(scheduledByDate)
        .filter(d => !closedDates.has(d) && d < today)
        .sort().reverse()
        .map(date => ({ date, employees: scheduledByDate[date] }));
      if (scheduledByDate[today] && !closedDates.has(today)) missingToday = { date: today, employees: scheduledByDate[today] };
    } catch { /* shifts table issue — leave empty */ }
  }

  // Which business day is this person closing right now? A shift that runs past
  // midnight still belongs to the day it started, so the form must not default
  // to the calendar date on the wall clock. Yesterday wins whenever yesterday's
  // shift is still inside its window (with the usual grace).
  // Stejné pravidlo jako u příchodu a u odeslání: včerejší směna, která v tuhle
  // chvíli ještě běží (i s tolerancí na úklid), nebo podnik otevřený přes
  // půlnoc → včera. Dřív tu platilo jen „plánovaná směna přes půlnoc", takže
  // 16–23 zavřená v 0:20 padla na neděli.
  let suggestedDate = today;
  try { suggestedDate = await denSmeny(c.teamId, c.meId, new Date()); } catch { /* today it is */ }

  return NextResponse.json({
    closings,
    suggestedDate,
    canSeeAll: p.vse,
    payDailyCash,
    payoutFromRegister,
    tipsInDrawer,
    requiresShift,
    // Názvy polí zůstávají kvůli klientovi; znamenají „smí zavírat za jiné
    // s volným datem" a „sdílený tablet".
    isEmployer: p.zaJineho,
    isKiosk: p.tablet,
    // Smí odeslat uzávěrku i se zamčenými povinnými věcmi. Dřív to formulář
    // odvozoval z isEmployer (za_jineho), server z obejit_postupy — Provozní
    // pak dostal „Odeslat přesto" a hned nato 400.
    obejitPovinne: p.obejitPostupy,
    eligibleShifts,
    members,
    scheduledByDate,
    missingClosings,
    missingToday,
    meId: c.meId,
  });
}

// POST — create a closing (employee or employer). Bound to the author's team.
export const maxDuration = 60;

export async function POST(request: Request) {
  const c = await pozaduj('uzaverky.vytvorit');
  if (jeOdpoved(c)) return c;
  const p = prava(c);

  const b = await request.json();
  let payDailyCash = false;
  try {
    const [team] = await sql`SELECT pay_daily_cash FROM teams WHERE id = ${c.teamId}`;
    payDailyCash = !!team?.pay_daily_cash;
  } catch { /* not migrated */ }
  // Payout source is chosen per closing (the form defaults it to the team's
  // policy, but the person can override it). Snapshot the chosen value so the
  // row keeps its own expected-cash math regardless of later changes.
  let payoutFromRegister = true;
  try {
    const [team] = await sql`SELECT payout_from_register FROM teams WHERE id = ${c.teamId}`;
    payoutFromRegister = team?.payout_from_register !== false;
  } catch { /* not migrated */ }
  if (typeof b.payoutFromRegister === 'boolean') payoutFromRegister = b.payoutFromRegister;

  // Same snapshot logic for cash tips: do they stay in the drawer (and so count
  // towards the expected cash) or are they kept aside? Team default, per-closing
  // override; absent everywhere ⇒ false, which matches the historic maths.
  let tipsInDrawer = false;
  try {
    const [team] = await sql`SELECT tips_in_drawer FROM teams WHERE id = ${c.teamId}`;
    tipsInDrawer = team?.tips_in_drawer === true;
  } catch { /* not migrated */ }
  if (typeof b.tipsInDrawer === 'boolean') tipsInDrawer = b.tipsInDrawer;

  // Kdo zavírá, za který obchodní den, kterou směnu, jakou akci a s kým —
  // stejně jako GET /api/closings/povinne, aby zámek ve formuláři a brána
  // tady nikdy nehleděly na jiný den nebo jinou osádku.
  const kontext = await urciKontextUzaverky(c, b);
  if (kontext instanceof NextResponse) return kontext;
  const { actorId, shiftDate, shift, eventId, posadka: shiftEmployeeIds, typy: typyPovinnych } = kontext;
  const date = shiftDate;

  // One closing per person per BUSINESS DAY. The day is what the till is
  // counted for: a Friday shift that closes at 00:40 still belongs to Friday,
  // and somebody who covered both the morning and the evening of that Friday
  // files one closing for the day, not two. `shiftId` only records which shift
  // it was filed from — it never takes part in uniqueness.
  const shiftId: number | null = shift?.id ?? null;
  let dupe: any = null;
  try {
    if (eventId != null) {
      [dupe] = await sql`
        SELECT id FROM cash_closings
        WHERE created_by = ${actorId} AND event_id = ${eventId}
          AND (date = ${shiftDate} OR shift_date = ${shiftDate})`;
    } else {
      [dupe] = await sql`
        SELECT id FROM cash_closings
        WHERE created_by = ${actorId} AND (date = ${shiftDate} OR shift_date = ${shiftDate})
          AND event_id IS NULL`;
    }
  } catch {
    [dupe] = await sql`SELECT id FROM cash_closings WHERE created_by = ${actorId} AND date = ${shiftDate}`;
  }
  if (dupe) {
    return NextResponse.json({ error: eventId != null ? 'Za tuhle akci už máš uzávěrku odeslanou.' : 'Za tuto směnu už je uzávěrka odeslaná.' }, { status: 409 });
  }

  const shiftLabel: string | null = b.shiftLabel || (shift ? `${shift.start_time}–${shift.end_time}` : null);

  // A closing from someone with uzaverky.bez_schvaleni (vedení) is always
  // trusted. Otherwise it needs approval when the person wasn't on shift.
  const approved = p.bezSchvaleni || !!shift;

  // Povinné věci (postupy, úkoly, návody) hlídá i server — kontrola jen ve
  // formuláři by byla dekorace. uzaverky.obejit_postupy smí odeslat přesto
  // (ve formuláři to potvrdil). Ne za akci (stánek nedělá rutinu podniku) a
  // ne za člověka bez směny — ta uzávěrka jde vedení ke schválení a blokovat
  // ji by nechalo peníze nenahlášené. Zdroj, který nejde zjistit (migrace),
  // neblokuje. Odpověď nese `kod` a seznam, aby formulář ukázal zámek.
  // Na tabletu rozhoduje role člověka, za kterého se zavírá (smiObejitPovinne).
  if (eventId == null && shift && !(await smiObejitPovinne(c, actorId))) {
    const stav = await chybejiciPredUzaverkou({ teamId: c.teamId, den: shiftDate, actorId, posadka: shiftEmployeeIds, typy: typyPovinnych });
    if (jeZamceno(stav)) {
      return NextResponse.json({
        error: zpravaZamceno(stav.polozky),
        kod: 'POVINNE_NESPLNENO',
        chybi: stav.polozky,
      }, { status: 400 });
    }
  }

  // Itemised movements and the reason for a mismatch travel with the closing.
  const movements = normalizeMovements(b.movements);
  const diffReason = b.diffReason ? String(b.diffReason).slice(0, 40) : null;
  const diffNote = b.diffNote ? String(b.diffNote).trim().slice(0, 500) || null : null;
  const denominations = normalizeDenominations(b.denominations);
  // The card half of the tips: never in the drawer, so the expected cash must
  // not count it. Clamped to the total — a card half larger than the whole is
  // a typo, not data.
  const tipsCard = Math.min(Math.max(0, Math.round(Number(b.tipsCard) || 0)), Math.max(0, money(b.tips)));
  // End-of-shift removal happens AFTER the count, so it can never exceed what
  // was counted — clamp instead of trusting the client.
  const finalRemoval = Math.min(
    Math.max(0, Math.round(Number(b.finalRemoval) || 0)),
    Math.max(0, money(b.closingCash)),
  );

  let row: any;
  try {
   try {
    [row] = await sql`
      INSERT INTO cash_closings (
        team_id, created_by, date, shift_date, shift_label, shift_id, approved, approved_by, payout_from_register,
        tips_in_drawer, shift_employees, movements, diff_reason, diff_note, denominations, final_removal, event_id,
        opening_cash, cash_revenue, card_revenue, tips, expenses,
        cash_removed, self_payout, closing_cash, customers, notes
      ) VALUES (
        ${c.teamId}, ${actorId}, ${date}, ${shiftDate}, ${shiftLabel}, ${shiftId}, ${approved}, ${p.bezSchvaleni ? c.meId : null}, ${payoutFromRegister},
        ${tipsInDrawer}, ${JSON.stringify(shiftEmployeeIds)}::jsonb,
        ${JSON.stringify(movements)}::jsonb, ${diffReason}, ${diffNote},
        ${JSON.stringify(denominations)}::jsonb, ${finalRemoval}, ${eventId},
        ${money(b.openingCash)}, ${money(b.cashRevenue)}, ${money(b.cardRevenue)}, ${money(b.tips)}, ${money(b.expenses)},
        ${money(b.cashRemoved)}, ${money(b.selfPayout)}, ${money(b.closingCash)}, ${count(b.customers)}, ${b.notes || null}
      ) RETURNING *`;
  } catch {
   try {
    // final_removal not migrated yet.
    [row] = await sql`
      INSERT INTO cash_closings (
        team_id, created_by, date, shift_label, shift_id, approved, approved_by, payout_from_register,
        tips_in_drawer, shift_employees, movements, diff_reason, diff_note, denominations,
        opening_cash, cash_revenue, card_revenue, tips, expenses,
        cash_removed, self_payout, closing_cash, customers, notes
      ) VALUES (
        ${c.teamId}, ${actorId}, ${date}, ${shiftLabel}, ${shiftId}, ${approved}, ${p.bezSchvaleni ? c.meId : null}, ${payoutFromRegister},
        ${tipsInDrawer}, ${JSON.stringify(shiftEmployeeIds)}::jsonb,
        ${JSON.stringify(movements)}::jsonb, ${diffReason}, ${diffNote},
        ${JSON.stringify(denominations)}::jsonb,
        ${money(b.openingCash)}, ${money(b.cashRevenue)}, ${money(b.cardRevenue)}, ${money(b.tips)}, ${money(b.expenses)},
        ${money(b.cashRemoved)}, ${money(b.selfPayout)}, ${money(b.closingCash)}, ${count(b.customers)}, ${b.notes || null}
      ) RETURNING *`;
   } catch {
    try {
      // tips_in_drawer / shift_employees not migrated yet.
      [row] = await sql`
        INSERT INTO cash_closings (
          team_id, created_by, date, shift_label, shift_id, approved, approved_by, payout_from_register,
          opening_cash, cash_revenue, card_revenue, tips, expenses,
          cash_removed, self_payout, closing_cash, customers, notes
        ) VALUES (
          ${c.teamId}, ${actorId}, ${date}, ${shiftLabel}, ${shiftId}, ${approved}, ${p.bezSchvaleni ? c.meId : null}, ${payoutFromRegister},
          ${money(b.openingCash)}, ${money(b.cashRevenue)}, ${money(b.cardRevenue)}, ${money(b.tips)}, ${money(b.expenses)},
          ${money(b.cashRemoved)}, ${money(b.selfPayout)}, ${money(b.closingCash)}, ${count(b.customers)}, ${b.notes || null}
        ) RETURNING *`;
    } catch {
      // approval/shift columns not migrated yet — insert the core row so closings still work.
      [row] = await sql`
        INSERT INTO cash_closings (
          team_id, created_by, date, shift_label,
          opening_cash, cash_revenue, card_revenue, tips, expenses,
          cash_removed, self_payout, closing_cash, customers, notes
        ) VALUES (
          ${c.teamId}, ${actorId}, ${date}, ${shiftLabel},
          ${money(b.openingCash)}, ${money(b.cashRevenue)}, ${money(b.cardRevenue)}, ${money(b.tips)}, ${money(b.expenses)},
          ${money(b.cashRemoved)}, ${money(b.selfPayout)}, ${money(b.closingCash)}, ${count(b.customers)}, ${b.notes || null}
        ) RETURNING *`;
    }
   }
   }
  } catch (e: any) {
    // The partial unique index closes the double-submit race the SELECT above
    // can't — turn the violation into the same friendly 409.
    if (e?.code === '23505') {
      // Which rule fired matters: the SELECT above already let this through, so
      // a violation here means the database still carries the older
      // one-per-DAY index. Naming it turns „nejde to uložit" into something
      // actionable instead of a mystery.
      const stale = String(e?.constraint ?? '') === 'cash_closings_one_per_day';
      return NextResponse.json({
        error: stale
          ? 'Uzávěrku blokuje starší databázové pravidlo „jedna uzávěrka na den". Spusť /api/init — přestaví se na pravidlo podle směn.'
          : 'Za tuto směnu už je uzávěrka odeslaná.',
      }, { status: 409 });
    }
    throw e;
  }

  // The business day the closing belongs to — separate from `date` so a night
  // shift's closing stays attached to the shift that earned it.
  if (row?.id) {
    try {
      await sql`UPDATE cash_closings SET shift_date = ${shiftDate} WHERE id = ${row.id}`;
      row.shift_date = shiftDate;
    } catch { /* column not migrated yet */ }
    if (eventId != null) {
      try {
        await sql`UPDATE cash_closings SET event_id = ${eventId} WHERE id = ${row.id}`;
        row.event_id = eventId;
      } catch { /* column not migrated yet */ }
    }
  }

  // ---- „podřadná uzávěrka" akce: denní uzávěrka sama rozepíše okna akcí ----
  // Když se ten den u nás koná akce s časem, uzávěrka pozná kolik z tržby
  // spadlo do jejího okna (z účtenek pokladny) a rozpis si uloží k sobě.
  // Jen informativní vrstva — částky uzávěrky se nemění, finance nedvojí.
  if (row?.id && eventId == null) {
    try {
      const dayEvents = await sql`
        SELECT id, title, start_time, end_time FROM events
        WHERE team_id = ${c.teamId} AND date = ${shiftDate} AND status <> 'cancelled'
          AND offsite = FALSE AND start_time IS NOT NULL`;
      if ((dayEvents as any[]).length) {
        const conn = await getConnection(c.teamId);
        if (conn) {
          const breakdown: any[] = [];
          for (const ev2 of (dayEvents as any[]).slice(0, 3)) {
            try {
              const w = await eventWindowFromPos(conn, { date: shiftDate, startTime: ev2.start_time, endTime: ev2.end_time }, 8);
              breakdown.push({ eventId: Number(ev2.id), title: String(ev2.title), from: w.from, till: w.till, revenue: w.revenue, bills: w.bills });
            } catch { /* jedno okno nesmí shodit uzávěrku */ }
          }
          if (breakdown.length) {
            try {
              await sql`UPDATE cash_closings SET event_breakdown = ${JSON.stringify(breakdown)}::jsonb WHERE id = ${row.id}`;
              row.event_breakdown = breakdown;
            } catch { /* sloupec před migrací */ }
          }
        }
      }
    } catch { /* rozpis je bonus — uzávěrka platí i bez něj */ }
  }

  if (tipsCard > 0 && row?.id) {
    try {
      await sql`UPDATE cash_closings SET tips_card = ${tipsCard} WHERE id = ${row.id}`;
      row.tips_card = tipsCard;
    } catch { /* column not migrated yet */ }
  }

  // The handover rides on the closing; separate UPDATE so a not-yet-migrated
  // column can't fail the insert.
  try {
    const handover = normalizeHandover(b.handover);
    if (handover) await sql`UPDATE cash_closings SET handover = ${JSON.stringify(handover)}::jsonb WHERE id = ${row.id}`;
  } catch { /* column not migrated yet */ }

  // Upozornění (kromě autora): na čekající uzávěrku ten, kdo smí schvalovat,
  // na hotovou ten, kdo vidí všechny uzávěrky (kolo 67 — dřív vedení podle
  // typu účtu; Vedení má obojí, takže dostane totéž co dřív).
  try {
    const employers = (await clenoveSOpravnenim(c.teamId, approved ? 'uzaverky.zobrazit_vse' : 'uzaverky.schvalovat'))
      .filter(id => id !== actorId);
    if (employers.length) {
      const [author] = await sql`SELECT name FROM users WHERE id = ${actorId}`;
      const diff = cashDifference({ ...(row as any), tips_in_drawer: tipsInDrawer });
      const verdict = diff === 0 ? 'kasa sedí' : diff > 0 ? `přebytek +${czk(diff)}` : `manko ${czk(diff)}`;
      const name = author?.name ?? 'Zaměstnanec';
      await Promise.allSettled(employers.map(eid => notifyUser(eid, {
        title: approved ? 'Nová uzávěrka' : '⚠️ Uzávěrka ke schválení',
        body: approved
          ? `${name} odeslal uzávěrku (${row.date}) — ${verdict}.`
          : `${name} odeslal uzávěrku (${row.date}) bez směny — schval ji v Uzávěrkách.`,
        type: approved ? (diff < 0 ? 'warning' : 'info') : 'warning',
        category: 'closing',
        link: '/employer/overview?view=reports',
      })));
    }
  } catch (e) {
    console.error('notify employers failed', e);
  }

  // Co-workers: one closing can cover everyone who worked. A colleague who has
  // no planned shift can still be added manually — we then create an auto shift
  // and give them the SAME clocked time as the person who filed the closing,
  // flagged in attendance so the employer can check/edit it.
  const refStart: string = shift?.start_time ?? '08:00';
  const refEnd: string = shift?.end_time ?? '16:00';
  let refEntry: any = null;
  try {
    [refEntry] = await sql`
      SELECT clock_in, clock_out FROM time_entries
      WHERE employee_id = ${actorId}
        AND to_char((clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${shiftDate}
      ORDER BY clock_in ASC LIMIT 1`;
  } catch { /* ignore */ }

  const coveredIds: number[] = [];
  if (eventId == null && Array.isArray(b.coworkers) && b.coworkers.length && row?.id) {
    // Kolo 62: členové podniku jednou před cyklem (členství nebo zrcadlo, bez tabletu).
    const clenove = new Set(await idClenu(c.teamId));
    for (const cw of b.coworkers) {
      const cid = parseInt(cw?.employeeId);
      if (!Number.isFinite(cid) || cid === actorId) continue;
      try {
        if (!clenove.has(cid)) continue;
        const [cwDupe] = await sql`SELECT id FROM cash_closings WHERE created_by = ${cid} AND date = ${shiftDate}`;
        if (cwDupe) continue;

        // Their shift that day, or create an auto one if they weren't scheduled.
        let cwShift: any = (await sql`SELECT id FROM shifts WHERE employee_id = ${cid} AND date = ${shiftDate} LIMIT 1`)[0];
        const noShift = !cwShift;
        if (noShift) {
          try {
            try { cwShift = (await sql`INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type, auto_created) VALUES (${c.teamId}, ${cid}, ${shiftDate}, ${refStart}, ${refEnd}, 'auto', TRUE) RETURNING id`)[0]; }
            catch { cwShift = (await sql`INSERT INTO shifts (team_id, employee_id, date, start_time, end_time, type) VALUES (${c.teamId}, ${cid}, ${shiftDate}, ${refStart}, ${refEnd}, 'auto') RETURNING id`)[0]; }
          } catch { cwShift = null; }
        }

        const cwPayout = payDailyCash ? money(cw?.payout) : 0;
        try {
          await sql`
            INSERT INTO cash_closings (team_id, created_by, date, shift_date, shift_label, shift_id, covered_by, approved, approved_by, payout_from_register, self_payout)
            VALUES (${c.teamId}, ${cid}, ${shiftDate}, ${shiftDate}, ${shiftLabel}, ${cwShift?.id ?? null}, ${row.id}, ${approved}, ${p.bezSchvaleni ? c.meId : null}, ${payoutFromRegister}, ${cwPayout})`;
        } catch {
          await sql`INSERT INTO cash_closings (team_id, created_by, date, shift_label, covered_by, self_payout) VALUES (${c.teamId}, ${cid}, ${shiftDate}, ${shiftLabel}, ${row.id}, ${cwPayout})`;
        }
        coveredIds.push(cid);

        // Attendance record with the same time as the closing author + a note.
        if (noShift) {
          try {
            const note = 'Přidán v uzávěrce — neměl naplánovanou směnu (zkontroluj čas)';
            if (refEntry?.clock_in) {
              await sql`INSERT INTO time_entries (team_id, employee_id, clock_in, clock_out, source, note) VALUES (${c.teamId}, ${cid}, ${refEntry.clock_in}, ${refEntry.clock_out ?? null}, 'closing', ${note})`;
            } else {
              await sql`INSERT INTO time_entries (team_id, employee_id, clock_in, clock_out, source, note) VALUES (${c.teamId}, ${cid}, ${`${shiftDate} ${refStart}`}, ${`${shiftDate} ${refEnd}`}, 'closing', ${note})`;
            }
          } catch { /* best-effort */ }
        }

        try {
          const [author] = await sql`SELECT name FROM users WHERE id = ${actorId}`;
          await notifyUser(cid, { title: 'Uzávěrka za tebe', body: `${author?.name ?? 'Kolega'} vyplnil uzávěrku i za tebe (${shiftDate}).`, type: 'info', category: 'closing', link: '/employee/shifts?view=closing' });
        } catch { /* best-effort */ }
      } catch { /* skip this coworker */ }
    }
  }

  // Colleagues added by hand were on the shift too — fold them into the crew.
  const finalCrew = shiftEmployeeIds.concat(coveredIds.filter(id => !shiftEmployeeIds.includes(id)));
  if (row?.id && finalCrew.length > shiftEmployeeIds.length) {
    try {
      await sql`UPDATE cash_closings SET shift_employees = ${JSON.stringify(finalCrew)}::jsonb WHERE id = ${row.id}`;
      row.shift_employees = finalCrew;
    } catch { /* column not migrated yet */ }
  }

  // Snímek mzdy: kolik autor za směnu odpracoval a vydělal v okamžiku
  // uzávěrky. Sazba se ukládá s tím — pozdější změna hodinovky nesmí
  // přepsat historii. Otevřený záznam se počítá do teď: uzávěrka JE konec
  // směny, odpíchnout se lidi chodí až po ní.
  if (row?.id && eventId == null) {
    try {
      const m = await mzdaZaSmenu(c.teamId, actorId, shiftDate);
      if (!m.noEntries && !m.suspicious) {
        await sql`
          UPDATE cash_closings SET worked_ms = ${Math.round(m.ms)}, wage_rate = ${m.rate}, wage_earned = ${m.earned}
          WHERE id = ${row.id}`;
      }
    } catch { /* sloupce před migrací — uzávěrka se tím nesmí zdržet */ }
  }

  // Kdo z osádky se zapomněl odpíchnout, se dozví hned — ne až ráno z nočního
  // úklidu. Samotné uzavření záznamu necháváme na něm (lib/staleShifts.ts):
  // uzávěrka ve 22:00 neznamená, že v 22:00 odešel. Bere si čas uzávěrky
  // jako nejpozdější doloženou stopu, takže výsledek je ten, který obsluha
  // čeká — jen s možností se ještě odpíchnout a mít čas přesně.
  const openClockIns: { id: number; name: string }[] = [];
  try {
    const osadka = Array.from(new Set<number>([actorId, ...coveredIds]));
    const otevrene = await sql`
      SELECT te.employee_id AS id, u.name
      FROM time_entries te JOIN users u ON u.id = te.employee_id
      WHERE te.team_id = ${c.teamId} AND te.clock_out IS NULL AND te.employee_id = ANY(${osadka})
        AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${shiftDate}`;
    for (const o of otevrene as any[]) {
      openClockIns.push({ id: Number(o.id), name: String(o.name ?? '') });
      notifyUser(Number(o.id), {
        title: '⏱️ Odpíchni se',
        body: 'Uzávěrka je hotová, ale příchod máš pořád otevřený. Odpíchni se — jinak směnu uzavřeme podle času uzávěrky.',
        type: 'warning',
        category: 'shift',
        link: '/employee/shifts',
      }).catch(() => {});
    }
  } catch { /* před migrací */ }

  return NextResponse.json({ ok: true, closing: row, approved, covered: coveredIds.length, tipsInDrawer, openClockIns });
}
