// Souhlasy hosta s novinkami po podnicích (spuštění, balík G; GDPR čl. 7, zák. 480/2004).
//
//  GET  → { podniky: [{ teamId, podnik, slug, push, email }], dostupne }
//         Každý podnik, kde je host členem, se svým souhlasem. `dostupne: false` = tabulka souhlasů
//         ještě není (před migrací); profil pak ukáže původní jeden přepínač.
//  POST { teamId, typ: 'novinky_push'|'novinky_email', stav: boolean } → nový řádek v consents (jen
//         přidávání) a nový stav podniku. Souhlas jde dát jen podniku, kde je host členem.

import { NextResponse } from 'next/server';
import { customer, sql } from '@/lib/client';
import { zmenaZTela, aktualniSouhlasy, souhlasPodniku } from '@/lib/consents';
import { radkySouhlasu, zmenSouhlas, prevedUzivatele, zajistiConsents } from '@/lib/consentsDb';
import { hit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';

export async function GET() {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  if (!(await zajistiConsents())) return NextResponse.json({ podniky: [], dostupne: false });
  // Kdo měl dřív jeden globální souhlas a noční převod ho ještě nezastihl, převede se teď.
  await prevedUzivatele(me.id);
  const radky = await radkySouhlasu(me.id);
  if (!radky) return NextResponse.json({ podniky: [], dostupne: false });
  const akt = aktualniSouhlasy(radky);
  const clenstvi = await sql`
    SELECT m.team_id, COALESCE(NULLIF(t.share_theme->>'businessName', ''), t.name) AS podnik, p.slug
    FROM client_memberships m JOIN teams t ON t.id = m.team_id LEFT JOIN client_profiles p ON p.team_id = m.team_id
    WHERE m.customer_id = ${me.id} ORDER BY podnik, m.team_id` as any[];
  const podniky = clenstvi.map(r => ({
    teamId: Number(r.team_id), podnik: String(r.podnik ?? ''), slug: r.slug ? String(r.slug) : null,
    ...souhlasPodniku(akt, Number(r.team_id)),
  }));
  return NextResponse.json({ podniky, dostupne: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(req: Request) {
  const me = await customer();
  if (!me) return NextResponse.json({ error: 'Nepřihlášen' }, { status: 401 });
  const z = zmenaZTela(await req.json().catch(() => ({})));
  if (!z) return NextResponse.json({ error: 'Neplatná změna souhlasu.' }, { status: 400 });
  const gate = await hit(`souhlas-novinky:${me.id}`, 60, 3600);
  if (!gate.ok) return NextResponse.json({ error: 'Moc změn za sebou. Zkus to za chvíli.' }, { status: 429 });
  const [clen] = await sql`SELECT 1 AS ok FROM client_memberships WHERE customer_id = ${me.id} AND team_id = ${z.teamId}`;
  if (!clen) return NextResponse.json({ error: 'V tomhle podniku nejsi členem.' }, { status: 404 });
  const s = await zmenSouhlas(me.id, z, 'profil');
  if (!s) return NextResponse.json({ error: 'Nastavení se zatím nepodařilo uložit.' }, { status: 503 });
  return NextResponse.json({ ok: true, teamId: z.teamId, ...s });
}
