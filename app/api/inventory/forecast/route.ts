// Předpověď zásob: „dojde za ~2 dny" podle skutečné spotřeby (kolo 8, R8-4).
//
// Docházející zásoby a nákupní seznam stály jen na pevném minimu položky — mléko s minimem
// 5 l se v pátek objevilo pozdě a v úterý zbytečně. Tady se z odpisů posledních 28 dní
// (prodeje z kasy, ruční odpisy; inventurní opravy a příjmy ne — lib/skladPrehled
// ubytekPohybu) spočítá denní spotřeba každé položky, kolik dní vydrží zásoba a v jaké
// jednotce (obsah u balení, jinak kusy). Widgety z toho kreslí „dojde za" a návrh na 7 dní.
//
// Jen čtení; položky bez úbytku v odpovědi nejsou (bez spotřeby se „dojde za" nevymýšlí).

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { OKNO_SPOTREBY_DNI, dojdeZaDni, spotrebaZPohybu, zasobaVObsahu, type PohybProSpotrebu } from '@/lib/skladPrehled';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

export async function GET() {
  const c = await pozaduj('sklad.zobrazit');
  if (jeOdpoved(c)) return c;
  const teamId = c.teamId;

  let rows: any[] = [];
  try {
    // Jen položky podniku; pohyby za okno. old_open/new_open přibyly migrací — bez nich spadne na kusy.
    rows = await sql`
      SELECT l.item_id AS "itemId", l.old_quantity AS "oldQuantity", l.new_quantity AS "newQuantity",
             l.old_open AS "oldOpen", l.new_open AS "newOpen", l.note,
             i.package_size AS "packageSize"
      FROM inventory_log l
      JOIN inventory_items i ON i.id = l.item_id
      WHERE i.team_id = ${teamId} AND l.created_at >= NOW() - (${OKNO_SPOTREBY_DNI}::int * INTERVAL '1 day')`;
  } catch {
    try {
      rows = await sql`
        SELECT l.item_id AS "itemId", l.old_quantity AS "oldQuantity", l.new_quantity AS "newQuantity",
               NULL AS "oldOpen", NULL AS "newOpen", l.note, NULL AS "packageSize"
        FROM inventory_log l
        JOIN inventory_items i ON i.id = l.item_id
        WHERE i.team_id = ${teamId} AND l.created_at >= NOW() - (${OKNO_SPOTREBY_DNI}::int * INTERVAL '1 day')`;
    } catch {
      return NextResponse.json({ days: OKNO_SPOTREBY_DNI, items: {} });
    }
  }
  const pohyby: PohybProSpotrebu[] = rows.map(r => ({
    itemId: Number(r.itemId), oldQuantity: num(r.oldQuantity), newQuantity: num(r.newQuantity),
    oldOpen: r.oldOpen == null ? null : num(r.oldOpen), newOpen: r.newOpen == null ? null : num(r.newOpen),
    note: r.note == null ? null : String(r.note), packageSize: r.packageSize == null ? null : num(r.packageSize),
  }));
  const spotreba = spotrebaZPohybu(pohyby);
  if (spotreba.size === 0) return NextResponse.json({ days: OKNO_SPOTREBY_DNI, items: {} });

  // Aktuální zásoba položek se spotřebou (v obsahu u balení).
  const ids = [...spotreba.keys()];
  let polozky: any[] = [];
  try {
    polozky = await sql`
      SELECT id, quantity, open_amount AS "openAmount", package_size AS "packageSize", content_unit AS "contentUnit", unit, archived
      FROM inventory_items WHERE team_id = ${teamId} AND id = ANY(${ids})`;
  } catch {
    polozky = await sql`SELECT id, quantity, unit FROM inventory_items WHERE team_id = ${teamId} AND id = ANY(${ids})`;
  }
  const items: Record<string, { dailyUse: number; runsOutInDays: number | null; stock: number; unit: string; packageSize: number | null }> = {};
  for (const p of polozky) {
    if (p.archived === true) continue;
    const celkem = spotreba.get(Number(p.id)) ?? 0;
    if (celkem <= 0) continue;
    const pkg = p.packageSize == null ? null : num(p.packageSize);
    const stock = zasobaVObsahu({ quantity: num(p.quantity), openAmount: p.openAmount == null ? null : num(p.openAmount), packageSize: pkg });
    const dailyUse = Math.round((celkem / OKNO_SPOTREBY_DNI) * 1000) / 1000;
    items[String(p.id)] = {
      dailyUse, runsOutInDays: dojdeZaDni(stock, dailyUse), stock,
      unit: pkg != null && pkg > 0 ? String(p.contentUnit || p.unit || '') : String(p.unit || ''),
      packageSize: pkg != null && pkg > 0 ? pkg : null,
    };
  }
  return NextResponse.json({ days: OKNO_SPOTREBY_DNI, items });
}
