// Výchozí role pro nové členy (kód pro připojení, pozvánka bez role).
// Dostane ji každý, kdo zná kód — proto nesmí nést citlivá oprávnění ani
// správu týmu (smiBytVychozi), a volající ji musí sám „pokrýt".

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { systemovaRole, smiBytVychozi, navic } from '@/lib/opravneni';
import { pozaduj, jeOdpoved, vlastniRole } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

export async function PUT(request: Request) {
  const c = await pozaduj('tym.role_spravovat');
  if (jeOdpoved(c)) return c;
  const b = await request.json().catch(() => ({}));
  let sada: string[]; let roleId: number | null = null; let klic: string | null = null; let nazev: string;
  if (b?.roleId != null) {
    const r = (await vlastniRole(c.teamId)).find(x => x.id === Number(b.roleId));
    if (!r) return NextResponse.json({ error: 'Role nenalezena.' }, { status: 404 });
    if (r.typ === 'kiosk') return NextResponse.json({ error: 'Roli tabletu nejde dát jako výchozí.' }, { status: 400 });
    sada = r.opravneni; roleId = r.id; nazev = r.nazev;
  } else {
    const r = systemovaRole(b?.klic);
    if (!r || r.typ === 'kiosk') return NextResponse.json({ error: 'Neznámá role.' }, { status: 400 });
    sada = r.opravneni; klic = r.klic; nazev = r.nazev;
  }
  const vy = smiBytVychozi(sada);
  if (!vy.ok) return NextResponse.json({ error: `Výchozí roli dostane každý, kdo zná kód pro připojení — a ${vy.proc}.` }, { status: 400 });
  if (!c.role.jeVlastnik && navic(sada, c.role.opravneni).length) {
    return NextResponse.json({ error: 'Výchozí role nesmí mít oprávnění, která sám nemáš.' }, { status: 403 });
  }
  try {
    await sql`UPDATE teams SET vychozi_role_id = ${roleId}, vychozi_role_klic = ${klic} WHERE id = ${c.teamId}`;
  } catch {
    return NextResponse.json({ error: 'Aktualizace databáze ještě neproběhla. Zkus to za chvíli.' }, { status: 503 });
  }
  audit(c.teamId, c.meId, 'role.default', 'role', roleId, nazev);
  return NextResponse.json({ ok: true });
}
