import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { clenovePodniku } from '@/lib/tenant';
import { dayPlus, pragueToday } from '@/lib/pragueTime';
import { spropitneZaObdobi, rozeberZaznam, denZaznamu, normalizujSmlouvu, type UzaverkaSpropitne, type ZaznamDochazky } from '@/lib/dochazkaPrehled';
import { idsZeSmeny, nactiPravidla, nactiZamky, pozicePodniku, rozmeziZDotazu } from './_spolecne';

// Výplaty (kolo 8, R8-1): co o výplatě ví jen server.
//
// Hodiny, mzdu a prémie si klient počítá z GET /api/attendance (lib/dochazkaPrehled) jako dosud. Tady je
// to, co klient neměl jak sečíst: výplaty z kasy po lidech (cash_closings.self_payout — /api/closings je vrací
// jen tomu, kdo vidí všechny uzávěrky), označené výplaty (payroll_payments), zamčená období, smlouvy a odpracované
// hodiny letos (strop DPP) a pravidla podniku. Majitel tak na konci měsíce nevyplatí dvakrát, co už odešlo z kasy.
//
//   GET /api/payroll?od&do        vedení (dochazka.zobrazit); peníze jen s finance.mzdy
//   GET /api/payroll?od&do&ja=1   zaměstnanec (finance.moje_mzda): vlastní z kasy, výplaty, zámky a — když to
//                                 podnik zapnul — podíl na dýšku spočítaný tady stejnou funkcí jako u vedení
//                                 (cizí hodiny ani uzávěrky klientovi nejdou)

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

interface RadekZKasy { id: number; created_by: number; den: string; castka: number; kdo: string | null }

/** „Moje výplata dnes" z hlavních uzávěrek v období — vyplaceno z kasy i bokem je vyplaceno. */
async function vyplatyZKasy(teamId: number, od: string, doD: string, jen?: number): Promise<RadekZKasy[]> {
  try {
    const rows = jen == null
      ? await sql`
          SELECT cc.id, cc.created_by, COALESCE(cc.shift_date, cc.date) AS den, cc.self_payout, u.name AS kdo
          FROM cash_closings cc LEFT JOIN users u ON u.id = cc.created_by
          WHERE cc.team_id = ${teamId} AND cc.self_payout > 0 AND cc.covered_by IS NULL
            AND COALESCE(cc.shift_date, cc.date) >= ${od} AND COALESCE(cc.shift_date, cc.date) <= ${doD}
          ORDER BY den DESC`
      : await sql`
          SELECT cc.id, cc.created_by, COALESCE(cc.shift_date, cc.date) AS den, cc.self_payout, u.name AS kdo
          FROM cash_closings cc LEFT JOIN users u ON u.id = cc.created_by
          WHERE cc.team_id = ${teamId} AND cc.created_by = ${jen} AND cc.self_payout > 0 AND cc.covered_by IS NULL
            AND COALESCE(cc.shift_date, cc.date) >= ${od} AND COALESCE(cc.shift_date, cc.date) <= ${doD}
          ORDER BY den DESC`;
    return (rows as any[]).map(r => ({ id: Number(r.id), created_by: Number(r.created_by), den: String(r.den).slice(0, 10), castka: Math.round(Number(r.self_payout) || 0), kdo: r.kdo ?? null }));
  } catch { return []; }
}

interface RadekVyplaty { id: number; user_id: number; amount: number; method: string | null; paidAt: string; od: string; do: string; note: string | null }

/** Označené výplaty, jejichž období zasahuje do <od, do>. */
async function oznaceneVyplaty(teamId: number, od: string, doD: string, jen?: number): Promise<RadekVyplaty[]> {
  try {
    const rows = jen == null
      ? await sql`
          SELECT id, user_id, amount, method, paid_at, period_from, period_to, note FROM payroll_payments
          WHERE team_id = ${teamId} AND period_from <= ${doD} AND period_to >= ${od}
          ORDER BY paid_at DESC, id DESC`
      : await sql`
          SELECT id, user_id, amount, method, paid_at, period_from, period_to, note FROM payroll_payments
          WHERE team_id = ${teamId} AND user_id = ${jen} AND period_from <= ${doD} AND period_to >= ${od}
          ORDER BY paid_at DESC, id DESC`;
    return (rows as any[]).map(r => ({ id: Number(r.id), user_id: Number(r.user_id), amount: Math.round(Number(r.amount) || 0), method: r.method ?? null, paidAt: String(r.paid_at), od: String(r.period_from), do: String(r.period_to), note: r.note ?? null }));
  } catch { return []; }
}

