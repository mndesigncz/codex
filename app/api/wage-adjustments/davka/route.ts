import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { jeClenem } from '@/lib/tenant';
import { audit } from '@/lib/audit';
import { notifyUser } from '@/lib/push';
import { pragueToday } from '@/lib/pragueTime';
import { menaPodniku } from '@/lib/menaPodniku';
import { ZDROJ_NENAROKOVE_PREMIE } from '@/lib/tresty';
import { oznameniOdmeny, prvniOtevrenyDen, srovnejSZamky, validujOdmenu } from '@/lib/trestyPenize';
import { zamkyOd } from '@/lib/trestyPenizeDb';

// Hromadná odměna v penězích (kolo 96, docs/TRESTY-PENIZE.md): jednomu i víc lidem naráz, „každý X" nebo
// „rozpočítat X". Každý dostane vlastní úpravu mzdy (wage_adjustments, batch_id = dávka); výchozí je
// nenároková prémie (source 'premie' — dá se z ní i krátit), `nenarokova: false` = mzda / ostatní ('manual').
// Den v uzavřeném období se posune na první otevřený. Peníze jen s finance.mzdy.
//
//   POST   { userIds[] | userId, castka, rozpocitat?, day?, text, nenarokova? } → { ok, batchId, items: [{ id, userId, day, amount }] }
//   DELETE ?batchId=  — vezme dávku zpět (v otevřeném období řádky zmizí, v uzavřeném vrátí oprava v dalším)

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function POST(req: NextRequest) {
  const c = await pozaduj('finance.mzdy');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  const dnes = pragueToday();
  const v = validujOdmenu(b ?? {}, dnes);
  if (!v.ok) return NextResponse.json({ error: v.chyba }, { status: 400 });
  const o = v.odmena;
  for (const id of o.ids) if (!(await jeClenem(id, c.teamId))) return NextResponse.json({ error: 'Člověk není v podniku.', userId: id }, { status: 404 });
  const den = prvniOtevrenyDen(o.den, await zamkyOd(c.teamId, o.den));
  const zdroj = o.nenarokova ? ZDROJ_NENAROKOVE_PREMIE : 'manual';
  const mena = await menaPodniku(c.teamId);
  let batchId: number;
  const items: { id: number; userId: number; day: string; amount: number }[] = [];
  try {
    const [d] = await sql`
      INSERT INTO pay_batches (team_id, kind, text, count, total, created_by)
      VALUES (${c.teamId}, 'odmena', ${o.text}, ${o.ids.length}, ${o.castky.reduce((a, x) => a + x, 0)}, ${c.meId})
      RETURNING id`;
    batchId = Number(d.id);
    for (let i = 0; i < o.ids.length; i++) {
      const [w] = await sql`
        INSERT INTO wage_adjustments (team_id, user_id, day, amount, note, source, created_by, batch_id)
        VALUES (${c.teamId}, ${o.ids[i]}, ${den}, ${o.castky[i]}, ${o.text}, ${zdroj}, ${c.meId}, ${batchId})
        RETURNING id`;
      items.push({ id: Number(w.id), userId: o.ids[i], day: den, amount: o.castky[i] });
    }
  } catch {
    return NextResponse.json({ error: 'Odměny se nepodařilo uložit — databáze ještě není připravená.' }, { status: 503 });
  }
  audit(c.teamId, c.meId, 'wage.davka', 'pay_batch', batchId, `${o.ids.length} lidí · ${mena.money(o.castky.reduce((a, x) => a + x, 0))} (${den})${o.nenarokova ? ' · nenároková prémie' : ''} · ${o.text}`);
  for (const it of items) {
    if (it.userId === c.meId) continue;
    try {
      const z = oznameniOdmeny(it.amount, o.text, mena.money);
      await notifyUser(it.userId, { title: z.title, body: z.body, type: 'info', link: '/employee/shifts' });
    } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, batchId, items }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const c = await pozaduj('finance.mzdy');
  if (jeOdpoved(c)) return c;
  const batchId = parseInt(new URL(req.url).searchParams.get('batchId') ?? '');
  if (!Number.isFinite(batchId)) return NextResponse.json({ error: 'Chybí dávka.' }, { status: 400 });
  try {
    const [d] = await sql`SELECT id FROM pay_batches WHERE id = ${batchId} AND team_id = ${c.teamId} AND kind = 'odmena'`;
    if (!d) return NextResponse.json({ error: 'Dávka nenalezena.' }, { status: 404 });
    const rows = await sql`SELECT id, user_id, day, amount, source, note FROM wage_adjustments WHERE team_id = ${c.teamId} AND batch_id = ${batchId}`;
    const zamky = await zamkyOd(c.teamId, '0000-01-01');
    const poLidech = new Map<number, any[]>();
    for (const r of rows as any[]) poLidech.set(Number(r.user_id), [...(poLidech.get(Number(r.user_id)) ?? []), r]);
    let opravy = 0;
    for (const [userId, rs] of poLidech) {
      const s = srovnejSZamky(rs.map(r => ({ id: Number(r.id), den: String(r.day).slice(0, 10), castka: Number(r.amount) || 0 })), [], zamky);
      if (s.smazat.length) await sql`DELETE FROM wage_adjustments WHERE team_id = ${c.teamId} AND id = ANY(${s.smazat})`;
      for (const v of s.vlozit) {
        opravy++;
        await sql`
          INSERT INTO wage_adjustments (team_id, user_id, day, amount, note, source, created_by)
          VALUES (${c.teamId}, ${userId}, ${v.den}, ${v.castka}, ${`${String(rs[0].note ?? 'Odměna')} (vzato zpět, oprava za uzavřené období)`.slice(0, 200)}, ${String(rs[0].source ?? 'manual')}, ${c.meId})`;
      }
    }
    audit(c.teamId, c.meId, 'wage.davka_zpet', 'pay_batch', batchId, `${poLidech.size} lidí${opravy ? ` · ${opravy} oprav za uzavřené období` : ''}`);
    return NextResponse.json({ ok: true, opravy });
  } catch {
    return NextResponse.json({ error: 'Dávku se nepodařilo vzít zpět.' }, { status: 503 });
  }
}
