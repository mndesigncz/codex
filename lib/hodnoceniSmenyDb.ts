// Hodnocení směny jako celku — databáze (logika a pravidla v lib/hodnoceniSmeny.ts).
//
// Body z rozpisu po lidech jsou ruční řádky shift_review_items (kind 'smena', ref_id = id hodnocení,
// rucne TRUE, created_by = hodnotitel). Zůstatek (lib/pointsBalance) je tak sečte bez úprav; přepočet
// zpětně (lib/bodyPrepocetDb) bere jen automatické řádky (created_by NULL), takže je nepřepíše, a denní
// strop (lib/bodyDenDb) počítá ruční řádky jen u úkolů, postupů a uzávěrek — ruční body vedení za směnu
// jsou mimo strop, jako pochvala.
import { neon } from '@neondatabase/serverless';
import { clenovePodniku, tymyCiselniku } from './tenant';
import {
  KLIC_DEN, normalizujStitky, proClena, skupinySmen,
  type HodnoceniProClena, type RadekRozvrhu, type SkupinaSmeny, type Stitky, type VstupHodnoceni,
} from './hodnoceniSmeny';

const sql = neon(process.env.DATABASE_URL!);

const LEGACY: Record<string, string> = { morning: 'Ranní', afternoon: 'Odpolední', flexible: 'Vlastní' };

/** Rozvrh dne jako řádky pro skupinySmen: kdo, od kdy do kdy a název typu směny. Jen členové podniku. */
export async function rozvrhDne(teamId: number, den: string): Promise<RadekRozvrhu[]> {
  let smeny: any[] = [];
  try {
    smeny = await sql`
      SELECT employee_id, start_time, end_time, type FROM shifts
      WHERE team_id = ${teamId} AND date = ${den} ORDER BY start_time ASC, id ASC`;
  } catch { return []; }
  if (!smeny.length) return [];
  let typy: any[] = [];
  try {
    const tymy = await tymyCiselniku(teamId, 'typySmen');
    typy = await sql`
      SELECT name, start_time, end_time FROM shift_types WHERE team_id = ANY(${tymy})
      ORDER BY (team_id = ${teamId}) DESC, position ASC, id ASC`;
  } catch { typy = []; }
  const nazev = (s: any): string | null => {
    const podleJmena = typy.find(t => t.name === s.type);
    if (podleJmena) return podleJmena.name;
    const podleCasu = typy.find(t => t.start_time === s.start_time && t.end_time === s.end_time);
    if (podleCasu) return podleCasu.name;
    return LEGACY[s.type as string] ?? null;
  };
  const clenove = new Map((await clenovePodniku(teamId)).map(m => [m.id, m]));
  return smeny
    .filter(s => clenove.has(Number(s.employee_id)))
    .map(s => {
      const m = clenove.get(Number(s.employee_id))!;
      return { employeeId: m.id, jmeno: m.name, avatar: m.avatar ?? null, od: s.start_time ?? null, do: s.end_time ?? null, nazev: nazev(s) };
    });
}

export interface HodnoceniSmeny {
  id: number;
  den: string;
  klic: string;
  nazev: string | null;
  od: string | null;
  do: string | null;
  hvezdy: number;
  dobre: string | null;
  kritika: string | null;
  stitky: Stitky;
  kNaprave: boolean;
  foto: string | null;
  osadka: number[];
  videli: number[];
  body: { id: number; body: number; poznamka: string | null }[];
  kdo: string | null;
  upraveno: string | null;
}

const cisla = (v: unknown): number[] => (Array.isArray(v) ? v.map(Number).filter(n => Number.isFinite(n)) : []);

async function bodyKHodnocenim(teamId: number, ids: number[]): Promise<Map<number, { id: number; body: number; poznamka: string | null }[]>> {
  const out = new Map<number, { id: number; body: number; poznamka: string | null }[]>();
  if (!ids.length) return out;
  try {
    const rows = await sql`
      SELECT ref_id, employee_id, points, note FROM shift_review_items
      WHERE team_id = ${teamId} AND kind = 'smena' AND ref_id = ANY(${ids}) ORDER BY employee_id`;
    for (const r of rows as any[]) {
      const a = out.get(Number(r.ref_id)) ?? [];
      a.push({ id: Number(r.employee_id), body: Number(r.points) || 0, poznamka: r.note ?? null });
      out.set(Number(r.ref_id), a);
    }
  } catch { /* tabulka chybí — bez bodů */ }
  return out;
}

