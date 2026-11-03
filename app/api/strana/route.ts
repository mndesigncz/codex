import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hit } from '@/lib/rateLimit';
import { COOKIE_STRANA, HLASKA_PODNIK_HESLEM, cestaStrany, druhaStranaRelace, dvojnik, jeStrana, metodaRelace, smiNaStranu, stranaRole, verzeRelaceUctu, vydejListek } from '@/lib/dveStrany';

export const dynamic = 'force-dynamic';

// Dvě strany jednoho účtu (lib/dveStrany). GET řekne, jestli má přihlášený
// i druhou stranu (přepínač se bez ní neukazuje) a kterou si naposledy
// vybral (`zapamatovana`, z cookie). POST zapamatuje volbu
// „Kam jdeš“ a když je cílem druhá strana, vydá minutový lístek pro
// signIn('prepnout-stranu'). Relace z kódu z e-mailu správu podniku nevidí
// a lístek do ní nedostane (heslo chce i druhá strana).

async function ja() {
  const session = await getServerSession(authOptions);
  const u = session?.user as any;
  if (!u?.id) return null;
  return { id: parseInt(u.id), strana: stranaRole(u.role), metoda: metodaRelace(u.metoda, u.role) };
}

export async function GET() {
  const me = await ja();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const d = await druhaStranaRelace(me.id, me.metoda);
  const pamet = (await cookies()).get(COOKIE_STRANA)?.value;
  return NextResponse.json({ strana: me.strana, druha: d ? stranaRole(d.role) : null, zapamatovana: jeStrana(pamet) ? pamet : null });
}

function sCookie(res: NextResponse, strana: string) {
  res.cookies.set(COOKIE_STRANA, strana, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
  return res;
}

export async function POST(req: Request) {
  const me = await ja();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await req.json().catch(() => ({} as any));
  if (!jeStrana(b?.strana)) return NextResponse.json({ error: 'Neznámá strana' }, { status: 400 });
  if (b.strana === me.strana) return sCookie(NextResponse.json({ cil: cestaStrany(me.strana) }), me.strana);
  if (!smiNaStranu(b.strana, me.metoda)) return NextResponse.json({ error: HLASKA_PODNIK_HESLEM }, { status: 403 });
  const brzda = await hit(`strana:${me.id}`, 30, 15 * 60);
  if (!brzda.ok) return NextResponse.json({ error: 'Moc pokusů, zkuste to za chvíli.' }, { status: 429 });
  const tajemstvi = process.env.NEXTAUTH_SECRET;
  const d = await dvojnik(me.id);
  if (!d || !tajemstvi) return NextResponse.json({ error: 'Druhou stranu tenhle účet nemá.' }, { status: 404 });
  const listek = vydejListek({ zId: me.id, naId: d.id, sv: await verzeRelaceUctu(me.id), metoda: me.metoda }, tajemstvi);
  return sCookie(NextResponse.json({ listek, cil: cestaStrany(b.strana) }), b.strana);
}
