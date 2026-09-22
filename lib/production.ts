// Výroba vlastních produktů — limonáda, ice tea, extrakty, sirupy, pečivo…
//
// Položka skladu označená „vyrábíme sami" nepatří do nákupního seznamu. Když
// jí dochází, vznikne směně úkol „Vyrobit X" s výrobní recepturou (suroviny
// × množství na dávku) a kontrolou, jestli je na to ve skladu dost surovin.
// Co chybí, dostane vlajku do nákupního seznamu — nakupují se jen suroviny,
// nikdy hotový produkt. Odškrtnutí úkolu dávku naskladní a suroviny odepíše.
//
// Jedno místo pro celý koloběh: prodej v pokladně → odpis produktu → dochází
// → úkol → nákup surovin → výroba → naskladněno. Volá se po každém pohybu
// skladu (pokladna, ruční odpis, příjem objednávky, inventura) a při načtení
// úkolů, takže úkol nikdy nechybí a nikdy není dvakrát.

import { neon } from '@neondatabase/serverless';
import { consumeContent, normalizeCategoryPackaging, stockStatus } from './packaging';
import {
  MAX_BATCHES, MAX_INGREDIENTS, availableOf, checklistFor, describe, fmtQty, planFor, recipeUnit, sizeOf, taskTitleFor,
  type StockRow,
} from './productionPlan';
export { availableOf, batchesNeeded, fmtQty, planFor, recipeUnit, taskTitleFor } from './productionPlan';
export type { ProductionPlan, RecipeLine, StockRow } from './productionPlan';
import { packagingSourceOf } from './categoryTree';
import { navodyProPolozky, navodProPolozku } from './navodyDb';
import { krokyNavodu } from './navody';
import { pragueToday } from './pragueTime';
import { notifyUsers } from './push';
import { audit } from './audit';

const sql = neon(process.env.DATABASE_URL!);