/** Odpracováno letos po lidech (ms): uzavřené záznamy do 24 h od 1. ledna (pražský rok dne `do`). */
async function hodinyLetos(teamId: number, rok: string): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  try {
    const rows = await sql`
      SELECT employee_id, SUM(EXTRACT(EPOCH FROM (clock_out - clock_in))) AS s FROM time_entries
      WHERE team_id = ${teamId} AND clock_out IS NOT NULL
        AND clock_in >= (${`${rok}-01-01 00:00`}::timestamp - INTERVAL '2 hours')
        AND clock_out - clock_in < INTERVAL '24 hours'
      GROUP BY employee_id`;
    for (const r of rows as any[]) m.set(String(r.employee_id), Math.round((Number(r.s) || 0) * 1000));
  } catch { /* před migrací */ }
  return m;
}

export async function GET(req: NextRequest) {
  const c = await pozaduj(null);
  if (jeOdpoved(c)) return c;
  const opr = c.role.opravneni;
  const { searchParams } = new URL(req.url);
  const r = rozmeziZDotazu(searchParams);
  if (!r) return NextResponse.json({ error: 'Neplatné období (od–do, nejvýš 400 dní).' }, { status: 400 });
  const ja = searchParams.get('ja') === '1';
  const pravidla = await nactiPravidla(c.teamId);

  if (ja) {
    // Vlastní výplata (Můj výdělek): kdo smí znát svou mzdu. Tablet je sdílená obrazovka — nic.
    if (c.role.typ === 'kiosk' || !(opr.has('finance.moje_mzda') || opr.has('finance.mzdy'))) {
      return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
    }
    const zKasy = await vyplatyZKasy(c.teamId, r.od, r.do, c.meId);
    // Historie výplat a zámků za posledních šest měsíců — pás měsíců v Mém výdělku.
    const odHistorie = `${dayPlus(r.od, -150).slice(0, 7)}-01`;
    const vyplaty = await oznaceneVyplaty(c.teamId, odHistorie, r.do, c.meId);
    const zamky = await nactiZamky(c.teamId, odHistorie, r.do);
    // Podíl na dýšku jen, když to podnik zapnul („Ukázat lidem jejich dýško") — stejná funkce jako u vedení,
    // ale ven jde jen vlastní podíl a vlastní hodiny: cizí hodiny ani tržby klientovi nejdou.
    let spropitne: number | null = null;
    let spropitnePoDnech: { den: string; castka: number; mojeMs: number; smenaMs: number }[] = [];
    if (pravidla.showTipsToStaff || opr.has('finance.mzdy')) {
      try {
        const uz = await sql`
          SELECT id, date, shift_date, created_by, covered_by, tips, shift_employees FROM cash_closings
          WHERE team_id = ${c.teamId} AND covered_by IS NULL
            AND COALESCE(shift_date, date) >= ${r.od} AND COALESCE(shift_date, date) <= ${r.do}`;
        const entries = await sql`
          SELECT id, employee_id AS "employeeId", clock_in AS "clockIn", clock_out AS "clockOut" FROM time_entries
          WHERE team_id = ${c.teamId}
            AND clock_in >= (${`${dayPlus(r.od, -1)} 00:00`}::timestamp) AND clock_in < (${`${dayPlus(r.do, 2)} 00:00`}::timestamp)`;
        const closings: UzaverkaSpropitne[] = (uz as any[]).map(x => ({
          date: String(x.date), shift_date: x.shift_date ?? null, created_by: x.created_by, covered_by: x.covered_by,
          tips: Number(x.tips) || 0, shiftEmployees: idsZeSmeny(x.shift_employees).map(id => ({ id })),
        }));
        const zaznamy = entries as ZaznamDochazky[];
        const ted = Date.now();
        const sp = spropitneZaObdobi(closings, zaznamy, ted, r.od, r.do, [], { pravidla: pravidla.dysko, pozice: await pozicePodniku(c.teamId) });
        spropitne = Math.round(sp.poLidech.get(String(c.meId)) ?? 0);
        const mojeMs = new Map<string, number>(), smenaMs = new Map<string, number>();
        for (const e of zaznamy) {
          const den = denZaznamu(e);
          if (!den) continue;
          const ms = rozeberZaznam(e, ted).ms;
          smenaMs.set(den, (smenaMs.get(den) ?? 0) + ms);
          if (Number(e.employeeId) === c.meId) mojeMs.set(den, (mojeMs.get(den) ?? 0) + ms);
        }
        for (const [klic, castka] of sp.poDnech) {
          const [den, id] = klic.split('|');
          if (Number(id) !== c.meId || castka <= 0) continue;
          spropitnePoDnech.push({ den, castka: Math.round(castka), mojeMs: mojeMs.get(den) ?? 0, smenaMs: smenaMs.get(den) ?? 0 });
        }
        spropitnePoDnech.sort((a, b) => b.den.localeCompare(a.den));
      } catch { spropitne = null; spropitnePoDnech = []; }
    }
    return NextResponse.json({
      od: r.od, do: r.do,
      ja: {
        zKasy: zKasy.reduce((a, x) => a + x.castka, 0), zKasyPocet: zKasy.length,
        uzaverky: zKasy.map(x => ({ id: x.id, den: x.den, castka: x.castka, kdo: x.kdo })),
        vyplaty: vyplaty.map(({ user_id: _u, ...v }) => v),
        spropitne, spropitnePoDnech,
      },
      zamky,
      pravidla: { priplatky: pravidla.priplatky, showTipsToStaff: pravidla.showTipsToStaff },
    });
  }

  if (!opr.has('dochazka.zobrazit')) return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  const vidiMzdy = opr.has('finance.mzdy');
  const lide = await clenovePodniku(c.teamId);
  const smlouvy = new Map<string, { typ: string | null; limit: number | null }>();
  try {
    const rows = await sql`SELECT user_id, contract_type, contract_hours_year FROM team_members WHERE team_id = ${c.teamId}`;
    for (const x of rows as any[]) smlouvy.set(String(x.user_id), { typ: x.contract_type ?? null, limit: x.contract_hours_year != null ? Number(x.contract_hours_year) : null });
  } catch { /* před migrací */ }
  const letos = await hodinyLetos(c.teamId, (r.do > pragueToday() ? pragueToday() : r.do).slice(0, 4));
  const zKasy = vidiMzdy ? await vyplatyZKasy(c.teamId, r.od, r.do) : [];
  const vyplaty = vidiMzdy ? await oznaceneVyplaty(c.teamId, r.od, r.do) : [];
  const zamky = await nactiZamky(c.teamId, r.od, r.do);
  const out = lide.map(l => {
    const id = String(l.id);
    const moje = zKasy.filter(x => x.created_by === l.id);
    const v = vyplaty.filter(x => x.user_id === l.id);
    const s = smlouvy.get(id);
    return {
      id: l.id, name: l.name, avatar: l.avatar, jobTitle: l.jobTitle, role: l.role,
      contractType: normalizujSmlouvu(s?.typ), contractHoursYear: s?.limit ?? null,
      hodinyLetosMs: letos.get(id) ?? 0,
      zKasy: vidiMzdy ? moje.reduce((a, x) => a + x.castka, 0) : null, zKasyPocet: moje.length,
      uzaverky: moje.map(x => ({ id: x.id, den: x.den, castka: x.castka, kdo: x.kdo })),
      vyplaceno: vidiMzdy ? v.reduce((a, x) => a + x.amount, 0) : null,
      vyplaty: v.map(({ user_id: _u, ...x }) => x),
    };
  });
  return NextResponse.json({
    od: r.od, do: r.do, lide: out, zamky, vidiMzdy, payDailyCash: pravidla.payDailyCash,
    pravidla: { dysko: pravidla.dysko, priplatky: pravidla.priplatky, showTipsToStaff: pravidla.showTipsToStaff, hraniceOdvodu: pravidla.hraniceOdvodu },
  });
}
