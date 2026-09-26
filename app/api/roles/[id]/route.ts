// Úprava a smazání vlastní role (kolo 67). Systémové role jsou v kódu a
// upravit ani smazat nejdou — jde je jen zkopírovat do vlastní.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { SYSTEMOVE_ROLE, sZavislostmi, vycisti, smiUpravitRoli, smiBytVychozi, navic, type TypRole } from '@/lib/opravneni';
import { pozaduj, jeOdpoved, vlastniRole, zneplatniOpravneni } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { czCount, czVerb } from '@/lib/czech';

// „člověk“ má v množném čísle jiný kmen (lidé/lidí), proto vlastní tvar.
const CLOVEK = { one: 'člověk', few: 'lidé', many: 'lidí' };

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);
const jeTyp = (v: unknown): v is TypRole => v === 'vedeni' || v === 'zamestnanec' || v === 'kiosk';

async function najdi(teamId: number, idRaw: string) {
  const id = Number(idRaw);
  if (!Number.isInteger(id) || id <= 0) return null;
  return (await vlastniRole(teamId)).find(r => r.id === id) ?? null;
}

async function drzitele(teamId: number, roleId: number): Promise<number[]> {
  try { return (await sql`SELECT user_id FROM team_members WHERE team_id = ${teamId} AND role_id = ${roleId}` as any[]).map(r => Number(r.user_id)); }
  catch { return []; }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await pozaduj('tym.role_spravovat');
  if (jeOdpoved(c)) return c;
  const role = await najdi(c.teamId, (await params).id);
  if (!role) return NextResponse.json({ error: 'Role nenalezena.' }, { status: 404 });
  const b = await request.json().catch(() => ({}));

  const nazev = b?.nazev !== undefined ? String(b.nazev).trim().slice(0, 60) : role.nazev;
  if (!nazev) return NextResponse.json({ error: 'Zadej název role.' }, { status: 400 });
  const popis = b?.popis !== undefined ? (String(b.popis).trim().slice(0, 240) || null) : role.popis;
  const typ: TypRole = jeTyp(b?.typ) ? b.typ : role.typ;
  const opravneni = Array.isArray(b?.opravneni) ? sZavislostmi(vycisti(b.opravneni)) : role.opravneni;

  const jeJehoRole = c.role.roleId === role.id;
  const v = smiUpravitRoli({ jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni }, role.opravneni, opravneni, { jeJehoRole, typ });
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });

  if (nazev.toLocaleLowerCase('cs') !== role.nazev.toLocaleLowerCase('cs')) {
    const jine = (await vlastniRole(c.teamId)).filter(r => r.id !== role.id).map(r => r.nazev);
    if ([...jine, ...SYSTEMOVE_ROLE.map(r => r.nazev)].some(n => n.toLocaleLowerCase('cs') === nazev.toLocaleLowerCase('cs'))) {
      return NextResponse.json({ error: 'Role s tímhle názvem už existuje.' }, { status: 409 });
    }
  }
  // Výchozí role (dostane ji každý, kdo zná kód pro připojení) nesmí zcitlivět.
  try {
    const [t] = await sql`SELECT vychozi_role_id FROM teams WHERE id = ${c.teamId}`;
    if (Number(t?.vychozi_role_id) === role.id) {
      // Výchozí role smí být jen typu zaměstnanec (viz roles/vychozi) —
      // změnou typu by se to obešlo.
      if (typ !== 'zamestnanec') return NextResponse.json({ error: 'Tohle je výchozí role pro nové členy a ta musí zůstat typu zaměstnanec. Nejdřív nastav jinou výchozí roli.' }, { status: 400 });
      const vy = smiBytVychozi(opravneni);
      if (!vy.ok) return NextResponse.json({ error: `Tohle je výchozí role pro nové členy a ${vy.proc}. Nejdřív nastav jinou výchozí roli.` }, { status: 400 });
    }
  } catch { /* před migrací */ }

  // Tablet je jiný druh účtu, ne sada práv: přepnout na něj roli, kterou
  // drží lidé, by z jejich osobních účtů udělalo tablety (a naopak).
  if (typ !== role.typ && (typ === 'kiosk' || role.typ === 'kiosk') && (await drzitele(c.teamId, role.id)).length) {
    return NextResponse.json({ error: 'Roli, kterou už někdo má, nejde přepnout na tablet ani z tabletu. Vytvoř novou roli.' }, { status: 409 });
  }
  await sql`
    UPDATE roles SET nazev = ${nazev}, popis = ${popis}, typ = ${typ}, opravneni = ${JSON.stringify(opravneni)}::jsonb,
                     verze = verze + 1, updated_at = NOW()
    WHERE id = ${role.id} AND team_id = ${c.teamId}`;
  // Typ role je typ účtu jejích držitelů — rozhraní, které se jim otevře.
  if (typ !== role.typ) {
    const ucet = typ === 'vedeni' ? 'employer' : typ === 'kiosk' ? 'kiosk' : 'employee';
    try {
      await sql`UPDATE team_members SET role = ${ucet} WHERE team_id = ${c.teamId} AND role_id = ${role.id}`;
      await sql`UPDATE users SET role = ${ucet} WHERE team_id = ${c.teamId} AND id IN (SELECT user_id FROM team_members WHERE team_id = ${c.teamId} AND role_id = ${role.id})`;
    } catch { /* před migrací */ }
  }
  for (const u of await drzitele(c.teamId, role.id)) zneplatniOpravneni(u, c.teamId);
  const pridano = navic(opravneni, role.opravneni), odebrano = navic(role.opravneni, opravneni);
  audit(c.teamId, c.meId, 'role.update', 'role', role.id,
    `${nazev}: +${pridano.length} −${odebrano.length}${pridano.length ? ` (+${pridano.slice(0, 8).join(', ')})` : ''}${odebrano.length ? ` (−${odebrano.slice(0, 8).join(', ')})` : ''}`);
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const c = await pozaduj('tym.role_spravovat');
  if (jeOdpoved(c)) return c;
  const role = await najdi(c.teamId, (await params).id);
  if (!role) return NextResponse.json({ error: 'Role nenalezena.' }, { status: 404 });
  const v = smiUpravitRoli({ jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni }, role.opravneni, [], { jeJehoRole: c.role.roleId === role.id });
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });
  const lide = await drzitele(c.teamId, role.id);
  if (lide.length) return NextResponse.json({ error: `Roli ${czVerb(lide.length, 'má', 'mají')} ${czCount(lide.length, CLOVEK)} — nejdřív jim dej jinou.` }, { status: 409 });
  try {
    const [t] = await sql`SELECT vychozi_role_id FROM teams WHERE id = ${c.teamId}`;
    if (Number(t?.vychozi_role_id) === role.id) return NextResponse.json({ error: 'Tohle je výchozí role pro nové členy — nejdřív nastav jinou.' }, { status: 409 });
  } catch { /* před migrací */ }
  // Nepřijaté pozvánky s touhle rolí dostanou výchozí roli při přijetí.
  // Smaže jen roli, kterou mezitím nikdo nedostal: kontrola držitelů výš a
  // DELETE nejsou v transakci a souběžné přiřazení by jinak nechalo
  // role_id mířit do prázdna.
  const smazano = await sql`
    DELETE FROM roles WHERE id = ${role.id} AND team_id = ${c.teamId}
      AND NOT EXISTS (SELECT 1 FROM team_members WHERE team_id = ${c.teamId} AND role_id = ${role.id})
    RETURNING id` as any[];
  if (!smazano.length) return NextResponse.json({ error: 'Roli mezitím někdo dostal — nejdřív mu dej jinou.' }, { status: 409 });
  // Výchozí rozložení stránek pro tuhle roli (rozsah role:#id, kolo 68) by
  // teď nepatřilo nikomu. Úklid je best-effort: když se nepovede, řádek jen
  // leží v databázi — id role se znovu nepřidělí, takže nikoho nezasáhne.
  const rozsahRole = `role:#${role.id}`;
  try { await sql`DELETE FROM rozlozeni_stranek WHERE team_id = ${c.teamId} AND rozsah = ${rozsahRole}`; } catch { /* před migrací kola 68 */ }
  audit(c.teamId, c.meId, 'role.delete', 'role', role.id, role.nazev);
  return NextResponse.json({ ok: true });
}
