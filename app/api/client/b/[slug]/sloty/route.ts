// Volné časy rezervace: GET ?den=YYYY-MM-DD&osob=N → { den, osob, kapacita, sloty: [{ cas, volno }], dny: [{ den, otevreno }] }.
// Veřejné (jako stránka podniku); počítá lib/klient/sloty.ts z otevírací doby, stolů a rezervací.
import { NextRequest, NextResponse } from 'next/server';
import { profileBySlug } from '@/lib/client';
import { slotyPodniku } from '@/lib/klient/sloty';
import { pragueToday, dayPlus } from '@/lib/pragueTime';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET(req: NextRequest, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const p = await profileBySlug(slug);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen' }, { status: 404 });
  if (!p.reservations_on) return NextResponse.json({ error: 'Podnik rezervace přes aplikaci nepřijímá.' }, { status: 400 });
  const q = req.nextUrl.searchParams;
  const dnes = pragueToday();
  const den = /^\d{4}-\d{2}-\d{2}$/.test(q.get('den') ?? '') ? String(q.get('den')) : dnes;
  if (den < dnes || den > dayPlus(dnes, Number(p.lead_days) || 30)) return NextResponse.json({ error: 'Vyber den od dneška do ' + (Number(p.lead_days) || 30) + ' dní dopředu.' }, { status: 400 });
  const osob = Math.max(1, Math.min(Number(p.max_party) || 8, Math.trunc(Number(q.get('osob'))) || 2));
  return NextResponse.json(await slotyPodniku(p, den, osob));
}
