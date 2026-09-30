// Umí sloupec desetiny (NUMERIC)? — zjišťuje se z databáze, ne z domněnky.
//
// Nákupní cena položky skladu (`inventory_items.unit_cost`), cena příjmu
// objednávky (`orders.total_cost`) a cena položky menu (`menu_items.price`)
// jsou v DDL (app/api/init) INTEGER. Aby eurový podnik mohl zadat 4,99 €, musí
// být sloupec NUMERIC. Migraci schématu nespouští aplikace sama od sebe — dělá
// ji člověk jednou v konzoli Neonu; INTEGER → NUMERIC nic neztrácí (každé celé
// číslo se převede beze změny) a je idempotentní:
//
//   ALTER TABLE inventory_items ALTER COLUMN unit_cost TYPE NUMERIC(12,2);
//   ALTER TABLE orders          ALTER COLUMN total_cost TYPE NUMERIC(12,2);
//   ALTER TABLE menu_items      ALTER COLUMN price      TYPE NUMERIC(10,2);
//   ALTER TABLE client_orders   ALTER COLUMN total      TYPE NUMERIC(12,2);
//
// (poslední je součet objednávky hosta z cen menu — s haléřovými cenami by
// INTEGER sloupec odmítl uložit 13,50 a host by objednat nemohl.)
//
// (opakované spuštění na už převedeném sloupci je bez efektu). Do té doby se
// ceny ukládají zaokrouhlené na celé, přesně jako dřív; jakmile je sloupec
// převedený, začnou se ukládat s haléři bez dalšího nasazení. Kód tak funguje
// před migrací i po ní, a čtení (`cenaZDb`) bere INTEGER i NUMERIC.

import { neon } from '@neondatabase/serverless';
import { cenaProSloupec } from './cena';

const sql = neon(process.env.DATABASE_URL!);

type Sloupec =
  | 'inventory_items.unit_cost' | 'orders.total_cost' | 'menu_items.price' | 'client_orders.total'
  // Množství skladu: v DDL INTEGER; inventura podle něj pozná, jestli smí přijmout 2,35 kg.
  | 'inventory_items.quantity';

// „Ano" se pamatuje napořád (zpět na INTEGER nikdo sloupec nevrací); „ne" jen
// minutu, aby migrace provedená za provozu zabrala bez restartu procesu.
const pamet = new Map<Sloupec, { desetinny: boolean; kdy: number }>();
const PLATNOST_NE_MS = 60_000;

export async function sloupecJeDesetinny(sloupec: Sloupec): Promise<boolean> {
  const z = pamet.get(sloupec);
  if (z && (z.desetinny || Date.now() - z.kdy < PLATNOST_NE_MS)) return z.desetinny;
  const [tabulka, nazev] = sloupec.split('.');
  let desetinny = false;
  try {
    const rows = await sql`
      SELECT data_type FROM information_schema.columns
      WHERE table_schema = current_schema() AND table_name = ${tabulka} AND column_name = ${nazev}`;
    desetinny = rows.length > 0 && String((rows[0] as any).data_type) === 'numeric';
  } catch { /* nejde zjistit → chováme se jako dřív (celé jednotky) */ }
  pamet.set(sloupec, { desetinny, kdy: Date.now() });
  return desetinny;
}

/** Hodnota připravená k zápisu do sloupce (viz `cenaProSloupec`). */
export async function cenaKZapisu(sloupec: Sloupec, hodnota: number | null): Promise<number | null> {
  return cenaProSloupec(hodnota, await sloupecJeDesetinny(sloupec));
}
