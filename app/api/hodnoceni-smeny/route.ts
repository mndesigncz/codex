import { NextRequest, NextResponse } from 'next/server';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { notifyUser, notifyUsers } from '@/lib/push';
import { audit } from '@/lib/audit';
import { jeClenem, clenovePodniku } from '@/lib/tenant';
import { jeDen, normalizujVstup, popisSmeny, textPoznamkyProClena, tonHodnoceni, zmenyBodu } from '@/lib/hodnoceniSmeny';
import {
  denKHodnoceni, hodnoceniClena, hodnoceniDnu, nastavPripominat, oznacVideno, pripominat, smazHodnoceni, ulozHodnoceni,
} from '@/lib/hodnoceniSmenyDb';

export const dynamic = 'force-dynamic';

// Hodnocení směny jako celku (lib/hodnoceniSmeny.ts).
//
// GET  ?den=RRRR-MM-DD          → směny dne podle rozvrhu, uložená hodnocení, kdo z podniku může do osádky (hodnoceni.zobrazit)
// GET  ?od=…&do=…               → uložená hodnocení v rozsahu dnů (kalendář, přehled; hodnoceni.zobrazit)
// GET  ?moje=1                  → hodnocení směn, na kterých jsem byl — z bodů jen moje (každý člen kromě tabletu)
// POST { den, klic, … }         → uložit (hodnoceni.hodnotit); oznámení osádce
// POST { videno: true }         → potvrzuji hodnocení svých směn (každý člen)
// PATCH { pripominat }          → pravidlo „po uzávěrce připomenout ohodnocení směny" (hodnoceni.hodnotit)
// DELETE ?id=                   → smazat hodnocení i body z něj (hodnoceni.hodnotit)
//
// Hodnocení výkonu je osobní údaj: sdílený tablet sem nesmí nikdy (stejně jako do /api/shift-reviews).

const dnyMezi = (od: string, doo: string) => Math.round((Date.parse(`${doo}T12:00:00Z`) - Date.parse(`${od}T12:00:00Z`)) / 86_400_000);

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams;
  if (q.get('moje') === '1') {
    const c = await pozaduj(null);
    if (jeOdpoved(c)) return c;
    if (c.role.typ === 'kiosk') return NextResponse.json({ error: 'Jen pro členy týmu' }, { status: 403 });
    return NextResponse.json({ hodnoceni: await hodnoceniClena(c.teamId, c.meId) });
  }

  const c = await pozaduj('hodnoceni.zobrazit');
  if (jeOdpoved(c)) return c;
  if (c.role.typ === 'kiosk') return NextResponse.json({ error: 'Jen pro vedení' }, { status: 403 });
  const smiHodnotit = c.role.opravneni.has('hodnoceni.hodnotit');

  const den = q.get('den');
  if (den) {
    if (!jeDen(den)) return NextResponse.json({ error: 'Neplatný den' }, { status: 400 });
    const [dne, clenove, prip] = await Promise.all([
      denKHodnoceni(c.teamId, den),
      clenovePodniku(c.teamId),
      pripominat(c.teamId),
    ]);
    return NextResponse.json({
      den, ...dne, smiHodnotit, pripominat: prip,
      clenove: clenove.map(m => ({ id: m.id, jmeno: m.name, avatar: m.avatar ?? null })),
    });
  }

  const od = q.get('od'), doo = q.get('do') ?? od;
  if (!jeDen(od) || !jeDen(doo) || doo < od || dnyMezi(od, doo) > 62) {
    return NextResponse.json({ error: 'Zadej den, nebo rozsah nejvýš dvou měsíců' }, { status: 400 });
  }
  return NextResponse.json({ od, do: doo, hodnoceni: await hodnoceniDnu(c.teamId, od, doo), smiHodnotit });
}

