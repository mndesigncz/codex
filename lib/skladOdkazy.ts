// Co po smazání skladové položky zbývá v jiných tabulkách.
//
// Smazání dřív odstranilo jen řádek položky a její historii. Nejvíc škodí
// `pos_product_map`: odpis prodejů smazanou surovinu nenajde a přeskočí ji,
// ale protože mapování pořád existuje, produkt se nikdy neobjeví ani ve frontě
// „Prodává se, ale neodepisuje" — sklad přestal klesat a nikdo neví proč.
// Po smazání řádku se produkt při dalším prodeji zařadí do té fronty sám.
//
// Každý krok je samostatný, ať tabulka, která ještě není zmigrovaná, neshodí
// ostatní. Volat až PO smazání položky; `ids` musí být jen položky téhož
// podniku (volající je ověřil).

import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);

export async function uklidOdkazyNaPolozky(teamId: number, ids: number[]): Promise<void> {
  if (ids.length === 0) return;
  await Promise.allSettled([
    sql`DELETE FROM pos_product_map WHERE item_id = ANY(${ids}) AND team_id = ${teamId}`,
    sql`DELETE FROM item_recipes WHERE (item_id = ANY(${ids}) OR ingredient_id = ANY(${ids})) AND team_id = ${teamId}`,
    sql`DELETE FROM purchase_flags WHERE (item_id = ANY(${ids}) OR for_item_id = ANY(${ids})) AND team_id = ${teamId}`,
    sql`UPDATE guides SET item_id = NULL WHERE item_id = ANY(${ids}) AND team_id = ${teamId}`,
    sql`UPDATE tasks SET status = 'done', completed_at = NOW(), review_note = 'Položka byla smazána ze skladu.'
        WHERE team_id = ${teamId} AND source = 'production' AND source_ref = ANY(${ids}) AND status <> 'done'`,
  ]);
}
