// Role nového člena (kolo 67) — společné pro připojení kódem, přijetí
// pozvánky a přímé založení účtu. Není to routa (podtržítko), jen sdílený
// kus kódu tří vstupů do podniku, aby každý z nich dával roli stejně.
//
// Nový člen dostane VÝCHOZÍ roli podniku (teams.vychozi_role_id /
// vychozi_role_klic, nastavuje ji /api/roles/vychozi). Dřív to byl vždy
// „zaměstnanec" — výchozí je proto Barista, takže podnik, který výchozí roli
// nikdy nenastavil, se chová přesně jako dosud.

import { neon } from '@neondatabase/serverless';
import { systemovaRole, smiBytVychozi, smiPriraditRoli, typNaUcet, type TypRole } from '@/lib/opravneni';
import { roleClena, vlastniRole, zneplatniOpravneni } from '@/lib/opravneniDb';

const sql = neon(process.env.DATABASE_URL!);

export interface RoleNoveho {
  /** Klíč systémové role, nebo null u vlastní. */
  klic: string | null;
  /** Id vlastní role, nebo null u systémové. */
  roleId: number | null;
  typ: TypRole;
  nazev: string;
  opravneni: string[];
}

function zeSystemove(klic: string): RoleNoveho | null {
  const r = systemovaRole(klic);
  return r ? { klic: r.klic, roleId: null, typ: r.typ, nazev: r.nazev, opravneni: [...r.opravneni] } : null;
}

const barista = (): RoleNoveho => zeSystemove('barista')!;

/**
 * Výchozí role podniku. Pravidla výchozí role (žádný tablet, nic citlivého,
 * žádná správa týmu — smiBytVychozi) se tu ověřují ZNOVU: vlastní roli jde
 * upravit i potom, co se stala výchozí, a kód pro připojení zná kdokoli,
 * komu ho kdo přepošle. Co pravidlům nevyhoví, nahradí Barista — nový člen
 * radši dostane méně, než by dostal víc, než podnik zamýšlel.
 */
export async function vychoziRolePodniku(teamId: number): Promise<RoleNoveho> {
  let t: any = null;
  try {
    [t] = await sql`SELECT vychozi_role_id, vychozi_role_klic FROM teams WHERE id = ${teamId}`;
  } catch { return barista(); /* před migrací kola 67 */ }
  if (t?.vychozi_role_id != null) {
    const r = (await vlastniRole(teamId)).find(x => x.id === Number(t.vychozi_role_id));
    if (r && r.typ !== 'kiosk' && smiBytVychozi(r.opravneni).ok) {
      return { klic: null, roleId: r.id, typ: r.typ, nazev: r.nazev, opravneni: r.opravneni };
    }
    return barista();
  }
  const s = t?.vychozi_role_klic ? zeSystemove(String(t.vychozi_role_klic)) : null;
  if (s && s.typ !== 'kiosk' && smiBytVychozi(s.opravneni).ok) return s;
  return barista();
}

/** Systémová role Vedení — pozvánka „jako vedení" z doby před rolemi. */
export const roleVedeni = (): RoleNoveho => zeSystemove('vedeni')!;

/**
 * Smí `userId` v podniku dát novému člověku roli `role`? Stejná pravidla jako
 * změna role u člena (lib/opravneni.ts → smiPriraditRoli): nikdo nepřidělí
 * víc, než sám má, a Vedení dává jen vlastník. `klice` jsou oprávnění, která
 * k tomu volající potřebuje navíc (pozvat, přiřazovat role…).
 * Role se čte čerstvě — pozvánka mohla ležet týdny a zvoucí mezitím o práva
 * přijít, nebo z podniku odejít.
 */
export async function smiDatRoli(userId: number, teamId: number, role: RoleNoveho, klice: string[]): Promise<boolean> {
  if (!Number.isFinite(userId)) return false;
  const v = await roleClena(userId, teamId, { cerstve: true });
  if (!v) return false;
  if (!klice.every(k => v.opravneni.has(k))) return false;
  return smiPriraditRoli(
    { jeVlastnik: v.jeVlastnik, opravneni: v.opravneni },
    { jeVlastnik: false, jeTo: false, soucasna: [], soucasnaKlic: null },
    { opravneni: role.opravneni, klic: role.klic },
  ).ok;
}

/** Typ účtu (team_members.role / users.role) pro roli — určuje rozhraní. */
export const typUctu = (role: RoleNoveho) => typNaUcet(role.typ) as 'employer' | 'employee';

/**
 * Zapíše roli do členství, které už existuje (pridejClenstvi zná jen typ
 * účtu). Před migrací kola 67 sloupce role_id / role_klic nejsou — pak platí
 * role odvozená z typu účtu, což je pro Baristu i Vedení totéž.
 */
export async function zapisRoliClenstvi(userId: number, teamId: number, role: RoleNoveho): Promise<void> {
  try {
    await sql`UPDATE team_members SET role = ${typUctu(role)}, role_id = ${role.roleId}, role_klic = ${role.klic}
              WHERE user_id = ${userId} AND team_id = ${teamId}`;
  } catch { /* před migrací */ }
  zneplatniOpravneni(userId, teamId);
}
