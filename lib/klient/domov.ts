// Doplňky domovské karty hosta k odpovědi /api/client/me a stránce podniku:
//  · razitkaData — data razítek na rozdělané kartě (kolečka s datem návštěvy, koncept B 10a/6),
//  · zebricek    — odměny za body podniku seřazené podle ceny (lišta s prahy na kartě s body),
//  · nabidky     — kupony, které si host může vzít (za body nebo zdarma) napříč svými podniky.
// Všechno ze skutečných dat; když tabulka nebo sloupec chybí (před migrací), vrátí prázdno.

import { sql } from '../client';
import { benefitLabel } from '../coupons';
import { menaZRadku } from '../mena';

/**
 * Data razítek rozdělané karty: pro každou kampaň posledních `pocet` připsaných razítek
 * (deník client_stamp_events, bez storna), od nejstaršího. Razítko za dvě kávy = dvě kolečka
 * s týmž dnem. Klíč = id kampaně.
 */
export async function datRazitek(customerId: number, teamId: number, kampane: { id: number; stamps: number }[]): Promise<Record<string, string[]>> {
  const chtene = kampane.filter(k => Number(k.stamps) > 0);
  if (!chtene.length) return {};
  try {
    const ids = chtene.map(k => Number(k.id));
    const rows = await sql`
      SELECT campaign_id, delta, day, created_at FROM client_stamp_events
      WHERE team_id = ${teamId} AND customer_id = ${customerId} AND campaign_id = ANY(${ids})
        AND kind = 'earn' AND delta > 0 AND undone_at IS NULL
      ORDER BY created_at DESC, id DESC LIMIT 400` as any[];
    const out: Record<string, string[]> = {};
    for (const k of chtene) {
      const dny: string[] = [];
      for (const r of rows) {
        if (Number(r.campaign_id) !== Number(k.id)) continue;
        const den = String(r.day ?? '').slice(0, 10) || String(r.created_at ?? '').slice(0, 10);
        for (let i = 0; i < Number(r.delta) && dny.length < k.stamps; i++) dny.push(den);
        if (dny.length >= k.stamps) break;
      }
      out[String(k.id)] = dny.reverse();
    }
    return out;
  } catch { return {}; }
}

export interface PrahOdmeny { id: number; title: string; cost: number }

/** Odměny za body podniků (nejlevnější první), nejvýš 5 na podnik. Klíč = team_id. */
export async function zebricky(teamIds: number[], dnes: string): Promise<Map<number, PrahOdmeny[]>> {
  const out = new Map<number, PrahOdmeny[]>();
  if (!teamIds.length) return out;
  try {
    const rows = await sql`
      SELECT id, team_id, title, cost_points FROM client_coupons
      WHERE team_id = ANY(${teamIds}) AND active = TRUE AND kind = 'offer' AND draft = FALSE AND archived_at IS NULL
        AND cost_points > 0 AND (valid_until IS NULL OR valid_until >= ${dnes})
      ORDER BY team_id, cost_points, id` as any[];
    for (const r of rows) {
      const t = Number(r.team_id);
      const seznam = out.get(t) ?? [];
      if (seznam.length < 5) seznam.push({ id: Number(r.id), title: String(r.title), cost: Number(r.cost_points) });
      out.set(t, seznam);
    }
  } catch { /* před migrací sloupců kuponů */ }
  return out;
}

export interface NabidkaHosta {
  id: number; slug: string; business: string; accent: string | null; title: string; description: string;
  costPoints: number; benefit: string | null; validUntil: string | null; points: number;
}

/** Kupony k vzetí napříč podniky hosta (za body nebo zdarma), nejvýš 30. */
export async function nabidkyHosta(customerId: number, dnes: string): Promise<NabidkaHosta[]> {
  try {
    const rows = await sql`
      SELECT c.*, p.slug, p.accent, t.currency, t.locale, m.points AS my_points,
             COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS business,
             (SELECT mi.name FROM menu_items mi WHERE mi.id = c.menu_item_id) AS menu_item_name
      FROM client_memberships m
      JOIN client_profiles p ON p.team_id = m.team_id AND p.enabled = TRUE AND p.loyalty_on = TRUE
      JOIN teams t ON t.id = m.team_id
      JOIN client_coupons c ON c.team_id = m.team_id
      WHERE m.customer_id = ${customerId} AND c.active = TRUE AND c.kind = 'offer' AND c.draft = FALSE AND c.archived_at IS NULL
        AND (c.valid_until IS NULL OR c.valid_until >= ${dnes})
      ORDER BY c.cost_points, c.id LIMIT 30` as any[];
    return rows.map(r => ({
      id: Number(r.id), slug: String(r.slug), business: String(r.business), accent: r.accent ? String(r.accent) : null,
      title: String(r.title), description: String(r.description ?? ''), costPoints: Number(r.cost_points) || 0,
      benefit: benefitLabel(r, menaZRadku(r.currency, r.locale).money) || null, validUntil: r.valid_until ?? null,
      points: Number(r.my_points) || 0,
    }));
  } catch { return []; }
}
