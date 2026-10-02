// Hromadné přidání členů do skupiny z CSV (nebo vloženého seznamu e-mailů, telefonů, jmen).
// Nikoho nezakládá: kdo není člen podniku, se vrátí s důvodem. Bez `potvrdit` jen náhled.
import { NextRequest, NextResponse } from 'next/server';
import { sql } from '@/lib/client';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { zajistiSchemaClenu } from '@/lib/clenoveSchema';
import { radkyProSkupinu, sparujSClenyPodniku } from '@/lib/clenoveSeznam';
import { audit } from '@/lib/audit';
import { normalizujPravidla } from '@/lib/clenoveFiltr';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

const MAX_ZNAKU = 600_000;

export async function POST(req: NextRequest) {
  const ctx = await pozaduj('zakaznici.skupiny');
  if (jeOdpoved(ctx)) return ctx;
  // Párování podle e-mailu a telefonu by jinak šlo zneužít k ověřování, kdo je členem: smí jen ten, kdo kontakty vidí.
  if (!ctx.role.opravneni.has('zakaznici.kontakty')) return NextResponse.json({ error: 'Přidávat členy ze souboru smí jen ten, kdo vidí kontakty hostů.' }, { status: 403 });
  await zajistiSchemaClenu();
  const b = await req.json().catch(() => ({}));
  const gid = Math.round(Number(b.skupina));
  const [g] = await sql`SELECT id, name, rules, archived FROM client_groups WHERE id = ${gid} AND team_id = ${ctx.teamId}`;
  if (!g) return NextResponse.json({ error: 'Skupina nenalezena.' }, { status: 404 });
  if (normalizujPravidla(g.rules)) return NextResponse.json({ error: 'Členy dynamické skupiny počítá pravidlo, ručně se neupravují.' }, { status: 400 });
  if (g.archived) return NextResponse.json({ error: 'Skupina je v archivu. Nejdřív ji vrať z archivu.' }, { status: 400 });
  const text = String(b.text ?? '');
  if (!text.trim()) return NextResponse.json({ error: 'Vlož seznam nebo vyber soubor CSV.' }, { status: 400 });
  if (text.length > MAX_ZNAKU) return NextResponse.json({ error: 'Soubor je moc velký. Rozděl ho na víc částí.' }, { status: 400 });
  const { radky, prazdne, zkraceno } = radkyProSkupinu(text);
  if (!radky.length) return NextResponse.json({ error: 'V souboru jsem nenašel žádný e-mail, telefon ani jméno.' }, { status: 400 });
  const clenove = await sql`
    SELECT m.customer_id AS id, us.name, us.email, us.phone FROM client_memberships m JOIN users us ON us.id = m.customer_id
    WHERE m.team_id = ${ctx.teamId}` as any[];
  const spar = sparujSClenyPodniku(radky, clenove.map(c => ({ id: Number(c.id), name: String(c.name), email: c.email, phone: c.phone })));
  let pridano = 0;
  if (b.potvrdit === true && spar.nalezeno.length) {
    const ids = spar.nalezeno.map(n => n.id);
    const r = await sql`
      INSERT INTO client_group_members (group_id, customer_id, team_id)
      SELECT ${gid}, x, ${ctx.teamId} FROM unnest(${ids}::int[]) AS x
      ON CONFLICT (group_id, customer_id) DO NOTHING RETURNING customer_id` as any[];
    pridano = r.length;
    audit(ctx.teamId, ctx.meId, 'client.skupina.import', 'client', gid, `${g.name}: +${pridano} z CSV, ${spar.nenalezeno.length} nenalezeno`);
  }
  return NextResponse.json({
    ok: true, potvrzeno: b.potvrdit === true,
    nalezeno: spar.nalezeno.length, pridano, uBylo: b.potvrdit === true ? spar.nalezeno.length - pridano : null,
    nenalezeno: spar.nenalezeno.slice(0, 200), nenalezenoCelkem: spar.nenalezeno.length,
    prazdnych: prazdne.length, zkraceno,
    ukazka: spar.nalezeno.slice(0, 8).map(n => ({ name: n.name, podle: n.podle })),
  });
}
