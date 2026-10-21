// Živá odezva u kasy: co se hostovi od daného okamžiku připsalo nebo uplatnilo.
//
// Host má otevřené „U kasy“ (QR přes celou výšku) a ptá se každé 2–3 s
// GET /api/client/card/stav?od=<kurzor>. Zdrojem jsou deníky, do kterých už dnes zapisuje
// každá cesta u kasy (čtečka, párování s pokladnou, ruční úprava), takže čtečka pro odezvu
// nemusí dělat nic navíc — jen dál zapisovat jako dnes:
//   · client_stamp_events (kind 'earn', delta > 0, bez storna)  → razítko v kampani
//   · client_loyalty_ledger (delta ≠ 0 / credit_delta ≠ 0)      → body / kredit
//   · client_loyalty_ledger kind 'visit' bez kampaní            → razítko ve staré kartě podniku
//   · client_coupon_claims.claimed_at, kupon kind 'stamps'      → odměna připravena
//   · client_coupon_claims.redeemed_at                          → odměna uplatněna
// Kurzor je čas databáze (text), ať se hodiny telefonu a serveru nemusí shodovat.

import { sql } from '../client';
import { activeCampaigns, progressFor, prubehHosta } from '../stamps';
import { stavKartyHosta } from '../razitkaPravidla';
import { pragueToday } from '../pragueTime';
import { zajistiHosta } from './schema';

export type TypUdalosti = 'razitko' | 'body' | 'kredit' | 'odmena' | 'uplatneno';

export interface UdalostKasy {
  id: string;
  typ: TypUdalosti;
  /** ISO čas. */
  at: string;
  teamId: number;
  slug: string;
  podnik: string;
  /** Barva značky podniku (#RRGGBB) nebo null. */
  accent: string | null;
  /** +1 razítko, +21 bodů, −50 kreditu (v jednotkách měny), u odměny 0. */
  delta: number;
  /** U razítka: stav karty po načtení. */
  karta?: { id: number; nazev: string; razitka: number; cil: number; odmena: string | null };
  /** U odměny a uplatnění: název odměny. */
  nazev?: string;
  /** U bodů a kreditu: zůstatek po připsání. */
  zustatek?: number;
}

export interface OdezvaKasy {
  kurzor: string;
  udalosti: UdalostKasy[];
}

const MAX_ZPET_MIN = 30;

/** Kurzor „teď“ podle hodin databáze. */
export async function kurzorTed(): Promise<string> {
  const [r] = await sql`SELECT to_char(NOW()::timestamp, 'YYYY-MM-DD"T"HH24:MI:SS.US') AS t`;
  return String(r.t);
}

/** Kurzor od klienta: jen tvar času, jinak null (vrátí se nový kurzor bez událostí). */
export function platnyKurzor(v: unknown): string | null {
  const s = String(v ?? '').trim();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(s) ? s : null;
}

