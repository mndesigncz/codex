// Hledání účtu podle e-mailu pro jednorázové odkazy (heslo, smazání z webu).
// Smazané (anonymizované) účty se nenajdou: nemají e-mail ani heslo, ale pro jistotu.

import { neon } from '@neondatabase/serverless';
import { createHash } from 'node:crypto';

export interface NalezenyUcet { id: number; name: string; email: string; role: string }

export async function najdiUcet(emailMale: string): Promise<NalezenyUcet | null> {
  const sql = neon(process.env.DATABASE_URL!);
  let rows: any[];
  try {
    rows = await sql`SELECT id, name, email, role FROM users WHERE lower(email) = ${emailMale} AND deleted_at IS NULL ORDER BY id LIMIT 1` as any[];
  } catch {
    // Před migrací sloupec `deleted_at` neexistuje.
    rows = await sql`SELECT id, name, email, role FROM users WHERE lower(email) = ${emailMale} ORDER BY id LIMIT 1` as any[];
  }
  const u = rows[0];
  return u ? { id: Number(u.id), name: String(u.name), email: String(u.email), role: String(u.role) } : null;
}

/**
 * Klíč počítadla pokusů z e-mailu: zahashovaný, ať se v tabulce auth_attempts
 * neukládají cizí adresy pro žádosti, které žádný účet nemají.
 */
export function klicPoctadla(predpona: string, emailMale: string): string {
  return `${predpona}:${createHash('sha256').update(emailMale).digest('hex').slice(0, 24)}`;
}
