// Koncept a verze pravidel věrnosti v databázi.
//
// Koncept: změny pravidel, které se uloží, ale pro hosty zatím neplatí (`client_profiles.loyalty_draft`).
// Použije se tlačítkem „Použít pravidla“ stejnou cestou jako přímé uložení (PUT /api/client/admin/profile),
// takže je jen jedna kontrola a jeden zápis pravidel. Verze: každá změna pravidel, přímá i z konceptu,
// zapíše do `client_pravidla_verze` větu „před → po“, kdo ji udělal a poznámku. Čistá logika
// (popis změn, kontrola) je v lib/bodyPravidla.ts.

import { sql, ensureProfile } from './client';
import { menaPodniku } from './menaPodniku';
import { parseDbTime } from './pragueTime';
import { validujPravidla, popisZmenyPravidel, POLE_PRAVIDEL, novaPolePravidel, KLICE_KONCEPTU } from './bodyPravidla';

let pripraveno: Promise<void> | null = null;

/** Sloupce konceptu a tabulka verzí. Stejné příkazy jsou v app/api/init/route.ts; tady jednou za studený start. */
export function zajistiVerzePravidel(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS loyalty_draft JSONB`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS loyalty_draft_at TIMESTAMP`;
      await sql`ALTER TABLE client_profiles ADD COLUMN IF NOT EXISTS rules_version INTEGER NOT NULL DEFAULT 1`;
      await sql`
        CREATE TABLE IF NOT EXISTS client_pravidla_verze (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          version INTEGER NOT NULL,
          changed_by INTEGER,
          source TEXT NOT NULL DEFAULT 'form',
          note TEXT,
          changes JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE (team_id, version)
        )`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

export interface VerzePravidel {
  id: number; version: number; created_at: string; changed_by_name: string | null; source: string; note: string | null; changes: string[];
}

export interface StavPravidel {
  platna: Record<string, any>;
  koncept: Record<string, any> | null;
  konceptZmeny: string[];
  konceptOd: string | null;
  verze: number;
  verzeSeznam: VerzePravidel[];
}

/** Pravidla, jak platí (hodnoty sloupců profilu). */
function platnaZProfilu(p: any): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of KLICE_KONCEPTU) out[k] = p?.[k];
  return { ...out, ...novaPolePravidel(p) };
}

export async function seznamVerzi(teamId: number, limit = 30): Promise<VerzePravidel[]> {
  await zajistiVerzePravidel();
  const rows = await sql`
    SELECT v.id, v.version, v.created_at, v.source, v.note, v.changes, u.name AS changed_by_name
    FROM client_pravidla_verze v LEFT JOIN users u ON u.id = v.changed_by
    WHERE v.team_id = ${teamId} ORDER BY v.version DESC LIMIT ${limit}` as any[];
  return rows.map(r => ({
    id: Number(r.id), version: Number(r.version), created_at: new Date(parseDbTime(r.created_at) ?? Date.now()).toISOString(),
    changed_by_name: r.changed_by_name ?? null, source: String(r.source ?? 'form'), note: r.note ?? null,
    changes: Array.isArray(r.changes) ? r.changes.map(String) : [],
  }));
}

/** Všechno, co potřebuje obrazovka konceptu a verzí. */
export async function stavPravidel(teamId: number): Promise<StavPravidel> {
  await zajistiVerzePravidel();
  const p = await ensureProfile(teamId);
  const platna = platnaZProfilu(p);
  const koncept = p.loyalty_draft && typeof p.loyalty_draft === 'object' ? { ...platna, ...p.loyalty_draft } : null;
  const { money } = await menaPodniku(teamId);
  return {
    platna, koncept,
    konceptZmeny: koncept ? popisZmenyPravidel(platna, koncept, money) : [],
    konceptOd: p.loyalty_draft_at ? new Date(parseDbTime(p.loyalty_draft_at) ?? Date.now()).toISOString() : null,
    verze: Number(p.rules_version) || 1,
    verzeSeznam: await seznamVerzi(teamId),
  };
}

/** Uloží koncept z těla požadavku (jen známá pole). Nic se tím nemění pro hosty. */
export async function ulozKoncept(teamId: number, raw: any): Promise<{ ok: true } | { ok: false; error: string }> {
  await zajistiVerzePravidel();
  const p = await ensureProfile(teamId);
  const draft: Record<string, unknown> = {};
  for (const k of KLICE_KONCEPTU) if (raw?.[k] !== undefined) draft[k] = raw[k];
  // Kontrola jako celek (prahy rostou, slevy neklesají) stejnou funkcí jako při přímém uložení.
  const platna = platnaZProfilu(p);
  const spojene: Record<string, unknown> = {};
  for (const k of POLE_PRAVIDEL) spojene[k] = draft[k] !== undefined ? draft[k] : platna[k];
  const chyby = validujPravidla(spojene);
  if (chyby.length) return { ok: false, error: chyby[0].text };
  await sql`UPDATE client_profiles SET loyalty_draft = ${JSON.stringify(draft)}::jsonb, loyalty_draft_at = NOW() WHERE team_id = ${teamId}`;
  return { ok: true };
}

export async function zahodKoncept(teamId: number): Promise<void> {
  await zajistiVerzePravidel();
  await sql`UPDATE client_profiles SET loyalty_draft = NULL, loyalty_draft_at = NULL WHERE team_id = ${teamId}`;
}

/** Zapíše verzi: jedním příkazem se zvedne číslo verze a vloží řádek, takže dva souběžné zápisy nedostanou stejné číslo. */
export async function zapisVerzi(teamId: number, userId: number | null, zmeny: string[], source: 'form' | 'koncept', note?: string | null): Promise<number | null> {
  if (!zmeny.length) return null;
  try {
    await zajistiVerzePravidel();
    const [v] = await sql`
      WITH nova AS (UPDATE client_profiles SET rules_version = COALESCE(rules_version, 1) + 1 WHERE team_id = ${teamId} RETURNING rules_version)
      INSERT INTO client_pravidla_verze (team_id, version, changed_by, source, note, changes)
      SELECT ${teamId}, rules_version, ${userId}, ${source}, ${note ? String(note).trim().slice(0, 200) || null : null}, ${JSON.stringify(zmeny)}::jsonb FROM nova
      RETURNING version` as any[];
    return v ? Number(v.version) : null;
  } catch (e) {
    // Historie verzí je doplněk: když se nezapíše, pravidla už platí a historie změn ji má.
    console.error('[vernost] verze pravidel se nezapsala', e);
    return null;
  }
}
