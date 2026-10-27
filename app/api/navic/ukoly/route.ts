import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { typNaUcet } from '@/lib/opravneni';
import { audit } from '@/lib/audit';
import { pragueToday } from '@/lib/pragueTime';
import { limitNabidkyVycerpan, seradUkoly, stavUkolu, terminNabidky, urcenoPro, type NabidkaNavic, type UkolNavic } from '@/lib/navic';
import { kdoJednaNavic, obsazenostTerminu, predMigraci, tvarNabidky } from '../_spolecne';

// Volitelné úkoly za body (kolo 11): nabídka navíc s opakováním a kapacitou.
//
// GET  ?day=RRRR-MM-DD&actingAs=          → { ukoly: UkolNavic[], den, smi }
//      úkoly, které se dají ten den (výchozí dnes) vzít, určené volajícímu (na tabletu
//      vybranému člověku), s jeho stavem, obsazeností a kdo je má vzaté / hotové.
// GET  ?scope=team&day=                   → totéž pro vedení (navic.zobrazit_tym): všechny
//      úkoly dne bez ohledu na „komu", stav vůči volajícímu.
// POST { offerId, akce: 'vzit' | 'vratit', day?, actingAs? }
//      „Beru si" zabere úkol v termínu (ať ho nedělají dva), „Vrátit" ho uvolní.
//      Splnění = POST /api/navic s offerId (zábor se tím označí jako hotový).

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);
const chyba = (text: string, status: number) => NextResponse.json({ error: text }, { status });
const DEN = /^\d{4}-\d{2}-\d{2}$/;

async function nactiNabidky(teamId: number, id: number | null = null): Promise<NabidkaNavic[]> {
  const rows = await sql`
    SELECT id, title, description, points, bonus_czk, auto_approve, active, valid_from, valid_to, max_per_day,
      recurrence, rec_days, rec_interval, capacity, require_photo, target_users, created_at
    FROM extra_offers
    WHERE team_id = ${teamId} AND archived_at IS NULL AND active = TRUE AND (${id}::int IS NULL OR id = ${id})
    ORDER BY points DESC, title ASC`;
  return rows.map(tvarNabidky);
}

async function ukolPro(teamId: number, n: NabidkaNavic, termin: string, userId: number): Promise<UkolNavic> {
  const obs = await obsazenostTerminu(teamId, n, termin);
  const zapisy = obs.zapisy.get(userId) ?? [];
  const kdo: UkolNavic['kdo'] = [];
  const lide = new Set<number>([...obs.zabory.keys(), ...[...obs.zapisy].filter(([, z]) => z.some(x => x.status !== 'odmitnuto')).map(([id]) => id)]);
  for (const id of lide) kdo.push({ userId: id, name: obs.jmena.get(id) ?? '', stav: obs.zabory.get(id) === 'vzato' ? 'vzato' : 'hotovo' });
  const platne = zapisy.filter(z => z.status !== 'odmitnuto');
  return {
    nabidka: n, termin, obsazeno: obs.obsazeno,
    stav: stavUkolu({ zapisy, vzato: obs.zabory.get(userId) === 'vzato', obsazeno: obs.obsazeno, capacity: n.capacity, maxPerDay: n.maxPerDay }),
    mojeZapisy: platne.length,
    workId: zapisy.length ? zapisy[zapisy.length - 1].id : null,
    kdo,
  };
}

export async function GET(req: NextRequest) {
  const c = await pozaduj(['navic.zapsat', 'navic.zobrazit_tym']);
  if (jeOdpoved(c)) return c;
  const q = req.nextUrl.searchParams;
  const smiTym = c.role.opravneni.has('navic.zobrazit_tym');
  const smi = { zapsat: c.role.opravneni.has('navic.zapsat'), nabidka: c.role.opravneni.has('navic.nabidka'), tym: smiTym };
  const tym = q.get('scope') === 'team' && smiTym;
  const den = DEN.test(q.get('day') ?? '') ? q.get('day')! : pragueToday();
  const kdo = await kdoJednaNavic(c, q.get('actingAs'), req);
  try {
    const nabidky = (await nactiNabidky(c.teamId)).filter(n => tym || urcenoPro(n, kdo));
    const ukoly: UkolNavic[] = [];
    for (const n of nabidky) {
      const termin = terminNabidky(n, den);
      if (!termin) continue;
      ukoly.push(await ukolPro(c.teamId, n, termin, kdo));
    }
    return NextResponse.json({ ukoly: seradUkoly(ukoly), den, smi });
  } catch (e) {
    if (predMigraci(e)) return NextResponse.json({ ukoly: [], den, smi });
    console.error('navic/ukoly GET', e);
    return chyba('Úkoly za body se nenačetly.', 500);
  }
}

