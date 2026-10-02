// Bonusové akce věrnosti („Happy hour", dvojnásobné body v úterý): správa pravidel.
// Čtení smí kdo vidí věrnost, měnit jen kdo má pravidla věrnosti.

import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { hit } from '@/lib/rateLimit';
import { bonusPravidla, zajistiBonusAkce, aktivniBonus } from '@/lib/bonusAkceDb';
import { normalizujPravidlo, popisNasobice } from '@/lib/bonusAkce';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

function detail(v: { name: string; multiplier: number; stampBonus: number }): string {
  return [v.name, v.multiplier > 1 ? popisNasobice(v.multiplier) : '', v.stampBonus > 0 ? `+${v.stampBonus} razítek` : ''].filter(Boolean).join(' · ');
}

export async function GET() {
  const ctx = await pozaduj('vernost.zobrazit');
  if (jeOdpoved(ctx)) return ctx;
  try {
    const rules = await bonusPravidla(ctx.teamId);
    const bonus = await aktivniBonus(ctx.teamId);
    return NextResponse.json({ rules, nowActive: bonus.pravidla.map(r => r.id) });
  } catch {
    return NextResponse.json({ rules: [], nowActive: [], notMigrated: true });
  }
}

async function brzda(teamId: number): Promise<NextResponse | null> {
  const gate = await hit(`client-bonus-rules:${teamId}`, 120, 60 * 60);
  if (gate.ok) return null;
  return NextResponse.json({ error: 'Změn je dnes moc. Zkus to za chvíli.' }, { status: 429, headers: { 'Retry-After': String(gate.retryAfter) } });
}

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('vernost.pravidla');
  if (jeOdpoved(ctx)) return ctx;
  const limit = await brzda(ctx.teamId);
  if (limit) return limit;
  const b = await req.json().catch(() => ({}));
  const v = normalizujPravidlo(b);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const f = v.value;
  await zajistiBonusAkce();
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM client_bonus_rules WHERE team_id = ${ctx.teamId}` as any[];
  if (Number(n) >= 50) return NextResponse.json({ error: 'Akcí je dost. Smaž některou nepoužívanou.' }, { status: 400 });
  const [row] = await sql`
    INSERT INTO client_bonus_rules (team_id, name, multiplier, stamp_bonus, days_of_week, hour_from, hour_till, valid_since, valid_till, active)
    VALUES (${ctx.teamId}, ${f.name}, ${f.multiplier}, ${f.stampBonus}, ${JSON.stringify(f.days)}::jsonb, ${f.hourFrom}, ${f.hourTill}, ${f.validSince}, ${f.validTill}, ${f.active})
    RETURNING id`;
  audit(ctx.teamId, ctx.meId, 'client.bonus', 'client', Number(row.id), `založena: ${detail(f)}`);
  return NextResponse.json({ ok: true, id: row.id });
}

export async function PATCH(req: NextRequest) {
  const ctx = await pozaduj('vernost.pravidla');
  if (jeOdpoved(ctx)) return ctx;
  const limit = await brzda(ctx.teamId);
  if (limit) return limit;
  const b = await req.json().catch(() => ({}));
  const id = parseInt(String(b.id), 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná akce.' }, { status: 400 });
  await zajistiBonusAkce();
  const [cur] = await sql`SELECT id, name FROM client_bonus_rules WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  if (!cur) return NextResponse.json({ error: 'Akce nenalezena.' }, { status: 404 });
  // Samotné zapnutí a vypnutí (přepínač v seznamu) nemá posílat celý formulář.
  if (b.name === undefined && typeof b.active === 'boolean') {
    await sql`UPDATE client_bonus_rules SET active = ${b.active} WHERE id = ${id} AND team_id = ${ctx.teamId}`;
    audit(ctx.teamId, ctx.meId, 'client.bonus', 'client', id, `${b.active ? 'zapnuta' : 'vypnuta'}: ${cur.name}`);
    return NextResponse.json({ ok: true });
  }
  const v = normalizujPravidlo(b);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const f = v.value;
  await sql`
    UPDATE client_bonus_rules SET
      name = ${f.name}, multiplier = ${f.multiplier}, stamp_bonus = ${f.stampBonus}, days_of_week = ${JSON.stringify(f.days)}::jsonb,
      hour_from = ${f.hourFrom}, hour_till = ${f.hourTill}, valid_since = ${f.validSince}, valid_till = ${f.validTill}, active = ${f.active}
    WHERE id = ${id} AND team_id = ${ctx.teamId}`;
  audit(ctx.teamId, ctx.meId, 'client.bonus', 'client', id, `upravena: ${detail(f)}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const ctx = await pozaduj('vernost.pravidla');
  if (jeOdpoved(ctx)) return ctx;
  const limit = await brzda(ctx.teamId);
  if (limit) return limit;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '', 10);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatná akce.' }, { status: 400 });
  await zajistiBonusAkce();
  const [cur] = await sql`DELETE FROM client_bonus_rules WHERE id = ${id} AND team_id = ${ctx.teamId} RETURNING name`;
  if (!cur) return NextResponse.json({ error: 'Akce nenalezena.' }, { status: 404 });
  audit(ctx.teamId, ctx.meId, 'client.bonus', 'client', id, `smazána: ${cur.name}`);
  return NextResponse.json({ ok: true });
}
