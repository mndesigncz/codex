import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { normalizujPravidlaDyska, normalizujPravidlaPriplatku } from '@/lib/dochazkaPrehled';
import { nactiPravidla } from '../_spolecne';

// Pravidla výplat podniku (kolo 8, R8-1): jak se dělí dýško, příplatky za víkend / noc / svátek, hranice
// odvodů z DPP a zda lidé vidí svůj podíl na dýšku. Mění je, kdo smí měnit sazby (finance.sazby_upravit) —
// stejný klíč jako prémie: pravidla výplat jsou zápis do mezd, samotné finance.mzdy je jen na čtení.
// Dýško platí od zvoleného dne (platiOd): starší měsíce se nepřepočítají potichu.

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

export async function GET() {
  const c = await pozaduj('dochazka.zobrazit');
  if (jeOdpoved(c)) return c;
  const p = await nactiPravidla(c.teamId);
  return NextResponse.json({ dysko: p.dysko, priplatky: p.priplatky, showTipsToStaff: p.showTipsToStaff, hraniceOdvodu: p.hraniceOdvodu });
}

export async function PUT(req: NextRequest) {
  const c = await pozaduj('finance.sazby_upravit');
  if (jeOdpoved(c)) return c;
  const b = await req.json().catch(() => ({}));
  if (!b || typeof b !== 'object') return NextResponse.json({ error: 'Neplatné tělo požadavku.' }, { status: 400 });
  const zmeny: string[] = [];
  try {
    if (b.dysko !== undefined) {
      if (!b.dysko || typeof b.dysko !== 'object') return NextResponse.json({ error: 'Pravidla dýška mají nečekaný tvar.' }, { status: 400 });
      // `vylouceni` se neukládá — server ho odvozuje z rolí podle „Dělit i s vedením"; `platiOd` je povinné, ať je jasné, odkdy.
      const d = normalizujPravidlaDyska(b.dysko);
      if (!d.platiOd) return NextResponse.json({ error: 'Vyplň, od kterého dne pravidlo dýška platí.' }, { status: 400 });
      const ulozit = { metoda: d.metoda, vahy: d.vahy, sVedenim: d.sVedenim, platiOd: d.platiOd };
      await sql`UPDATE teams SET tip_rules = ${JSON.stringify(ulozit)}::jsonb WHERE id = ${c.teamId}`;
      zmeny.push(`dýško: ${d.metoda}${d.sVedenim ? ' i s vedením' : ''} od ${d.platiOd}`);
    }
    if (b.priplatky !== undefined || b.hraniceOdvodu !== undefined) {
      const dosud = await nactiPravidla(c.teamId);
      const p = b.priplatky !== undefined ? normalizujPravidlaPriplatku(b.priplatky) : dosud.priplatky;
      let hranice: number | null = dosud.hraniceOdvodu;
      if (b.hraniceOdvodu !== undefined) {
        if (b.hraniceOdvodu === null || b.hraniceOdvodu === '') hranice = null;
        else {
          const h = Math.round(Number(b.hraniceOdvodu));
          if (!Number.isFinite(h) || h < 0 || h > 10_000_000) return NextResponse.json({ error: 'Hranice odvodů musí být částka od nuly.' }, { status: 400 });
          hranice = h || null;
        }
      }
      await sql`UPDATE teams SET pay_rules = ${JSON.stringify({ ...p, hraniceOdvodu: hranice })}::jsonb WHERE id = ${c.teamId}`;
      zmeny.push(`příplatky: So/Ne ${p.vikend ? p.vikendPct : 0} %, noc ${p.noc ? p.nocPct : 0} % (${p.nocOd}–${p.nocDo}), svátek ${p.svatek ? p.svatekPct : 0} %${hranice ? `, hranice odvodů ${hranice}` : ''}`);
    }
    if (typeof b.showTipsToStaff === 'boolean') {
      await sql`UPDATE teams SET show_tips_to_staff = ${b.showTipsToStaff} WHERE id = ${c.teamId}`;
      zmeny.push(`dýško lidem: ${b.showTipsToStaff ? 'zapnuto' : 'vypnuto'}`);
    }
  } catch {
    return NextResponse.json({ error: 'Pravidla se nepodařilo uložit — databáze ještě není připravená.' }, { status: 503 });
  }
  if (!zmeny.length) return NextResponse.json({ error: 'Není co uložit.' }, { status: 400 });
  await audit(c.teamId, c.meId, 'vyplata.pravidla', 'team', c.teamId, zmeny.join(' · '));
  const p = await nactiPravidla(c.teamId);
  return NextResponse.json({ ok: true, dysko: p.dysko, priplatky: p.priplatky, showTipsToStaff: p.showTipsToStaff, hraniceOdvodu: p.hraniceOdvodu });
}
