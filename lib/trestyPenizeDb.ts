// Peníze v trestech a výplatě — databáze. Pravidla jsou čistá v lib/trestyPenize.ts (testy
// scripts/testy/k96-tresty-penize.ts), kontrakt pro UI v docs/TRESTY-PENIZE.md.
//
// Model:
//  - krácení nenárokové složky = penalties.bonus_cut → wage_adjustments source 'trest', source_ref = trest;
//  - srážky (náhrada škody, přímá srážka) = wage_deductions; uplatněná srážka se rozloží do výplat
//    jako wage_adjustments source 'nahrada' | 'srazka', source_ref = srážka; čekající na souhlas nic;
//  - záskok = penalty_transfers; skutečně přešlé peníze jsou wage_adjustments source 'zaskok',
//    source_ref = převod, poměrně k tomu, co se z trestu opravdu strhlo;
//  - všechno se po každé změně (udělení, úprava, zrušení, souhlas, nesouhlas) přepočítá jedním
//    `prepocitejPenizeTrestu` a srovná s uzavřenými obdobími (srovnejSZamky: zamčené řádky zůstanou,
//    rozdíl jde opravným řádkem do prvního otevřeného dne).
// Před migrací (tabulky nebo sloupce chybí) se čtení chová jako „bez peněz".

import { neon } from '@neondatabase/serverless';
import { earnedFor, MAX_SHIFT_HOURS } from './wages';
import { parseDbTime, pragueDayOf } from './pragueTime';
import { sazbaVPodniku } from './tenant';
import { normalizujSmlouvu, type TypSmlouvy, type ZamekObdobi } from './dochazkaPrehled';
import { zajistiConsents } from './consentsDb';
import {
  KANAL_SOUHLASU_SRAZKY, TYP_SOUHLASU_SRAZKY, VERZE_DOHODY_O_SRAZCE, ZDROJ_KRACENI, ZDROJ_PREMIE, ZDROJ_ZASKOK,
  mesicePrumeru, odKdySrazka, posledniDenMesice, potrebujeSouhlas, preskalujPodily, prumernyVydelek, rozpisPrevoduNaKusy, rozvrhSplatek,
  slozkaZaObdobi, slozkaZeSloupcu, srovnejSZamky, vetaSouhlasu, zneniDohodyOSrazce,
  type DruhSrazky, type KomuZaskok, type NastaveniSlozky, type PenizeTrestu, type PrevodTrestu, type SrazkaTrestu, type StavSrazky, type ZpusobZaskoku,
} from './trestyPenize';

const sql = neon(process.env.DATABASE_URL!);

const predMigraci = (e: unknown) => {
  const kod = (e as { code?: string } | null)?.code;
  return kod === '42P01' || kod === '42703';
};
const iso = (v: unknown): string | null => { const d = parseDbTime(v as string); return d ? d.toISOString() : null; };

// ---------------------------------------------------------------------------
// Člověk: smlouva, nenároková složka, mzda za období, průměrný výdělek
// ---------------------------------------------------------------------------

export async function smlouvaClena(teamId: number, userId: number): Promise<TypSmlouvy | null> {
  try {
    const [r] = await sql`SELECT contract_type FROM team_members WHERE team_id = ${teamId} AND user_id = ${userId}`;
    return normalizujSmlouvu(r?.contract_type);
  } catch { return null; }
}

/** Nenárokové složky členů podniku (jen ti, kdo ji mají). */
export async function nactiSlozky(teamId: number): Promise<Map<number, NastaveniSlozky>> {
  const m = new Map<number, NastaveniSlozky>();
  try {
    const rows = await sql`
      SELECT user_id, nenarokova_typ, nenarokova_hodnota, nenarokova_v_sazbe FROM team_members
      WHERE team_id = ${teamId} AND nenarokova_typ IS NOT NULL`;
    for (const r of rows as any[]) {
      const s = slozkaZeSloupcu(r.nenarokova_typ, r.nenarokova_hodnota, r.nenarokova_v_sazbe);
      if (s) m.set(Number(r.user_id), s);
    }
  } catch { /* před migrací */ }
  return m;
}

