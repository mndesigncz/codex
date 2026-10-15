import { NextResponse } from 'next/server';
import { customer, sql } from '@/lib/client';
import { hit } from '@/lib/rateLimit';
import { sestavExportHosta, nazevExportuHosta } from '@/lib/exportHosta';
import { radkySouhlasu } from '@/lib/consentsDb';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

// „Stáhnout moje data“ v profilu hosta (spuštění, balík G; GDPR čl. 15 a 20). Osobní věc účtu:
// jen přihlášený host. KAŽDÝ dotaz je omezený na vlastní id (customer_id / user_id = me), takže
// v souboru nejsou cizí hosté ani provozní data podniku. Sekce, kterou databáze (ještě) nemá,
// se vynechá a jmenuje se v `nedostupne`. Sestavení a bílá listina polí: lib/exportHosta.ts.

const STROP = 20000;

async function sekce<T>(f: () => Promise<T>): Promise<T | null> {
  try { return await f(); } catch { return null; }
}

type Radky = Record<string, unknown>[];

export async function GET() {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const id = me.id;

  // Export je drahý dotaz a obsahuje osobní údaje: pár stažení za hodinu stačí.
  const brana = await hit(`export-dat-host:${id}`, 6, 60 * 60, { failClosed: true });
  if (!brana.ok) return NextResponse.json({ error: 'Příliš mnoho stažení. Zkus to později.' }, { status: 429 });

  const [ucet, karta, clenstvi, body, razitka, razitkaHistorie, kupony, promoKody, objednavky, rezervace, hodnoceni, poukazy, akce, souhlasy] = await Promise.all([
    sekce(async () => {
      try {
        const [u] = await sql`SELECT id, name, email, phone, birthday, avatar, role, lang, created_at, terms_version, privacy_version, terms_accepted_at FROM users WHERE id = ${id}`;
        return (u ?? null) as Record<string, unknown> | null;
      } catch {
        const [u] = await sql`SELECT id, name, email, phone, birthday, avatar, role, created_at FROM users WHERE id = ${id}`;
        return (u ?? null) as Record<string, unknown> | null;
      }
    }),
    sekce(async () => {
      const [k] = await sql`SELECT code, created_at FROM client_cards WHERE customer_id = ${id}`;
      return (k ?? null) as Record<string, unknown> | null;
    }),
    // Členství s kreditem a útratou; před migrací těch sloupců bez nich.
    sekce(async () => {
      try {
        return await sql`
          SELECT m.team_id, COALESCE(NULLIF(t.share_theme->>'businessName', ''), t.name) AS podnik, m.points, m.stamps, m.visits,
                 m.credit, m.spend, m.joined_at, m.last_visit_at, m.blocked, m.blocked_at
          FROM client_memberships m JOIN teams t ON t.id = m.team_id
          WHERE m.customer_id = ${id} ORDER BY m.team_id` as Radky;
      } catch {
        return await sql`
          SELECT m.team_id, t.name AS podnik, m.points, m.stamps, m.visits, m.joined_at, m.last_visit_at
          FROM client_memberships m JOIN teams t ON t.id = m.team_id
          WHERE m.customer_id = ${id} ORDER BY m.team_id` as Radky;
      }
    }),
    // Historie bodů a kreditu (připsání, uplatnění, propadnutí).
    sekce(async () => {
      try {
        return await sql`
          SELECT id, team_id, delta, credit_delta, kind, note, created_at
          FROM client_loyalty_ledger WHERE customer_id = ${id} ORDER BY id LIMIT ${STROP}` as Radky;
      } catch {
        return await sql`
          SELECT id, team_id, delta, kind, note, created_at
          FROM client_loyalty_ledger WHERE customer_id = ${id} ORDER BY id LIMIT ${STROP}` as Radky;
      }
    }),
    sekce(async () => await sql`
      SELECT sp.team_id, sp.campaign_id, c.name AS karta, sp.stamps, sp.completed, sp.started_at, sp.last_stamp_at, sp.last_completed_at
      FROM client_stamp_progress sp LEFT JOIN client_stamp_campaigns c ON c.id = sp.campaign_id
      WHERE sp.customer_id = ${id} ORDER BY sp.team_id, sp.campaign_id` as Radky),
    sekce(async () => await sql`
      SELECT id, team_id, campaign_id, kind, delta, completions, reason, day, undone_at, created_at
      FROM client_stamp_events WHERE customer_id = ${id} ORDER BY id LIMIT ${STROP}` as Radky),
    sekce(async () => await sql`
      SELECT cl.id, cl.team_id, c.title AS kupon, cl.code, cl.claimed_at, cl.redeemed_at
      FROM client_coupon_claims cl LEFT JOIN client_coupons c ON c.id = cl.coupon_id
      WHERE cl.customer_id = ${id} ORDER BY cl.id LIMIT ${STROP}` as Radky),
    sekce(async () => await sql`
      SELECT p.team_id, p.code, p.title, u.used_at
      FROM client_promo_uses u JOIN client_promos p ON p.id = u.promo_id
      WHERE u.customer_id = ${id} ORDER BY u.used_at` as Radky),
    sekce(async () => await sql`
      SELECT id, team_id, table_id, items, total, note, status, created_at, updated_at
      FROM client_orders WHERE customer_id = ${id} ORDER BY id LIMIT ${STROP}` as Radky),
    sekce(async () => await sql`
      SELECT id, team_id, date, time, party, note, status, created_at, updated_at
      FROM client_reservations WHERE customer_id = ${id} ORDER BY id LIMIT ${STROP}` as Radky),
    // Hodnocení i s odpovědí podniku (ta je reakcí na hostův text).
    sekce(async () => {
      try {
        return await sql`
          SELECT id, team_id, ref, rating, note, reply, replied_at, created_at
          FROM client_reviews WHERE customer_id = ${id} ORDER BY id LIMIT ${STROP}` as Radky;
      } catch {
        return await sql`
          SELECT id, team_id, ref, rating, note, created_at
          FROM client_reviews WHERE customer_id = ${id} ORDER BY id LIMIT ${STROP}` as Radky;
      }
    }),
    // Dárkové poukazy přiřazené hostovi nebo jím koupené.
    sekce(async () => await sql`
      SELECT id, team_id, code, value_amount, balance, currency, valid_until, status, recipient_name, created_at
      FROM client_vouchers WHERE customer_id = ${id} OR buyer_customer_id = ${id} ORDER BY id LIMIT ${STROP}` as Radky),
    sekce(async () => await sql`
      SELECT f.event_id, e.team_id, e.title, e.date, f.going, f.created_at
      FROM client_event_follows f LEFT JOIN events e ON e.id = f.event_id
      WHERE f.customer_id = ${id} ORDER BY f.created_at` as Radky),
    sekce(async () => {
      const r = await radkySouhlasu(id);
      if (!r) throw new Error('bez tabulky');
      return r.map(x => ({ podnik: x.team_id, typ: x.typ, stav: x.stav, kanal: x.kanal, verze: x.verze, zneni: x.zneni, kdy: x.created_at })) as Radky;
    }),
  ]);

  const ted = new Date();
  const dokument = sestavExportHosta({ ucet, karta, clenstvi, body, razitka, razitkaHistorie, kupony, promoKody, objednavky, rezervace, hodnoceni, poukazy, akce, souhlasy }, ted, STROP);
  return new NextResponse(JSON.stringify(dokument, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nazevExportuHosta(ted)}"`,
      'Cache-Control': 'no-store',
    },
  });
}
