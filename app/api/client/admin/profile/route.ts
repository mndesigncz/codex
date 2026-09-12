// Profil podniku v Managero client — vedení ho zapíná, pojmenuje adresu,
// nastaví, co host smí (rezervace, objednávky, věrnost) a pravidla věrnosti.
import { NextRequest, NextResponse } from 'next/server';
import { sql, employer, ensureProfile, slugify, publicProfile } from '@/lib/client';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function origin(req: NextRequest) { return (process.env.NEXTAUTH_URL?.replace(/\/$/, '') || new URL(req.url).origin); }

export async function GET(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const p = await ensureProfile(u.team_id);
  const boards = await sql`SELECT slug, name FROM menu_boards WHERE team_id = ${u.team_id} AND enabled IS NOT FALSE ORDER BY id`;
  const [team] = await sql`SELECT name, opening_hours FROM teams WHERE id = ${u.team_id}`;
  return NextResponse.json({ profile: { ...p, team_name: team?.name, opening_hours: team?.opening_hours ?? {} }, boards, url: `${origin(req)}/client/${p.slug}` });
}

export async function PUT(req: NextRequest) {
  const u = await employer();
  if (!u) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  const cur = await ensureProfile(u.team_id);
  const slug = b.slug != null ? slugify(b.slug) : cur.slug;
  if (!slug) return NextResponse.json({ error: 'Adresa musí mít aspoň jedno písmeno nebo číslo.' }, { status: 400 });
  if (slug !== cur.slug) {
    const [clash] = await sql`SELECT team_id FROM client_profiles WHERE slug = ${slug} AND team_id <> ${u.team_id}`;
    if (clash) return NextResponse.json({ error: 'Tuhle adresu už používá jiný podnik.' }, { status: 409 });
  }
  // „|| d" bralo nulu jako nevyplněno — narozeninové body (0 = nedávat),
  // body za útratu i cíl razítek pak nešly vypnout.
  const num = (v: any, d: number, lo: number, hi: number) => { const n = parseInt(String(v ?? d), 10); return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : d)); };
  // Souřadnice: undefined nechá, prázdný řetězec nebo null smaže, číslo uloží.
  const coord = (v: any, cur: any, lim: number) => {
    if (v === undefined) return cur ?? null;
    if (v === null || v === '') return null;
    const n = Number(String(v).replace(',', '.'));
    return Number.isFinite(n) && Math.abs(n) <= lim ? n : (cur ?? null);
  };
  const [p] = await sql`
    UPDATE client_profiles SET
      slug = ${slug},
      enabled = ${b.enabled != null ? !!b.enabled : cur.enabled},
      tagline = ${String(b.tagline ?? cur.tagline ?? '').slice(0, 120)},
      description = ${String(b.description ?? cur.description ?? '').slice(0, 1200)},
      address = ${String(b.address ?? cur.address ?? '').slice(0, 200)},
      cover_url = ${String(b.cover_url ?? cur.cover_url ?? '').slice(0, 500)},
      reservations_on = ${b.reservations_on != null ? !!b.reservations_on : cur.reservations_on},
      ordering_on = ${b.ordering_on != null ? !!b.ordering_on : cur.ordering_on},
      loyalty_on = ${b.loyalty_on != null ? !!b.loyalty_on : cur.loyalty_on},
      points_per_100 = ${num(b.points_per_100, Number(cur.points_per_100), 0, 100)},
      stamp_target = ${num(b.stamp_target, Number(cur.stamp_target), 0, 50)},
      stamp_reward = ${String(b.stamp_reward ?? cur.stamp_reward ?? '').slice(0, 80)},
      birthday_points = ${num(b.birthday_points, Number(cur.birthday_points) || 0, 0, 1000)},
      max_party = ${num(b.max_party, Number(cur.max_party), 1, 40)},
      lead_days = ${num(b.lead_days, Number(cur.lead_days), 1, 180)},
      slot_minutes = ${num(b.slot_minutes, Number(cur.slot_minutes), 15, 120)},
      menu_slug = ${b.menu_slug !== undefined ? (b.menu_slug ? String(b.menu_slug).slice(0, 80) : null) : cur.menu_slug},
      order_qr_required = ${b.order_qr_required != null ? !!b.order_qr_required : cur.order_qr_required},
      order_geo = ${['off', 'warn', 'block'].includes(String(b.order_geo)) ? String(b.order_geo) : cur.order_geo},
      lat = ${coord(b.lat, cur.lat, 90)},
      lng = ${coord(b.lng, cur.lng, 180)},
      geo_radius_m = ${num(b.geo_radius_m, Number(cur.geo_radius_m) || 100, 30, 1000)},
      order_auto_pos = ${b.order_auto_pos != null ? !!b.order_auto_pos : cur.order_auto_pos},
      updated_at = NOW()
    WHERE team_id = ${u.team_id} RETURNING *`;
  audit(u.team_id, u.id, 'client.profile', 'client', null, p.enabled ? `zapnuto · /client/${p.slug}` : 'vypnuto');
  return NextResponse.json({ ok: true, profile: p, public: publicProfile({ ...p, team_name: '', opening_hours: {} }), url: `${origin(req)}/client/${p.slug}` });
}
