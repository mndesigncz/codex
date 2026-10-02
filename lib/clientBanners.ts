// Promo bannery podniku: tabulka client_banners a čtení pro hosta.
// Tabulka je i v app/api/init/route.ts (Kolo 74: bannery); tady se pro jistotu
// zajistí při prvním použití (CREATE TABLE IF NOT EXISTS), ať banner funguje
// i před spuštěním /api/init. Čisté funkce (validace, výběr) jsou v lib/bannery.ts.

import { sql } from './client';
import { vyberAktivni } from './bannery';

let pripraveno: Promise<void> | null = null;

/** Založí tabulku, pokud chybí. Jednou za běh procesu; při chybě se příští volání zkusí znovu. */
export function zajistiTabulkuBanneru(): Promise<void> {
  if (!pripraveno) {
    pripraveno = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS client_banners (
          id SERIAL PRIMARY KEY,
          team_id INTEGER NOT NULL,
          title TEXT NOT NULL,
          text TEXT NOT NULL DEFAULT '',
          image_url TEXT,
          link_kind TEXT NOT NULL DEFAULT 'none',
          link_ref TEXT,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          valid_since TEXT,
          valid_until TEXT,
          position INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW()
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_banners_team_idx ON client_banners (team_id, position)`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

/** Veřejný tvar banneru pro stránku hosta (jen to, co host smí vidět). */
export function tvarBanneru(r: any) {
  return {
    id: Number(r.id), title: String(r.title), text: String(r.text ?? ''),
    imageUrl: r.image_url ?? null, linkKind: String(r.link_kind ?? 'none'), linkRef: r.link_ref ?? null,
  };
}

/** Aktivní bannery podniku v platnosti k datu, nejvýš pět, podle pozice. Chyba databáze = žádné bannery. */
export async function aktivniBannery(teamId: number, dnes: string) {
  try {
    await zajistiTabulkuBanneru();
    const rows = await sql`
      SELECT * FROM client_banners WHERE team_id = ${teamId} AND active = TRUE ORDER BY position, id` as any[];
    return vyberAktivni(rows, dnes).map(tvarBanneru);
  } catch { return []; }
}