function zRadku(r: any, body: Map<number, { id: number; body: number; poznamka: string | null }[]>): HodnoceniSmeny {
  return {
    id: Number(r.id), den: String(r.work_date), klic: String(r.smena_klic ?? KLIC_DEN),
    nazev: r.nazev ?? null, od: r.cas_od ?? null, do: r.cas_do ?? null,
    hvezdy: Number(r.hvezdy) || 0, dobre: r.dobre ?? null, kritika: r.kritika ?? null,
    stitky: normalizujStitky(r.stitky), kNaprave: r.k_naprave === true, foto: r.foto ?? null,
    osadka: cisla(r.osadka), videli: cisla(r.videli),
    body: body.get(Number(r.id)) ?? [],
    kdo: r.kdo ?? null,
    upraveno: r.updated_at ? new Date(r.updated_at).toISOString() : null,
  };
}

/** Hodnocení směn jednoho dne (nebo rozsahu dnů) v podniku. */
export async function hodnoceniDnu(teamId: number, od: string, doo: string = od): Promise<HodnoceniSmeny[]> {
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT h.id, h.work_date, h.smena_klic, h.nazev, h.cas_od, h.cas_do, h.hvezdy, h.dobre, h.kritika, h.stitky,
             h.k_naprave, h.foto, h.osadka, h.videli, h.updated_at, u.name AS kdo
      FROM smeny_hodnoceni h LEFT JOIN users u ON u.id = COALESCE(h.updated_by, h.created_by)
      WHERE h.team_id = ${teamId} AND h.work_date >= ${od} AND h.work_date <= ${doo}
      ORDER BY h.work_date DESC, h.cas_od ASC NULLS LAST, h.id ASC`;
  } catch { return []; }
  const body = await bodyKHodnocenim(teamId, rows.map(r => Number(r.id)));
  return rows.map(r => zRadku(r, body));
}

export async function hodnoceniPodleId(teamId: number, id: number): Promise<HodnoceniSmeny | null> {
  try {
    const [r] = await sql`
      SELECT id, work_date, smena_klic, nazev, cas_od, cas_do, hvezdy, dobre, kritika, stitky, k_naprave, foto,
             osadka, videli, updated_at FROM smeny_hodnoceni WHERE id = ${id} AND team_id = ${teamId}`;
    if (!r) return null;
    return zRadku(r, await bodyKHodnocenim(teamId, [Number(r.id)]));
  } catch { return null; }
}

/** Den k hodnocení: směny podle rozvrhu (skupiny) a už uložená hodnocení. */
export async function denKHodnoceni(teamId: number, den: string): Promise<{ skupiny: SkupinaSmeny[]; hodnoceni: HodnoceniSmeny[] }> {
  const [radky, hodnoceni] = await Promise.all([rozvrhDne(teamId, den), hodnoceniDnu(teamId, den)]);
  const skupiny = skupinySmen(radky);
  // Uložené hodnocení směny, která z rozvrhu mezitím zmizela (přesunutá, smazaná), se ukáže taky —
  // s osádkou, jak byla uložená.
  const clenove = new Map((await clenovePodniku(teamId)).map(m => [m.id, m]));
  for (const h of hodnoceni) {
    if (skupiny.some(s => s.klic === h.klic)) continue;
    skupiny.push({
      klic: h.klic, nazev: h.nazev, od: h.od, do: h.do,
      lide: h.osadka.map(id => clenove.get(id)).filter(Boolean).map(m => ({ id: m!.id, jmeno: m!.name, avatar: m!.avatar ?? null })),
    });
  }
  return { skupiny, hodnoceni };
}

/**
 * Uloží hodnocení směny (nové nebo úprava téže směny) a body po lidech. Vrátí uložené hodnocení,
 * předchozí body (kvůli auditu a oznámení) a jestli šlo o nové.
 */
export async function ulozHodnoceni(teamId: number, meId: number, v: VstupHodnoceni): Promise<{ hodnoceni: HodnoceniSmeny; nove: boolean; predtim: HodnoceniSmeny | null }> {
  const predtim = (await hodnoceniDnu(teamId, v.den)).find(h => h.klic === v.klic) ?? null;
  const stitky = JSON.stringify(v.stitky);
  const osadka = JSON.stringify(v.osadka);
  // Kdo už potvrdil a hodnocení se změnilo, má ho vidět znovu: videli se při úpravě vyprázdní.
  const [r] = await sql`
    INSERT INTO smeny_hodnoceni (team_id, work_date, smena_klic, nazev, cas_od, cas_do, hvezdy, dobre, kritika, stitky,
                                 k_naprave, foto, osadka, videli, created_by, updated_by, updated_at)
    VALUES (${teamId}, ${v.den}, ${v.klic}, ${v.nazev}, ${v.od}, ${v.do}, ${v.hvezdy}, ${v.dobre}, ${v.kritika}, ${stitky}::jsonb,
            ${v.kNaprave}, ${v.foto}, ${osadka}::jsonb, '[]'::jsonb, ${meId}, ${meId}, NOW())
    ON CONFLICT (team_id, work_date, smena_klic) DO UPDATE SET
      nazev = EXCLUDED.nazev, cas_od = EXCLUDED.cas_od, cas_do = EXCLUDED.cas_do, hvezdy = EXCLUDED.hvezdy,
      dobre = EXCLUDED.dobre, kritika = EXCLUDED.kritika, stitky = EXCLUDED.stitky, k_naprave = EXCLUDED.k_naprave,
      foto = EXCLUDED.foto, osadka = EXCLUDED.osadka, videli = '[]'::jsonb, updated_by = EXCLUDED.updated_by, updated_at = NOW()
    RETURNING id`;
  const id = Number(r.id);
  // Body: řádky téhle směny se přepíšou celé (kdo z rozpisu vypadl, přijde o body ze směny).
  await sql`DELETE FROM shift_review_items WHERE team_id = ${teamId} AND kind = 'smena' AND ref_id = ${id}`;
  for (const b of v.body) {
    await sql`
      INSERT INTO shift_review_items (team_id, employee_id, work_date, kind, ref_id, points, note, flagged, created_by, updated_at, rucne)
      VALUES (${teamId}, ${b.id}, ${v.den}, 'smena', ${id}, ${b.body}, ${b.poznamka}, FALSE, ${meId}, NOW(), TRUE)
      ON CONFLICT (employee_id, work_date, kind, ref_id)
      DO UPDATE SET points = EXCLUDED.points, note = EXCLUDED.note, updated_at = NOW(), rucne = TRUE`;
  }
  const hodnoceni = (await hodnoceniPodleId(teamId, id))!;
  return { hodnoceni, nove: !predtim, predtim };
}

/** Smaže hodnocení směny i body z něj. */
export async function smazHodnoceni(teamId: number, id: number): Promise<HodnoceniSmeny | null> {
  const h = await hodnoceniPodleId(teamId, id);
  if (!h) return null;
  await sql`DELETE FROM shift_review_items WHERE team_id = ${teamId} AND kind = 'smena' AND ref_id = ${id}`;
  await sql`DELETE FROM smeny_hodnoceni WHERE id = ${id} AND team_id = ${teamId}`;
  return h;
}

/** Hodnocení směn, na kterých člověk byl (pohled zaměstnance: z bodů jen jeho). */
export async function hodnoceniClena(teamId: number, clen: number, limit = 20): Promise<HodnoceniProClena[]> {
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT id, work_date, smena_klic, nazev, cas_od, cas_do, hvezdy, dobre, kritika, stitky, k_naprave, foto, osadka, videli, updated_at
      FROM smeny_hodnoceni
      WHERE team_id = ${teamId} AND osadka @> to_jsonb(${clen}::int)
      ORDER BY work_date DESC, id DESC LIMIT ${limit}`;
  } catch { return []; }
  if (!rows.length) return [];
  let mojeBody: any[] = [];
  try {
    mojeBody = await sql`
      SELECT ref_id, points, note FROM shift_review_items
      WHERE team_id = ${teamId} AND employee_id = ${clen} AND kind = 'smena' AND ref_id = ANY(${rows.map(r => Number(r.id))})`;
  } catch { mojeBody = []; }
  const body = new Map<number, { id: number; body: number; poznamka: string | null }[]>();
  for (const b of mojeBody) body.set(Number(b.ref_id), [{ id: clen, body: Number(b.points) || 0, poznamka: b.note ?? null }]);
  return rows.map(r => proClena(zRadku(r, body), clen)).filter((x): x is HodnoceniProClena => !!x);
}

/** Člen potvrdil („Beru na vědomí") všechna hodnocení svých směn. */
export async function oznacVideno(teamId: number, clen: number): Promise<void> {
  try {
    await sql`
      UPDATE smeny_hodnoceni SET videli = videli || to_jsonb(${clen}::int)
      WHERE team_id = ${teamId} AND osadka @> to_jsonb(${clen}::int) AND NOT (videli @> to_jsonb(${clen}::int))`;
  } catch { /* tabulka chybí — nic k potvrzení */ }
}

/** Pravidlo „po uzávěrce připomenout ohodnocení směny" (vypnuté výchozí). */
export async function pripominat(teamId: number): Promise<boolean> {
  try {
    const [t] = await sql`SELECT smena_hodnoceni_pripominat FROM teams WHERE id = ${teamId}`;
    return t?.smena_hodnoceni_pripominat === true;
  } catch { return false; }
}

export async function nastavPripominat(teamId: number, zap: boolean): Promise<void> {
  await sql`UPDATE teams SET smena_hodnoceni_pripominat = ${zap} WHERE id = ${teamId}`;
}
