// Záměr hosta u kasy: „přibalit odměnu“ k příštímu načtení karty v podniku.
// GET → { zamery: [{ teamId, claimId, expiresAt }] }
// PUT { slug, claimId } → přibalí (jeden záměr na podnik; přepíše předchozí)
// DELETE ?slug= → zruší. Čtečka záměr čte přes lib/klient/zamer.ts (zamerHosta).
import { NextRequest, NextResponse } from 'next/server';
import { customer, sql } from '@/lib/client';
import { nastavZamer, zrusZamer, zameryHosta } from '@/lib/klient/zamer';
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

async function teamPodleSlugu(slug: unknown): Promise<number | null> {
  const s = String(slug ?? '').trim().slice(0, 64);
  if (!s) return null;
  const [p] = await sql`SELECT team_id FROM client_profiles WHERE slug = ${s} AND enabled = TRUE`;
  return p ? Number(p.team_id) : null;
}

export async function GET() {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  try { return NextResponse.json({ zamery: await zameryHosta(me.id) }); }
  catch { return NextResponse.json({ zamery: [] }); }
}

export async function PUT(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const b = await req.json().catch(() => ({}));
  const teamId = await teamPodleSlugu(b.slug);
  if (!teamId) return NextResponse.json({ error: 'Podnik tu není.' }, { status: 404 });
  const claimId = Math.trunc(Number(b.claimId));
  if (!(claimId > 0)) return NextResponse.json({ error: 'Vyber odměnu.' }, { status: 400 });
  const chyba = await nastavZamer(me.id, teamId, claimId);
  if (chyba) return NextResponse.json({ error: chyba }, { status: 409 });
  return NextResponse.json({ ok: true, zamery: await zameryHosta(me.id) });
}

export async function DELETE(req: NextRequest) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const teamId = await teamPodleSlugu(new URL(req.url).searchParams.get('slug'));
  if (!teamId) return NextResponse.json({ error: 'Podnik tu není.' }, { status: 404 });
  await zrusZamer(me.id, teamId);
  return NextResponse.json({ ok: true, zamery: await zameryHosta(me.id) });
}
