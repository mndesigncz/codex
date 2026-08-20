import { NextResponse } from 'next/server';
import { audit } from '@/lib/audit';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { notifyUser } from '@/lib/push';
import { normalizeCategoryPackaging, stockStatus, consumeContent } from '@/lib/packaging';
import { resolveActingUser } from '@/lib/kioskActing';
import { packagingSourceOf } from '@/lib/categoryTree';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function currentUser() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const meId = parseInt((session.user as any).id);
  const role = (session.user as any).role as string;
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  const teamId = u?.team_id ?? null;
  return { meId, role, teamId };
}

function statusOf(quantity: number, min: number, critical: number): 'ok' | 'low' | 'critical' {
  if (quantity <= critical) return 'critical';
  if (quantity <= min) return 'low';
  return 'ok';
}

/** The category's packaging settings, inherited from a parent when nested. */
async function packagingFor(teamId: number | null, categoryName: string, categoryId?: number | null) {
  let cats: any[] = [];
  try {
    cats = await sql`
      SELECT id, name, parent_id, tracks_open, content_unit, default_package_size, threshold_unit, scale
      FROM inventory_categories WHERE team_id = ${teamId}`;
  } catch {
    return null;
  }
  const nodes = cats.map((c: any) => ({
    id: Number(c.id), name: String(c.name), position: 0,
    parentId: c.parent_id != null ? Number(c.parent_id) : null,
    tracksOpen: c.tracks_open === true,
  }));
  // Resolve by id when the item has one — names may repeat across branches.
  const own = categoryId != null
    ? nodes.find(n => n.id === categoryId)
    : nodes.find(n => n.name === categoryName);
  if (!own) return null;
  const src = packagingSourceOf(nodes, own);
  return src ? normalizeCategoryPackaging(cats.find((c: any) => Number(c.id) === src.id)) : null;
}

// Return the item in the same shape the list endpoint uses (camelCase fields).
async function mappedItem(id: number, teamId: number | null) {
  try {
    const [row] = await sql`
      SELECT
        i.id, i.name, i.category, i.quantity,
        i.min_quantity      AS "minQuantity",
        i.critical_quantity AS "criticalQuantity",
        i.max_quantity      AS "maxQuantity",
        i.unit, i.supplier,
        i.supplier_url      AS "supplierUrl",
        i.unit_cost         AS "unitCost",
        i.package_size      AS "packageSize",
        i.open_amount       AS "openAmount",
        i.content_unit      AS "contentUnit",
        i.brand, i.description, i.archived,
        i.category_id       AS "categoryId",
        i.updated_at        AS "updatedAt",
        i.updated_by        AS "updatedBy",
        u.name              AS "updatedByName"
      FROM inventory_items i LEFT JOIN users u ON u.id = i.updated_by
      WHERE i.id = ${id}`;
    if (!row) return row;
    const item: any = {
      ...row,
      packageSize: row.packageSize != null ? Number(row.packageSize) : null,
      openAmount: row.openAmount != null ? Number(row.openAmount) : null,
    };
    // Ship the status with the item so no screen has to re-derive it.
    const packaging = await packagingFor(teamId, item.category, item.categoryId ?? null);
    const sized = packaging
      ? { ...item, packageSize: item.packageSize ?? packaging.defaultPackageSize }
      : item;
    return { ...item, status: stockStatus(sized as any, packaging) };
  } catch {
    const [row] = await sql`
      SELECT
        i.id, i.name, i.category, i.quantity,
        i.min_quantity      AS "minQuantity",
        i.critical_quantity AS "criticalQuantity",
        i.max_quantity      AS "maxQuantity",
        i.unit, i.supplier,
        i.supplier_url      AS "supplierUrl",
        i.updated_at        AS "updatedAt",
        i.updated_by        AS "updatedBy",
        u.name              AS "updatedByName"
      FROM inventory_items i LEFT JOIN users u ON u.id = i.updated_by
      WHERE i.id = ${id}`;
    return row;
  }
}

