// „Přepočítat zpětně body“ (kolo 91): nastaví automatické body podle nového pravidla,
// jako by platilo odjakživa — s náhledem dopadu a možností poslední přepočet vrátit.
//
// Co se přepočítá: jen řádky shift_review_items, které vznikly automaticky a vedení je
// nikdy ručně neupravilo (created_by NULL, ne rucne, poznámka „auto:…“, updated_at ≈
// created_at). Ruční úpravy vedení zůstávají. U úkolů bez řádku se řádek doplní, když
// nové pravidlo dá jiný výsledek než základ. Uzávěrky jen ty se snímkem povinných věcí.
// Strop: „zpětně“ = strop platí odjakživa (denniStropOd = null). Ruční přednost se
// respektuje sama — ruční řádky se nemění a den s ručním hodnocením zůstává nahrazený.
//
// Zůstatky lidí se počítají z řádků (lib/pointsBalance), takže po přepočtu sedí všude.
// Před uložením se staré hodnoty řádků i nastavení uloží do body_prepocty.

import { neon } from '@neondatabase/serverless';
import { normalizePoints, type PointsConfig } from './rewardLevels';
import { breakdownForTeam, totalPoints } from './pointsBalance';
import { nactiDny, upravyZDnu } from './bodyDenDb';
import { clenovePodniku } from './tenant';
import { normalizeSkipReasons } from './procedureScoring';
import { sanitizeSteps } from './steps';
import {
  bodyPostupu, bodyUkolu, bodyUzaverky, doPointsConfig, jeZmena, nastaveniRezimu, normalizujPrepis, normalizujPravidlo,
  povinneZPoznamky, rozdelRadek, souhrnDopadu, ucinnePravidlo, MAX_STROP,
  type DenBodu, type DruhBodu, type NastaveniRezimu, type PrepisRezimu, type SouhrnDopadu, type ZmenaRadku,
} from './bodyRezim';

const sql = neon(process.env.DATABASE_URL!);

export type Rozsah =
  | { typ: 'podnik'; druhy: DruhBodu[]; zpetneStrop: boolean }
  | { typ: 'postup'; id: number }
  | { typ: 'ukol'; id: number };

export interface PravidlaPrepoctu {
  /** Podnik: nové výchozí pravidlo a strop. */
  rezim?: Partial<Record<DruhBodu, unknown>>;
  denniStrop?: unknown;
  /** Položka: nové přepsání (null = podle podniku). */
  bodyRezim?: unknown;
  /** Postup: kroky z editoru, které se ukládají spolu s přepočtem (váhy a body kroků už podle nich). */
  items?: unknown;
}

export interface VysledekPrepoctu {
  zmeny: ZmenaRadku[];
  souhrn: SouhrnDopadu;
  n0: NastaveniRezimu;
  n1: NastaveniRezimu;
  raw: any;
  /** Položka: staré a nové přepsání. */
  prepis0?: PrepisRezimu | null;
  prepis1?: PrepisRezimu | null;
}

const ints = (a: unknown): number[] => (Array.isArray(a) ? a.map(n => parseInt(String(n))).filter(n => Number.isFinite(n)) : []);

export function rozsahZTela(raw: any): Rozsah | null {
  const r = raw && typeof raw === 'object' ? raw : {};
  if (r.typ === 'podnik') {
    const druhy = (Array.isArray(r.druhy) ? r.druhy : []).filter((d: unknown): d is DruhBodu => d === 'postupy' || d === 'ukoly' || d === 'uzaverky');
    return { typ: 'podnik', druhy: Array.from(new Set(druhy)), zpetneStrop: r.zpetneStrop === true };
  }
  const id = parseInt(String(r.id));
  if ((r.typ === 'postup' || r.typ === 'ukol') && Number.isFinite(id) && id > 0) return { typ: r.typ, id };
  return null;
}

async function pointsConfigOf(teamId: number): Promise<any> {
  try { const [t] = await sql`SELECT points_config FROM teams WHERE id = ${teamId}`; return t?.points_config ?? {}; } catch { return {}; }
}

