// Ztráty a manka ze skladu: co inventura našla proti tomu, co systém čekal.
//
// Evidenční stav je teoretický — vzniká z příjmů a z odpisů podle receptur.
// Skutečnost zná jedině inventura. Rozdíl mezi nimi je odpad, rozlití, chyba
// v receptuře nebo krádež; tenhle endpoint ho pojmenuje v jednotkách i v
// korunách a dá ho do poměru k tomu, kolik se za období opravdu prodalo —
// 0,5 l chybějící vodky je u dvou lahví jiný příběh než u dvaceti.

import { NextRequest, NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { pozaduj, jeOdpoved } from '@/lib/opravneniDb';
import { menaPodniku } from '@/lib/menaPodniku';
import { historieZtrat, rozdilyInventury, souhrnZtrat, type ZtrataInventury } from '@/lib/skladPrehled';

export const dynamic = 'force-dynamic';

const sql = neon(process.env.DATABASE_URL!);

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** Kolik posledních dokončených inventur vrací `?history=1` (vývoj ztrát ve widgetu a v Inventuře). */
const HISTORIE = 6;

export interface ShrinkRow {
  itemId: number;
  name: string;
  category: string | null;
  unit: string;
  contentUnit: string | null;
  /** Rozdíl v celých baleních (spočítáno − evidence). */
  qtyDiff: number;
  /** Rozdíl v načatém balení, v obsahových jednotkách. */
  openDiff: number | null;
  /** Celkový rozdíl v obsahu (u balení) nebo v kusech. */
  diff: number;
  diffUnit: string;
  /** Kolik se toho za období podle receptur odepsalo z prodeje. */
  sold: number | null;
  /** Podíl ztráty na tom, co se prodalo. */
  lossPct: number | null;
  /** Hodnota rozdílu v měně podniku; záporná = chybí. */
  value: number | null;
}

// Kolo 67: `finance.ztraty` — ztráty v Kč jsou peníze a nepřímo podezření na
// krádež. Dřív rozhodovala role z tokenu (vedení), teď oprávnění v aktivním
// podniku z databáze.
export async function GET(req: NextRequest) {
  const c = await pozaduj('finance.ztraty');
  if (jeOdpoved(c)) return c;
  const teamId = c.teamId;
  // Rady ukazují částky v měně podniku (osm podporovaných měn), ne natvrdo v korunách.
  const mena = await menaPodniku(teamId);

  const params = new URL(req.url).searchParams;
  const idParam = params.get('id');
  const wantId = idParam ? parseInt(idParam) : null;
  if (idParam != null && !Number.isFinite(wantId)) return NextResponse.json({ error: 'Neplatné ID' }, { status: 400 });

  // ?history=1 (kolo 7): k poslední (nebo vybrané) inventuře i čistý rozdíl a ztráty
  // posledních šesti dokončených — jeden dotaz nad stocktakes a stejný výpočet jako
  // pro jednu inventuru (lib/skladPrehled). Poměr k prodeji se v řadě nepočítá
  // (šest dotazů do inventory_log navíc by za to nestálo).
  let history: ZtrataInventury[] | undefined;
  if (params.get('history') === '1') {
    try {
      const posledni = await sql`
        SELECT id, completed_at, data FROM stocktakes
        WHERE team_id = ${teamId} AND status = 'done' AND completed_at IS NOT NULL
        ORDER BY completed_at DESC LIMIT ${HISTORIE}`;
      history = historieZtrat(posledni as any[]);
    } catch { history = []; }
  }

  let take: any;
  try {
    const rows = wantId
      ? await sql`SELECT * FROM stocktakes WHERE id = ${wantId} AND team_id = ${teamId} AND status = 'done'`
      : await sql`SELECT * FROM stocktakes WHERE team_id = ${teamId} AND status = 'done'
                  ORDER BY completed_at DESC LIMIT 1`;
    take = rows[0];
  } catch {
    return NextResponse.json({ ready: false, reason: 'notMigrated', ...(history ? { history: [] } : {}) });
  }
  if (!take) return NextResponse.json({ ready: false, reason: 'noStocktake', ...(history ? { history } : {}) });

  const [prev] = await sql`
    SELECT id, completed_at FROM stocktakes
    WHERE team_id = ${teamId} AND status = 'done' AND completed_at < ${take.completed_at}
    ORDER BY completed_at DESC LIMIT 1`;

  const { radky: rozdily, polozek, spocitano } = rozdilyInventury(take.data);

  // Kolik se mezi inventurami odepsalo z prodeje — teoretická spotřeba.
  const soldById = new Map<number, number>();
  try {
    // Spotřeba jednoho pohybu = (ubylé kusy × balení) + (ubylo z načatého).
    // Počítat oba členy zvlášť by nešlo: když odpis načne další balení, kus
    // ubude a načaté naopak naroste — 0,04 l vodky by se tak vykázalo jako
    // celá lahev. Proto se sčítá až výsledek řádku.
    const logs = await sql`
      SELECT l.item_id AS "itemId",
             SUM(GREATEST(
               (l.old_quantity - l.new_quantity) * COALESCE(NULLIF(i.package_size, 0), 1)
               + COALESCE(l.old_open, 0) - COALESCE(l.new_open, 0), 0))::float AS "out"
      FROM inventory_log l
      JOIN inventory_items i ON i.id = l.item_id
      WHERE i.team_id = ${teamId}
        AND l.note = 'Prodej (Storyous)'
        AND l.created_at <= ${take.completed_at}
        AND (${prev?.completed_at ?? null}::timestamp IS NULL OR l.created_at > ${prev?.completed_at ?? null}::timestamp)
      GROUP BY l.item_id`;
    for (const l of logs as any[]) {
      soldById.set(Number(l.itemId), r3(Math.max(0, Number(l.out) || 0)));
    }
  } catch { /* bez historie prostě nebude poměr */ }

  // Rozdíly a jejich hodnota z lib/skladPrehled (stejný výpočet jako řada `history`);
  // tady jen přibude, kolik se za období odepsalo z prodeje.
  const rows: ShrinkRow[] = rozdily.map(r => {
    const sold = soldById.get(r.itemId) ?? null;
    return { ...r, sold, lossPct: sold && sold > 0 && r.diff < 0 ? Math.round((-r.diff / sold) * 100) : null };
  });

  rows.sort((a, b) => (a.value ?? 0) - (b.value ?? 0));

  const missing = rows.filter(r => r.diff < 0);
  const surplus = rows.filter(r => r.diff > 0);
  const { lostValue, surplusValue, netValue } = souhrnZtrat(rows);   // lostValue záporné
  const noPrice = rows.filter(r => r.value == null).map(r => r.name);

  const insights: { icon: string; title: string; text: string; tone: 'good' | 'warn' | 'info' }[] = [];

  if (!rows.length) {
    insights.push({
      icon: 'check', tone: 'good',
      title: 'Sklad sedí',
      text: 'Spočítané položky odpovídají evidenci. Buď se nic neztrácí, nebo se dobře odepisuje — tak jako tak dobrá zpráva.',
    });
  } else {
    if (lostValue < 0) {
      insights.push({
        icon: 'warning',
        // Práh dva tisíce korun přepočtený na měnu podniku — 2 000 € by byla hrůza, ne varování.
        tone: -lostValue > mena.prah(2000) ? 'warn' : 'info',
        title: `Chybí zboží za ${mena.money(Math.abs(lostValue))}`,
        text: `${missing.length} položek je ve skutečnosti méně, než systém čekal. Typicky odpad, rozlití, chybějící receptura nebo neevidovaný odpis. Projdi je odshora — první tři dělají většinu částky.`,
      });
    }
    if (surplusValue > 0) {
      insights.push({
        icon: 'box', tone: 'info',
        title: `Přebývá zboží za ${mena.money(surplusValue)}`,
        text: `${surplus.length} položek je víc, než systém čekal. Nejčastěji nezapsaný příjem objednávky, nebo receptura, která odepisuje víc, než se opravdu používá.`,
      });
    }
    const worstRate = missing.filter(r => r.lossPct != null && r.lossPct >= 10)
      .sort((a, b) => (b.lossPct ?? 0) - (a.lossPct ?? 0))[0];
    if (worstRate) {
      insights.push({
        icon: 'warning', tone: 'warn',
        title: `${worstRate.name}: ztráta ${worstRate.lossPct} % z prodaného`,
        text: `Za období se z ní odepsalo ${worstRate.sold} ${worstRate.diffUnit}, ale chybí navíc ${Math.abs(worstRate.diff)} ${worstRate.diffUnit}. Takhle vysoký podíl bývá špatná gramáž v receptuře nebo systematické přelévání.`,
      });
    }
    if (noPrice.length) {
      insights.push({
        icon: 'coins', tone: 'info',
        title: `${noPrice.length} položek nemá cenu`,
        text: `U ${noPrice.slice(0, 4).join(', ')}${noPrice.length > 4 ? ' a dalších' : ''} neumíme rozdíl přepočítat na peníze. Doplň cenu za balení ve skladu.`,
      });
    }
  }

  const uncounted = polozek - spocitano;
  if (uncounted > 0) {
    insights.push({
      icon: 'bulb', tone: 'info',
      title: `${uncounted} položek se nepočítalo`,
      text: 'Nespočítané položky do ztrát nevstupují — čísla níž platí jen pro to, co se opravdu přepočítalo.',
    });
  }

  return NextResponse.json({
    ready: true,
    stocktake: { id: take.id, completedAt: take.completed_at, items: polozek, counted: spocitano },
    since: prev?.completed_at ?? null,
    totals: {
      lostValue,
      surplusValue,
      netValue,
      missing: missing.length,
      surplus: surplus.length,
    },
    rows: rows.slice(0, 60),
    insights,
    // Od nejstarší po nejnovější; jen s ?history=1.
    ...(history ? { history } : {}),
  });
}
