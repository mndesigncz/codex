// Role a oprávnění (kolo 67): katalog, role podniku, vytvoření vlastní role.
//
// GET vidí každý člen s tym.zobrazit nebo tym.role_* (editor i výběr role
// u člena); vytvářet smí jen tym.role_spravovat. Kdo roli skládá, nesmí do
// ní dát nic, co sám nemá (lib/opravneni.ts → smiUpravitRoli).

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { KATALOG, OBLASTI, SYSTEMOVE_ROLE, KIOSK_BILA_LISTINA, sZavislostmi, vycisti, smiUpravitRoli, type TypRole } from '@/lib/opravneni';
import { pozaduj, jeOdpoved, vlastniRole, pocetyRoli } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

const TYPY: TypRole[] = ['vedeni', 'zamestnanec', 'kiosk'];
const jeTyp = (v: unknown): v is TypRole => TYPY.includes(v as TypRole);
const MAX_ROLI = 40;

export async function GET() {
  const c = await pozaduj(['tym.zobrazit', 'tym.role_prirazovat', 'tym.role_spravovat']);
  if (jeOdpoved(c)) return c;
  const [vlastni, pocty] = await Promise.all([vlastniRole(c.teamId), pocetyRoli(c.teamId)]);
  let vychozi: { id: number | null; klic: string | null } = { id: null, klic: 'barista' };
  try {
    const [t] = await sql`SELECT vychozi_role_id, vychozi_role_klic FROM teams WHERE id = ${c.teamId}`;
    if (t?.vychozi_role_id != null) vychozi = { id: Number(t.vychozi_role_id), klic: null };
    else if (t?.vychozi_role_klic) vychozi = { id: null, klic: String(t.vychozi_role_klic) };
  } catch { /* před migrací */ }
  return NextResponse.json({
    katalog: KATALOG, oblasti: OBLASTI, kioskPovoleno: [...KIOSK_BILA_LISTINA],
    system: SYSTEMOVE_ROLE.map(r => ({ ...r, pocet: pocty.system[r.klic] ?? 0 })),
    vlastni: vlastni.map(r => ({ ...r, pocet: pocty.vlastni[r.id] ?? 0 })),
    vychozi,
    ja: { jeVlastnik: c.role.jeVlastnik, klic: c.role.klic, roleId: c.role.roleId, nazev: c.role.nazev, opravneni: [...c.role.opravneni].sort() },
  });
}

export async function POST(request: Request) {
  const c = await pozaduj('tym.role_spravovat');
  if (jeOdpoved(c)) return c;
  const b = await request.json().catch(() => ({}));
  const nazev = String(b?.nazev ?? '').trim().slice(0, 60);
  if (!nazev) return NextResponse.json({ error: 'Zadej název role.' }, { status: 400 });
  const typ: TypRole = jeTyp(b?.typ) ? b.typ : 'zamestnanec';
  const popis = String(b?.popis ?? '').trim().slice(0, 240) || null;
  const zdroj = typeof b?.zdroj === 'string' ? b.zdroj.slice(0, 40) : null;
  const opravneni = sZavislostmi(vycisti(Array.isArray(b?.opravneni) ? b.opravneni : []));

  const v = smiUpravitRoli({ jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni }, [], opravneni, { typ });
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });

  const existujici = await vlastniRole(c.teamId);
  if (existujici.length >= MAX_ROLI) return NextResponse.json({ error: `Podnik může mít nejvýš ${MAX_ROLI} vlastních rolí.` }, { status: 400 });
  const kolize = [...existujici.map(r => r.nazev), ...SYSTEMOVE_ROLE.map(r => r.nazev)]
    .some(n => n.toLocaleLowerCase('cs') === nazev.toLocaleLowerCase('cs'));
  if (kolize) return NextResponse.json({ error: 'Role s tímhle názvem už existuje.' }, { status: 409 });

  let nova: any;
  try {
    [nova] = await sql`
      INSERT INTO roles (team_id, nazev, popis, typ, opravneni, zdroj, created_by)
      VALUES (${c.teamId}, ${nazev}, ${popis}, ${typ}, ${JSON.stringify(opravneni)}::jsonb, ${zdroj}, ${c.meId})
      RETURNING id`;
  } catch {
    return NextResponse.json({ error: 'Role se teď nedají ukládat — aktualizace databáze ještě neproběhla. Zkus to za chvíli.' }, { status: 503 });
  }
  audit(c.teamId, c.meId, 'role.create', 'role', Number(nova.id), `${nazev} (${typ}): ${opravneni.length} oprávnění`);
  return NextResponse.json({ ok: true, id: Number(nova.id) });
}