/** Celý sklad týmu se stavem, tak jak ho počítá obrazovka Sklad. */
export async function teamStock(teamId: number): Promise<Map<number, StockRow>> {
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT id, name, category, category_id, quantity, min_quantity, critical_quantity, max_quantity,
             unit, package_size, open_amount, content_unit,
             made_in_house, batch_yield, batch_steps, production_label
      FROM inventory_items
      WHERE team_id = ${teamId} AND archived IS NOT TRUE AND (approved IS DISTINCT FROM FALSE)`;
  } catch {
    return new Map(); // před migrací: výroba prostě neexistuje
  }
  let cats: any[] = [];
  try {
    cats = await sql`
      SELECT id, name, parent_id, tracks_open, content_unit, default_package_size, threshold_unit, scale
      FROM inventory_categories WHERE team_id = ${teamId}`;
  } catch { /* bez kategorií */ }
  const nodes = cats.map((c: any) => ({
    id: Number(c.id), name: String(c.name), position: 0,
    parentId: c.parent_id != null ? Number(c.parent_id) : null,
    tracksOpen: c.tracks_open === true,
  }));
  const out = new Map<number, StockRow>();
  for (const i of rows) {
    const own = i.category_id != null
      ? nodes.find(n => n.id === Number(i.category_id))
      : nodes.find(n => n.name === i.category);
    const src = own ? packagingSourceOf(nodes, own) : null;
    const packaging = src ? normalizeCategoryPackaging(cats.find((c: any) => Number(c.id) === src.id)) : null;
    const row: StockRow = {
      id: Number(i.id), name: String(i.name), category: String(i.category ?? ''),
      categoryId: i.category_id != null ? Number(i.category_id) : null,
      quantity: Number(i.quantity) || 0,
      minQuantity: Number(i.min_quantity) || 0,
      criticalQuantity: Number(i.critical_quantity) || 0,
      maxQuantity: Number(i.max_quantity) || 0,
      unit: String(i.unit ?? 'ks'),
      packageSize: i.package_size != null ? Number(i.package_size) : null,
      openAmount: i.open_amount != null ? Number(i.open_amount) : null,
      contentUnit: i.content_unit ?? null,
      madeInHouse: i.made_in_house === true,
      batchYield: i.batch_yield != null ? Number(i.batch_yield) : null,
      batchSteps: i.batch_steps ?? null,
      productionLabel: i.production_label ?? null,
      packaging,
      status: 'ok',
    };
    row.status = stockStatus({ ...row, packageSize: row.packageSize ?? packaging?.defaultPackageSize ?? null } as any, packaging);
    out.set(row.id, row);
  }
  return out;
}

async function recipesFor(teamId: number, itemIds: number[]): Promise<Map<number, { ingredientId: number; amount: number }[]>> {
  const map = new Map<number, { ingredientId: number; amount: number }[]>();
  if (itemIds.length === 0) return map;
  try {
    const rows = await sql`
      SELECT item_id, ingredient_id, amount FROM item_recipes
      WHERE team_id = ${teamId} AND item_id = ANY(${itemIds})
      ORDER BY id`;
    for (const r of rows) {
      const list = map.get(Number(r.item_id)) ?? [];
      list.push({ ingredientId: Number(r.ingredient_id), amount: Number(r.amount) || 0 });
      map.set(Number(r.item_id), list);
    }
  } catch { /* před migrací */ }
  return map;
}

async function oldestEmployer(teamId: number): Promise<number | null> {
  try {
    const [u] = await sql`SELECT id FROM users WHERE team_id = ${teamId} AND role = 'employer' ORDER BY id LIMIT 1`;
    return u ? Number(u.id) : null;
  } catch { return null; }
}

/**
 * Srovná úkoly a nákupní vlajky se stavem skladu. Idempotentní: pro každý
 * docházející vlastní produkt existuje právě jeden otevřený úkol; když se
 * zásoba doplní jinak, úkol se zavře sám. Vrací počet nově založených úkolů.
 */
export async function ensureProductionTasks(teamId: number, actorId?: number | null): Promise<{ created: number; open: number }> {
  const stock = await teamStock(teamId);
  const made = Array.from(stock.values()).filter(i => i.madeInHouse);
  if (made.length === 0) return { created: 0, open: 0 };

  const recipes = await recipesFor(teamId, made.map(i => i.id));
  // Návod připnutý k položce nahradí holý text „Postup“ — viz lib/navody.ts.
  const navody = await navodyProPolozky(teamId, made.map(i => i.id));
  let openTasks: any[] = [];
  try {
    openTasks = await sql`
      SELECT id, source_ref, source_meta, checklist FROM tasks
      WHERE team_id = ${teamId} AND source = 'production' AND status <> 'done'`;
  } catch { return { created: 0, open: 0 }; }
  const openByItem = new Map<number, any>(openTasks.map((t: any) => [Number(t.source_ref), t]));

  const today = pragueToday();
  let created = 0;
  const createdTitles: string[] = [];
  let creator: number | null | undefined = actorId ?? undefined;

  for (const item of made) {
    const open = openByItem.get(item.id);
    if (item.status === 'ok') {
      if (open) {
        await sql`
          UPDATE tasks SET status = 'done', completed_at = NOW(), review_note = 'Zásoba se doplnila jinak — úkol zavřen automaticky.'
          WHERE id = ${open.id}`;
        try { await sql`DELETE FROM purchase_flags WHERE for_item_id = ${item.id}`; } catch { /* před migrací */ }
      }
      continue;
    }
    const plan = planFor(item, recipes.get(item.id) ?? [], stock);
    // Nepotvrzený návrh návodu se do úkolu nepouští — obsluha by pracovala
    // podle postupu, který vedení ještě nevidělo.
    const n = navody.get(item.id);
    const navod = n && n.approved ? { id: n.id, title: n.title, steps: krokyNavodu(n) } : null;
    const meta = {
      itemId: item.id, batches: plan.batches, yieldTotal: plan.yieldTotal,
      ingredients: plan.lines.map(l => ({ id: l.ingredientId, name: l.name, need: l.need, available: l.available, unit: l.unit })),
      missing: plan.missing.map(l => l.ingredientId),
      status: item.status,
      // Odsud si ho vezmou Úkoly, kiosk i výrobní tabule a nabídnou „Otevřít návod“.
      guideId: navod?.id ?? null,
      guideTitle: navod?.title ?? null,
    };
    const priority = item.status === 'critical' ? 'high' : 'medium';
    if (open) {
      // Checklist se přepisuje JEN dokud na něm nikdo nezačal pracovat.
      // `ensureProductionTasks` běží po každém pohybu skladu a při každém
      // načtení úkolů — bezpodmínečný přepis by obsluze uprostřed výroby
      // smazal odškrtané kroky a ona by začínala znovu.
      const nedotcene = !Array.isArray(open.checklist)
        || open.checklist.every((k: any) => k?.done !== true);
      if (nedotcene) {
        await sql`
          UPDATE tasks SET description = ${describe(plan, navod)}, priority = ${priority},
            checklist = ${JSON.stringify(checklistFor(plan, navod))}::jsonb,
            source_meta = ${JSON.stringify({ ...(open.source_meta ?? {}), ...meta })}::jsonb
          WHERE id = ${open.id}`;
      } else {
        await sql`
          UPDATE tasks SET description = ${describe(plan, navod)}, priority = ${priority},
            source_meta = ${JSON.stringify({ ...(open.source_meta ?? {}), ...meta })}::jsonb
          WHERE id = ${open.id}`;
      }
    } else {
      if (creator === undefined) creator = await oldestEmployer(teamId);
      if (creator == null) continue;
      await sql`
        INSERT INTO tasks (title, description, assigned_to, created_by, priority, status, due_date, team_id, checklist, source, source_ref, source_meta)
        VALUES (${taskTitleFor(item)}, ${describe(plan, navod)}, NULL, ${creator}, ${priority}, 'pending', ${today}, ${teamId},
                ${JSON.stringify(checklistFor(plan, navod))}::jsonb, 'production', ${item.id}, ${JSON.stringify(meta)}::jsonb)`;
      created++;
      createdTitles.push(taskTitleFor(item));
    }
    // Chybějící suroviny do nákupního seznamu — a jen ty.
    try {
      await sql`DELETE FROM purchase_flags WHERE for_item_id = ${item.id}`;
      for (const m of plan.missing) {
        await sql`
          INSERT INTO purchase_flags (team_id, item_id, for_item_id, amount)
          VALUES (${teamId}, ${m.ingredientId}, ${item.id}, ${m.missing})
          ON CONFLICT (item_id, for_item_id) DO UPDATE SET amount = EXCLUDED.amount`;
      }
    } catch { /* před migrací */ }
  }

  if (created > 0) {
    try {
      const users = await sql`SELECT id, role FROM users WHERE team_id = ${teamId} AND role IN ('employer', 'employee')`;
      const body = createdTitles.slice(0, 3).join(', ') + (createdTitles.length > 3 ? ` a další ${createdTitles.length - 3}` : '');
      const emp = users.filter((u: any) => u.role === 'employer').map((u: any) => Number(u.id));
      const crew = users.filter((u: any) => u.role === 'employee').map((u: any) => Number(u.id));
      await Promise.all([
        notifyUsers(crew, { title: 'K výrobě na směně', body, type: 'task', category: 'stock', link: '/employee/shifts?view=tasks' }),
        notifyUsers(emp, { title: 'K výrobě na směně', body, type: 'task', category: 'stock', link: '/employer/overview?view=tasks' }),
      ]);
    } catch { /* push je best-effort */ }
  }
  return { created, open: openTasks.length + created };
}

/**
 * Vyrobeno: naskladní dávky produktu a odepíše suroviny podle receptury.
 * Zavře otevřený výrobní úkol položky. Nikdy nejde pod nulu — chybějící
 * surovina je chyba počítání, ne záporný sklad.
 */
export async function produceBatch(teamId: number, itemId: number, batches: number, userId: number | null, opts: { taskId?: number | null } = {}) {
  const stock = await teamStock(teamId);
  const item = stock.get(itemId);
  if (!item) throw new Error('Položka nenalezena');
  if (!item.madeInHouse) throw new Error('Tahle položka není označená jako vlastní výroba');
  const n = Math.min(MAX_BATCHES, Math.max(1, Math.round(Number(batches) || 1)));
  const recipe = (await recipesFor(teamId, [itemId])).get(itemId) ?? [];
  const plan = planFor(item, recipe, stock, n);

  const writes: any[] = [];
  const consumed: { name: string; amount: number; unit: string; short: number }[] = [];
  for (const l of plan.lines) {
    const ing = stock.get(l.ingredientId)!;
    const size = sizeOf(ing);
    const next = consumeContent({ quantity: ing.quantity, packageSize: size || null, openAmount: ing.openAmount }, l.need);
    writes.push(sql`
      UPDATE inventory_items SET quantity = ${next.quantity},
        open_amount = ${size > 0 ? next.openAmount : ing.openAmount}, updated_by = ${userId}, updated_at = NOW()
      WHERE id = ${ing.id} AND team_id = ${teamId}`);
    writes.push(sql`
      INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, old_open, new_open, note, created_at)
      VALUES (${ing.id}, ${userId}, ${ing.quantity}, ${next.quantity}, ${ing.openAmount}, ${size > 0 ? next.openAmount : null},
              ${`Výroba: ${item.name} (−${fmtQty(l.need)} ${l.unit})`}, NOW())`);
    consumed.push({ name: ing.name, amount: l.need, unit: l.unit, short: l.missing });
  }
  const added = Math.max(1, Math.round(plan.yieldTotal));
  const newQty = item.quantity + added;
  writes.push(sql`
    UPDATE inventory_items SET quantity = ${newQty}, updated_by = ${userId}, updated_at = NOW()
    WHERE id = ${item.id} AND team_id = ${teamId}`);
  writes.push(sql`
    INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
    VALUES (${item.id}, ${userId}, ${item.quantity}, ${newQty}, ${`Výroba +${added} ${item.unit} (${n}× dávka)`}, NOW())`);
  await sql.transaction(writes);

  // Splněný úkol nese body (lib/pointsBalance.ts počítá řádky s completed_by).
  // Odškrtnutí JEDNOHO úkolu proto smí připsat jen ten jeden — hromadný
  // zápis přes všechny otevřené výrobní úkoly položky dával jednomu člověku
  // body za víc úkolů, než odškrtl. Zbylé otevřené úkoly téže položky zavře
  // ensureProductionTasks níž, jakmile vidí doplněnou zásobu — bez
  // completed_by, takže bez bodů. Z výrobní tabule (bez taskId) se úkoly
  // dál zavírají hromadně, tam je to jedna akce za celou položku.
  const stamp = JSON.stringify({ produced: true, producedBatches: n });
  try {
    if (opts.taskId) {
      await sql`
        UPDATE tasks SET status = 'done', completed_by = ${userId}, completed_at = NOW(),
          source_meta = COALESCE(source_meta, '{}'::jsonb) || ${stamp}::jsonb
        WHERE id = ${opts.taskId} AND team_id = ${teamId}`;
    } else {
      await sql`
        UPDATE tasks SET status = 'done', completed_by = ${userId}, completed_at = NOW(),
          source_meta = COALESCE(source_meta, '{}'::jsonb) || ${stamp}::jsonb
        WHERE team_id = ${teamId} AND source = 'production' AND source_ref = ${item.id} AND status <> 'done'`;
    }
  } catch { /* před migrací */ }
  try { await sql`DELETE FROM purchase_flags WHERE for_item_id = ${item.id}`; } catch { /* před migrací */ }
  audit(teamId, userId, 'inventory.produce', 'inventory_item', item.id,
    `${item.name} +${added} ${item.unit}; ${consumed.map(c => `${c.name} −${fmtQty(c.amount)} ${c.unit}`).join(', ')}`);

  // Suroviny mohly klesnout pod limit — a jiný vlastní produkt mohl být závislý.
  try { await ensureProductionTasks(teamId, userId); } catch { /* ignore */ }
  return { item: item.name, added, unit: item.unit, batches: n, consumed };
}

/** Otevřené výrobní úkoly týmu i s plánem — pro dashboardy a TO GO. */
export async function openProduction(teamId: number) {
  const stock = await teamStock(teamId);
  const made = Array.from(stock.values()).filter(i => i.madeInHouse);
  if (made.length === 0) return [];
  const recipes = await recipesFor(teamId, made.map(i => i.id));
  let tasks: any[] = [];
  try {
    tasks = await sql`
      SELECT id, title, status, priority, source_ref, source_meta, due_date FROM tasks
      WHERE team_id = ${teamId} AND source = 'production' AND status <> 'done'
      ORDER BY (priority = 'high') DESC, created_at`;
  } catch { return []; }
  return tasks.map((t: any) => {
    const item = stock.get(Number(t.source_ref));
    if (!item) return null;
    const plan = planFor(item, recipes.get(item.id) ?? [], stock, Number(t.source_meta?.batches) || undefined);
    return {
      taskId: Number(t.id), title: String(t.title), priority: String(t.priority), status: String(t.status),
      item: { id: item.id, name: item.name, unit: item.unit, status: item.status, quantity: item.quantity, available: availableOf(item), recipeUnit: recipeUnit(item) },
      batches: plan.batches, yieldTotal: plan.yieldTotal,
      batchYield: item.batchYield, steps: item.batchSteps,
      lines: plan.lines, missing: plan.missing.map(l => l.ingredientId),
      ready: plan.missing.length === 0,
      // Tabule dřív u položky bez postupu napsala „Bez receptury — vedení ji
      // nastaví u položky ve skladu." a tím to skončilo. Odsud si vezme odkaz
      // na návod a nabídne ho místo té slepé uličky.
      guideId: t.source_meta?.guideId != null ? Number(t.source_meta.guideId) : null,
      guideTitle: t.source_meta?.guideTitle ?? null,
    };
  }).filter(Boolean);
}

/** Výrobní receptura jedné položky pro editor (jakákoli role smí číst). */
export async function recipeOf(teamId: number, itemId: number) {
  const stock = await teamStock(teamId);
  const item = stock.get(itemId);
  if (!item) return null;
  const recipe = (await recipesFor(teamId, [itemId])).get(itemId) ?? [];
  const plan = planFor(item, recipe, stock);
  const navod = await navodProPolozku(teamId, itemId);
  return {
    itemId: item.id, name: item.name, unit: item.unit,
    madeInHouse: item.madeInHouse, batchYield: item.batchYield, batchSteps: item.batchSteps ?? '',
    productionLabel: item.productionLabel ?? '', taskTitle: taskTitleFor(item),
    status: item.status, batches: plan.batches,
    ingredients: plan.lines,
    guideId: navod?.id ?? null,
    guideTitle: navod?.title ?? null,
    guideSteps: krokyNavodu(navod).length,
    guideApproved: navod ? navod.approved : null,
  };
}

/** Uloží výrobní recepturu položky (jen vedení). */
export async function saveRecipe(teamId: number, itemId: number, input: {
  madeInHouse?: boolean; batchYield?: number | null; batchSteps?: string | null; productionLabel?: string | null;
  ingredients?: { ingredientId: number; amount: number }[];
}, userId: number | null) {
  const stock = await teamStock(teamId);
  const item = stock.get(itemId);
  if (!item) throw new Error('Položka nenalezena');
  const madeInHouse = input.madeInHouse === undefined ? item.madeInHouse : !!input.madeInHouse;
  const yieldQty = input.batchYield === undefined ? item.batchYield
    : (Number(input.batchYield) > 0 ? Math.min(100000, Number(input.batchYield)) : null);
  const steps = input.batchSteps === undefined ? item.batchSteps : (String(input.batchSteps ?? '').trim().slice(0, 4000) || null);
  const label = input.productionLabel === undefined ? item.productionLabel : (String(input.productionLabel ?? '').trim().slice(0, 120) || null);
  await sql`
    UPDATE inventory_items SET made_in_house = ${madeInHouse}, batch_yield = ${yieldQty}, batch_steps = ${steps},
      production_label = ${label}, updated_by = ${userId}, updated_at = NOW()
    WHERE id = ${itemId} AND team_id = ${teamId}`;
  if (Array.isArray(input.ingredients)) {
    const clean = input.ingredients
      .map(i => ({ ingredientId: Number(i.ingredientId), amount: Number(String(i.amount).replace(',', '.')) }))
      .filter(i => Number.isFinite(i.ingredientId) && i.ingredientId !== itemId && stock.has(i.ingredientId) && i.amount > 0)
      .slice(0, MAX_INGREDIENTS);
    const writes: any[] = [sql`DELETE FROM item_recipes WHERE team_id = ${teamId} AND item_id = ${itemId}`];
    for (const i of clean) {
      writes.push(sql`
        INSERT INTO item_recipes (team_id, item_id, ingredient_id, amount) VALUES (${teamId}, ${itemId}, ${i.ingredientId}, ${i.amount})
        ON CONFLICT (item_id, ingredient_id) DO UPDATE SET amount = EXCLUDED.amount`);
    }
    await sql.transaction(writes);
  }
  audit(teamId, userId, 'inventory.recipe', 'inventory_item', itemId, `${item.name}: ${madeInHouse ? 'vlastní výroba' : 'nakupujeme'}`);
  // Vypnutí výroby zavře úkol a vlajky; zapnutí je může rovnou založit.
  if (!madeInHouse) {
    try {
      await sql`UPDATE tasks SET status = 'done', completed_at = NOW(), review_note = 'Položka už není vlastní výroba.' WHERE team_id = ${teamId} AND source = 'production' AND source_ref = ${itemId} AND status <> 'done'`;
      await sql`DELETE FROM purchase_flags WHERE for_item_id = ${itemId}`;
    } catch { /* před migrací */ }
  }
  try { await ensureProductionTasks(teamId, userId); } catch { /* ignore */ }
  return recipeOf(teamId, itemId);
}
