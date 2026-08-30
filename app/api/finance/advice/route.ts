// Doporučení a pozorování — co s čísly udělat, ne jen co ukazují.
//
// Přehled financí říká, kolik se vydělalo. Tenhle endpoint říká, co s tím.
// Každé pozorování má tři části: čím je doložené, co to znamená, a co s tím
// udělat. Kde to jde, je u toho i částka — „slabý čtvrtek stojí 12 400 Kč
// měsíčně" se čte jinak než „čtvrtky jsou slabší".
//
// Dvě pravidla, která tohle drží použitelné:
//
//   1. Nic se nedomýšlí. Když k závěru chybí data (nepřipojená pokladna,
//      produkt bez receptury, položka bez ceny balení), řekne se to jako
//      pozorování — slepé místo je taky informace, jen se z něj neradí.
//   2. Nic se neopakuje. Doporučení bez čísla, které by se dalo napsat
//      jakémukoli podniku, sem nepatří.
//
// Počítá se z naší databáze, ne z pokladny: měsíc dozadu už máme v pos_sales
// a cash_closings, takže se nemusí stahovat tisíce účtenek kvůli jedné radě.

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { neon } from '@neondatabase/serverless';
import { cashDifference } from '@/lib/closing';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const sql = neon(process.env.DATABASE_URL!);

/** Do jakého okna doporučení patří. Podle toho se skládají podokna ve Financích. */
export type AdviceGroup = 'revenue' | 'products' | 'people' | 'stock';

interface Advice {
  group: AdviceGroup;
  tone: 'good' | 'warn' | 'info';
  icon: string;
  title: string;
  /** Co se stalo a proč to tak je. */
  text: string;
  /** Co s tím. Prázdné u pozorování, ke kterým se nedá nic doporučit. */
  action?: string;
  /** Kolik je to ročně/měsíčně v korunách, když to jde spočítat. */
  impact?: number;
  /** Kolik korun, dní nebo kusů stojí za tvrzením — ať je vidět, odkud to je. */
  evidence?: string;
}

