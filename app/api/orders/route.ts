// Objednávky u dodavatelů.
//
// Kolo 67: dřív „jen vedení, jde o peníze". Teď se rozlišuje, co kdo dělá:
// sestavit objednávku (`nakup.vytvorit`) a odeslat ji dodavateli e-mailem
// (`nakup.odeslat`) jsou dvě věci — odeslání je závazek navenek. Nákupní
// cenu objednávky vidí jen `sklad.ceny` a zapisuje při příjmu jen
// `sklad.ceny_upravit`; zboží přijmout může i ten, kdo ceny nevidí.

import { NextRequest, NextResponse } from 'next/server';
import { sendOrderEmail } from '@/lib/email';
import { neon } from '@neondatabase/serverless';
import { ensureProductionTasks } from '@/lib/production';
import { tymyCiselniku } from '@/lib/tenant';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

interface OrderItem { name: string; qty: number; unit: string; itemId?: number | null }

function cleanItems(raw: any): OrderItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((i: any) => ({
      name: String(i?.name ?? '').trim().slice(0, 120),
      qty: Math.max(1, Math.round(Number(i?.qty)) || 1),
      unit: String(i?.unit ?? 'ks').slice(0, 12),
      itemId: Number.isFinite(parseInt(i?.itemId)) ? parseInt(i.itemId) : null,
    }))
    .filter(i => i.name);
}

const shape = (r: any, sCenou: boolean) => ({
  id: r.id, supplier: r.supplier, items: r.items ?? [], totalCost: sCenou ? r.total_cost : null,
  status: r.status, note: r.note, createdAt: r.created_at, receivedAt: r.received_at,
  createdByName: r.created_by_name ?? null,
});

// GET — objednávky podniku.
export async function GET() {
  const c = await pozaduj('nakup.zobrazit');
  if (jeOdpoved(c)) return c;
  const sCenou = c.role.opravneni.has('sklad.ceny');
  try {
    const rows = await sql`
      SELECT o.*, u.name AS created_by_name
      FROM orders o LEFT JOIN users u ON u.id = o.created_by
      WHERE o.team_id = ${c.teamId}
      ORDER BY (o.status = 'ordered') DESC, o.created_at DESC
      LIMIT 100`;
    return NextResponse.json({ orders: rows.map(r => shape(r, sCenou)) });
  } catch {
    return NextResponse.json({ orders: [] });
  }
}

// POST — create an order: { supplier?, items: [{name, qty, unit, itemId?}], note?, supplierId?, sendEmail? }.
export async function POST(req: NextRequest) {
  const c = await pozaduj('nakup.vytvorit');
  if (jeOdpoved(c)) return c;

  const b = await req.json().catch(() => ({}));
  // Odeslání se ověří dřív, než objednávka vznikne — jinak by vznikla
  // a člověk by si myslel, že odešla.
  if (b.sendEmail === true && !c.role.opravneni.has('nakup.odeslat')) {
    return NextResponse.json({ error: 'Objednávku dodavateli odesílá jen ten, kdo na to má oprávnění. Ulož ji bez odeslání.' }, { status: 403 });
  }
  const items = cleanItems(b.items);
  if (items.length === 0) return NextResponse.json({ error: 'Objednávka nemá žádné položky.' }, { status: 400 });

  const [row] = await sql`
    INSERT INTO orders (team_id, created_by, supplier, items, note)
    VALUES (${c.teamId}, ${c.meId}, ${b.supplier ? String(b.supplier).slice(0, 120) : null},
            ${JSON.stringify(items)}, ${b.note ? String(b.note).slice(0, 500) : null})
    RETURNING *`;

  // Link the supplier entity and — when asked and it has an e-mail — send the
  // order straight out. Both steps are additive; the order exists regardless.
  const supplierId = parseInt(b.supplierId);
  let emailed = false;
  // Proč se neodeslalo — obrazovka to má říct, ne mlčet. Dřív se
  // `email_sent_at` zapsalo i při odmítnutí, protože `send()` nepadá:
  // chybu vrací v odpovědi. Vedoucí pak čekal na zboží, které nikdo
  // neobjednal.
  let emailError: string | null = null;
  if (Number.isFinite(supplierId)) {
    try { await sql`UPDATE orders SET supplier_id = ${supplierId} WHERE id = ${row.id}`; } catch { /* not migrated */ }
    if (b.sendEmail === true) {
      try {
        // Dodavatel smí být i ze zdrojového podniku organizace (kolo 60);
        // objednávka sama zůstává řádek tohoto podniku a e-mail odchází
        // z účtu toho, kdo objednává.
        const tymy = await tymyCiselniku(c.teamId, 'dodavatele');
        const [sup] = await sql`SELECT name, email FROM suppliers WHERE id = ${supplierId} AND team_id = ANY(${tymy})`;
        if (!sup?.email) {
          emailError = 'Dodavatel nemá uložený e-mail.';
        } else {
          const [team] = await sql`SELECT name FROM teams WHERE id = ${c.teamId}`;
          // Odpověď musí dojít živému člověku. Tým vlastní kontaktní
          // adresu nemá, takže se bere e-mail toho, kdo objednává.
          const [me] = await sql`SELECT email FROM users WHERE id = ${c.meId}`;
          const text = items.map((i: any) => `• ${i.name} — ${i.qty} ${i.unit ?? ''}`.trim()).join('\n');
          // Odpověď dodavatele musí dojít do podniku, ne odesílací službě.
          const replyTo = (me?.email as string | undefined) || null;
          const res = await sendOrderEmail(sup.email, team?.name ?? 'Podnik', text, b.note ?? null, replyTo);
          if (res.sent) {
            await sql`UPDATE orders SET email_sent_at = NOW() WHERE id = ${row.id}`;
            emailed = true;
          } else {
            // Text chyby odesílací služby ven nejde (umí prozradit adresu
            // účtu); do logu ano.
            console.error('[orders] e-mail dodavateli neodešel', res.error);
            emailError = 'E-mail dodavateli se nepodařilo odeslat. Zkontroluj jeho adresu, nebo objednávku pošli jinak.';
          }
        }
      } catch (e: any) {
        console.error('[orders] e-mail dodavateli neodešel', e);
        emailError = 'E-mail dodavateli se nepodařilo odeslat. Zkontroluj jeho adresu, nebo objednávku pošli jinak.';
      }
    }
  }
  return NextResponse.json({ ok: true, order: shape(row, c.role.opravneni.has('sklad.ceny')), emailed, emailError });
}