export async function POST(req: NextRequest) {
  const b = await req.json().catch(() => ({}));

  if (b?.videno === true) {
    const c = await pozaduj(null);
    if (jeOdpoved(c)) return c;
    if (c.role.typ === 'kiosk') return NextResponse.json({ error: 'Jen pro členy týmu' }, { status: 403 });
    await oznacVideno(c.teamId, c.meId);
    return NextResponse.json({ ok: true });
  }

  const c = await pozaduj('hodnoceni.hodnotit');
  if (jeOdpoved(c)) return c;
  if (c.role.typ === 'kiosk') return NextResponse.json({ error: 'Jen pro vedení' }, { status: 403 });

  const n = normalizujVstup(b);
  if (!n.ok) return NextResponse.json({ error: n.chyba }, { status: 400 });
  const v = n.v;
  // Osádka jen z členů tohoto podniku (cizí id by jinak dostalo body i oznámení).
  const platni: number[] = [];
  for (const id of v.osadka) if (await jeClenem(id, c.teamId)) platni.push(id);
  v.osadka = platni;
  v.body = v.body.filter(x => platni.includes(x.id));

  let vysledek;
  try {
    vysledek = await ulozHodnoceni(c.teamId, c.meId, v);
  } catch {
    return NextResponse.json({ error: 'Hodnocení směny se nepodařilo uložit. Spusť /api/init.' }, { status: 500 });
  }
  const { hodnoceni, nove, predtim } = vysledek;
  const zmeny = zmenyBodu(predtim?.body ?? [], hodnoceni.body);
  const popis = popisSmeny(hodnoceni) ?? 'celý den';
  audit(c.teamId, c.meId, 'smena.hodnoceni', 'smeny_hodnoceni', hodnoceni.id,
    `${hodnoceni.den} ${popis}: ${hodnoceni.hvezdy ? `${hodnoceni.hvezdy}★ ` : ''}${hodnoceni.kNaprave ? 'k nápravě ' : ''}`
    + `${hodnoceni.osadka.length} lidí${zmeny.length ? `, body ${zmeny.map(z => `#${z.id} ${z.pred}→${z.po}`).join(', ')}` : ''}`);

  // Oznámení osádce: nové hodnocení vždy, úprava jen když se změnil obsah (ne jen překlep v rozpisu bez dopadu).
  // Osobní poznámka (Martin: „poznámka konkrétnímu člověku") jde jen tomu člověku — v jeho oznámení,
  // ostatní ji nedostanou; změna jen jeho poznámky upozorní jen jeho.
  const zmenenObsah = !predtim || predtim.hvezdy !== hodnoceni.hvezdy || predtim.dobre !== hodnoceni.dobre
    || predtim.kritika !== hodnoceni.kritika || predtim.kNaprave !== hodnoceni.kNaprave
    || JSON.stringify(predtim.stitky) !== JSON.stringify(hodnoceni.stitky) || zmeny.length > 0;
  const poznamka = (id: number) => hodnoceni.body.find(b => b.id === id)?.poznamka ?? null;
  const poznamkaPred = (id: number) => predtim?.body.find(b => b.id === id)?.poznamka ?? null;
  const komu = hodnoceni.osadka.filter(id => id !== c.meId && (zmenenObsah || poznamka(id) !== poznamkaPred(id)));
  if (komu.length) {
    try {
      const ton = tonHodnoceni(hodnoceni);
      const dLabel = `${Number(hodnoceni.den.slice(8, 10))}. ${Number(hodnoceni.den.slice(5, 7))}.`;
      const spolecne = {
        title: hodnoceni.kNaprave ? 'Hodnocení směny — něco k nápravě' : nove ? 'Vedení ohodnotilo vaši směnu' : 'Hodnocení směny se změnilo',
        body: `${dLabel}, ${popis}${hodnoceni.hvezdy ? ` — ${hodnoceni.hvezdy}★` : ''}${ton === 'kritika' ? ' · co příště jinak' : ton === 'smisene' ? ' · pochvala i kritika' : ''}`,
        type: hodnoceni.kNaprave ? 'warning' : 'info',
        link: '/employee/shifts?view=rewards',
      };
      await notifyUsers(komu.filter(id => !poznamka(id)), spolecne);
      await Promise.allSettled(komu.filter(id => !!poznamka(id)).map(id => notifyUser(id, { ...spolecne, body: spolecne.body + textPoznamkyProClena(poznamka(id)) })));
    } catch { /* best-effort */ }
  }
  return NextResponse.json({ ok: true, nove, hodnoceni, zmeny });
}

export async function PATCH(req: NextRequest) {
  const c = await pozaduj('hodnoceni.hodnotit');
  if (jeOdpoved(c)) return c;
  if (c.role.typ === 'kiosk') return NextResponse.json({ error: 'Jen pro vedení' }, { status: 403 });
  const b = await req.json().catch(() => ({}));
  if (typeof b?.pripominat !== 'boolean') return NextResponse.json({ error: 'Neznámá změna' }, { status: 400 });
  try {
    await nastavPripominat(c.teamId, b.pripominat);
  } catch {
    return NextResponse.json({ error: 'Nastavení se nepodařilo uložit. Spusť /api/init.' }, { status: 500 });
  }
  audit(c.teamId, c.meId, 'smena.hodnoceni_pravidlo', 'teams', c.teamId, b.pripominat ? 'připomínat po uzávěrce: zapnuto' : 'připomínat po uzávěrce: vypnuto');
  return NextResponse.json({ ok: true, pripominat: b.pripominat });
}

export async function DELETE(req: NextRequest) {
  const c = await pozaduj('hodnoceni.hodnotit');
  if (jeOdpoved(c)) return c;
  if (c.role.typ === 'kiosk') return NextResponse.json({ error: 'Jen pro vedení' }, { status: 403 });
  const id = parseInt(req.nextUrl.searchParams.get('id') ?? '');
  if (!Number.isFinite(id)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });
  let h;
  try { h = await smazHodnoceni(c.teamId, id); } catch { h = undefined; }
  if (h === undefined) return NextResponse.json({ error: 'Hodnocení se nepodařilo smazat.' }, { status: 500 });
  if (!h) return NextResponse.json({ error: 'Hodnocení nenalezeno' }, { status: 404 });
  audit(c.teamId, c.meId, 'smena.hodnoceni_smazat', 'smeny_hodnoceni', id, `${h.den} ${popisSmeny(h) ?? 'celý den'}`);
  return NextResponse.json({ ok: true });
}
