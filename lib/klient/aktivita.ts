// Aktivita hosta (schránka): co se mu za posledních 60 dní stalo napříč podniky — razítka a body
// u kasy, odměna připravená a uplatněná, potvrzení a změny rezervací, stav objednávek od stolu,
// novinky podniků (jen se souhlasem a jen ty, které mu opravdu přišly) a odpovědi na hodnocení,
// plus výzva „Jak to bylo?“ u hotové návštěvy. Texty skládá klient (t()), server vrací data.
// Nepřečtené = novější než users.host_aktivita_videno (odznak v doku).

import { sql } from '../client';
import { parseDbTime } from '../pragueTime';
import { zajistiHosta } from './schema';

export interface PolozkaAktivity {
  id: string;
  typ: 'razitko' | 'body' | 'kredit' | 'odmena' | 'uplatneno' | 'rezervace' | 'objednavka' | 'novinka' | 'odpoved' | 'hodnotit';
  at: string;
  slug: string; podnik: string; accent: string | null;
  delta?: number; zustatek?: number;
  karta?: { nazev: string; razitka?: number; cil: number };
  nazev?: string;
  stav?: string; date?: string; time?: string; party?: number; odkaz?: { rezervace?: number };
  titul?: string; text?: string | null;
  hodnoceni?: number; poznamka?: string | null;
  ref?: string; kind?: string;
}

const iso = (v: unknown) => parseDbTime(v as any)?.toISOString() ?? new Date(0).toISOString();

