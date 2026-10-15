// Veřejné oznámení nezákonného obsahu (DSA čl. 16) z formuláře /nahlasit — i bez účtu.
// Uloží se do content_reports se zdrojem „web“, jde provozovateli (e-mail + správa /admin/nahlaseni)
// a oznamovatel dostane potvrzení přijetí. Pravidla: lib/dsa.ts, databáze a e-maily: lib/dsaDb.ts.

import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { hit } from '@/lib/rateLimit';
import { klientIp } from '@/lib/klientIp';
import { audit } from '@/lib/audit';
import { platneOznameni } from '@/lib/dsa';
import { ulozOznameniWeb, eskalujOznameniWeb, potvrdOznamovateli } from '@/lib/dsaDb';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const v = platneOznameni(await request.json().catch(() => ({})));
  if (!v.ok) return NextResponse.json({ error: v.error, pole: v.pole }, { status: 400 });
  // Formulář bez přihlášení je snadný cíl zahlcení: pár oznámení za hodinu z jednoho připojení stačí.
  const gate = await hit(`dsa-oznameni:${klientIp(request.headers)}`, 10, 60 * 60);
  if (!gate.ok) return NextResponse.json({ error: 'Příliš mnoho oznámení z tohoto připojení. Zkuste to za hodinu, nebo napište e-mail na podporu.' }, { status: 429 });

  let reporterId: number | null = null;
  try {
    const s = await getServerSession(authOptions);
    const id = Number((s?.user as { id?: unknown } | undefined)?.id);
    reporterId = s?.user && Number.isFinite(id) ? id : null;
  } catch { reporterId = null; }

  const r = await ulozOznameniWeb(v.v, reporterId);
  if (!r) return NextResponse.json({ error: 'Oznámení se teď nepodařilo uložit. Zkuste to za chvíli znovu, nebo ho pošlete e-mailem na podporu.' }, { status: 503 });
  if (r.teamId != null) await audit(r.teamId, reporterId, 'nahlaseni.web', 'content_report', r.id, v.v.kategorie);
  // Provozovatel a potvrzení oznamovateli: selhání nic nezastaví, oznámení už je uložené a ve správě.
  const [eskalovano, potvrzeno] = await Promise.all([
    eskalujOznameniWeb(r.id, v.v.kategorie, r.podnik),
    potvrdOznamovateli(r.id, v.v.email, v.v.kategorie),
  ]);
  return NextResponse.json({ ok: true, id: r.id, potvrzeni: potvrzeno, eskalovano });
}
