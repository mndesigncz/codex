import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { createHash } from 'node:crypto';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { druhZarizeniZEndpointu } from '@/lib/exportUctu';

export const dynamic = 'force-dynamic';

// Zařízení, která dostávají push z prohlížeče (tabulka push_subscriptions) a jejich odebrání
// (Nastavení → Notifikace). Osobní věc účtu: vidí a odebírá se jen vlastní odběr (user_id = me).
// Adresa odběru je přístupový údaj, proto se nevrací; zařízení se pozná podle otisku (SHA-256),
// který si prohlížeč spočítá ze své vlastní adresy.

const sql = neon(process.env.DATABASE_URL!);

async function meId(): Promise<number | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  const id = parseInt((session.user as any).id);
  return Number.isFinite(id) ? id : null;
}

const otisk = (endpoint: string) => createHash('sha256').update(endpoint).digest('hex').slice(0, 16);

export async function GET() {
  const id = await meId();
  if (!id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  try {
    const rows = await sql`SELECT id, endpoint, created_at FROM push_subscriptions WHERE user_id = ${id} ORDER BY id DESC` as any[];
    return NextResponse.json({
      zarizeni: rows.map(r => ({ id: Number(r.id), druh: druhZarizeniZEndpointu(r.endpoint), otisk: otisk(String(r.endpoint)), vytvoreno: r.created_at })),
    });
  } catch {
    // Tabulka ještě není (před /api/init): žádná zařízení, ne chyba.
    return NextResponse.json({ zarizeni: [] });
  }
}

export async function DELETE(request: Request) {
  const id = await meId();
  if (!id) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const zarizeniId = Number(body?.id);
  if (!Number.isInteger(zarizeniId) || zarizeniId <= 0) return NextResponse.json({ error: 'Neplatné zařízení.' }, { status: 400 });
  try {
    // Jen vlastní odběr: cizí id se nesmaže (kolo 67 stejně u /api/push/subscribe).
    await sql`DELETE FROM push_subscriptions WHERE id = ${zarizeniId} AND user_id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Zařízení se nepodařilo odebrat.' }, { status: 500 });
  }
}