export async function POST(req: NextRequest) {
  const c = await pozaduj('navic.zapsat');
  if (jeOdpoved(c)) return c;
  let b: any;
  try { b = await req.json(); } catch { return chyba('Neplatný požadavek.', 400); }
  const offerId = Number(b?.offerId);
  if (!Number.isInteger(offerId) || offerId <= 0) return chyba('Neplatný úkol.', 400);
  const akce = b?.akce;
  if (akce !== 'vzit' && akce !== 'vratit') return chyba('Neznámá akce.', 400);
  const den = DEN.test(b?.day ?? '') ? b.day : pragueToday();
  const kdo = await kdoJednaNavic(c, b?.actingAs, req);
  // Tablet nesmí zabrat úkol sám za sebe — jen za vybraného člověka.
  if (typNaUcet(c.role.typ) === 'kiosk' && kdo === c.meId) return chyba('Vyber, kdo jsi.', 403);
  try {
    const [n] = await nactiNabidky(c.teamId, offerId);
    if (!n) return chyba('Úkol už v nabídce není.', 404);
    const termin = terminNabidky(n, den);
    if (!termin) return chyba('Tenhle úkol se dnes dělat nedá.', 400);
    if (!urcenoPro(n, kdo)) return chyba('Tenhle úkol je určený jiným lidem.', 403);
    if (akce === 'vzit') {
      const obs = await obsazenostTerminu(c.teamId, n, termin);
      const moje = (obs.zapisy.get(kdo) ?? []).map(x => ({ offerId: n.id, status: x.status }));
      if (limitNabidkyVycerpan(n, moje)) return chyba('Tohle už máš v tomhle termínu splněné.', 409);
      if (obs.zabory.get(kdo) !== 'vzato') {
        if (n.capacity != null && obs.obsazeno >= n.capacity && !obs.zabory.has(kdo)) {
          const jmena = [...obs.zabory.keys()].map(id => obs.jmena.get(id)).filter(Boolean).slice(0, 3).join(', ');
          return chyba(jmena ? `Úkol už mají vzatý: ${jmena}.` : 'Úkol už je obsazený.', 409);
        }
        await sql`
          INSERT INTO extra_claims (team_id, offer_id, termin, user_id, status, updated_at)
          VALUES (${c.teamId}, ${n.id}, ${termin}, ${kdo}, 'vzato', NOW())
          ON CONFLICT (offer_id, termin, user_id) DO UPDATE SET status = 'vzato', work_id = NULL, updated_at = NOW()`;
        audit(c.teamId, c.meId, 'navic.ukol.vzit', 'extra_offer', n.id, `${n.title} · ${termin}${kdo !== c.meId ? ` · za #${kdo}` : ''}`);
      }
    } else {
      const done = await sql`
        UPDATE extra_claims SET status = 'vraceno', updated_at = NOW()
        WHERE team_id = ${c.teamId} AND offer_id = ${n.id} AND termin = ${termin} AND user_id = ${kdo} AND status = 'vzato'
        RETURNING id`;
      if (done.length) audit(c.teamId, c.meId, 'navic.ukol.vratit', 'extra_offer', n.id, `${n.title} · ${termin}`);
    }
    return NextResponse.json({ ok: true, ukol: await ukolPro(c.teamId, n, termin, kdo) });
  } catch (e) {
    if (predMigraci(e)) return chyba('Úkoly za body se ještě připravují. Zkus to za chvíli znovu.', 503);
    console.error('navic/ukoly POST', e);
    return chyba('Úkol se nepodařilo uložit.', 500);
  }
}