const iso = (v: any): string => {
  if (v instanceof Date) return v.toISOString();
  const raw = String(v ?? '');
  return new Date(/[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(' ', 'T') + 'Z').toISOString();
};

export async function udalostiOd(customerId: number, od: string): Promise<OdezvaKasy> {
  try { await zajistiHosta(); } catch { /* bez indexů to jen pomaleji */ }
  const kurzor = await kurzorTed();
  // Nikdy dál než půl hodiny zpět — staré kurzory z uspané karty nemají přehrát celý den.
  const razitka = await sql`
    SELECT e.id, e.team_id, e.campaign_id, e.delta, e.created_at, c.name AS kampan, c.required_stamps, c.reward_title,
           p.slug, p.accent, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_stamp_events e
    JOIN client_stamp_campaigns c ON c.id = e.campaign_id
    JOIN client_profiles p ON p.team_id = e.team_id JOIN teams t ON t.id = e.team_id
    WHERE e.customer_id = ${customerId} AND e.kind = 'earn' AND e.delta > 0 AND e.undone_at IS NULL
      AND e.created_at > ${od}::timestamp AND e.created_at > NOW() - make_interval(mins => ${MAX_ZPET_MIN}::int)
    ORDER BY e.created_at` as any[];
  const denik = await sql`
    SELECT l.id, l.team_id, l.delta, l.credit_delta, l.kind, l.created_at,
           m.points, m.credit, m.stamps, pr.stamp_target, pr.stamp_reward,
           pr.slug, pr.accent, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_loyalty_ledger l
    JOIN client_profiles pr ON pr.team_id = l.team_id JOIN teams t ON t.id = l.team_id
    LEFT JOIN client_memberships m ON m.customer_id = l.customer_id AND m.team_id = l.team_id
    WHERE l.customer_id = ${customerId} AND l.kind <> 'expire'
      AND l.created_at > ${od}::timestamp AND l.created_at > NOW() - make_interval(mins => ${MAX_ZPET_MIN}::int)
    ORDER BY l.created_at` as any[];
  const odmeny = await sql`
    SELECT cl.id, cl.team_id, cl.claimed_at, cl.redeemed_at, c.title, c.kind,
           p.slug, p.accent, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
    JOIN client_profiles p ON p.team_id = cl.team_id JOIN teams t ON t.id = cl.team_id
    WHERE cl.customer_id = ${customerId}
      AND ((cl.redeemed_at > ${od}::timestamp AND cl.redeemed_at > NOW() - make_interval(mins => ${MAX_ZPET_MIN}::int))
        OR (c.kind = 'stamps' AND cl.claimed_at > ${od}::timestamp AND cl.claimed_at > NOW() - make_interval(mins => ${MAX_ZPET_MIN}::int)))` as any[];

  const out: UdalostKasy[] = [];
  const zaklad = (r: any) => ({ teamId: Number(r.team_id), slug: String(r.slug), podnik: String(r.podnik ?? ''), accent: r.accent ? String(r.accent) : null });
  // Stav kampaní po načtení (jen podniky, kde razítko přibylo): host vidí „9 / 10“.
  const tymy = Array.from(new Set(razitka.map(r => Number(r.team_id))));
  const stavy = new Map<number, number>();
  for (const teamId of tymy) {
    const camps = await activeCampaigns(teamId, pragueToday());
    const prog = await progressFor(teamId, customerId);
    for (const c of camps) {
      const pr = prog.get(c.id);
      stavy.set(c.id, stavKartyHosta(c, pr ? prubehHosta(pr) : null).stamps);
    }
  }
  // Součet razítek jedné kampaně v jednom okamžiku (účtenka se dvěma kávami) = jedna událost „+2“.
  const sloucena = new Map<string, any>();
  for (const r of razitka) {
    const k = `${r.campaign_id}:${iso(r.created_at).slice(0, 19)}`;
    const x = sloucena.get(k);
    if (x) x.delta += Number(r.delta); else sloucena.set(k, { ...r, delta: Number(r.delta) });
  }
  for (const r of sloucena.values()) {
    const cil = Number(r.required_stamps) || 0;
    const ted = stavy.get(Number(r.campaign_id));
    out.push({
      id: `S${r.id}`, typ: 'razitko', at: iso(r.created_at), ...zaklad(r), delta: r.delta,
      // Plná karta se hned vynuluje a vydá odměnu; host má vidět „10 / 10“, ne „0 / 10“.
      karta: { id: Number(r.campaign_id), nazev: String(r.kampan ?? ''), razitka: ted == null ? 0 : (ted === 0 && r.delta > 0 ? cil : ted), cil, odmena: r.reward_title ? String(r.reward_title) : null },
    });
  }
  const tymySRazitkem = new Set(tymy);
  for (const r of denik) {
    const z = zaklad(r);
    if (Number(r.delta) !== 0) out.push({ id: `L${r.id}`, typ: 'body', at: iso(r.created_at), ...z, delta: Number(r.delta), zustatek: Number(r.points ?? 0) });
    if (Number(r.credit_delta) !== 0) out.push({ id: `K${r.id}`, typ: 'kredit', at: iso(r.created_at), ...z, delta: Number(r.credit_delta), zustatek: Number(r.credit ?? 0) });
    // Stará karta podniku (bez kampaní): razítko je jen řádek „visit“ v deníku.
    if (r.kind === 'visit' && Number(r.delta) === 0 && !tymySRazitkem.has(z.teamId) && Number(r.stamp_target) > 0) {
      const cil = Number(r.stamp_target);
      const st = Number(r.stamps ?? 0);
      out.push({ id: `V${r.id}`, typ: 'razitko', at: iso(r.created_at), ...z, delta: 1, karta: { id: 0, nazev: '', razitka: st === 0 ? cil : st, cil, odmena: r.stamp_reward ? String(r.stamp_reward) : null } });
    }
  }
  for (const r of odmeny) {
    const z = zaklad(r);
    if (r.redeemed_at && iso(r.redeemed_at) > iso(od)) out.push({ id: `U${r.id}`, typ: 'uplatneno', at: iso(r.redeemed_at), ...z, delta: 0, nazev: String(r.title) });
    if (r.kind === 'stamps' && iso(r.claimed_at) > iso(od)) out.push({ id: `O${r.id}`, typ: 'odmena', at: iso(r.claimed_at), ...z, delta: 0, nazev: String(r.title) });
  }
  out.sort((a, b) => a.at.localeCompare(b.at));
  return { kurzor, udalosti: out };
}
