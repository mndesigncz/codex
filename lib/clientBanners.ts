// Promo bannery podniku: tabulky client_banners a client_banner_stats a čtení pro hosta.
// Tabulky jsou i v app/api/init/route.ts (Kolo 74: bannery); tady se pro jistotu
// zajistí při prvním použití (CREATE/ALTER ... IF NOT EXISTS), ať banner funguje
// i před spuštěním /api/init. Čisté funkce (validace, výběr, cílení) jsou v lib/bannery.ts.
//
// Statistika je lehká a bez osobních údajů: jeden řádek na banner a pražský den,
// počítadla zobrazení a prokliků. Zápis je jeden příkaz `INSERT ... ON CONFLICT DO UPDATE
// SET views = views + 1`, takže souběžné návštěvy nic neztratí (nečte se a nezapisuje absolutní hodnota).

import { sql } from './client';
import { pragueToday } from './pragueTime';
import { vyberAktivni, NEZNAMY_HOST, type HostKontext } from './bannery';

let pripraveno: Promise<void> | null = null;

/** Založí tabulky a sloupce, pokud chybí. Jednou za běh procesu; při chybě se příští volání zkusí znovu. */
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
      await sql`ALTER TABLE client_banners ADD COLUMN IF NOT EXISTS target_kind TEXT NOT NULL DEFAULT 'all'`;
      await sql`ALTER TABLE client_banners ADD COLUMN IF NOT EXISTS target_ref TEXT`;
      await sql`ALTER TABLE client_banners ADD COLUMN IF NOT EXISTS archived BOOLEAN NOT NULL DEFAULT FALSE`;
      await sql`
        CREATE TABLE IF NOT EXISTS client_banner_stats (
          banner_id INTEGER NOT NULL,
          team_id INTEGER NOT NULL,
          day DATE NOT NULL,
          views INTEGER NOT NULL DEFAULT 0,
          clicks INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (banner_id, day)
        )`;
      await sql`CREATE INDEX IF NOT EXISTS client_banner_stats_team ON client_banner_stats (team_id, day)`;
    })().catch(e => { pripraveno = null; throw e; });
  }
  return pripraveno;
}

/** Veřejný tvar banneru pro stránku hosta (jen to, co host smí vidět; cílení ani statistika ne). */
export function tvarBanneru(r: any) {
  return {
    id: Number(r.id), title: String(r.title), text: String(r.text ?? ''),
    imageUrl: r.image_url ?? null, linkKind: String(r.link_kind ?? 'none'), linkRef: r.link_ref ?? null,
  };
}

/** Aktivní bannery podniku v platnosti k datu a pro tohoto hosta, nejvýš pět, podle pozice. Chyba databáze = žádné bannery. */
export async function aktivniBannery(teamId: number, dnes: string, host: HostKontext = NEZNAMY_HOST) {
  try {
    await zajistiTabulkuBanneru();
    const rows = await sql`
      SELECT * FROM client_banners WHERE team_id = ${teamId} AND active = TRUE AND archived = FALSE ORDER BY position, id` as any[];
    return vyberAktivni(rows, dnes, undefined, host).map(tvarBanneru);
  } catch { return []; }
}

/** Kdo se dívá: člen (s úrovní a skupinami), nebo ne. Skupiny se čtou jen pro člena; chyba = bez skupin. */
export async function kontextHosta(teamId: number, customerId: number | null, mine: { member?: boolean; level?: string | null } | null): Promise<HostKontext> {
  if (!customerId || !mine?.member) return NEZNAMY_HOST;
  let groupIds: number[] = [];
  try {
    const rows = await sql`SELECT group_id FROM client_group_members WHERE team_id = ${teamId} AND customer_id = ${customerId}` as any[];
    groupIds = rows.map(r => Number(r.group_id)).filter(n => Number.isInteger(n));
  } catch { groupIds = []; }
  return { member: true, level: mine.level ?? null, groupIds };
}

/**
 * Zapíše zobrazení nebo klik. Banner musí patřit podniku a být v provozu (aktivní, nearchivovaný),
 * jinak se nezapíše nic. Jeden příkaz, žádné čtení: souběh dvou návštěv dá součet, ne ztrátu.
 * Vrací, zda se něco zapsalo.
 */
export async function zapisUdalostBanneru(teamId: number, bannerId: number, druh: 'view' | 'click'): Promise<boolean> {
  await zajistiTabulkuBanneru();
  const v = druh === 'view' ? 1 : 0;
  const c = druh === 'click' ? 1 : 0;
  const rows = await sql`
    INSERT INTO client_banner_stats (banner_id, team_id, day, views, clicks)
    SELECT b.id, b.team_id, ${pragueToday()}::date, ${v}, ${c}
    FROM client_banners b WHERE b.id = ${bannerId} AND b.team_id = ${teamId} AND b.active = TRUE AND b.archived = FALSE
    ON CONFLICT (banner_id, day) DO UPDATE
      SET views = client_banner_stats.views + EXCLUDED.views, clicks = client_banner_stats.clicks + EXCLUDED.clicks
    RETURNING banner_id` as any[];
  return rows.length > 0;
}

/** Denní řádky statistiky podniku za posledních `dni` dní (pražský den), pro součty v editoru. */
export async function statistikyBanneru(teamId: number, dni: number) {
  await zajistiTabulkuBanneru();
  const od = pragueToday();
  const rows = await sql`
    SELECT banner_id, to_char(day, 'YYYY-MM-DD') AS day, views, clicks
    FROM client_banner_stats
    WHERE team_id = ${teamId} AND day > ${od}::date - ${Math.max(1, Math.min(365, Math.round(dni)))}::int` as any[];
  return rows.map(r => ({ banner_id: Number(r.banner_id), day: String(r.day), views: Number(r.views) || 0, clicks: Number(r.clicks) || 0 }));
}
