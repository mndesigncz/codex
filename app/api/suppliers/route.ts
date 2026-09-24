// Suppliers as entities: a name you order from, with a real e-mail address —
// so an order can leave the app instead of living in a copy-pasted note.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { audit } from '@/lib/audit';
import { ciselnikPodniku } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Kolo 67: brána oprávněním v aktivním podniku (z databáze). Tvar `{ id,
 * team_id }` drží dotazy níž beze změny.
 */
async function me(klic: string | string[]) {
  const c = await pozaduj(klic);
  if (jeOdpoved(c)) return c;
  return { id: c.meId, team_id: c.teamId, kontakty: c.role.opravneni.has('dodavatele.zobrazit') };
}

// GET — dodavatelé podniku; se sdílenými číselníky (kolo 60) i dodavatelé
// zdrojového podniku organizace, vlastní první. Vazba položka→dodavatel je
// jen text (jméno), takže sjednocený seznam jmen stačí našeptávači i
// nákupnímu seznamu beze změny. E-mail a telefon ze zdroje vidí každý člen —
// stejný majitel, stejná organizace; hint v nastavení to říká.
//
// Kolo 67: kontakty (e-mail, telefon, poznámka — u OSVČ osobní údaje) jen
// s `dodavatele.zobrazit`. Kdo má jen `sklad.zobrazit`, dostane jména pro
// našeptávač; dřív dostal každý z podniku všechno, i když UI zaměstnance
// ani tabletu dodavatele nečte.
export async function GET() {
  const u = await me(['dodavatele.zobrazit', 'sklad.zobrazit']);
  if (jeOdpoved(u)) return u;
  const teamId = Number(u.team_id);
  try {
    // Zdroj vidí jen své řádky, ale má vědět, že úprava se propíše do celé
    // organizace — proto chip „sdíleno". Název zdroje pro „Spravuje: …" vidí
    // každý člen organizace i v seznamu podniků, takže tím nic neprozrazujeme.
    const { tymy, jsemZdroj, spravuje } = await ciselnikPodniku(teamId, 'dodavatele');
    const rows = await sql`
      SELECT id, team_id, name, email, phone, note FROM suppliers
      WHERE team_id = ANY(${tymy}) ORDER BY (team_id = ${teamId}) DESC, name ASC`;
    return NextResponse.json({
      suppliers: (rows as any[]).map(r => {
        const zOrganizace = Number(r.team_id) !== teamId;
        return {
          id: r.id, name: r.name,
          email: u.kontakty ? r.email : null, phone: u.kontakty ? r.phone : null, note: u.kontakty ? r.note : null,
          zOrganizace, sdileno: !zOrganizace && jsemZdroj, spravuje: zOrganizace ? spravuje : null,
        };
      }),
    });
  } catch { return NextResponse.json({ suppliers: [] }); }
}

// POST, PATCH, DELETE: `dodavatele.upravit` (dřív vedení).
export async function POST(req: NextRequest) {
  const u = await me('dodavatele.upravit');
  if (jeOdpoved(u)) return u;
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim().slice(0, 120);
  if (!name) return NextResponse.json({ error: 'Název je povinný' }, { status: 400 });
  const email = b.email ? String(b.email).trim().slice(0, 200) || null : null;
  const phone = b.phone ? String(b.phone).trim().slice(0, 40) || null : null;
  const note = b.note ? String(b.note).trim().slice(0, 300) || null : null;
  try {
    const [row] = await sql`
      INSERT INTO suppliers (team_id, name, email, phone, note)
      VALUES (${u.team_id}, ${name}, ${email}, ${phone}, ${note}) RETURNING *`;
    audit(u.team_id, u.id, 'supplier.create', 'supplier', row.id, name);
    return NextResponse.json({ supplier: row });
  } catch { return NextResponse.json({ error: 'Dodavatelé nejsou dostupní — spusť /api/init.' }, { status: 400 }); }
}

export async function PATCH(req: NextRequest) {
  const u = await me('dodavatele.upravit');
  if (jeOdpoved(u)) return u;
  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  try {
    if (b.name !== undefined) await sql`UPDATE suppliers SET name = ${String(b.name).trim().slice(0, 120)} WHERE id = ${id} AND team_id = ${u.team_id}`;
    if (b.email !== undefined) await sql`UPDATE suppliers SET email = ${b.email ? String(b.email).trim().slice(0, 200) : null} WHERE id = ${id} AND team_id = ${u.team_id}`;
    if (b.phone !== undefined) await sql`UPDATE suppliers SET phone = ${b.phone ? String(b.phone).trim().slice(0, 40) : null} WHERE id = ${id} AND team_id = ${u.team_id}`;
    if (b.note !== undefined) await sql`UPDATE suppliers SET note = ${b.note ? String(b.note).trim().slice(0, 300) : null} WHERE id = ${id} AND team_id = ${u.team_id}`;
    const [row] = await sql`SELECT * FROM suppliers WHERE id = ${id} AND team_id = ${u.team_id}`;
    if (!row) return NextResponse.json({ error: 'Dodavatel nenalezen' }, { status: 404 });
    return NextResponse.json({ supplier: row });
  } catch { return NextResponse.json({ error: 'Uložení se nepodařilo' }, { status: 500 }); }
}

export async function DELETE(req: NextRequest) {
  const u = await me('dodavatele.upravit');
  if (jeOdpoved(u)) return u;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Chybí id' }, { status: 400 });
  try {
    await sql`DELETE FROM suppliers WHERE id = ${id} AND team_id = ${u.team_id}`;
    try { await sql`UPDATE inventory_items SET supplier_id = NULL WHERE supplier_id = ${id} AND team_id = ${u.team_id}`; } catch {}
    audit(u.team_id, u.id, 'supplier.delete', 'supplier', id);
    return NextResponse.json({ ok: true });
  } catch { return NextResponse.json({ error: 'Smazání se nepodařilo' }, { status: 500 }); }
}
