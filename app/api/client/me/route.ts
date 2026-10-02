// Moje podniky: členství s body a razítky, rezervace, objednávky, kupony.
import { NextRequest, NextResponse } from 'next/server';
import { sql, customer, publicProfile } from '@/lib/client';
import { dispatchDueBroadcasts } from '@/lib/broadcasts';
import { pragueToday } from '@/lib/pragueTime';
import { shapeCampaign, jmenaPolozek, prubehZRadku } from '@/lib/stamps';
import { zajistiRazitka } from '@/lib/stampsSchema';
import { kartaProHosta } from '@/lib/razitkaPravidla';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  // Naplánované zprávy členům: hosté jsou nejčastější provoz, tak se fronta
  // prohlédne tady (levný dotaz přes částečný index) — cron je jen záloha.
  await dispatchDueBroadcasts();
  const today = pragueToday();
  const memberships = await sql`
    SELECT m.points, m.stamps, m.visits, m.credit, m.joined_at, m.last_visit_at, p.*, t.name AS team_name, t.opening_hours, t.share_theme, t.currency
    FROM client_memberships m JOIN client_profiles p ON p.team_id = m.team_id JOIN teams t ON t.id = m.team_id
    WHERE m.customer_id = ${me.id} ORDER BY m.last_visit_at DESC NULLS LAST, m.joined_at DESC` as any[];
  const reservations = await sql`
    SELECT r.id, r.date, r.time, r.party, r.note, r.status, p.slug, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS business
    FROM client_reservations r JOIN client_profiles p ON p.team_id = r.team_id JOIN teams t ON t.id = r.team_id
    WHERE r.customer_id = ${me.id} ORDER BY r.date DESC, r.time DESC LIMIT 40`;
  let orders: any[] = [];
  try {
    orders = await sql`
      SELECT o.id, o.items, o.total, o.status, o.created_at, p.slug, t.currency,
             COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS business
      FROM client_orders o JOIN client_profiles p ON p.team_id = o.team_id JOIN teams t ON t.id = o.team_id
      WHERE o.customer_id = ${me.id} ORDER BY o.created_at DESC LIMIT 40` as any[];
  } catch { orders = []; }
  const claims = await sql`
    SELECT cl.id, cl.code, cl.claimed_at, cl.redeemed_at, c.title, p.slug, COALESCE(NULLIF(t.share_theme->>'businessName',''), t.name) AS business
    FROM client_coupon_claims cl JOIN client_coupons c ON c.id = cl.coupon_id JOIN client_profiles p ON p.team_id = cl.team_id JOIN teams t ON t.id = cl.team_id
    WHERE cl.customer_id = ${me.id} ORDER BY cl.redeemed_at NULLS FIRST, cl.claimed_at DESC LIMIT 40`;
  const [profile] = await sql`SELECT id, name, email, phone, birthday FROM users WHERE id = ${me.id}`;
  // Souhlas s novinkami podniků (opt-in): chybí-li nastavení nebo sloupec, je to NE.
  let novinky = false;
  try { const [p] = await sql`SELECT notif_prefs FROM users WHERE id = ${me.id}`; novinky = p?.notif_prefs?.novinky === true; } catch { /* před migrací */ }
  // Razítkové kampaně všech mých podniků + můj průběh — dvě skupinové otázky.
  let campaignRows: any[] = []; let progRows: any[] = [];
  try {
    const teamIds = memberships.map(m => Number(m.team_id));
    if (teamIds.length) {
      await zajistiRazitka();
      [campaignRows, progRows] = await Promise.all([
        sql`SELECT * FROM client_stamp_campaigns WHERE team_id = ANY(${teamIds}) AND active = TRUE AND draft = FALSE AND archived_at IS NULL
             AND (valid_since IS NULL OR valid_since <= ${today}) AND (valid_till IS NULL OR valid_till >= ${today})
             ORDER BY position, id` as any,
        sql`SELECT * FROM client_stamp_progress WHERE customer_id = ${me.id}` as any,
      ]);
    }
  } catch { /* před migrací */ }
  // Útrata a slevy skupin po podnicích: samostatné dotazy, ať chybějící sloupec (před migrací) nic neshodí.
  const spendBy = new Map<number, number>();
  const skupinyBy = new Map<number, { name: string; discount: number }[]>();
  try {
    const rows = await sql`SELECT team_id, spend FROM client_memberships WHERE customer_id = ${me.id}` as any[];
    for (const r of rows) spendBy.set(Number(r.team_id), Number(r.spend) || 0);
  } catch { /* před migrací */ }
  try {
    const rows = await sql`
      SELECT gm.team_id, g.name, g.discount_pct FROM client_group_members gm
      JOIN client_groups g ON g.id = gm.group_id AND g.team_id = gm.team_id
      WHERE gm.customer_id = ${me.id} AND g.discount_pct > 0 ORDER BY g.discount_pct DESC` as any[];
    for (const r of rows) {
      const t = Number(r.team_id);
      if (!skupinyBy.has(t)) skupinyBy.set(t, []);
      skupinyBy.get(t)!.push({ name: String(r.name), discount: Number(r.discount_pct) || 0 });
    }
  } catch { /* před migrací */ }
  const progBy = new Map(progRows.map((r: any) => [Number(r.campaign_id), r]));
  const campsByTeam = new Map<number, any[]>();
  const odmenaJmena = await jmenaPolozek(Array.from(new Set(campaignRows.flatMap((r: any) => shapeCampaign(r).reward_items.map(x => x.itemId)))));
  for (const r of campaignRows) {
    const t = Number(r.team_id);
    if (!campsByTeam.has(t)) campsByTeam.set(t, []);
    const c = shapeCampaign(r);
    const pr = progBy.get(c.id);
    campsByTeam.get(t)!.push(kartaProHosta(c, pr ? prubehZRadku(pr) : null, c.reward_items.map(x => odmenaJmena.get(x.itemId)).filter((x): x is string => !!x)));
  }
  return NextResponse.json({
    me: { ...(profile ?? me), novinky },
    memberships: memberships.map(m => ({ ...publicProfile(m), points: Number(m.points), stamps: Number(m.stamps), visits: Number(m.visits), spend: spendBy.get(Number(m.team_id)) ?? 0, groupDiscounts: skupinyBy.get(Number(m.team_id)) ?? [], credit: Number(m.credit ?? 0), lastVisitAt: m.last_visit_at, campaigns: campsByTeam.get(Number(m.team_id)) ?? [] })),
    reservations, orders, claims, today,
  });
}