// PATCH: employees may only change quantity; employers may edit all fields.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });

  const id = parseInt(params.id);
  const [item] = await sql`SELECT * FROM inventory_items WHERE id = ${id}`;
  if (!item) return NextResponse.json({ error: 'Položka nenalezena' }, { status: 404 });

  const body = await request.json();
  const note = body.note ?? null;

  // Direct consumption: "odešlo 150 ml" — the server cracks packages the same
  // way the POS sync does, so a partial pour never costs a whole bottle.
  // Available to every role; whoever poured the wine is the one who writes it off.
  if (body.consume !== undefined) {
    const amount = Number(body.consume);
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'Neplatné množství' }, { status: 400 });
    }
    const authorId = me.role === 'employer'
      ? me.meId
      : await resolveActingUser(me.meId, me.role, me.teamId, body.actingAs, request);
    const oldQty = Number(item.quantity);
    const oldOpen = item.open_amount != null ? Number(item.open_amount) : null;
    const next = consumeContent({
      quantity: oldQty,
      packageSize: item.package_size != null ? Number(item.package_size) : null,
      openAmount: oldOpen,
    }, amount);
    try {
      await sql`
        UPDATE inventory_items
        SET quantity = ${next.quantity}, open_amount = ${next.openAmount}, updated_by = ${authorId}, updated_at = NOW()
        WHERE id = ${id}`;
    } catch {
      await sql`
        UPDATE inventory_items
        SET quantity = ${next.quantity}, updated_by = ${authorId}, updated_at = NOW()
        WHERE id = ${id}`;
    }
    try {
      await sql`
        INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, old_open, new_open, note, created_at)
        VALUES (${id}, ${authorId}, ${oldQty}, ${next.quantity}, ${oldOpen}, ${next.openAmount}, ${note ?? `Odpis −${amount}`}, NOW())`;
    } catch {
      await sql`
        INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
        VALUES (${id}, ${authorId}, ${oldQty}, ${next.quantity}, ${note ?? `Odpis −${amount}`}, NOW())`;
    }

    // Same low-stock alert as a manual count change — the drop matters,
    // not which door it left through.
    const size = item.package_size != null ? Number(item.package_size) : 0;
    let byContent = false;
    try {
      const [c] = await sql`
        SELECT threshold_unit, tracks_open FROM inventory_categories
        WHERE team_id = ${me.teamId} AND name = ${item.category}`;
      byContent = c?.tracks_open === true && c?.threshold_unit === 'content';
    } catch { /* pre-migration DB: stay on packages */ }
    const effective = byContent
      ? next.quantity * size + (next.openAmount ?? 0)
      : (size > 0 ? next.quantity + (next.openAmount ?? 0) / size : next.quantity);
    const status = statusOf(effective, Number(item.min_quantity), Number(item.critical_quantity));
    if (status !== 'ok') {
      const employers = await sql`
        SELECT id FROM users WHERE team_id = ${me.teamId} AND role = 'employer'`;
      await Promise.all(
        employers.map((e: any) =>
          notifyUser(e.id, {
            title: 'Nízké zásoby',
            body: `${item.name} dochází — zbývá ${next.quantity} ${item.unit}${(next.openAmount ?? 0) > 0 ? ` + načaté balení` : ''}`,
            type: 'inventory',
            category: 'stock',
            link: '/',
          }),
        ),
      );
    }
    return NextResponse.json(await mappedItem(id, me.teamId));
  }

  if (me.role !== 'employer') {
    // Employees and the shared kiosk may change the stock count, how much is
    // left in the open package, and whether we currently carry the item at all —
    // the person at the counter is the one who knows it ran out.
    if ((body.quantity === undefined || body.quantity === null)
        && body.openAmount === undefined && body.archived === undefined) {
      return NextResponse.json({ error: 'Zaměstnanec může upravit pouze množství' }, { status: 403 });
    }
    // On the shared tablet the write belongs to whoever is clocked in, not to
    // the tablet account — same attribution as tasks and procedure runs.
    const authorId = await resolveActingUser(me.meId, me.role, me.teamId, body.actingAs, request);
    const oldQty = Number(item.quantity);
    const newQty = body.quantity !== undefined && body.quantity !== null ? Number(body.quantity) : oldQty;
    const oldOpen = item.open_amount != null ? Number(item.open_amount) : null;
    const newOpen = body.openAmount !== undefined
      ? (body.openAmount === null ? null : Math.max(0, Number(body.openAmount) || 0))
      : oldOpen;

    if (body.openAmount !== undefined) {
      try {
        await sql`
          UPDATE inventory_items
          SET quantity = ${newQty}, open_amount = ${newOpen}, updated_by = ${authorId}, updated_at = NOW()
          WHERE id = ${id}`;
      } catch {
        return NextResponse.json({ error: 'Sledování balení není dostupné — spusť /api/init.' }, { status: 400 });
      }
    } else {
      await sql`
        UPDATE inventory_items
        SET quantity = ${newQty}, updated_by = ${authorId}, updated_at = NOW()
        WHERE id = ${id}`;
    }

    // Parking an item is its own change and must land even when no number moved.
    if (body.archived !== undefined) {
      try {
        await sql`
          UPDATE inventory_items SET archived = ${body.archived === true}, updated_by = ${authorId}, updated_at = NOW()
          WHERE id = ${id}`;
      } catch {
        return NextResponse.json({ error: 'Označení „nevedeme" není dostupné — spusť /api/init.' }, { status: 400 });
      }
    }

    if (newQty !== oldQty || newOpen !== oldOpen) {
      try {
        await sql`
          INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, old_open, new_open, note, created_at)
          VALUES (${id}, ${authorId}, ${oldQty}, ${newQty}, ${oldOpen}, ${newOpen}, ${note}, NOW())`;
      } catch {
        await sql`
          INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
          VALUES (${id}, ${authorId}, ${oldQty}, ${newQty}, ${note}, NOW())`;
      }

      // Alert employer(s) when the item drops to low/critical. The category
      // decides whether the thresholds are counted in packages or in content,
      // so the alert fires on the same number the employer sees on screen.
      const size = item.package_size != null ? Number(item.package_size) : 0;
      let byContent = false;
      try {
        const [c] = await sql`
          SELECT threshold_unit, tracks_open FROM inventory_categories
          WHERE team_id = ${me.teamId} AND name = ${item.category}`;
        byContent = c?.tracks_open === true && c?.threshold_unit === 'content';
      } catch { /* pre-migration DB: stay on packages */ }
      const effective = byContent
        ? newQty * size + (newOpen ?? 0)
        : (size > 0 ? newQty + (newOpen ?? 0) / size : newQty);
      const status = statusOf(effective, Number(item.min_quantity), Number(item.critical_quantity));
      if (status !== 'ok') {
        const employers = await sql`
          SELECT id FROM users WHERE team_id = ${me.teamId} AND role = 'employer'`;
        await Promise.all(
          employers.map((e: any) =>
            notifyUser(e.id, {
              title: 'Nízké zásoby',
              body: `${item.name} je na ${newQty} ${item.unit}`,
              type: 'inventory',
              category: 'stock',
              link: '/',
            }),
          ),
        );
      }
    }

    return NextResponse.json(await mappedItem(id, me.teamId));
  }

  // Employer: full edit.
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const name = body.name !== undefined ? body.name : item.name;
  const category = body.category !== undefined ? body.category : item.category;
  const quantity = body.quantity !== undefined ? Number(body.quantity) : Number(item.quantity);
  const minQuantity = body.minQuantity !== undefined ? Number(body.minQuantity) : Number(item.min_quantity);
  const criticalQuantity = body.criticalQuantity !== undefined ? Number(body.criticalQuantity) : Number(item.critical_quantity);
  const maxQuantity = body.maxQuantity !== undefined ? Number(body.maxQuantity) : Number(item.max_quantity);
  const unit = body.unit !== undefined ? body.unit : item.unit;
  const supplier = body.supplier !== undefined ? body.supplier : item.supplier;
  const supplierUrl = body.supplierUrl !== undefined
    ? (body.supplierUrl ? String(body.supplierUrl).trim() || null : null)
    : item.supplier_url;

  await sql`
    UPDATE inventory_items SET
      name = ${name},
      category = ${category},
      quantity = ${quantity},
      min_quantity = ${minQuantity},
      critical_quantity = ${criticalQuantity},
      max_quantity = ${maxQuantity},
      unit = ${unit},
      supplier = ${supplier},
      supplier_url = ${supplierUrl},
      updated_by = ${me.meId},
      updated_at = NOW()
    WHERE id = ${id}`;

  // unit_cost updated separately so a not-yet-migrated column can't fail the edit.
  if (body.unitCost !== undefined) {
    const uc = body.unitCost === '' || body.unitCost === null ? null : Math.max(0, Math.round(Number(body.unitCost)));
    try { await sql`UPDATE inventory_items SET unit_cost = ${uc} WHERE id = ${id}`; } catch { /* column not migrated yet */ }
  }

  // The category pointer travels with the label so a re-filed item follows the
  // right branch even when two branches use the same name.
  if (body.categoryId !== undefined) {
    const wanted = body.categoryId == null || body.categoryId === '' ? null : Number(body.categoryId);
    try {
      if (wanted == null) {
        await sql`UPDATE inventory_items SET category_id = NULL WHERE id = ${id}`;
      } else if (Number.isFinite(wanted)) {
        await sql`
          UPDATE inventory_items SET category_id = ${wanted}
          WHERE id = ${id} AND EXISTS (
            SELECT 1 FROM inventory_categories c WHERE c.id = ${wanted} AND c.team_id = ${me.teamId})`;
      }
    } catch { /* column not migrated yet */ }
  }

  // Brand, description and the parked flag — separate so an un-migrated DB
  // still saves the rest of the edit.
  // Approving an employee's proposed item.
  if (body.approve === true) {
    try {
      const [row] = await sql`
        UPDATE inventory_items SET approved = TRUE
        WHERE id = ${id} AND team_id = ${me.teamId}
        RETURNING id, name, submitted_by`;
      if (row?.submitted_by) {
        try {
          await notifyUser(row.submitted_by, {
            title: 'Položka schválena ✓',
            body: `„${row.name}" je teď ve skladu.`,
            type: 'info',
            category: 'stock',
            link: '/employee/shifts?view=inventory',
          });
        } catch { /* best-effort */ }
      }
      return NextResponse.json({ ok: true });
    } catch {
      return NextResponse.json({ error: 'Schválení není dostupné — spusť /api/init.' }, { status: 400 });
    }
  }

  // Customer-facing badge on the share page.
  if (body.highlight !== undefined) {
    const h = body.highlight === 'new' || body.highlight === 'tip' ? body.highlight : null;
    try {
      await sql`UPDATE inventory_items SET highlight = ${h} WHERE id = ${id} AND (team_id = ${me.teamId} OR team_id IS NULL)`;
    } catch { /* not migrated yet */ }
  }

  // Visibility on the "Vše" overview is employer configuration.
  if (body.hideFromOverview !== undefined) {
    try {
      await sql`
        UPDATE inventory_items SET hide_from_overview = ${body.hideFromOverview === true}, updated_by = ${me.meId}, updated_at = NOW()
        WHERE id = ${id} AND (team_id = ${me.teamId} OR team_id IS NULL)`;
    } catch { /* not migrated yet */ }
  }

  if (body.brand !== undefined || body.description !== undefined || body.archived !== undefined) {
    const brand = body.brand !== undefined
      ? (body.brand ? String(body.brand).trim().slice(0, 120) || null : null)
      : (item.brand ?? null);
    const description = body.description !== undefined
      ? (body.description ? String(body.description).trim().slice(0, 500) || null : null)
      : (item.description ?? null);
    const archived = body.archived !== undefined ? body.archived === true : item.archived === true;
    try {
      await sql`
        UPDATE inventory_items SET brand = ${brand}, description = ${description}, archived = ${archived}
        WHERE id = ${id}`;
    } catch { /* columns not migrated yet */ }
  }

  // Packaging, same treatment — an un-migrated DB must not block a plain edit.
  if (body.packageSize !== undefined || body.openAmount !== undefined) {
    const rawSize = body.packageSize === '' || body.packageSize === null ? null : Number(body.packageSize);
    const size = body.packageSize !== undefined
      ? (Number.isFinite(rawSize as number) && (rawSize as number) > 0 ? rawSize : null)
      : (item.package_size != null ? Number(item.package_size) : null);
    const open = body.openAmount !== undefined
      ? (body.openAmount === '' || body.openAmount === null ? null : Math.max(0, Number(body.openAmount) || 0))
      : (item.open_amount != null ? Number(item.open_amount) : null);
    try {
      await sql`UPDATE inventory_items SET package_size = ${size}, open_amount = ${open} WHERE id = ${id}`;
    } catch { /* columns not migrated yet */ }
  }
  if (body.contentUnit !== undefined) {
    const cu = body.contentUnit ? String(body.contentUnit).trim().slice(0, 10) || null : null;
    try { await sql`UPDATE inventory_items SET content_unit = ${cu} WHERE id = ${id}`; } catch { /* not migrated yet */ }
  }

  // Log any employer-driven quantity change too.
  if (body.quantity !== undefined && Number(item.quantity) !== quantity) {
    await sql`
      INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note, created_at)
      VALUES (${id}, ${me.meId}, ${Number(item.quantity)}, ${quantity}, ${note}, NOW())`;
  }

  return NextResponse.json(await mappedItem(id, me.teamId));
}

// DELETE (employer): remove item.
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const me = await currentUser();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (me.role !== 'employer') return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });

  const id = parseInt(params.id);
  await sql`DELETE FROM inventory_log WHERE item_id = ${id}`;
  await sql`DELETE FROM inventory_items WHERE id = ${id}`;
  audit(me.teamId, me.meId, 'inventory.delete', 'item', id);

  return NextResponse.json({ ok: true });
}