/** Nové nastavení podniku z návrhu (bez uložení). */
function navrzeneNastaveni(n0: NastaveniRezimu, pravidla: PravidlaPrepoctu, rozsah: Rozsah): NastaveniRezimu {
  if (rozsah.typ !== 'podnik') return n0;
  const rz = pravidla.rezim && typeof pravidla.rezim === 'object' ? pravidla.rezim : {};
  const strop = Number(pravidla.denniStrop);
  return {
    postupy: rz.postupy !== undefined ? normalizujPravidlo(rz.postupy) : n0.postupy,
    ukoly: rz.ukoly !== undefined ? normalizujPravidlo(rz.ukoly) : n0.ukoly,
    uzaverky: rz.uzaverky !== undefined ? normalizujPravidlo(rz.uzaverky) : n0.uzaverky,
    denniStrop: pravidla.denniStrop !== undefined && Number.isFinite(strop) && strop >= 0 ? Math.min(MAX_STROP, Math.round(strop)) : n0.denniStrop,
    stropOd: rozsah.zpetneStrop ? null : n0.stropOd,
  };
}

/** Spočítá, které řádky se změní, a dopad na zůstatky. Nic nezapisuje. */
export async function spocitejPrepocet(teamId: number, rozsah: Rozsah, pravidla: PravidlaPrepoctu): Promise<VysledekPrepoctu> {
  const raw = await pointsConfigOf(teamId);
  const pt: PointsConfig = normalizePoints(raw);
  const n0 = nastaveniRezimu(raw);
  const n1 = navrzeneNastaveni(n0, pravidla, rozsah);
  const zmeny: ZmenaRadku[] = [];
  let prepis0: PrepisRezimu | null | undefined;
  let prepis1: PrepisRezimu | null | undefined;

  const chciPostupy = rozsah.typ === 'postup' || (rozsah.typ === 'podnik' && rozsah.druhy.includes('postupy'));
  const chciUkoly = rozsah.typ === 'ukol' || (rozsah.typ === 'podnik' && rozsah.druhy.includes('ukoly'));
  const chciUzaverky = rozsah.typ === 'podnik' && rozsah.druhy.includes('uzaverky');

  if (rozsah.typ === 'postup') {
    const [p] = await sql`SELECT id, body_rezim FROM procedures WHERE id = ${rozsah.id} AND team_id = ${teamId}`;
    if (!p) throw new Error('Postup nenalezen');
    prepis0 = normalizujPrepis(p.body_rezim);
    prepis1 = normalizujPrepis(pravidla.bodyRezim);
  }
  let ukolIds: number[] = [];
  if (rozsah.typ === 'ukol') {
    const [t] = await sql`SELECT id, series_id, body_rezim FROM tasks WHERE id = ${rozsah.id} AND team_id = ${teamId}`;
    if (!t) throw new Error('Úkol nenalezen');
    prepis0 = normalizujPrepis(t.body_rezim);
    prepis1 = normalizujPrepis(pravidla.bodyRezim);
    // Opakovaný úkol: přepočet se týká celé série (každý výskyt je tentýž úkol).
    ukolIds = t.series_id
      ? (await sql`SELECT id FROM tasks WHERE team_id = ${teamId} AND series_id = ${t.series_id}`).map((r: any) => Number(r.id))
      : [Number(t.id)];
  }

  if (chciPostupy) {
    const pid = rozsah.typ === 'postup' ? rozsah.id : null;
    const krokyNavrh = pid != null && Array.isArray(pravidla.items) ? sanitizeSteps(pravidla.items) : null;
    const rows = await sql`
      SELECT i.id, i.employee_id, i.work_date, i.ref_id, i.points, i.srazka, i.note,
             r.checked_items, r.skipped_items, r.skip_reasons, p.items, p.body_rezim
      FROM shift_review_items i
      JOIN procedure_runs r ON r.id = i.ref_id AND r.user_id = i.employee_id
      JOIN procedures p ON p.id = r.procedure_id
      WHERE i.team_id = ${teamId} AND i.kind = 'procedure' AND r.status = 'completed'
        AND i.created_by IS NULL AND COALESCE(i.rucne, FALSE) = FALSE AND i.note LIKE 'auto:%'
        AND i.updated_at <= i.created_at + INTERVAL '2 seconds'
        AND (${pid}::int IS NULL OR p.id = ${pid}::int)`;
    for (const r of rows as any[]) {
      const prepisPolozky = pid != null ? (prepis1 ?? null) : normalizujPrepis(r.body_rezim);
      if (pid == null && prepisPolozky?.rezim != null) continue; // má vlastní způsob — výchozí podniku se ho netýká
      const pr = ucinnePravidlo(n1.postupy, prepisPolozky, pt.procedure);
      const checked = ints(r.checked_items);
      const skipped = ints(r.skipped_items).filter(i => !checked.includes(i));
      const v = bodyPostupu(krokyNavrh ?? r.items, checked, skipped, normalizeSkipReasons(r.skip_reasons), pr, pt.procedure);
      const z: ZmenaRadku = {
        id: Number(r.id), uid: Number(r.employee_id), den: String(r.work_date), kind: 'procedure', refId: Number(r.ref_id),
        stare: Number(r.points) || 0, nove: v.radek, stareSrazka: r.srazka == null ? null : Number(r.srazka), noveSrazka: v.srazka,
        stareNote: r.note ?? null, noveNote: v.summary,
      };
      if (jeZmena(z)) zmeny.push(z);
    }
  }

  if (chciUkoly) {
    const jenIds = rozsah.typ === 'ukol' ? ukolIds : null;
    const rows = await sql`
      SELECT t.id, t.completed_by, t.checklist, t.body_rezim,
             to_char((t.completed_at AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') AS den,
             i.id AS iid, i.points, i.srazka, i.note, i.work_date,
             (i.id IS NOT NULL AND NOT (i.created_by IS NULL AND COALESCE(i.rucne, FALSE) = FALSE AND i.note LIKE 'auto:%'
               AND i.updated_at <= i.created_at + INTERVAL '2 seconds')) AS rucni
      FROM tasks t
      LEFT JOIN shift_review_items i ON i.kind = 'task' AND i.ref_id = t.id AND i.employee_id = t.completed_by AND i.team_id = ${teamId}
      WHERE t.team_id = ${teamId} AND t.status = 'done' AND t.completed_by IS NOT NULL AND t.completed_at IS NOT NULL
        AND (${jenIds}::int[] IS NULL OR t.id = ANY(${jenIds}::int[]))`;
    for (const r of rows as any[]) {
      if (r.rucni === true) continue; // vedení body k úkolu zadalo ručně
      const prepisPolozky = jenIds ? (prepis1 ?? null) : normalizujPrepis(r.body_rezim);
      if (!jenIds && prepisPolozky?.rezim != null) continue;
      const pr = ucinnePravidlo(n1.ukoly, prepisPolozky, pt.task);
      const v = bodyUkolu(r.checklist, pr, pt.task);
      const z: ZmenaRadku = {
        id: r.iid == null ? null : Number(r.iid), uid: Number(r.completed_by), den: String(r.work_date ?? r.den), kind: 'task', refId: Number(r.id),
        stare: Number(r.points) || 0, nove: v.radek, stareSrazka: r.srazka == null ? null : Number(r.srazka), noveSrazka: v.srazka,
        stareNote: r.note ?? null, noveNote: v.summary,
      };
      if (jeZmena(z)) zmeny.push(z);
    }
  }

  if (chciUzaverky) {
    const rows = await sql`
      SELECT i.id, i.employee_id, i.work_date, i.ref_id, i.points, i.srazka, i.note
      FROM shift_review_items i
      WHERE i.team_id = ${teamId} AND i.kind = 'closing'
        AND i.created_by IS NULL AND COALESCE(i.rucne, FALSE) = FALSE AND i.note LIKE 'auto:%'
        AND i.updated_at <= i.created_at + INTERVAL '2 seconds'`;
    for (const r of rows as any[]) {
      const pov = povinneZPoznamky(r.note);
      if (!pov) continue;
      const v = bodyUzaverky(pov.hotovo, pov.celkem, ucinnePravidlo(n1.uzaverky, null, pt.closing), pt.closing);
      const z: ZmenaRadku = {
        id: Number(r.id), uid: Number(r.employee_id), den: String(r.work_date), kind: 'closing', refId: Number(r.ref_id),
        stare: Number(r.points) || 0, nove: v.radek, stareSrazka: r.srazka == null ? null : Number(r.srazka), noveSrazka: v.srazka,
        stareNote: r.note ?? null, noveNote: v.summary,
      };
      if (jeZmena(z)) zmeny.push(z);
    }
  }

  // ---- dopad na zůstatky: dnešní součet − dnešní oprava dne + nová oprava dne + změny řádků ----
  const clenove = await clenovePodniku(teamId);
  const uids = Array.from(new Set([...clenove.map(c => c.id), ...zmeny.map(z => z.uid)]));
  const rozpady = await breakdownForTeam(teamId, uids, null, raw);
  const dny = await nactiDny(teamId, uids, pt, null, 0, true);
  const klic = (uid: number, den: string | null) => `${uid}|${den ?? ''}`;
  const mapaDnu = new Map<string, DenBodu>(dny.map(d => [klic(d.uid, d.den), { ...d }]));
  const rozdilRadku = new Map<number, number>();
  for (const z of zmeny) {
    rozdilRadku.set(z.uid, (rozdilRadku.get(z.uid) ?? 0) + (z.nove - z.stare));
    const k = klic(z.uid, z.den);
    const d = mapaDnu.get(k) ?? { uid: z.uid, den: z.den, plus: 0, minus: 0, nahrazeno: false };
    const s0 = z.id == null ? { plus: 0, minus: 0 } : rozdelRadek(z.stare, z.stareSrazka);
    const s1 = rozdelRadek(z.nove, z.noveSrazka);
    d.plus += s1.plus - s0.plus; d.minus += s1.minus - s0.minus;
    mapaDnu.set(k, d);
  }
  const upravy1 = upravyZDnu(Array.from(mapaDnu.values()), n1);
  const dopad = uids.map(uid => {
    const b = rozpady.get(uid);
    const pred = b ? totalPoints(b, pt) : 0;
    const po = pred - (b?.dayAdjust ?? 0) + (upravy1.get(uid)?.uprava ?? 0) + (rozdilRadku.get(uid) ?? 0);
    return { uid, pred, po };
  });
  return { zmeny, souhrn: souhrnDopadu(zmeny, dopad), n0, n1, raw, prepis0, prepis1 };
}