/** Profil hosta: jméno, telefon, narozeniny (jen den a měsíc stačí podniku na přání). */
export async function PATCH(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const name = b.name != null ? String(b.name).trim().slice(0, 80) : null;
  const phone = b.phone != null ? String(b.phone).replace(/[^\d+ ]/g, '').trim().slice(0, 20) : null;
  const birthday = b.birthday != null ? (/^\d{4}-\d{2}-\d{2}$/.test(String(b.birthday)) ? String(b.birthday) : '') : null;
  if (name !== null && !name) return NextResponse.json({ error: 'Jméno nesmí být prázdné.' }, { status: 400 });
  // Souhlas s novinkami podniků (nebo jeho odvolání). Čas souhlasu se zapisuje, ať je co doložit.
  if (typeof b.novinky === 'boolean') {
    try {
      await sql`UPDATE users SET notif_prefs = COALESCE(notif_prefs, '{}'::jsonb) || jsonb_build_object('novinky', ${b.novinky}::boolean, 'novinkyAt', ${new Date().toISOString()}::text) WHERE id = ${me.id}`;
    } catch {
      return NextResponse.json({ error: 'Nastavení se zatím nepodařilo uložit.' }, { status: 503 });
    }
  }
  // Ovladač neumí skládat úryvky SQL, proto COALESCE: null znamená „nech, jak je".
  const setBirthday = birthday !== null;
  await sql`UPDATE users SET
    name = COALESCE(${name}, name), phone = COALESCE(${phone}, phone),
    birthday = CASE WHEN ${setBirthday} THEN ${birthday || null} ELSE birthday END
    WHERE id = ${me.id}`;
  const [u] = await sql`SELECT id, name, email, phone, birthday FROM users WHERE id = ${me.id}`;
  let novinky = false;
  try { const [p] = await sql`SELECT notif_prefs FROM users WHERE id = ${me.id}`; novinky = p?.notif_prefs?.novinky === true; } catch { /* před migrací */ }
  return NextResponse.json({ ok: true, me: { ...u, novinky } });
}
