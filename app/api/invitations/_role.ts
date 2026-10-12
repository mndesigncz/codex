// Role pozvánky (kolo 6, B3) — společné pro vytvoření pozvánky, její výpis a přijetí.
// Není to routa (podtržítko). Rozhodování je čisté v lib/pozvanky.ts; tady se jen
// načte role, kterou pozvánka slibuje, tak jak v podniku dnes platí.

import { vlastniRole, systemovaRolePodniku } from '@/lib/opravneniDb';
import type { CilPozvanky, RolePozvanky } from '@/lib/pozvanky';

/**
 * Slíbená role, jak v podniku dnes platí (přednastavená i s úpravou podniku).
 * Null, když už neexistuje (smazaná vlastní role), je to tablet, nebo slibuje výchozí roli
 * (tu rozhoduje vychoziRolePodniku). Chyba databáze projde dál — „nevím" není „nic".
 */
export async function nactiRoliPozvanky(teamId: number, cil: CilPozvanky): Promise<RolePozvanky | null> {
  if (cil.druh === 'vlastni') {
    const r = (await vlastniRole(teamId)).find(x => x.id === cil.id);
    return r && r.typ !== 'kiosk' ? { klic: null, roleId: r.id, typ: r.typ, nazev: r.nazev, opravneni: [...r.opravneni] } : null;
  }
  if (cil.druh === 'system') {
    const r = await systemovaRolePodniku(teamId, cil.klic);
    return r && r.typ !== 'kiosk' ? { klic: r.klic, roleId: null, typ: r.typ, nazev: r.nazev, opravneni: [...r.opravneni] } : null;
  }
  return null;
}