const KLICE_NASTAVENI = ['rezim', 'denniStrop', 'denniStropOd'] as const;

/** Provede přepočet: uloží pravidlo, přepíše řádky a zapíše, co bylo předtím. Vrátí id přepočtu. */
export async function provedPrepocet(teamId: number, kdo: number, rozsah: Rozsah, pravidla: PravidlaPrepoctu, v: VysledekPrepoctu): Promise<number> {
  // Předchozí stav nastavení (aby šel přepočet vrátit i s pravidlem).
  const predchozi: Record<string, unknown> = {};
  if (rozsah.typ === 'podnik') {
    const mel: Record<string, unknown> = {};
    const chybelo: string[] = [];
    for (const k of KLICE_NASTAVENI) {
      if (v.raw && Object.prototype.hasOwnProperty.call(v.raw, k)) mel[k] = v.raw[k]; else chybelo.push(k);
    }
    predchozi.pointsConfig = mel; predchozi.chybelo = chybelo;
  } else {
    predchozi.bodyRezim = v.prepis0 ?? null;
  }
  const radky = v.zmeny.filter(z => z.id != null).map(z => ({ id: z.id, p: z.stare, s: z.stareSrazka, n: z.stareNote, np: z.nove }));
  const souhrnUlozeny = { zaznamu: v.souhrn.zaznamu, lidi: v.souhrn.lidi, celkem: v.souhrn.celkem, doMinusu: v.souhrn.doMinusu.length };
  const [hlava] = await sql`
    INSERT INTO body_prepocty (team_id, kdo, rozsah, pravidla, predchozi, radky, souhrn)
    VALUES (${teamId}, ${kdo}, ${JSON.stringify(rozsah)}::jsonb, ${JSON.stringify({ ...(pravidla ?? {}), items: undefined })}::jsonb,
            ${JSON.stringify(predchozi)}::jsonb, ${JSON.stringify(radky)}::jsonb, ${JSON.stringify(souhrnUlozeny)}::jsonb)
    RETURNING id`;
  const id = Number(hlava.id);

  // Pravidlo.
  if (rozsah.typ === 'podnik') {
    const nove = doPointsConfig(v.n1);
    await sql`UPDATE teams SET points_config = COALESCE(points_config, '{}'::jsonb) || ${JSON.stringify(nove)}::jsonb WHERE id = ${teamId}`;
  } else if (rozsah.typ === 'postup') {
    await sql`UPDATE procedures SET body_rezim = ${v.prepis1 ? JSON.stringify(v.prepis1) : null}::jsonb WHERE id = ${rozsah.id} AND team_id = ${teamId}`;
  } else {
    const [t] = await sql`SELECT series_id FROM tasks WHERE id = ${rozsah.id} AND team_id = ${teamId}`;
    const json = v.prepis1 ? JSON.stringify(v.prepis1) : null;
    if (t?.series_id) await sql`UPDATE tasks SET body_rezim = ${json}::jsonb WHERE team_id = ${teamId} AND series_id = ${t.series_id}`;
    else await sql`UPDATE tasks SET body_rezim = ${json}::jsonb WHERE id = ${rozsah.id} AND team_id = ${teamId}`;
  }

  // Řádky: jen dosud nedotčené a se stejnou hodnotou, jakou náhled viděl (souběh s ruční úpravou vyhraje vedení).
  const upravy = v.zmeny.filter(z => z.id != null).map(z => ({ id: z.id, p0: z.stare, p: z.nove, s: z.noveSrazka, n: z.noveNote }));
  if (upravy.length) {
    await sql`
      UPDATE shift_review_items AS s SET points = x.p, srazka = x.s, note = x.n
      FROM jsonb_to_recordset(${JSON.stringify(upravy)}::jsonb) AS x(id int, p0 int, p int, s int, n text)
      WHERE s.id = x.id AND s.team_id = ${teamId} AND s.points = x.p0
        AND s.created_by IS NULL AND COALESCE(s.rucne, FALSE) = FALSE AND s.note LIKE 'auto:%'`;
  }
  const nove = v.zmeny.filter(z => z.id == null).map(z => ({ uid: z.uid, den: z.den, kind: z.kind, ref: z.refId, p: z.nove, s: z.noveSrazka, n: z.noveNote }));
  if (nove.length) {
    const vlozene = await sql`
      INSERT INTO shift_review_items (team_id, employee_id, work_date, kind, ref_id, points, srazka, note, flagged, created_by)
      SELECT ${teamId}, x.uid, x.den, x.kind, x.ref, x.p, x.s, x.n, FALSE, NULL
      FROM jsonb_to_recordset(${JSON.stringify(nove)}::jsonb) AS x(uid int, den text, kind text, ref int, p int, s int, n text)
      ON CONFLICT (employee_id, work_date, kind, ref_id) DO NOTHING
      RETURNING id, points`;
    const doplnek = (vlozene as any[]).map(r => ({ id: Number(r.id), p: null, s: null, n: null, np: Number(r.points), novy: true }));
    if (doplnek.length) {
      await sql`UPDATE body_prepocty SET radky = radky || ${JSON.stringify(doplnek)}::jsonb WHERE id = ${id}`;
    }
  }
  return id;
}