export async function slozkaClena(teamId: number, userId: number): Promise<NastaveniSlozky | null> {
  try {
    const [r] = await sql`
      SELECT nenarokova_typ, nenarokova_hodnota, nenarokova_v_sazbe FROM team_members WHERE team_id = ${teamId} AND user_id = ${userId}`;
    return r ? slozkaZeSloupcu(r.nenarokova_typ, r.nenarokova_hodnota, r.nenarokova_v_sazbe) : null;
  } catch { return null; }
}

/**
 * Odpracovaný čas a hrubá mzda člověka po měsících (pražský den příchodu) v <od, do>: stejná aritmetika
 * jako docházka (earnedFor po záznamu, záznamy nad 24 h se nepočítají, otevřený do teď).
 */
export async function mzdaPoMesicich(teamId: number, userId: number, od: string, doD: string, ted = Date.now()): Promise<Map<string, { ms: number; mzda: number | null }>> {
  const out = new Map<string, { ms: number; mzda: number | null }>();
  let sazba = 0;
  try { sazba = Math.max(0, Number(await sazbaVPodniku(userId, teamId)) || 0); } catch { /* bez sazby */ }
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT clock_in, clock_out FROM time_entries
      WHERE team_id = ${teamId} AND employee_id = ${userId}
        AND to_char((clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') >= ${od}
        AND to_char((clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') <= ${doD}`;
  } catch { return out; }
  for (const r of rows) {
    const a = parseDbTime(r.clock_in);
    if (!a) continue;
    const b = r.clock_out ? parseDbTime(r.clock_out) : new Date(ted);
    const ms = Math.max(0, (b?.getTime() ?? a.getTime()) - a.getTime());
    if (ms / 3_600_000 >= MAX_SHIFT_HOURS) continue;
    const mesic = pragueDayOf(a).slice(0, 7);
    const x = out.get(mesic) ?? { ms: 0, mzda: sazba > 0 ? 0 : null };
    x.ms += ms;
    if (x.mzda != null) x.mzda += earnedFor(ms, sazba);
    out.set(mesic, x);
  }
  return out;
}

/** Nenároková složka člověka za měsíc dne `day` (podle dosud odpracovaných hodin). */
export async function slozkaMesiceDb(teamId: number, userId: number, day: string): Promise<number> {
  const s = await slozkaClena(teamId, userId);
  if (!s) return 0;
  const mesic = day.slice(0, 7);
  const m = (await mzdaPoMesicich(teamId, userId, `${mesic}-01`, posledniDenMesice(mesic))).get(mesic) ?? { ms: 0, mzda: null };
  return slozkaZaObdobi(s, { mzda: m.mzda, ms: m.ms, od: `${mesic}-01`, do: posledniDenMesice(mesic) });
}

/** Průměrný měsíční výdělek za poslední 3 celé měsíce: mzda z hodin + kladné úpravy mzdy (prémie). */
export async function prumerVydelkuDb(teamId: number, userId: number, dnes: string): Promise<{ prumer: number | null; mesicu: number }> {
  const mesice = mesicePrumeru(dnes);
  const od = `${mesice[0]}-01`;
  const doD = posledniDenMesice(mesice[mesice.length - 1]);
  const mzdy = await mzdaPoMesicich(teamId, userId, od, doD);
  const premie = new Map<string, number>();
  try {
    const rows = await sql`
      SELECT substring(day, 1, 7) AS mesic, COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0)::int AS plus
      FROM wage_adjustments WHERE team_id = ${teamId} AND user_id = ${userId} AND day >= ${od} AND day <= ${doD}
      GROUP BY substring(day, 1, 7)`;
    for (const r of rows as any[]) premie.set(String(r.mesic), Number(r.plus) || 0);
  } catch { /* bez úprav */ }
  return prumernyVydelek(mesice.map(m => ({ mesic: m, hruba: (mzdy.get(m)?.mzda ?? 0) + (premie.get(m) ?? 0) })));
}

/**
 * Strop krácení za měsíc dne `day`: nenároková složka (podle dosud odpracovaných hodin) + nenárokové
 * prémie a přijatý záskok − krácení jinými platnými tresty. `premie` vrací jen nenárokové prémie
 * (source 'premie'), jak to okno trestu ukazuje od spuštění.
 */
export async function nenarokovePrijmyMesice(teamId: number, userId: number, day: string, bezTrestu: number | null): Promise<{ premie: number; zaskok: number; uzKraceno: number }> {
  const od = `${day.slice(0, 7)}-01`;
  const doDne = `${day.slice(0, 7)}-31`;
  try {
    const [r] = await sql`
      SELECT COALESCE(SUM(amount) FILTER (WHERE amount > 0 AND source = ${ZDROJ_PREMIE}), 0)::int AS premie,
             COALESCE(SUM(amount) FILTER (WHERE source = ${ZDROJ_ZASKOK}), 0)::int AS zaskok,
             COALESCE(-SUM(amount) FILTER (WHERE source = ${ZDROJ_KRACENI} AND (${bezTrestu}::int IS NULL OR source_ref IS DISTINCT FROM ${bezTrestu})), 0)::int AS kraceno
      FROM wage_adjustments
      WHERE team_id = ${teamId} AND user_id = ${userId} AND day >= ${od} AND day <= ${doDne}`;
    return { premie: Number(r?.premie) || 0, zaskok: Math.max(0, Number(r?.zaskok) || 0), uzKraceno: Math.max(0, Number(r?.kraceno) || 0) };
  } catch { return { premie: 0, zaskok: 0, uzKraceno: 0 }; }
}

// ---------------------------------------------------------------------------
// Zámky a srovnání úprav mzdy
// ---------------------------------------------------------------------------

/** Zámky období podniku, které končí v den `od` nebo později. */
export async function zamkyOd(teamId: number, od: string): Promise<ZamekObdobi[]> {
  try {
    const rows = await sql`SELECT id, period_from, period_to FROM payroll_locks WHERE team_id = ${teamId} AND period_to >= ${od} ORDER BY period_from`;
    return (rows as any[]).map(r => ({ id: Number(r.id), od: String(r.period_from), do: String(r.period_to) }));
  } catch { return []; }
}

/** Srovná řádky wage_adjustments jednoho zdroje a vazby s cílem (lib/trestyPenize srovnejSZamky). */
export async function srovnejUpravy(o: {
  teamId: number; userId: number; source: string; sourceRef: number; cil: readonly { den: string; castka: number }[];
  note: string; createdBy: number | null; zamky: readonly ZamekObdobi[]; batchId?: number | null;
}): Promise<{ smazano: number; vlozeno: number; opravy: number }> {
  const rows = await sql`
    SELECT id, day, amount FROM wage_adjustments
    WHERE team_id = ${o.teamId} AND user_id = ${o.userId} AND source = ${o.source} AND source_ref = ${o.sourceRef}`;
  const r = srovnejSZamky((rows as any[]).map(x => ({ id: Number(x.id), den: String(x.day).slice(0, 10), castka: Number(x.amount) || 0 })), o.cil, o.zamky);
  if (r.smazat.length) await sql`DELETE FROM wage_adjustments WHERE team_id = ${o.teamId} AND id = ANY(${r.smazat})`;
  for (const v of r.vlozit) {
    const note = `${o.note}${v.oprava ? ' (oprava za uzavřené období)' : ''}`.slice(0, 200);
    await sql`
      INSERT INTO wage_adjustments (team_id, user_id, day, amount, note, source, source_ref, created_by, batch_id)
      VALUES (${o.teamId}, ${o.userId}, ${v.den}, ${v.castka}, ${note}, ${o.source}, ${o.sourceRef}, ${o.createdBy}, ${o.batchId ?? null})`;
  }
  return { smazano: r.smazat.length, vlozeno: r.vlozit.length, opravy: r.vlozit.filter(v => v.oprava).length };
}

// ---------------------------------------------------------------------------
// Přepočet peněz jednoho trestu
// ---------------------------------------------------------------------------

/**
 * Po každé změně trestu, srážky nebo záskoku: krácení, splátky uplatněných srážek a převody
 * záskoku znovu z jednoho místa. Plánovaný základ převodů = krácení + srážky, které platí nebo čekají
 * na souhlas; když se změní (snížení, zrušení, nesouhlas), podíly se přeškálují. Peníze ze srážky
 * čekající na souhlas přejdou až se srážkou.
 */
export async function prepocitejPenizeTrestu(teamId: number, trestId: number, kdo: number | null): Promise<void> {
  const [p] = await sql`SELECT id, user_id, day, bonus_cut, status, text FROM penalties WHERE id = ${trestId} AND team_id = ${teamId}`;
  if (!p) return;
  const userId = Number(p.user_id);
  const day = String(p.day).slice(0, 10);
  const plati = p.status === 'plati';
  const kraceni = plati ? Math.max(0, Number(p.bonus_cut) || 0) : 0;
  const text = String(p.text ?? '').replace(/\s+/g, ' ').slice(0, 140);
  const zamky = await zamkyOd(teamId, day);

  await srovnejUpravy({ teamId, userId, source: ZDROJ_KRACENI, sourceRef: trestId, cil: kraceni ? [{ den: day, castka: -kraceni }] : [], note: `Trest: ${text}`, createdBy: kdo, zamky });
  try {
    await sql`
      UPDATE penalties SET adjustment_id = (SELECT MIN(id) FROM wage_adjustments WHERE team_id = ${teamId} AND source = ${ZDROJ_KRACENI} AND source_ref = ${trestId})
      WHERE id = ${trestId} AND team_id = ${teamId}`;
  } catch { /* nevadí */ }

  const kusy: { den: string; castka: number }[] = kraceni ? [{ den: day, castka: kraceni }] : [];
  let planovano = kraceni;
  let srazky: any[] = [];
  try {
    srazky = await sql`SELECT id, kind, amount, installments, status, apply_from, reason FROM wage_deductions WHERE team_id = ${teamId} AND penalty_id = ${trestId} ORDER BY id`;
  } catch (e) { if (!predMigraci(e)) throw e; return; }
  for (const s of srazky) {
    const stav = String(s.status) as StavSrazky;
    const castka = Math.max(0, Number(s.amount) || 0);
    if (plati && (stav === 'ceka' || stav === 'uplatneno')) planovano += castka;
    const cil = plati && stav === 'uplatneno' && s.apply_from ? rozvrhSplatek(castka, Number(s.installments) || 1, String(s.apply_from)) : [];
    kusy.push(...cil);
    const druh = String(s.kind) as DruhSrazky;
    await srovnejUpravy({
      teamId, userId, source: druh, sourceRef: Number(s.id), cil: cil.map(x => ({ den: x.den, castka: -x.castka })),
      note: `${druh === 'nahrada' ? 'Náhrada škody' : 'Srážka'}: ${String(s.reason ?? text).slice(0, 140)}`, createdBy: kdo, zamky,
    });
  }
  kusy.sort((a, b) => a.den.localeCompare(b.den));

  let prevody: any[] = [];
  try { prevody = await sql`SELECT id, user_id, amount, base, status FROM penalty_transfers WHERE team_id = ${teamId} AND penalty_id = ${trestId} ORDER BY id`; }
  catch (e) { if (!predMigraci(e)) throw e; return; }
  const platne = prevody.filter(t => t.status === 'plati');
  // Plánovaný základ se změnil → podíly poměrně (snížení, zrušená srážka, nesouhlas).
  const stary = platne.length ? Number(platne[0].base) || 0 : 0;
  if (platne.length && stary !== planovano) {
    const nove = preskalujPodily(platne.map(t => Number(t.amount) || 0), stary, planovano);
    for (let i = 0; i < platne.length; i++) {
      platne[i].amount = nove[i];
      platne[i].base = planovano;
      await sql`UPDATE penalty_transfers SET amount = ${nove[i]}, base = ${planovano} WHERE id = ${Number(platne[i].id)} AND team_id = ${teamId}`;
    }
  }
  for (const t of prevody) {
    const aktivni = plati && t.status === 'plati';
    const cil = aktivni ? rozpisPrevoduNaKusy([{ klic: Number(t.id), castka: Number(t.amount) || 0 }], kusy, Number(t.base) || 0) : [];
    await srovnejUpravy({
      teamId, userId: Number(t.user_id), source: ZDROJ_ZASKOK, sourceRef: Number(t.id), cil: cil.map(x => ({ den: x.den, castka: x.castka })),
      note: `Záskok: ${text}`, createdBy: kdo, zamky,
    });
  }
}

// ---------------------------------------------------------------------------
// Zápis srážek a převodů
// ---------------------------------------------------------------------------

export interface NovaSrazka {
  druh: DruhSrazky;
  castka: number;
  splatky: number;
  duvod: string;
  skoda?: { castka: number; druh: string; zavineni: string; dohoda: boolean; dohodaDatum: string | null; prumer: number | null; strop: number | null; varovani: string | null } | null;
}

/** Založí srážku k trestu; stav podle smlouvy (OSVČ hned, jinak čeká na souhlas). Vrací id a stav. */
export async function zalozSrazku(o: { teamId: number; userId: number; trestId: number; day: string; smlouva: TypSmlouvy | null; s: NovaSrazka; kdo: number | null; dnes: string }): Promise<{ id: number; stav: StavSrazky }> {
  const souhlas = potrebujeSouhlas(o.smlouva);
  const stav: StavSrazky = souhlas ? 'ceka' : 'uplatneno';
  const applyFrom = souhlas ? null : odKdySrazka({ denTrestu: o.day, denSouhlasu: null, zamky: await zamkyOd(o.teamId, o.day) });
  const sk = o.s.skoda ?? null;
  const [r] = await sql`
    INSERT INTO wage_deductions (team_id, user_id, penalty_id, kind, amount, installments, reason, day, status, needs_consent, contract_type,
      damage_amount, damage_kind, fault, liability_agreement, liability_agreement_date, avg_earnings, cap, cap_warning, apply_from, created_by)
    VALUES (${o.teamId}, ${o.userId}, ${o.trestId}, ${o.s.druh}, ${o.s.castka}, ${o.s.splatky}, ${o.s.duvod.slice(0, 500)}, ${o.day}, ${stav}, ${souhlas}, ${o.smlouva},
      ${sk?.castka ?? null}, ${sk?.druh ?? null}, ${sk?.zavineni ?? null}, ${sk?.dohoda ?? false}, ${sk?.dohodaDatum ?? null}, ${sk?.prumer ?? null}, ${sk?.strop ?? null},
      ${sk?.varovani ?? null}, ${applyFrom}, ${o.kdo})
    RETURNING id`;
  return { id: Number(r.id), stav };
}

/** Založí převody záskoku (plánované podíly ze základu). */
export async function zalozPrevody(o: { teamId: number; trestId: number; podily: readonly { userId: number; castka: number }[]; zaklad: number; kdo: number | null }): Promise<number[]> {
  const ids: number[] = [];
  for (const p of o.podily) {
    if (!(p.castka > 0)) continue;
    const [r] = await sql`
      INSERT INTO penalty_transfers (team_id, penalty_id, user_id, amount, base, status, created_by)
      VALUES (${o.teamId}, ${o.trestId}, ${p.userId}, ${p.castka}, ${o.zaklad}, 'plati', ${o.kdo})
      RETURNING id`;
    ids.push(Number(r.id));
  }
  return ids;
}

/** Plánovaný základ záskoku trestu: krácení + srážky, které platí nebo čekají na souhlas. */
export async function zakladZaskoku(teamId: number, trestId: number): Promise<number> {
  const [p] = await sql`SELECT bonus_cut, status FROM penalties WHERE id = ${trestId} AND team_id = ${teamId}`;
  if (!p || p.status !== 'plati') return 0;
  let s = Math.max(0, Number(p.bonus_cut) || 0);
  try {
    const [r] = await sql`SELECT COALESCE(SUM(amount), 0)::int AS n FROM wage_deductions WHERE team_id = ${teamId} AND penalty_id = ${trestId} AND status IN ('ceka', 'uplatneno')`;
    s += Number(r?.n) || 0;
  } catch { /* před migrací */ }
  return s;
}

/**
 * Lidé ze směny dne (plán i docházka; s uzávěrkou i lidé z ní) — pro „rozdělit mezi směnu"
 * a hromadný výběr „celá směna". Bez tabletu; ověření členství dělá volající.
 */
export async function osadkaSmeny(teamId: number, day: string, closingId: number | null = null): Promise<{ smena: number[]; uzaverka: number[] }> {
  const smena = new Set<number>();
  const uzaverka = new Set<number>();
  try {
    const rows = await sql`
      SELECT employee_id FROM shifts WHERE team_id = ${teamId} AND date = ${day}
      UNION
      SELECT employee_id FROM time_entries WHERE team_id = ${teamId}
        AND to_char((clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') = ${day}`;
    for (const r of rows as any[]) smena.add(Number(r.employee_id));
  } catch { /* před migrací */ }
  if (closingId) {
    try {
      const [c] = await sql`SELECT created_by, shift_employees FROM cash_closings WHERE id = ${closingId} AND team_id = ${teamId}`;
      if (c) {
        if (c.created_by != null) uzaverka.add(Number(c.created_by));
        for (const x of Array.isArray(c.shift_employees) ? c.shift_employees : []) { const n = Number(x); if (Number.isFinite(n)) uzaverka.add(n); }
      }
    } catch { /* před migrací */ }
  }
  return { smena: [...smena].filter(n => n > 0), uzaverka: [...uzaverka].filter(n => n > 0) };
}

// ---------------------------------------------------------------------------
// Souhlas se srážkou (tabulka consents jako ostatní souhlasy)
// ---------------------------------------------------------------------------

/** Zapíše souhlas / nesouhlas se srážkou do `consents` (jen nový řádek). Vrací id řádku nebo null. */
export async function zapisSouhlasSrazky(o: { userId: number; teamId: number; udelen: boolean; zneni: string }): Promise<number | null> {
  if (!(await zajistiConsents())) return null;
  try {
    const [r] = await sql`
      INSERT INTO consents (user_id, team_id, typ, stav, verze, zneni, kanal)
      VALUES (${o.userId}, ${o.teamId}, ${TYP_SOUHLASU_SRAZKY}, ${o.udelen ? 'udelen' : 'odmitnut'}, ${VERZE_DOHODY_O_SRAZCE}, ${o.zneni.slice(0, 1000)}, ${KANAL_SOUHLASU_SRAZKY})
      RETURNING id`;
    return Number(r.id);
  } catch (e) {
    console.error('srážky: zápis souhlasu selhal', (e as { code?: string })?.code ?? e);
    return null;
  }
}

export async function nazevPodniku(teamId: number): Promise<string> {
  try {
    const [t] = await sql`SELECT COALESCE(NULLIF(share_theme->>'businessName', ''), name) AS business FROM teams WHERE id = ${teamId}`;
    return String(t?.business ?? '');
  } catch {
    try { const [t] = await sql`SELECT name FROM teams WHERE id = ${teamId}`; return String(t?.name ?? ''); } catch { return ''; }
  }
}

/** Aktuální znění dohody o srážce (pro čekající srážku se počítá k dnešku a zámkům). */
export function zneniSrazky(s: { kind: string; amount: number; installments: number; reason: string; day: string }, o: { dnes: string; zamky: readonly ZamekObdobi[]; podnik: string; kc: (n: number) => string }): string {
  const od = odKdySrazka({ denTrestu: s.day, denSouhlasu: o.dnes, zamky: o.zamky });
  return zneniDohodyOSrazce({ castka: s.amount, splatky: s.installments, duvod: s.reason, podnik: o.podnik, odMesice: od.slice(0, 7), druh: s.kind === 'nahrada' ? 'nahrada' : 'srazka' }, o.kc);
}

// ---------------------------------------------------------------------------
// Čtení pro klienta (GET /api/tresty → item.penize, výplatní listina)
// ---------------------------------------------------------------------------

/**
 * Peníze k trestům. `vedeni` = divák smí peníze (finance.mzdy): vidí jména příjemců záskoku. Zaměstnanec
 * vidí u svého trestu srážky a souhrn záskoku bez jmen. Prázdná mapa před migrací.
 */
export async function nactiPenize(teamId: number, tresty: readonly { id: number; bonusCut: number; status: string }[], o: { vedeni: boolean; dnes: string; kc: (n: number) => string; zaskok?: Map<number, { komu: KomuZaskok; zpusob: ZpusobZaskoku | null }> }): Promise<Map<number, PenizeTrestu>> {
  const out = new Map<number, PenizeTrestu>();
  if (!tresty.length) return out;
  const ids = tresty.map(t => t.id);
  let srazky: any[] = [];
  let prevody: any[] = [];
  try {
    srazky = await sql`
      SELECT id, penalty_id, kind, amount, installments, reason, day, status, needs_consent, contract_type, damage_amount, damage_kind, fault,
        liability_agreement, liability_agreement_date, avg_earnings, cap, cap_warning, apply_from, consent_text, consent_at, refused_at, refuse_note, cancelled_at
      FROM wage_deductions WHERE team_id = ${teamId} AND penalty_id = ANY(${ids}) ORDER BY id`;
    prevody = await sql`
      SELECT t.id, t.penalty_id, t.user_id, t.amount, t.status, u.name AS user_name,
        COALESCE((SELECT SUM(w.amount) FROM wage_adjustments w WHERE w.team_id = ${teamId} AND w.source = ${ZDROJ_ZASKOK} AND w.source_ref = t.id), 0)::int AS preslo
      FROM penalty_transfers t LEFT JOIN users u ON u.id = t.user_id
      WHERE t.team_id = ${teamId} AND t.penalty_id = ANY(${ids}) ORDER BY t.id`;
  } catch (e) { if (predMigraci(e)) return out; throw e; }
  const potrebaZneni = srazky.some(s => s.status === 'ceka');
  const zamky = potrebaZneni ? await zamkyOd(teamId, o.dnes.slice(0, 7) + '-01') : [];
  const podnik = potrebaZneni ? await nazevPodniku(teamId) : '';
  for (const t of tresty) {
    const moje = srazky.filter(s => Number(s.penalty_id) === t.id);
    const mojePrevody = prevody.filter(p => Number(p.penalty_id) === t.id);
    const z = o.zaskok?.get(t.id) ?? { komu: 'podnik' as KomuZaskok, zpusob: null };
    if (!moje.length && !mojePrevody.length && !(t.bonusCut > 0)) continue;
    const srazkyTvar: SrazkaTrestu[] = moje.map(s => {
      const stav = String(s.status) as StavSrazky;
      const castka = Number(s.amount) || 0;
      const zakl = { kind: String(s.kind), amount: castka, installments: Number(s.installments) || 1, reason: String(s.reason ?? ''), day: String(s.day).slice(0, 10) };
      return {
        id: Number(s.id), druh: s.kind === 'nahrada' ? 'nahrada' : 'srazka', castka, splatky: zakl.installments, stav,
        potrebujeSouhlas: s.needs_consent !== false, smlouva: s.contract_type ?? null, proc: vetaSouhlasu(s.contract_type),
        zneni: stav === 'ceka' ? zneniSrazky(zakl, { dnes: o.dnes, zamky, podnik, kc: o.kc }) : s.consent_text ?? null,
        souhlasAt: iso(s.consent_at), nesouhlasAt: iso(s.refused_at), nesouhlasDuvod: s.refuse_note ?? null,
        odDne: s.apply_from ?? null,
        rozvrh: stav === 'uplatneno' && s.apply_from ? rozvrhSplatek(castka, zakl.installments, String(s.apply_from)) : [],
        skoda: s.damage_amount != null ? {
          castka: Number(s.damage_amount), druh: s.damage_kind ?? 'zavinena', zavineni: s.fault === 'umysl' ? 'umysl' : 'nedbalost',
          dohoda: s.liability_agreement === true, dohodaDatum: s.liability_agreement_date ?? null,
          prumer: s.avg_earnings != null ? Number(s.avg_earnings) : null, strop: s.cap != null ? Number(s.cap) : null, varovani: s.cap_warning ?? null,
        } : null,
        zrusenoAt: iso(s.cancelled_at),
      } as SrazkaTrestu;
    });
    const prevodyTvar: PrevodTrestu[] = mojePrevody.map(p => ({
      id: Number(p.id), userId: o.vedeni ? Number(p.user_id) : null, userName: o.vedeni ? p.user_name ?? null : null,
      castka: Number(p.amount) || 0, preslo: Number(p.preslo) || 0, stav: p.status === 'zruseno' ? 'zruseno' : 'plati',
    }));
    const plati = t.status === 'plati';
    out.set(t.id, {
      kraceni: Math.max(0, t.bonusCut),
      srazky: srazkyTvar,
      zaskok: { komu: z.komu, zpusob: z.zpusob, prevody: prevodyTvar },
      cekaNaSouhlas: plati ? srazkyTvar.filter(s => s.stav === 'ceka').reduce((a, s) => a + s.castka, 0) : 0,
      strzeno: plati ? Math.max(0, t.bonusCut) + srazkyTvar.filter(s => s.stav === 'uplatneno').reduce((a, s) => a + s.castka, 0) : 0,
    });
  }
  return out;
}

/** Srážky čekající na souhlas po lidech (trest v <od, do>) — výplatní listina je ukáže, nestrhne. */
export async function cekajiciSrazky(teamId: number, od: string, doD: string, userId?: number): Promise<Map<number, number>> {
  const m = new Map<number, number>();
  try {
    const rows = await sql`
      SELECT d.user_id, SUM(d.amount)::int AS n FROM wage_deductions d
      JOIN penalties p ON p.id = d.penalty_id AND p.team_id = d.team_id
      WHERE d.team_id = ${teamId} AND d.status = 'ceka' AND p.status = 'plati' AND d.day >= ${od} AND d.day <= ${doD}
        AND (${userId ?? null}::int IS NULL OR d.user_id = ${userId ?? null})
      GROUP BY d.user_id`;
    for (const r of rows as any[]) m.set(Number(r.user_id), Number(r.n) || 0);
  } catch { /* před migrací */ }
  return m;
}

/** Vlastní srážky člověka pro Můj výdělek: čekající (kdykoli) a ty, jejichž trest je v období. */
export async function mojeSrazky(teamId: number, userId: number, od: string, doD: string): Promise<{ id: number; penaltyId: number; druh: DruhSrazky; castka: number; splatky: number; stav: StavSrazky; text: string; day: string }[]> {
  try {
    const rows = await sql`
      SELECT d.id, d.penalty_id, d.kind, d.amount, d.installments, d.status, d.day, p.text
      FROM wage_deductions d JOIN penalties p ON p.id = d.penalty_id AND p.team_id = d.team_id
      WHERE d.team_id = ${teamId} AND d.user_id = ${userId}
        AND ((d.status = 'ceka' AND p.status = 'plati') OR (d.day >= ${od} AND d.day <= ${doD}))
      ORDER BY d.day DESC, d.id DESC LIMIT 100`;
    return (rows as any[]).map(r => ({
      id: Number(r.id), penaltyId: Number(r.penalty_id), druh: r.kind === 'nahrada' ? 'nahrada' : 'srazka', castka: Number(r.amount) || 0,
      splatky: Number(r.installments) || 1, stav: String(r.status) as StavSrazky, text: String(r.text ?? ''), day: String(r.day).slice(0, 10),
    }));
  } catch { return []; }
}
