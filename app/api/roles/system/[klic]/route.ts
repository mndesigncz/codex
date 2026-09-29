// Úprava přednastavené role podnikem (PUT) a návrat k výchozí sadě z kódu
// (DELETE). Pravidla jsou v lib/roleUpravy.ts (smiUpravitSystemovou):
// stejná ochrana proti eskalaci jako u vlastních rolí, Vedení a Tablet
// upravit nejde, výchozí role (a Barista vždy) nesmí zcitlivět.
//
// Úprava platí pro každého, kdo roli v podniku drží — i pro lidi, kterým
// se role odvozuje z typu účtu (employee → Barista). Proto se po uložení
// zahazuje cache oprávnění celého podniku, ne jen držitelů podle klíče.

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { systemovaRole, sZavislostmi, vycisti, navic } from '@/lib/opravneni';
import { smiUpravitSystemovou } from '@/lib/roleUpravy';
import { pozaduj, jeOdpoved, systemoveRolePodniku, vlastniRole, zneplatniOpravneniPodniku, type Kontext } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
const sql = neon(process.env.DATABASE_URL!);

const PRED_MIGRACI = 'Přednastavené role se teď nedají upravovat — aktualizace databáze ještě neproběhla. Zkus to za chvíli.';
const NEVIM = 'Roli se teď nepodařilo načíst. Zkus to za chvíli znovu.';
const jePredMigraci = (e: unknown) => { const k = (e as { code?: unknown } | null)?.code; return k === '42P01' || k === '42703'; };

/** Je role výchozí pro nové členy? Bez nastavené výchozí je to Barista. */
async function jeVychozi(teamId: number, klic: string): Promise<boolean> {
  try {
    const [t] = await sql`SELECT vychozi_role_id, vychozi_role_klic FROM teams WHERE id = ${teamId}`;
    if (t?.vychozi_role_id != null) return false;
    return (t?.vychozi_role_klic ? String(t.vychozi_role_klic) : 'barista') === klic;
  } catch { return klic === 'barista'; /* před migrací kola 67 platí Barista */ }
}

/** Společný začátek PUT i DELETE: brána, role podle klíče a její dnešní podoba v podniku. */
async function priprav(params: Promise<{ klic: string }>) {
  const c = await pozaduj('tym.role_spravovat');
  if (jeOdpoved(c)) return { odpoved: c };
  const klic = String((await params).klic ?? '');
  const kod = systemovaRole(klic);
  if (!kod) return { odpoved: NextResponse.json({ error: 'Role nenalezena.' }, { status: 404 }) };
  let vsechny;
  try { vsechny = await systemoveRolePodniku(c.teamId); }
  catch { return { odpoved: NextResponse.json({ error: NEVIM }, { status: 503 }) }; }
  const soucasna = vsechny.find(r => r.klic === klic)!;
  return { c, klic, kod, soucasna, vsechny };
}

const volajici = (c: Kontext) => ({ jeVlastnik: c.role.jeVlastnik, opravneni: c.role.opravneni });
// Roli, kterou volající sám drží, si upravit nesmí (samoeskalace). Vlastník
// má klíč „vedeni" a tu upravit nejde, takže se ho to netýká.
const jeJeho = (c: Kontext, klic: string) => !c.role.jeVlastnik && c.role.roleId == null && c.role.klic === klic;

const shrnuti = (nazev: string, pred: string[], po: string[]) => {
  const pridano = navic(po, pred), odebrano = navic(pred, po);
  return `${nazev}: +${pridano.length} −${odebrano.length}${pridano.length ? ` (+${pridano.slice(0, 8).join(', ')})` : ''}${odebrano.length ? ` (−${odebrano.slice(0, 8).join(', ')})` : ''}`;
};

