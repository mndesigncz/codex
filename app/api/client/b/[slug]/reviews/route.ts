// Kolo 8 (R8-7): odpovědi podniku na hodnocení hosta — host je vidí v Moje stránka.
// Jen vlastní hodnocení přihlášeného hosta v tomhle podniku, jen ta s odpovědí.
import { NextResponse } from 'next/server';
import { sql, customer, profileBySlug } from '@/lib/client';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(_req: Request, props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Přihlas se jako host.' }, { status: 401 });
  const p = await profileBySlug(params.slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  let rows: any[] = [];
  try {
    rows = await sql`
      SELECT v.id, v.ref, v.rating, v.note, v.created_at, v.reply, v.replied_at
      FROM client_reviews v
      WHERE v.team_id = ${Number(p.team_id)} AND v.customer_id = ${me.id} AND v.reply IS NOT NULL
      ORDER BY v.replied_at DESC NULLS LAST, v.id DESC LIMIT 10` as any[];
  } catch { rows = []; /* před migrací sloupců odpovědí */ }
  return NextResponse.json({
    reviews: rows.map(r => ({
      id: Number(r.id), rating: Number(r.rating) || 0, note: r.note ?? null, createdAt: r.created_at ?? null,
      reply: String(r.reply ?? ''), repliedAt: r.replied_at ?? null, kind: String(r.ref ?? '').startsWith('ord:') ? 'order' : 'reservation',
    })),
  });
}
