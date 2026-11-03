// Hledání účtu podle e-mailu pro jednorázové odkazy (heslo, smazání z webu).
// Smazané (anonymizované) účty se nenajdou: nemají e-mail ani heslo, ale pro jistotu.

import { seradPodleStrany, uctyEmailu } from './dveStrany';
import { createHash } from 'node:crypto';

export interface NalezenyUcet { id: number; name: string; email: string; role: string }

/**
 * Účet s adresou; má-li ji podnik i host (lib/dveStrany), přednost má strana,
 * ze které žádost přišla (formulář posílá `strana`), jinak starší účet.
 */
export async function najdiUcet(emailMale: string, strana?: unknown): Promise<NalezenyUcet | null> {
  // Kiosk až nakonec: odkaz na heslo patří člověku, ne tabletu směny.
  const ucty = seradPodleStrany(await uctyEmailu(emailMale), strana);
  const u = [...ucty.filter((x) => x.role !== 'kiosk'), ...ucty.filter((x) => x.role === 'kiosk')][0];
  return u ? { id: u.id, name: u.name, email: u.email, role: u.role } : null;
}

/**
 * Klíč počítadla pokusů z e-mailu: zahashovaný, ať se v tabulce auth_attempts
 * neukládají cizí adresy pro žádosti, které žádný účet nemají.
 */
export function klicPoctadla(predpona: string, emailMale: string): string {
  return `${predpona}:${createHash('sha256').update(emailMale).digest('hex').slice(0, 24)}`;
}