export async function PUT(request: Request, { params }: { params: Promise<{ klic: string }> }) {
  const p = await priprav(params);
  if ('odpoved' in p) return p.odpoved;
  const { c, klic, kod, soucasna, vsechny } = p;
  const b = await request.json().catch(() => ({}));
  if (!Array.isArray(b?.opravneni)) return NextResponse.json({ error: 'Chybí seznam oprávnění.' }, { status: 400 });
  const opravneni = sZavislostmi(vycisti(b.opravneni));
  // Prázdný název / popis = výchozí z kódu (úprava ho nepřepisuje).
  const nazevRaw = b?.nazev !== undefined ? String(b.nazev ?? '').trim().slice(0, 60) : (soucasna.upraveno && soucasna.nazev !== kod.nazev ? soucasna.nazev : '');
  const popisRaw = b?.popis !== undefined ? String(b.popis ?? '').trim().slice(0, 240) : (soucasna.upraveno && soucasna.popis !== kod.popis ? soucasna.popis : '');
  const nazev = nazevRaw && nazevRaw !== kod.nazev ? nazevRaw : null;
  const popis = popisRaw && popisRaw !== kod.popis ? popisRaw : null;

  const v = smiUpravitSystemovou(volajici(c), klic, soucasna.opravneni, opravneni,
    { jeJehoRole: jeJeho(c, klic), jeVychozi: await jeVychozi(c.teamId, klic) });
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });

  if (nazev && nazev.toLocaleLowerCase('cs') !== soucasna.nazev.toLocaleLowerCase('cs')) {
    const jine = [
      ...vsechny.filter(r => r.klic !== klic).flatMap(r => [r.nazev, r.vychoziNazev]),
      ...(await vlastniRole(c.teamId)).map(r => r.nazev),
    ];
    if (jine.some(n => n.toLocaleLowerCase('cs') === nazev.toLocaleLowerCase('cs'))) {
      return NextResponse.json({ error: 'Role s tímhle názvem už existuje.' }, { status: 409 });
    }
  }

  // Úprava shodná s kódem není úprava — řádek se smaže, ať role ukazuje
  // „výchozí" a pozdější změna katalogu se do ní propíše.
  const jakoKod = !nazev && !popis && opravneni.length === kod.opravneni.length && navic(kod.opravneni, opravneni).length === 0;
  // Verze proti přepsání souběžné úpravy: editor posílá verzi, se kterou
  // roli otevřel (0 = bez úpravy). Starší klient bez verze přepisuje.
  const verze = Number.isInteger(b?.verze) ? Number(b.verze) : null;
  const soubeh = () => NextResponse.json({ error: 'Roli mezitím upravil někdo jiný. Načti ji znovu.' }, { status: 409 });
  if (verze != null && verze !== soucasna.verze) return soubeh();
  try {
    if (jakoKod) {
      const r = verze == null
        ? await sql`DELETE FROM role_upravy WHERE team_id = ${c.teamId} AND klic = ${klic} RETURNING klic` as any[]
        : await sql`DELETE FROM role_upravy WHERE team_id = ${c.teamId} AND klic = ${klic} AND verze = ${verze} RETURNING klic` as any[];
      if (!r.length && soucasna.upraveno) return soubeh();
    } else {
      const json = JSON.stringify(opravneni);
      const r = verze == null
        ? await sql`
            INSERT INTO role_upravy (team_id, klic, opravneni, nazev, popis, verze, upraveno_at, upravil)
            VALUES (${c.teamId}, ${klic}, ${json}::jsonb, ${nazev}, ${popis}, 1, NOW(), ${c.meId})
            ON CONFLICT (team_id, klic) DO UPDATE SET opravneni = EXCLUDED.opravneni, nazev = EXCLUDED.nazev, popis = EXCLUDED.popis,
              verze = role_upravy.verze + 1, upraveno_at = NOW(), upravil = EXCLUDED.upravil
            RETURNING verze` as any[]
        : await sql`
            INSERT INTO role_upravy (team_id, klic, opravneni, nazev, popis, verze, upraveno_at, upravil)
            VALUES (${c.teamId}, ${klic}, ${json}::jsonb, ${nazev}, ${popis}, 1, NOW(), ${c.meId})
            ON CONFLICT (team_id, klic) DO UPDATE SET opravneni = EXCLUDED.opravneni, nazev = EXCLUDED.nazev, popis = EXCLUDED.popis,
              verze = role_upravy.verze + 1, upraveno_at = NOW(), upravil = EXCLUDED.upravil
            WHERE role_upravy.verze = ${verze}
            RETURNING verze` as any[];
      // Prázdný RETURNING = podmínka na verzi neprošla, řádek mezi čtením
      // a zápisem změnil někdo jiný.
      if (!r.length) return soubeh();
    }
  } catch (e) {
    return NextResponse.json({ error: jePredMigraci(e) ? PRED_MIGRACI : 'Roli se nepodařilo uložit. Zkus to prosím znovu.' }, { status: 503 });
  }
  zneplatniOpravneniPodniku(c.teamId);
  audit(c.teamId, c.meId, jakoKod ? 'role.system_reset' : 'role.system_update', 'role', null,
    `[${klic}] ` + shrnuti(nazev ?? kod.nazev, soucasna.opravneni, opravneni));
  return NextResponse.json({ ok: true, upraveno: !jakoKod });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ klic: string }> }) {
  const p = await priprav(params);
  if ('odpoved' in p) return p.odpoved;
  const { c, klic, kod, soucasna } = p;
  if (!soucasna.upraveno) return NextResponse.json({ ok: true, upraveno: false });
  // Návrat k výchozí sadě může práva i přidat — stejná pravidla jako úprava.
  const v = smiUpravitSystemovou(volajici(c), klic, soucasna.opravneni, kod.opravneni,
    { jeJehoRole: jeJeho(c, klic), jeVychozi: await jeVychozi(c.teamId, klic) });
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 403 });
  try {
    await sql`DELETE FROM role_upravy WHERE team_id = ${c.teamId} AND klic = ${klic}`;
  } catch (e) {
    return NextResponse.json({ error: jePredMigraci(e) ? PRED_MIGRACI : 'Roli se nepodařilo obnovit. Zkus to prosím znovu.' }, { status: 503 });
  }
  zneplatniOpravneniPodniku(c.teamId);
  audit(c.teamId, c.meId, 'role.system_reset', 'role', null, `[${klic}] ` + shrnuti(kod.nazev, soucasna.opravneni, kod.opravneni));
  return NextResponse.json({ ok: true, upraveno: false });
}
