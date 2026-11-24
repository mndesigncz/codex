// Nastavení účetní podniku: e-mail, automatický měsíční e-mail (3. den za minulý měsíc),
// přiložit výplaty a zneplatnění všech vydaných odkazů.
//
// GET i PATCH: finance.exportovat. Výplaty k automatu smí ZAPNOUT jen finance.mzdy
// (vypnout smí každý, kdo nastavení mění — ubrat údaje je vždycky bezpečné).
// Kdo nemá finance.mzdy a ZMĚNÍ e-mail účetní, tím zároveň vypne přikládání výplat:
// jinak by si mohl přesměrovat automatický e-mail s výplatami na svou adresu
// (odpověď to řekne příznakem `vyplatyVypnuty`).
// PATCH { email?, auto?, mzdy?, zneplatnit?: true }

import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { audit } from '@/lib/audit';
import { normalizujEmail, vypadaJakoEmail } from '@/lib/emailAdresa';
import { nactiPodnik } from '@/lib/ucetniExportDb';
import { DEN_AUTOMATU } from '@/lib/ucetniExport';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

async function odpoved(teamId: number, smiMzdy: boolean, vyplatyVypnuty = false) {
  const p = await nactiPodnik(teamId);
  if (!p) return NextResponse.json({ error: 'Podnik nenalezen.' }, { status: 404 });
  return NextResponse.json({ email: p.email ?? '', auto: p.auto, mzdy: p.mzdy, posledni: p.posledni, denAutomatu: DEN_AUTOMATU, smiMzdy, ico: p.ico, dic: p.dic, vyplatyVypnuty });
}

export async function GET() {
  const c = await pozaduj('finance.exportovat');
  if (jeOdpoved(c)) return c;
  return odpoved(c.teamId, c.role.opravneni.has('finance.mzdy'));
}

export async function PATCH(req: Request) {
  const c = await pozaduj('finance.exportovat');
  if (jeOdpoved(c)) return c;
  const smiMzdy = c.role.opravneni.has('finance.mzdy');
  const b = await req.json().catch(() => ({}));
  const zmeny: string[] = [];
  let vyplatyVypnuty = false;
  try {
    if (b?.email !== undefined) {
      const email = b.email == null || b.email === '' ? null : normalizujEmail(b.email);
      if (email && !vypadaJakoEmail(email)) return NextResponse.json({ error: 'Zadej platný e-mail účetní, třeba ucetni@firma.cz.' }, { status: 400 });
      if (smiMzdy) {
        await sql`UPDATE teams SET accountant_email = ${email} WHERE id = ${c.teamId}`;
      } else {
        // Bez finance.mzdy: změna adresy vypne výplaty v témž příkazu (žádné okno mezi dvěma UPDATE).
        const [r] = await sql`
          UPDATE teams t SET accountant_email = ${email},
            accountant_payroll = CASE WHEN t.accountant_email IS DISTINCT FROM ${email} THEN FALSE ELSE t.accountant_payroll END
          FROM (SELECT accountant_payroll AS pred, accountant_email AS predEmail FROM teams WHERE id = ${c.teamId}) p
          WHERE t.id = ${c.teamId}
          RETURNING p.pred = TRUE AND p.predEmail IS DISTINCT FROM ${email} AS vypnuto` as any[];
        vyplatyVypnuty = r?.vypnuto === true;
      }
      zmeny.push(email ? 'e-mail' : 'e-mail smazán'); // i18n-ok (detail auditu)
      if (vyplatyVypnuty) zmeny.push('bez výplat (e-mail změnil někdo bez práva na mzdy)'); // i18n-ok (detail auditu)
    }
    if (b?.auto !== undefined) {
      const auto = b.auto === true;
      if (auto) {
        const [t] = await sql`SELECT accountant_email FROM teams WHERE id = ${c.teamId}`;
        if (!t?.accountant_email && !(typeof b.email === 'string' && b.email)) return NextResponse.json({ error: 'Pro automatické posílání nejdřív vyplň e-mail účetní.' }, { status: 400 });
      }
      await sql`UPDATE teams SET accountant_auto = ${auto} WHERE id = ${c.teamId}`;
      zmeny.push(auto ? 'automaticky zapnuto' : 'automaticky vypnuto'); // i18n-ok
    }
    if (b?.mzdy !== undefined) {
      const mzdy = b.mzdy === true;
      if (mzdy && !smiMzdy) return NextResponse.json({ error: 'Výplaty smí k podkladům přidat jen ten, kdo vidí mzdy.' }, { status: 403 });
      await sql`UPDATE teams SET accountant_payroll = ${mzdy} WHERE id = ${c.teamId}`;
      zmeny.push(mzdy ? 's výplatami' : 'bez výplat'); // i18n-ok
    }
    if (b?.zneplatnit === true) {
      await sql`UPDATE teams SET accountant_link_ver = COALESCE(accountant_link_ver, 1) + 1 WHERE id = ${c.teamId}`;
      audit(c.teamId, c.meId, 'ucetni.zneplatneno', 'team', c.teamId);
    }
  } catch (e) {
    console.error('ucetni/nastaveni', e);
    return NextResponse.json({ error: 'Nastavení se nepodařilo uložit. Zkus to za chvíli znovu.' }, { status: 503 });
  }
  if (zmeny.length) audit(c.teamId, c.meId, 'ucetni.nastaveni', 'team', c.teamId, zmeny.join(' · '));
  return odpoved(c.teamId, smiMzdy, vyplatyVypnuty);
}