// PATCH — receive or cancel: { id, action: 'received'|'cancelled', totalCost?, restock? }.
// Receiving with restock=true adds the ordered quantities to matching stock items.
export async function PATCH(req: NextRequest) {
  const c = await pozaduj('nakup.prijmout');
  if (jeOdpoved(c)) return c;

  const b = await req.json().catch(() => ({}));
  const id = parseInt(b.id);
  const action = b.action === 'received' ? 'received' : b.action === 'cancelled' ? 'cancelled' : null;
  if (!Number.isFinite(id) || !action) return NextResponse.json({ error: 'Neplatný požadavek' }, { status: 400 });

  const [order] = await sql`SELECT * FROM orders WHERE id = ${id} AND team_id = ${c.teamId}`;
  if (!order) return NextResponse.json({ error: 'Objednávka nenalezena' }, { status: 404 });
  if (order.status !== 'ordered') return NextResponse.json({ error: 'Objednávka už je vyřízená.' }, { status: 409 });

  const totalCost = action === 'received' && b.totalCost !== undefined && b.totalCost !== null && b.totalCost !== ''
    ? Math.max(0, Math.round(Number(b.totalCost)) || 0)
    : null;
  if (totalCost != null && !c.role.opravneni.has('sklad.ceny_upravit')) {
    return NextResponse.json({ error: 'Nákupní cenu zapisuje jen ten, kdo smí měnit ceny. Přijmi zboží bez ní.' }, { status: 403 });
  }

  const [row] = await sql`
    UPDATE orders
    SET status = ${action},
        total_cost = ${totalCost},
        received_at = ${action === 'received' ? new Date().toISOString() : null}
    WHERE id = ${id}
    RETURNING *`;

  // Auto-restock: add ordered quantities to matching inventory items.
  let restocked = 0;
  if (action === 'received' && b.restock !== false) {
    const items: OrderItem[] = Array.isArray(order.items) ? order.items : [];
    for (const it of items) {
      try {
        let updated: any[] = [];
        if (it.itemId) {
          updated = await sql`
            UPDATE inventory_items SET quantity = quantity + ${it.qty}, updated_by = ${c.meId}, updated_at = NOW()
            WHERE id = ${it.itemId} AND team_id = ${c.teamId}
            RETURNING id, quantity`;
        }
        if (updated.length === 0) {
          updated = await sql`
            UPDATE inventory_items SET quantity = quantity + ${it.qty}, updated_by = ${c.meId}, updated_at = NOW()
            WHERE LOWER(name) = LOWER(${it.name}) AND team_id = ${c.teamId}
            RETURNING id, quantity`;
        }
        if (updated.length > 0) {
          restocked++;
          try {
            await sql`
              INSERT INTO inventory_log (item_id, user_id, old_quantity, new_quantity, note)
              VALUES (${updated[0].id}, ${c.meId}, ${updated[0].quantity - it.qty}, ${updated[0].quantity}, ${'Příjem objednávky #' + id})`;
          } catch { /* log is best-effort */ }
        }
      } catch { /* skip item */ }
    }
  }

  // Příjem surovin může odblokovat výrobu (vlajky v nákupu zmizí, úkol se přepíše).
  if (restocked > 0) { try { await ensureProductionTasks(c.teamId, c.meId); } catch { /* před migrací */ } }
  return NextResponse.json({ ok: true, order: shape(row, c.role.opravneni.has('sklad.ceny')), restocked });
}

// DELETE ?id= — remove an order record.
export async function DELETE(req: NextRequest) {
  const c = await pozaduj('nakup.prijmout');
  if (jeOdpoved(c)) return c;
  const id = parseInt(new URL(req.url).searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  await sql`DELETE FROM orders WHERE id = ${id} AND team_id = ${c.teamId}`;
  return NextResponse.json({ ok: true });
}