const czk = (n: number) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`;
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const num = (v: any) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const WEEKDAYS = ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'];

/** Poslední den měsíce jako 'YYYY-MM-DD' a první den následujícího. */
function monthRange(month: string) {
  const from = `${month}-01`;
  const d = new Date(from + 'T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + 1);
  const till = d.toISOString().slice(0, 10);
  const prev = new Date(from + 'T12:00:00Z');
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  return { from, till, prevMonth: prev.toISOString().slice(0, 7) };
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as any).role !== 'employer') {
    return NextResponse.json({ error: 'Nedostatečná oprávnění' }, { status: 403 });
  }
  const meId = parseInt((session.user as any).id);
  const [u] = await sql`SELECT team_id FROM users WHERE id = ${meId}`;
  if (!u?.team_id) return NextResponse.json({ error: 'Bez týmu' }, { status: 400 });
  const teamId = u.team_id as number;

  const month = String(new URL(req.url).searchParams.get('month') ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) return NextResponse.json({ error: 'Neplatný měsíc' }, { status: 400 });
  const { from, till, prevMonth } = monthRange(month);
  const prevRange = monthRange(prevMonth);

  const out: Advice[] = [];
  /** Co jsme chtěli spočítat a nešlo to. Slepá místa se přiznávají. */
  const blind: string[] = [];
  const add = (a: Advice) => { out.push(a); };

  // ---------------------------------------------------------------- tržby --
  let revenue = 0, prevRevenue = 0, cash = 0, card = 0, tips = 0, customers = 0;
  let diffSum = 0, diffAbs = 0, closingCount = 0;
  const byDay = new Map<string, number>();
  const byWeekday = new Map<number, { total: number; n: number }>();
  try {
    const rows = await sql`
      SELECT * FROM cash_closings
      WHERE team_id = ${teamId} AND COALESCE(shift_date, date) >= ${from}
        AND COALESCE(shift_date, date) < ${till} AND covered_by IS NULL`;
    for (const c of rows as any[]) {
      closingCount++;
      const day = String(c.shift_date || c.date);
      const rev = num(c.cash_revenue) + num(c.card_revenue);
      revenue += rev; cash += num(c.cash_revenue); card += num(c.card_revenue);
      tips += num(c.tips); customers += num(c.customers);
      byDay.set(day, (byDay.get(day) ?? 0) + rev);
      const wd = new Date(day + 'T12:00:00Z').getUTCDay();
      const b = byWeekday.get(wd) ?? { total: 0, n: 0 };
      b.total += rev; b.n++; byWeekday.set(wd, b);
      const d = cashDifference(c as any);
      diffSum += d; diffAbs += Math.abs(d);
    }
    const prev = await sql`
      SELECT COALESCE(SUM(cash_revenue + card_revenue), 0)::int AS rev
      FROM cash_closings
      WHERE team_id = ${teamId} AND COALESCE(shift_date, date) >= ${prevRange.from}
        AND COALESCE(shift_date, date) < ${prevRange.till} AND covered_by IS NULL`;
    prevRevenue = num((prev as any[])[0]?.rev);
  } catch { blind.push('Uzávěrky se nepodařilo načíst, takže tržby v doporučeních chybí.'); }

  if (closingCount === 0) {
    add({
      group: 'revenue', tone: 'info', icon: 'clipboard',
      title: 'Za tenhle měsíc nejsou uzávěrky',
      text: 'Bez uzávěrek se nedá spočítat tržba ani nic, co z ní vychází — podíl mezd, marže, trend.',
      action: 'Doplň uzávěrky za odpracované dny; pak se doporučení objeví sama.',
    });
  }

  if (prevRevenue > 0 && revenue > 0) {
    const delta = revenue - prevRevenue;
    const p = Math.round((delta / prevRevenue) * 100);
    add({
      group: 'revenue', tone: p >= 0 ? 'good' : 'warn', icon: 'trend',
      title: `Tržby ${p >= 0 ? '+' : ''}${p} % proti minulému měsíci`,
      text: `${czk(revenue)} proti ${czk(prevRevenue)}, rozdíl ${delta >= 0 ? '+' : ''}${czk(delta)}.`,
      action: p >= 0
        ? 'Podívej se níž, který den a který produkt růst táhne, a zopakuj to.'
        : 'Nejdřív zjisti, jestli klesl počet hostů, nebo útrata na hosta — každé se řeší jinak.',
      impact: Math.abs(delta),
    });
  }

  // Průměrná útrata — jestli klesla tržba, tohle řekne proč.
  if (customers > 0 && revenue > 0) {
    let prevAvg: number | null = null;
    try {
      const [p] = await sql`
        SELECT COALESCE(SUM(cash_revenue + card_revenue), 0)::int AS rev,
               COALESCE(SUM(customers), 0)::int AS cust
        FROM cash_closings
        WHERE team_id = ${teamId} AND COALESCE(shift_date, date) >= ${prevRange.from}
          AND COALESCE(shift_date, date) < ${prevRange.till} AND covered_by IS NULL`;
      if (num(p?.cust) > 0) prevAvg = num(p.rev) / num(p.cust);
    } catch { /* nepodstatné */ }
    const avg = revenue / customers;
    const line = `${customers.toLocaleString('cs-CZ')} hostů, průměrná útrata ${czk(avg)}.`;
    if (prevAvg != null && prevAvg > 0) {
      const dp = Math.round(((avg - prevAvg) / prevAvg) * 100);
      add({
        group: 'revenue', tone: dp >= 0 ? 'good' : 'warn', icon: 'coins',
        title: `Útrata na hosta ${dp >= 0 ? '+' : ''}${dp} % (${czk(avg)})`,
        text: `${line} Minulý měsíc ${czk(prevAvg)}.`,
        action: dp < 0
          ? 'Klesající útrata se zvedá nabídkou k objednávce — druhý nálev, zákusek k čaji, větší balení domů. Zkus to nejdřív u nejprodávanější položky.'
          : 'Vyšší útrata na hosta je nejlevnější růst — nestojí víc hostů ani víc lidí na směně.',
        evidence: line,
      });
    } else {
      add({
        group: 'revenue', tone: 'info', icon: 'coins',
        title: `Průměrná útrata ${czk(avg)}`,
        text: line,
        action: 'Až bude na porovnání druhý měsíc, uvidíš, jestli roste útrata, nebo jen počet hostů.',
      });
    }
  }

  // Nejslabší a nejsilnější den v týdnu, a co stojí ten rozdíl.
  const wk = Array.from(byWeekday.entries()).filter(([, v]) => v.n >= 2)
    .map(([wd, v]) => ({ wd, avg: v.total / v.n, n: v.n }))
    .sort((a, b) => a.avg - b.avg);
  if (wk.length >= 3) {
    const worst = wk[0], best = wk[wk.length - 1];
    const median = wk[Math.floor(wk.length / 2)].avg;
    if (best.avg > 0 && worst.avg < median * 0.8) {
      const gap = Math.round((median - worst.avg) * worst.n);
      add({
        group: 'revenue', tone: 'info', icon: 'calendar',
        title: `${WEEKDAYS[worst.wd][0].toUpperCase()}${WEEKDAYS[worst.wd].slice(1)} táhne dolů — Ø ${czk(worst.avg)}`,
        text: `Nejsilnější ${WEEKDAYS[best.wd]} dělá Ø ${czk(best.avg)}, medián dne je ${czk(median)}. Kdyby ${WEEKDAYS[worst.wd]} dosáhla mediánu, je to ${czk(gap)} navíc za měsíc.`,
        action: `Slabý den unese kratší směnu (ušetří mzdy) nebo důvod přijít — ochutnávka, sleva na druhý nálev, tematický večer. Zkus jedno a porovnej za měsíc.`,
        impact: gap,
        evidence: `${worst.n}× ${WEEKDAYS[worst.wd]} v měsíci`,
      });
    }
  }

  // Vývoj uvnitř měsíce — první polovina proti druhé.
  if (byDay.size >= 8) {
    const days = Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const half = Math.floor(days.length / 2);
    const a1 = days.slice(0, half).reduce((s, [, v]) => s + v, 0) / half;
    const a2 = days.slice(half).reduce((s, [, v]) => s + v, 0) / (days.length - half);
    if (a1 > 0) {
      const dp = Math.round(((a2 - a1) / a1) * 100);
      if (Math.abs(dp) >= 12) {
        add({
          group: 'revenue', tone: dp >= 0 ? 'good' : 'warn', icon: 'trend',
          title: `Uvnitř měsíce ${dp >= 0 ? 'to roste' : 'to klesá'} o ${Math.abs(dp)} %`,
          text: `První polovina Ø ${czk(a1)} na den, druhá Ø ${czk(a2)}.`,
          action: dp >= 0
            ? 'Zjisti, co se ve druhé půlce změnilo — a udrž to i příští měsíc.'
            : 'Propad uvnitř měsíce bývá sezóna, počasí nebo vyprodaná položka. Zkontroluj, jestli něco delší dobu nechybělo ve skladu.',
        });
      }
    }
  }

  // Poměr hotovost / karta a poplatky za terminál.
  if (revenue > 0 && card > 0) {
    const share = pct(card, revenue);
    const fee = Math.round(card * 0.012);
    add({
      group: 'revenue', tone: 'info', icon: 'clipboard',
      title: `Kartou ${share} % tržeb (${czk(card)})`,
      text: share > 60
        ? `Při sazbě kolem 1,2 % to znamená zhruba ${czk(fee)} měsíčně na poplatcích, ${czk(fee * 12)} ročně.`
        : `Hotovost ${czk(cash)}, karta ${czk(card)} — poměr je zdravý.`,
      action: share > 60
        ? 'U takového objemu jde sazba obvykle vyjednat níž. Vyžádej si nabídku od dvou poskytovatelů a ukaž ji tomu stávajícímu.'
        : undefined,
      impact: share > 60 ? fee * 12 : undefined,
    });
  }

  if (revenue > 0 && tips > 0) {
    add({
      group: 'revenue', tone: 'good', icon: 'award',
      title: `Spropitné ${czk(tips)} — ${pct(tips, revenue)} % tržby`,
      text: 'Spropitné je nejrychlejší zpětná vazba na obsluhu, jakou máš.',
      action: 'Ukaž číslo týmu a propiš ho do odměn — co se měří a vidí, to roste.',
    });
  }

  if (diffAbs > 200) {
    add({
      group: 'people', tone: 'warn', icon: 'warning',
      title: `Rozdíly v kase ±${czk(diffAbs)} za měsíc`,
      text: `Součet rozdílů je ${diffSum >= 0 ? '+' : ''}${czk(diffSum)}. Když se přebytky a manka vyrovnávají, jde spíš o nepřesné počítání než o ztrátu.`,
      action: 'Zapni v uzávěrce počítání po bankovkách — většina rozdílů zmizí, protože se přestane počítat z hlavy.',
      impact: diffAbs,
    });
  }

  // ------------------------------------------------------------ produkty --
  let soldNow = new Map<string, { name: string; qty: number }>();
  let soldPrev = new Map<string, number>();
  try {
    for (const r of await sql`
      SELECT product_id, product_name, SUM(qty)::float AS qty FROM pos_sales
      WHERE team_id = ${teamId} AND date >= ${from} AND date < ${till}
      GROUP BY product_id, product_name` as any[]) {
      soldNow.set(String(r.product_id), { name: r.product_name ?? String(r.product_id), qty: num(r.qty) });
    }
    for (const r of await sql`
      SELECT product_id, SUM(qty)::float AS qty FROM pos_sales
      WHERE team_id = ${teamId} AND date >= ${prevRange.from} AND date < ${prevRange.till}
      GROUP BY product_id` as any[]) {
      soldPrev.set(String(r.product_id), num(r.qty));
    }
  } catch { blind.push('Prodeje po produktech se nepodařilo načíst.'); }

  if (soldNow.size === 0) {
    add({
      group: 'products', tone: 'info', icon: 'box',
      title: 'Prodeje po produktech zatím nejsou',
      text: 'Bez nich se nedá říct, co vydělává a co jen zabírá místo v menu.',
      action: 'Připoj pokladnu v Nastavení — prodeje se pak stahují každou noc samy.',
    });
  } else {
    const all = Array.from(soldNow.entries()).map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.qty - a.qty);
    const totalQty = all.reduce((s, p) => s + p.qty, 0);

    const top5 = all.slice(0, 5);
    const top5Share = pct(top5.reduce((s, p) => s + p.qty, 0), totalQty);
    add({
      group: 'products', tone: top5Share > 70 ? 'warn' : 'info', icon: 'box',
      title: `Pět nejprodávanějších dělá ${top5Share} % prodejů`,
      text: `${top5.map(p => `${p.name} (${Math.round(p.qty)}×)`).join(', ')}. Celkem se prodalo ${Math.round(totalQty).toLocaleString('cs-CZ')} kusů z ${all.length} položek.`,
      action: top5Share > 70
        ? 'Takhle úzká špička je zranitelná — když jedna položka vypadne, spadne tržba. Zkontroluj u těchhle pěti zásobu napřed a měj u každé náhradu.'
        : 'U těchhle pěti se nejvíc vyplatí hlídat marži: procento navíc tady vydělá víc než kdekoli jinde.',
    });

    // Co roste a co padá proti minulému měsíci.
    if (soldPrev.size > 0) {
      const moves = all
        .filter(p => (soldPrev.get(p.id) ?? 0) >= 3 || p.qty >= 3)
        .map(p => {
          const was = soldPrev.get(p.id) ?? 0;
          return { ...p, was, delta: p.qty - was, rel: was > 0 ? (p.qty - was) / was : 1 };
        })
        .filter(p => Math.abs(p.delta) >= 3);
      const risers = [...moves].sort((a, b) => b.delta - a.delta).slice(0, 3).filter(p => p.delta > 0);
      const fallers = [...moves].sort((a, b) => a.delta - b.delta).slice(0, 3).filter(p => p.delta < 0);
      if (risers.length) {
        add({
          group: 'products', tone: 'good', icon: 'trend',
          title: `Nejvíc roste ${risers[0].name}`,
          text: risers.map(p => `${p.name} ${Math.round(p.was)}→${Math.round(p.qty)}×`).join(', ') + '.',
          action: 'Dej rostoucí položku na viditelné místo v menu a hlídej u ní zásobu — růst se nejsnáz zabije tím, že dojde.',
        });
      }
      if (fallers.length) {
        add({
          group: 'products', tone: 'warn', icon: 'trend',
          title: `Nejvíc padá ${fallers[0].name}`,
          text: fallers.map(p => `${p.name} ${Math.round(p.was)}→${Math.round(p.qty)}×`).join(', ') + '.',
          action: 'Propad má obvykle jednu ze tří příčin: došla surovina, zdražilo se, nebo to zmizelo z očí. Projdi je v tomhle pořadí.',
        });
      }
    }

    // Položky, které se skoro neprodávají.
    const slow = all.filter(p => p.qty > 0 && p.qty <= 2);
    if (slow.length >= 3) {
      add({
        group: 'products', tone: 'info', icon: 'box',
        title: `${slow.length} položek se za měsíc prodalo nejvýš dvakrát`,
        text: `Například ${slow.slice(0, 5).map(p => p.name).join(', ')}.`,
        action: 'Každá taková položka drží suroviny, prodlužuje menu a zdržuje hosta u výběru. Vyřaď je, nebo z nich udělej sezónní nabídku mimo stálý lístek.',
      });
    }

    // Prodeje bez receptury — slepé místo v marži.
    try {
      const mapped = new Set<string>();
      for (const r of await sql`SELECT DISTINCT product_id FROM pos_product_map WHERE team_id = ${teamId}` as any[]) {
        mapped.add(String(r.product_id));
      }
      const unmapped = all.filter(p => !mapped.has(p.id));
      const unmappedQty = unmapped.reduce((s, p) => s + p.qty, 0);
      if (unmapped.length && totalQty > 0) {
        const share = pct(unmappedQty, totalQty);
        add({
          group: 'products', tone: share > 30 ? 'warn' : 'info', icon: 'warning',
          title: `${share} % prodejů nemá recepturu`,
          text: `${unmapped.length} položek se prodává, ale neví se, co stojí — mezi nimi ${unmapped.slice(0, 4).map(p => p.name).join(', ')}. U nich se nedá spočítat marže ani odepsat sklad.`,
          action: 'Dodělej receptury aspoň u nejprodávanějších z nich. Každá zaplněná receptura zpřesní marži i stav skladu naráz.',
          evidence: `${Math.round(unmappedQty).toLocaleString('cs-CZ')} kusů bez receptury`,
        });
      }
    } catch { /* tabulka ještě není */ }
  }

  // ------------------------------------------------------ lidé a provoz --
  let workedMin = 0, wageCost = 0;
  const workedByPerson = new Map<string, { min: number; cost: number }>();
  try {
    for (const r of await sql`
      SELECT u.name, u.hourly_rate,
             EXTRACT(EPOCH FROM (te.clock_out - te.clock_in)) AS secs
      FROM time_entries te JOIN users u ON u.id = te.employee_id
      WHERE te.team_id = ${teamId} AND te.clock_out IS NOT NULL
        AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') >= ${from}
        AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') < ${till}` as any[]) {
      const min = num(r.secs) / 60;
      const cost = (min / 60) * num(r.hourly_rate);
      workedMin += min; wageCost += cost;
      const cur = workedByPerson.get(r.name) ?? { min: 0, cost: 0 };
      cur.min += min; cur.cost += cost;
      workedByPerson.set(r.name, cur);
    }
  } catch { blind.push('Docházku se nepodařilo načíst, takže mzdové náklady v doporučeních chybí.'); }

  // Čeština skloňuje podle počtu: 1 minuta, 2–4 minuty, 5+ minut. „1 minut"
  // v jinak pečlivém textu okamžitě prozradí, že ho psal stroj.
  const plural = (n: number, one: string, few: string, many: string) =>
    `${n} ${n === 1 ? one : n >= 2 && n <= 4 ? few : many}`;
  const workedLabel = workedMin >= 60
    ? plural(Math.round(workedMin / 60), 'hodina', 'hodiny', 'hodin')
    : plural(Math.round(workedMin), 'minuta', 'minuty', 'minut');
  if (workedMin > 0 && wageCost === 0) {
    add({
      group: 'people', tone: 'warn', icon: 'users',
      title: 'U zaměstnanců není hodinová sazba',
      text: `V docházce je za měsíc ${workedLabel}, ale bez sazby se z toho nedá spočítat mzdový náklad ani podíl na tržbě.`,
      action: 'Doplň hodinovou sazbu v profilu každého člena týmu. Je to jedno číslo a odemkne celý blok doporučení k provozu.',
    });
  }

  if (revenue > 0 && wageCost > 0) {
    let target = 30;
    try {
      const [t] = await sql`SELECT labor_target_pct FROM teams WHERE id = ${teamId}`;
      if (num(t?.labor_target_pct) > 0) target = num(t.labor_target_pct);
    } catch { /* nepodstatné */ }
    const share = pct(wageCost, revenue);
    const over = Math.round(wageCost - revenue * (target / 100));
    add({
      group: 'people', tone: share <= target ? 'good' : 'warn', icon: 'users',
      title: `Mzdy jsou ${share} % tržeb (cíl ${target} %)`,
      text: share <= target
        ? `${czk(wageCost)} na ${czk(revenue)} tržby — pod cílem.`
        : `${czk(wageCost)} na ${czk(revenue)} tržby. Nad cíl to je o ${czk(over)} měsíčně, ${czk(over * 12)} ročně.`,
      action: share <= target
        ? undefined
        : 'Nejlevnější úspora není propouštění, ale zkrácení překryvu ve slabých hodinách. Porovnej rozvrh se špičkami v přehledu pokladny.',
      impact: share > target ? over * 12 : undefined,
    });

    const perHour = revenue / (workedMin / 60);
    add({
      group: 'people', tone: 'info', icon: 'clock',
      title: `Každá odpracovaná hodina vydělá ${czk(perHour)}`,
      text: `${Math.round(workedMin / 60).toLocaleString('cs-CZ')} hodin na ${czk(revenue)} tržby.`,
      action: 'Tohle je číslo, které se hlídá líp než celkové mzdy — roste, i když přidáš lidi, pokud je dáš na správné hodiny.',
    });
  }

  // Kdo odpracoval nejvíc hodin — přetížení se pozná dřív než z výpovědi.
  if (workedByPerson.size >= 2) {
    const list = Array.from(workedByPerson.entries())
      .map(([name, v]) => ({ name, hours: v.min / 60 })).sort((a, b) => b.hours - a.hours);
    const top = list[0], bottom = list[list.length - 1];
    if (top.hours > 0 && bottom.hours / top.hours < 0.5 && top.hours >= 60) {
      add({
        group: 'people', tone: 'warn', icon: 'users',
        title: `${top.name} odpracoval/a ${Math.round(top.hours)} h, nejmíň ${bottom.name} ${Math.round(bottom.hours)} h`,
        text: 'Takhle nerovnoměrné rozdělení bývá první krok k vyhoření toho, kdo drží provoz.',
        action: 'Projdi rozvrh na příští měsíc a zkus rozdíl srovnat — i kdyby jen o pár směn.',
      });
    }
  }

  // Dny, kdy se pracovalo bez uzávěrky.
  try {
    const [g] = await sql`
      SELECT COUNT(DISTINCT to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD'))::int AS days
      FROM time_entries te
      WHERE te.team_id = ${teamId}
        -- Pár minut není směna, jen omylem píchnutý příchod. Bez téhle
        -- hranice by appka hlásila chybějící uzávěrku za den, kdy se
        -- nepracovalo.
        AND (te.clock_out IS NULL OR te.clock_out - te.clock_in >= INTERVAL '30 minutes')
        AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') >= ${from}
        AND to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD') < ${till}
        AND NOT EXISTS (
          SELECT 1 FROM cash_closings cc
          WHERE cc.team_id = ${teamId}
            AND COALESCE(cc.shift_date, cc.date) = to_char((te.clock_in AT TIME ZONE 'UTC') AT TIME ZONE 'Europe/Prague', 'YYYY-MM-DD'))`;
    const missing = num(g?.days);
    if (missing > 0) {
      add({
        group: 'people', tone: 'warn', icon: 'clipboard',
        title: `${missing} ${missing === 1 ? 'den' : missing < 5 ? 'dny' : 'dní'} se pracovalo bez uzávěrky`,
        text: 'Za ty dny nevíš, kolik se protočilo ani jestli kasa seděla — a chybí i v každém součtu výš.',
        action: 'Doplň je zpětně v Uzávěrkách; kalendář ukazuje, které dny to jsou.',
      });
    }
  } catch { /* nepodstatné */ }

  // ------------------------------------------------------ nákup a sklad --
  let purchases = 0;
  const bySupplier = new Map<string, number>();
  try {
    for (const r of await sql`
      SELECT supplier, total_cost FROM orders
      WHERE team_id = ${teamId} AND status = 'received'
        AND to_char(COALESCE(received_at, created_at), 'YYYY-MM') = ${month}` as any[]) {
      const amt = num(r.total_cost);
      purchases += amt;
      const s = String(r.supplier ?? 'Bez dodavatele');
      bySupplier.set(s, (bySupplier.get(s) ?? 0) + amt);
    }
    for (const r of await sql`
      SELECT supplier, amount FROM receipts
      WHERE team_id = ${teamId} AND to_char(created_at, 'YYYY-MM') = ${month}` as any[]) {
      const amt = num(r.amount);
      purchases += amt;
      const s = String(r.supplier ?? 'Bez dodavatele');
      bySupplier.set(s, (bySupplier.get(s) ?? 0) + amt);
    }
  } catch { blind.push('Nákupy se nepodařilo načíst.'); }

  if (revenue > 0 && purchases > 0) {
    const share = pct(purchases, revenue);
    add({
      group: 'stock', tone: share > 40 ? 'warn' : 'good', icon: 'box',
      title: `Nákupy jsou ${share} % tržeb (${czk(purchases)})`,
      text: share > 40
        ? 'Nad čtyřicet procent bývá buď drahý nákup, nebo se hodně vyhazuje.'
        : 'Podíl nákupů je v pásmu, které se u podniku tvého typu čeká.',
      action: share > 40
        ? 'Porovnej to s odpisy a poslední inventurou — když se rozcházejí, ztrácí se to mezi skladem a kasou, ne u dodavatele.'
        : undefined,
    });
  }

  const topSup = Array.from(bySupplier.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topSup && purchases > 0 && topSup[1] / purchases > 0.5 && topSup[1] > 2000) {
    const savings = Math.round(topSup[1] * 0.05);
    add({
      group: 'stock', tone: 'info', icon: 'box',
      title: `${pct(topSup[1], purchases)} % nákupů jde přes „${topSup[0]}"`,
      text: `Za měsíc ${czk(topSup[1])}. U takového objemu se dá vyjednávat.`,
      action: 'Zeptej se na množstevní slevu. I pět procent je u tohohle objemu znát — a stojí to jeden e-mail.',
      impact: savings * 12,
    });
  }

  // Sklad, který leží.
  try {
    const items = await sql`
      SELECT name, quantity::float AS qty, unit_cost, low_stock
      FROM inventory_items WHERE team_id = ${teamId} AND (approved IS NULL OR approved = TRUE)`;
    let stockValue = 0;
    const noCost: string[] = [];
    for (const i of items as any[]) {
      const c = num(i.unit_cost);
      if (c <= 0) { if (num(i.qty) > 0) noCost.push(i.name); continue; }
      stockValue += Math.max(0, num(i.qty)) * c;
    }
    if (stockValue > 0 && revenue > 0 && stockValue > revenue * 0.4) {
      add({
        group: 'stock', tone: 'warn', icon: 'box',
        title: `Ve skladu leží ${czk(stockValue)} — ${pct(stockValue, revenue)} % měsíční tržby`,
        text: 'Zboží ve skladu jsou peníze, které nepracují, a u čaje i zboží, které stárne.',
        action: 'Objednávej menší dávky častěji. Ušetřené peníze pak nejsou vidět ve výsledku, ale v tom, že ti nechybí na nájem.',
        impact: Math.round(stockValue - revenue * 0.4),
      });
    }
    if (noCost.length >= 3) {
      add({
        group: 'stock', tone: 'info', icon: 'warning',
        title: `${noCost.length} položek skladu nemá cenu`,
        text: `Bez ceny se nedá spočítat hodnota skladu ani marže receptur, které je používají — třeba ${noCost.slice(0, 4).join(', ')}.`,
        action: 'Doplň u nich cenu balení a velikost balení. Je to nejrychlejší způsob, jak zpřesnit celý blok marží.',
      });
    }
  } catch { /* nepodstatné */ }

  // Seřazeno tak, aby nahoře bylo to, co stojí nejvíc peněz.
  const order = { warn: 0, info: 1, good: 2 } as const;
  out.sort((a, b) => (order[a.tone] - order[b.tone]) || ((b.impact ?? 0) - (a.impact ?? 0)));

  return NextResponse.json({
    month, prevMonth,
    advice: out,
    blind,
    counts: {
      revenue: out.filter(a => a.group === 'revenue').length,
      products: out.filter(a => a.group === 'products').length,
      people: out.filter(a => a.group === 'people').length,
      stock: out.filter(a => a.group === 'stock').length,
    },
  });
}
