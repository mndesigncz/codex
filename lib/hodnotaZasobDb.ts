// Hodnota zásob podniku z databáze — jedno číslo pro Finance, Sklad i rady.
//
// Rada „Ve skladu leží zboží za …" počítala quantity × unit_cost sama, bez
// načatých balení a včetně archivovaných položek, zatímco Finance
// (summary.stockValue) a widget Hodnota zásob ve Skladu počítaly
// `hodnotaZasob` z lib/skladPrehled. Majitel tak za totéž viděl dvě čísla.
// Teď si všichni berou řádky tady a počítá se jednou, stejnou funkcí.

import { neon } from '@neondatabase/serverless';
import { hodnotaZasob, type HodnotaZasob } from './skladPrehled';
import { nactiBaleniKategorii, baleniRadku } from './baleniKategorii';
import { cenaZDb } from './cena';

const sql = neon(process.env.DATABASE_URL!);

/**
 * Hodnota zásob podniku: bez archivovaných, s podílem načatého balení,
 * s velikostí balení zděděnou z kategorie. `null`, když se sklad nedá přečíst
 * (před migrací) — volající pak radu nebo číslo prostě nevypíše.
 */
export async function hodnotaZasobTymu(teamId: number): Promise<HodnotaZasob | null> {
  let rows: any[];
  try {
    rows = await sql`
      SELECT name, quantity, unit_cost, package_size, open_amount, content_unit,
             category, category_id, archived, approved
      FROM inventory_items WHERE team_id = ${teamId}`;
  } catch { return null; }
  const baleniKat = await nactiBaleniKategorii(teamId);
  return hodnotaZasob(rows.map((i: any) => ({
    id: 0,
    name: String(i.name),
    quantity: Number(i.quantity) || 0,
    unitCost: cenaZDb(i.unit_cost),
    packageSize: baleniRadku(i, baleniKat).packageSize,
    openAmount: i.open_amount != null ? Number(i.open_amount) : null,
    archived: i.archived === true,
    approved: i.approved,
  })));
}