export async function aktivitaHosta(customerId: number): Promise<{ polozky: PolozkaAktivity[]; videno: string | null }> {
  try { await zajistiHosta(); } catch { /* bez sloupce videno jsou všechny nové */ }
  const out: PolozkaAktivity[] = [];
  const z = (r: any) => ({ slug: String(r.slug), podnik: String(r.podnik ?? ''), accent: r.accent ? String(r.accent) : null });
  const bezpecne = async <T,>(f: () => Promise<T[]>): Promise<T[]> => { try { return await f(); } catch { return []; } };

  const razitka = await bezpecne(() => sql`
    SELECT e.id, e.delta, e.created_at, c.name AS kampan, c.required_stamps, p.slug, p.accent,
           COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_stamp_events e JOIN client_stamp_campaigns c ON c.id = e.campaign_id
    JOIN client_profiles p ON p.team_id = e.team_id JOIN teams t ON t.id = e.team_id
    WHERE e.customer_id = ${customerId} AND e.kind = 'earn' AND e.delta > 0 AND e.undone_at IS NULL AND e.created_at > NOW() - INTERVAL '60 days'
    ORDER BY e.created_at DESC LIMIT 40` as any);
  for (const r of razitka as any[]) out.push({ id: `S${r.id}`, typ: 'razitko', at: iso(r.created_at), ...z(r), delta: Number(r.delta), karta: { nazev: String(r.kampan ?? ''), cil: Number(r.required_stamps) || 0 } });

  const denik = await bezpecne(() => sql`
    SELECT l.id, l.delta, l.credit_delta, l.kind, l.created_at, p.slug, p.accent, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_loyalty_ledger l JOIN client_profiles p ON p.team_id = l.team_id JOIN teams t ON t.id = l.team_id
    WHERE l.customer_id = ${customerId} AND l.created_at > NOW() - INTERVAL '60 days' AND (l.delta <> 0 OR l.credit_delta <> 0)
    ORDER BY l.created_at DESC LIMIT 40` as any);
  for (const r of denik as any[]) {
    if (Number(r.delta) !== 0) out.push({ id: `L${r.id}`, typ: 'body', at: iso(r.created_at), ...z(r), delta: Number(r.delta), nazev: String(r.kind) });
    if (Number(r.credit_delta) !== 0) out.push({ id: `K${r.id}`, typ: 'kredit', at: iso(r.created_at), ...z(r), delta: Number(r.credit_delta) });
  }

  const kupony = await bezpecne(() => sql`
    SELECT cl.id, cl.claimed_at, cl.redeemed_at, c.title, c.kind, p.slug, p.accent, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id
    JOIN client_profiles p ON p.team_id = cl.team_id JOIN teams t ON t.id = cl.team_id
    WHERE cl.customer_id = ${customerId} AND (cl.claimed_at > NOW() - INTERVAL '60 days' OR cl.redeemed_at > NOW() - INTERVAL '60 days')
    ORDER BY COALESCE(cl.redeemed_at, cl.claimed_at) DESC LIMIT 30` as any);
  for (const r of kupony as any[]) {
    if (r.kind === 'stamps') out.push({ id: `O${r.id}`, typ: 'odmena', at: iso(r.claimed_at), ...z(r), nazev: String(r.title) });
    if (r.redeemed_at) out.push({ id: `U${r.id}`, typ: 'uplatneno', at: iso(r.redeemed_at), ...z(r), nazev: String(r.title) });
  }

  const rezervace = await bezpecne(() => sql`
    SELECT r.id, r.date, r.time, r.party, r.status, r.updated_at, r.created_at, p.slug, p.accent, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_reservations r JOIN client_profiles p ON p.team_id = r.team_id JOIN teams t ON t.id = r.team_id
    WHERE r.customer_id = ${customerId} AND COALESCE(r.updated_at, r.created_at) > NOW() - INTERVAL '60 days'
      AND r.status IN ('requested','confirmed','declined','cancelled')
    ORDER BY COALESCE(r.updated_at, r.created_at) DESC LIMIT 20` as any);
  for (const r of rezervace as any[]) out.push({ id: `R${r.id}-${r.status}`, typ: 'rezervace', at: iso(r.updated_at ?? r.created_at), ...z(r), stav: String(r.status), date: String(r.date), time: String(r.time), party: Number(r.party), odkaz: { rezervace: Number(r.id) } });

  const objednavky = await bezpecne(() => sql`
    SELECT o.id, o.status, o.updated_at, o.created_at, p.slug, p.accent, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_orders o JOIN client_profiles p ON p.team_id = o.team_id JOIN teams t ON t.id = o.team_id
    WHERE o.customer_id = ${customerId} AND COALESCE(o.updated_at, o.created_at) > NOW() - INTERVAL '30 days'
    ORDER BY COALESCE(o.updated_at, o.created_at) DESC LIMIT 10` as any);
  for (const r of objednavky as any[]) out.push({ id: `B${r.id}-${r.status}`, typ: 'objednavka', at: iso(r.updated_at ?? r.created_at), ...z(r), stav: String(r.status) });

  // Novinky: jen podniky, kde je host členem a dal jim souhlas; veřejné zprávy i ty, které dostal osobně.
  const novinky = await bezpecne(() => sql`
    SELECT b.id, b.title, b.body, b.sent_at, p.slug, p.accent, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_broadcasts b
    JOIN client_memberships m ON m.team_id = b.team_id AND m.customer_id = ${customerId}
    JOIN client_profiles p ON p.team_id = b.team_id JOIN teams t ON t.id = b.team_id
    WHERE COALESCE(b.status, 'sent') = 'sent' AND b.sent_at > NOW() - INTERVAL '60 days'
      AND (COALESCE(b.audience, 'all') = 'all' OR COALESCE(b.prijemci, '[]'::jsonb) @> to_jsonb(${customerId}::int))
    ORDER BY b.sent_at DESC LIMIT 20` as any);
  for (const r of novinky as any[]) out.push({ id: `N${r.id}`, typ: 'novinka', at: iso(r.sent_at), ...z(r), titul: String(r.title), text: r.body ? String(r.body) : null });

  const odpovedi = await bezpecne(() => sql`
    SELECT v.id, v.rating, v.note, v.reply, v.replied_at, p.slug, p.accent, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM client_reviews v JOIN client_profiles p ON p.team_id = v.team_id JOIN teams t ON t.id = v.team_id
    WHERE v.customer_id = ${customerId} AND v.reply IS NOT NULL AND v.replied_at > NOW() - INTERVAL '60 days'
    ORDER BY v.replied_at DESC LIMIT 10` as any);
  for (const r of odpovedi as any[]) out.push({ id: `A${r.id}`, typ: 'odpoved', at: iso(r.replied_at), ...z(r), hodnoceni: Number(r.rating), poznamka: r.note ? String(r.note) : null, text: String(r.reply) });

  const hodnotit = await bezpecne(() => sql`
    SELECT x.ref, x.when_at, x.kind, p.slug, p.accent, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS podnik
    FROM (
      SELECT 'res:' || r.id AS ref, r.team_id, r.updated_at AS when_at, 'reservation' AS kind FROM client_reservations r
        WHERE r.customer_id = ${customerId} AND r.status = 'done' AND r.updated_at > NOW() - INTERVAL '14 days'
      UNION ALL
      SELECT 'ord:' || o.id, o.team_id, o.updated_at, 'order' FROM client_orders o
        WHERE o.customer_id = ${customerId} AND o.status = 'done' AND o.updated_at > NOW() - INTERVAL '14 days'
    ) x
    JOIN client_profiles p ON p.team_id = x.team_id JOIN teams t ON t.id = x.team_id
    WHERE NOT EXISTS (SELECT 1 FROM client_reviews v WHERE v.customer_id = ${customerId} AND v.ref = x.ref)
    ORDER BY x.when_at DESC LIMIT 5` as any);
  for (const r of hodnotit as any[]) out.push({ id: `H${r.ref}`, typ: 'hodnotit', at: iso(r.when_at), ...z(r), ref: String(r.ref), kind: String(r.kind) });

  out.sort((a, b) => b.at.localeCompare(a.at));
  let videno: string | null = null;
  try { const [u] = await sql`SELECT host_aktivita_videno FROM users WHERE id = ${customerId}`; videno = u?.host_aktivita_videno ? iso(u.host_aktivita_videno) : null; } catch { videno = null; }
  return { polozky: out.slice(0, 80), videno };
}

export function pocetNovych(polozky: PolozkaAktivity[], videno: string | null): number {
  return polozky.filter(p => p.typ !== 'hodnotit' && (!videno || p.at > videno)).length;
}

export async function oznacVideno(customerId: number): Promise<void> {
  await zajistiHosta();
  await sql`UPDATE users SET host_aktivita_videno = NOW() WHERE id = ${customerId}`;
}