export interface ZaznamPrepoctu {
  id: number; kdo: string | null; kdy: string; rozsah: Rozsah | null; souhrn: { zaznamu: number; lidi: number; celkem: number; doMinusu: number };
  vraceno: string | null; lzeVratit: boolean;
}

/** Historie přepočtů podniku (posledních 10); vrátit jde jen poslední nevrácený. */
export async function historiePrepoctu(teamId: number): Promise<ZaznamPrepoctu[]> {
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT b.id, b.rozsah, b.souhrn, b.created_at, b.vraceno_at, u.name AS kdo
      FROM body_prepocty b LEFT JOIN users u ON u.id = b.kdo
      WHERE b.team_id = ${teamId} ORDER BY b.id DESC LIMIT 10`;
  } catch { return []; }
  return rows.map((r, i) => ({
    id: Number(r.id), kdo: r.kdo ?? null, kdy: String(r.created_at), rozsah: rozsahZTela(r.rozsah),
    souhrn: { zaznamu: Number(r.souhrn?.zaznamu) || 0, lidi: Number(r.souhrn?.lidi) || 0, celkem: Number(r.souhrn?.celkem) || 0, doMinusu: Number(r.souhrn?.doMinusu) || 0 },
    vraceno: r.vraceno_at ? String(r.vraceno_at) : null,
    lzeVratit: i === 0 && r.vraceno_at == null,
  }));
}

/** Vrátí poslední přepočet: staré hodnoty řádků (jen pokud se od přepočtu nezměnily) a předchozí pravidlo. */
export async function vratPrepocet(teamId: number, kdo: number, id: number): Promise<{ ok: true; radku: number } | { ok: false; chyba: string }> {
  const [posledni] = await sql`SELECT id, rozsah, predchozi, radky, vraceno_at FROM body_prepocty WHERE team_id = ${teamId} ORDER BY id DESC LIMIT 1`;
  if (!posledni || Number(posledni.id) !== id) return { ok: false, chyba: 'Vrátit jde jen poslední přepočet.' };
  if (posledni.vraceno_at) return { ok: false, chyba: 'Tenhle přepočet už je vrácený.' };
  const radky: any[] = Array.isArray(posledni.radky) ? posledni.radky : [];
  const stare = radky.filter(r => !r.novy).map(r => ({ id: Number(r.id), p: Number(r.p) || 0, s: r.s == null ? null : Number(r.s), n: r.n ?? null, np: Number(r.np) || 0 }));
  const nove = radky.filter(r => r.novy).map(r => ({ id: Number(r.id), np: Number(r.np) || 0 }));
  if (stare.length) {
    await sql`
      UPDATE shift_review_items AS s SET points = x.p, srazka = x.s, note = x.n
      FROM jsonb_to_recordset(${JSON.stringify(stare)}::jsonb) AS x(id int, p int, s int, n text, np int)
      WHERE s.id = x.id AND s.team_id = ${teamId} AND s.points = x.np
        AND s.created_by IS NULL AND COALESCE(s.rucne, FALSE) = FALSE`;
  }
  if (nove.length) {
    await sql`
      DELETE FROM shift_review_items AS s
      USING jsonb_to_recordset(${JSON.stringify(nove)}::jsonb) AS x(id int, np int)
      WHERE s.id = x.id AND s.team_id = ${teamId} AND s.points = x.np
        AND s.created_by IS NULL AND COALESCE(s.rucne, FALSE) = FALSE`;
  }
  const rozsah = rozsahZTela(posledni.rozsah);
  const pred = posledni.predchozi && typeof posledni.predchozi === 'object' ? posledni.predchozi : {};
  if (rozsah?.typ === 'podnik') {
    const mel = pred.pointsConfig && typeof pred.pointsConfig === 'object' ? pred.pointsConfig : {};
    const chybelo = (Array.isArray(pred.chybelo) ? pred.chybelo : []).filter((k: unknown) => KLICE_NASTAVENI.includes(k as any)).map(String);
    await sql`UPDATE teams SET points_config = (COALESCE(points_config, '{}'::jsonb) - ${chybelo}::text[]) || ${JSON.stringify(mel)}::jsonb WHERE id = ${teamId}`;
  } else if (rozsah?.typ === 'postup') {
    const p = normalizujPrepis(pred.bodyRezim);
    await sql`UPDATE procedures SET body_rezim = ${p ? JSON.stringify(p) : null}::jsonb WHERE id = ${rozsah.id} AND team_id = ${teamId}`;
  } else if (rozsah?.typ === 'ukol') {
    const p = normalizujPrepis(pred.bodyRezim);
    const [t] = await sql`SELECT series_id FROM tasks WHERE id = ${rozsah.id} AND team_id = ${teamId}`;
    const json = p ? JSON.stringify(p) : null;
    if (t?.series_id) await sql`UPDATE tasks SET body_rezim = ${json}::jsonb WHERE team_id = ${teamId} AND series_id = ${t.series_id}`;
    else await sql`UPDATE tasks SET body_rezim = ${json}::jsonb WHERE id = ${rozsah.id} AND team_id = ${teamId}`;
  }
  await sql`UPDATE body_prepocty SET vraceno_at = NOW(), vratil = ${kdo} WHERE id = ${id}`;
  return { ok: true, radku: radky.length };
}
