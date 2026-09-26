// Kolo 69, balík B5b (Finance, tržby, TO GO, Všechny podniky) — jednotkové testy.
//
// Čistá logika widgetů je v lib/financeWidgety.ts: výběr dat z odpovědí API,
// období, podíl mezd, Kam šly peníze, kasa proti uzávěrkám a přehled
// organizace. Hlídá se hlavně to, co se dřív pokazilo: nuly místo skrytých
// mezd a tržeb (API posílá `mzdySkryte` a null, UI z toho dělalo „0 Kč"),
// období podle hodin prohlížeče a dnešek počítaný jako „den bez uzávěrky".
// K tomu katalog a stránky balíku (hotové widgety, oprávnění N2, ikony,
// aktivní stránky) a pár pojistek nad zdrojáky (žádné čtení mimo
// useDataWidgetu, žádná limetka ve widgetu, žádná ruční okna).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import type { Divak } from '../../lib/widgety/typy.ts';
import {
  obdobiPokladny, dnyObdobi, mesiceObdobi, vyberDenniPokladnu, kasaProtiUzaverkam, vyberKalendarTrzeb,
  vyberFinance, podilMezd, kamSlyPenize, mzdyMesice, zmenaProti, vyberPrehled, potrebujePozornost, type DenPokladny,
} from '../../lib/financeWidgety.ts';
import { mesicZVolby, WIDGETY as FINANCE } from '../../lib/widgety/katalog/finance.ts';
import { WIDGETY as TRZBY } from '../../lib/widgety/katalog/trzby.ts';
import { WIDGETY as ORGANIZACE } from '../../lib/widgety/katalog/organizace.ts';
import { KATALOG_WIDGETU } from '../../lib/widgety/katalog/index.ts';
import { stranka } from '../../lib/widgety/stranky/index.ts';
import { vyresRozlozeni } from '../../lib/widgety/rozlozeni.ts';
import { KATALOG, SYSTEMOVE_ROLE } from '../../lib/opravneni.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Kód bez komentářů — komentáře popisují, co se opravilo („dřív confirm()"), a pojistky by chytaly je. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*)/.test(r)).join('\n');

const den = (x: Partial<DenPokladny>): DenPokladny => ({
  day: '2026-09-20', bills: 10, cash: 1000, card: 1000, other: 0, total: 2000, tips: 0, refundCount: 0, refundTotal: 0,
  closings: 1, declared: 2000, diff: 0, ...x,
});

const financeRaw = (summary: Record<string, unknown> = {}, x: Record<string, unknown> = {}) => ({
  month: '2026-09',
  summary: { revenue: 100000, prevRevenue: 80000, purchases: 20000, wagesCash: 5000, wagesWorked: 30000, gross: 50000, stockValue: 12000, laborTargetPct: 28, mzdySkryte: false, ...summary },
  guest: { orders: 3 },
  ledger: [
    { date: '2026-09-02', kind: 'receipt', label: 'Makro', amount: 1200 },
    { date: '2026-09-03', kind: 'order', label: 'Objednávka — Monin', amount: 800 },
    { date: '2026-09-04', kind: 'expense', label: 'Výdaj z kasy', amount: 300 },
    { date: '2026-09-05', kind: 'wage', label: 'Denní výplata', amount: 5000 },
  ],
  insights: [{ icon: 'trend', title: 'Tržby +25 %', text: '…', tone: 'good' }, { title: 'Bez tónu' }, { text: 'bez titulku' }],
  ...x,
});

export default function ({ eq, ok }: Testy) {
  const dnes = '2026-09-26';

  // ---- měsíc stránky a období ----
  eq('měsíc: „Tento" = měsíc stránky, „Minulý" o jeden zpět, i přes přelom roku',
    [mesicZVolby('tento', '2026-08'), mesicZVolby('minuly', '2026-08'), mesicZVolby('minuly', '2026-01')], ['2026-08', '2026-07', '2025-12']);
  eq('měsíc: neznámá volba (uložená z budoucí verze) = tento', mesicZVolby('podle_hvezd', '2026-09'), '2026-09');
  eq('období: dnes, včera, 7 a 30 dní, měsíc — v zadaném pražském dni',
    ['dnes', 'vcera', '7_dni', '30_dni', 'tento_mesic', 'mesic', 'nesmysl'].map(o => { const x = obdobiPokladny(o, dnes); return `${x.from}..${x.to}`; }),
    ['2026-09-26..2026-09-26', '2026-09-25..2026-09-25', '2026-09-20..2026-09-26', '2026-08-28..2026-09-26', '2026-09-01..2026-09-26', '2026-09-01..2026-09-26', '2026-09-26..2026-09-26']);
  eq('období: dny včetně krajů, přes konec měsíce a přechod času', [dnyObdobi('2026-10-24', '2026-10-27'), dnyObdobi('2026-09-30', '2026-10-01').length],
    [['2026-10-24', '2026-10-25', '2026-10-26', '2026-10-27'], 2]);
  eq('období: měsíce pro kalendář uzávěrek (jeden nebo dva)', [mesiceObdobi('2026-09-01', '2026-09-26'), mesiceObdobi('2026-08-28', '2026-09-26')], [['2026-09'], ['2026-08', '2026-09']]);

  // ---- pokladna ----
  eq('pokladna: nepropojená je platná odpověď (propojeno: false), ne chyba', vyberDenniPokladnu({ connected: false }).propojeno, false);
  let hodila = false; try { vyberDenniPokladnu(null); } catch { hodila = true; }
  ok('pokladna: nečekaný tvar je chyba widgetu, ne nuly', hodila);
  const p = vyberDenniPokladnu({
    connected: true, totals: { total: '1500', bills: 3, methods: [{ id: 'meal', label: 'Stravenky', amount: 200 }] },
    days: [{ day: '2026-09-25', total: 1500, declared: null, diff: null }], items: [{ name: 'Latte', qty: 2, revenue: null }],
    notes: [{ tone: 'warn', title: 'Chybí cena', text: 'Latte' }, { tone: 'ošklivý', title: 'x' }],
  });
  eq('pokladna: čísla, způsoby platby, položka bez ceny = null (ne 0), neznámý tón poznámky = info',
    [p.soucty.total, p.soucty.methods[0].label, p.polozky[0].revenue, p.dny[0].declared, p.poznamky.map(x => x.tone)], [1500, 'Stravenky', null, null, ['warn', 'info']]);

  const k = kasaProtiUzaverkam([
    den({ day: '2026-09-22', diff: 20 }),                          // pod prahem
    den({ day: '2026-09-23', diff: -180 }),                        // manko
    den({ day: '2026-09-24', closings: 0, declared: null, diff: null }), // tržba bez uzávěrky
    den({ day: '2026-09-26', closings: 0, declared: null, diff: null }), // dnešek — uzávěrka teprve bude
  ], 50, dnes);
  eq('kasa: dny mimo práh, dny bez uzávěrky, dnešek se nepočítá, čistý rozdíl jen z uzávěrek',
    [k.mimo.map(x => x.day), k.bezUzaverky.map(x => x.day), k.cisty, k.vse.map(x => x.day)],
    [['2026-09-23'], ['2026-09-24'], -160, ['2026-09-24', '2026-09-23']]);

  eq('kalendář uzávěrek: tržby po dnech', vyberKalendarTrzeb({ days: { '2026-09-01': { revenue: 5000 }, '2026-09-02': { onShift: [] } } }), { '2026-09-01': 5000 });
  let jenVlastni = false; try { vyberKalendarTrzeb({ days: {}, selfOnly: true }); } catch { jenVlastni = true; }
  ok('kalendář uzávěrek: jen vlastní uzávěrky (bez tržeb) = chyba, ne nulový graf', jenVlastni);

  // ---- finance ----
  const f = vyberFinance(financeRaw());
  eq('finance: mzdy = víc z docházky × sazby a denních výplat', mzdyMesice(f), 30000);
  eq('finance: podíl mezd proti cíli podniku', podilMezd(f), { podil: 30, cil: 28, nadCilem: true });
  eq('finance: bez cíle si ho widget nevymýšlí', podilMezd(vyberFinance(financeRaw({ laborTargetPct: null }))), { podil: 30, cil: null, nadCilem: null });
  eq('finance: skryté mzdy (role bez finance.mzdy) → žádný podíl, ne „0 %"', podilMezd(vyberFinance(financeRaw({ mzdySkryte: true, wagesCash: 0, wagesWorked: 0 }))), null);
  eq('finance: bez tržeb žádný podíl (dělení nulou)', podilMezd(vyberFinance(financeRaw({ revenue: 0 }))), null);
  eq('finance: Kam šly peníze — nákupy (účtenky + objednávky), kasa, mzdy; nejvyšší = 100 %',
    kamSlyPenize(f).map(x => [x.klic, x.castka, x.pct]), [['nakupy', 2000, 7], ['kasa', 300, 2], ['mzdy', 30000, 100]]);
  eq('finance: Kam šly peníze bez mezd, když je role nevidí', kamSlyPenize(vyberFinance(financeRaw({ mzdySkryte: true }))).map(x => x.klic), ['nakupy', 'kasa']);
  eq('finance: postřehy bez titulku vypadnou, neznámý tón = info', f.postrehy.map(x => [x.title, x.tone]), [['Tržby +25 %', 'good'], ['Bez tónu', 'info']]);
  eq('finance: změna proti minulému měsíci; bez minulého null', [zmenaProti(100000, 80000), zmenaProti(5, 0)], [25, null]);
  let bezSouhrnu = false; try { vyberFinance({ ledger: [] }); } catch { bezSouhrnu = true; }
  ok('finance: odpověď bez souhrnu je chyba, ne nulový souhrn', bezSouhrnu);

  // ---- organizace ----
  eq('organizace: vypnutý přehled je platná odpověď s důvodem', vyberPrehled({ available: false, reason: 'vypnuto', message: 'Vypnuto.' }),
    { dostupny: false, duvod: 'vypnuto', zprava: 'Vypnuto.', mesic: '', organizace: null, podniky: [], celkem: null });
  const o = vyberPrehled({
    available: true, month: '2026-09', organization: { name: 'Moje kavárny' },
    teams: [{ teamId: 1, name: 'Vinohrady', currency: 'CZK', revenue: null, wages: 5000, missingClosings: 0, stockAlerts: 0 },
      { teamId: 2, name: 'Karlín', currency: 'CZK', revenue: 90000, wages: null, missingClosings: 2 }],
    total: { currency: 'CZK', revenue: null, wages: null, missingClosings: 2 },
  });
  eq('organizace: tržby a mzdy bez oprávnění zůstávají null (dřív „0 Kč")', [o.podniky[0].revenue, o.podniky[1].wages, o.celkem?.revenue], [null, null, null]);
  eq('organizace: kdo potřebuje pozornost', o.podniky.map(potrebujePozornost), [false, true]);

  // ---- katalog a stránky balíku ----
  const moje = [...TRZBY, ...FINANCE, ...ORGANIZACE];
  eq('katalog B5b: všech 20 widgetů tržeb, financí a organizace je hotových', moje.filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  eq('katalog B5b (N2): každý widget tržeb chce finance.trzby (kromě Stavu pokladny)',
    TRZBY.filter(w => w.id !== 'pokladna.stav' && !w.opravneni.vse.includes('finance.trzby')).map(w => w.id), []);
  eq('katalog B5b: tržby po lidech jen s finance.trzby_lide', TRZBY.find(w => w.id === 'trzby.po_obsluze')?.opravneni.vse, ['finance.trzby', 'finance.trzby_lide']);
  eq('katalog B5b: podíl mezd chce finance.mzdy', FINANCE.find(w => w.id === 'finance.trzby_vs_mzdy')?.opravneni.vse, ['finance.zobrazit', 'finance.mzdy']);
  const ikonyOblasti = moje.map(w => w.ikona);
  eq('katalog B5b (AK-19): v oblasti se ikona opakuje jen tam, kde widgety nikdy nesdílí výchozí rozložení',
    [...new Set(ikonyOblasti.filter((x, i) => ikonyOblasti.indexOf(x) !== i))].sort(), ['chart', 'coins']);
  ok('katalog B5b: Souhrn měsíce smí nést inkoust (hlavní číslo peněz Financí)', FINANCE.find(w => w.id === 'finance.souhrn_mesice')?.muzeInkoust === true);

  for (const id of ['vedeni.finance', 'vedeni.togo', 'vedeni.vsechny_podniky'] as const) {
    const s = stranka(id)!;
    ok(`stránka ${id}: aktivní`, s.aktivni === true);
  }
  eq('stránky: nástroj Financí je kniha výdajů s vlastní ikonou, TO GO nástroj nemá',
    [stranka('vedeni.finance')?.nastroj?.ikona, stranka('vedeni.togo')?.nastroj, stranka('vedeni.vsechny_podniky')?.nastroj?.ikona], ['book', null, 'overview']);
  ok('stránky: Finance, TO GO a Přehled smí mít inkoustový widget', !!stranka('vedeni.finance')?.inkoust && !!stranka('vedeni.togo')?.inkoust);

  // Vyhodnocení výchozího rozložení pro systémové role (spec §1.3): tržby bez oprávnění nikde.
  const role = (klic: string, tarif: 'zdarma' | 'max' = 'max'): Divak => {
    const r = SYSTEMOVE_ROLE.find(x => x.klic === klic)!;
    return { userId: 1, typ: r.typ, klic, roleId: null, zdrojRole: null, opravneni: new Set(r.opravneni), tarif, jeSpravce: false };
  };
  const vid = (sid: string, d: Divak) => vyresRozlozeni({ stranka: stranka(sid as any)!, divak: d, osobni: null, vychozi: [] }).polozky.map(x => x.widget);
  const vlastnik: Divak = { ...role('vedeni'), opravneni: new Set(KATALOG.map(x => x.id)), jeSpravce: true };
  eq('výchozí TO GO pro vlastníka: hero a týden, kdo je na směně, výroba, pak uzávěrky ke schválení, úkoly, zprávy, sklad, účtenky a odkaz',
    vid('vedeni.togo', vlastnik),
    ['pokladna.dnes', 'trzby.po_dnech', 'dochazka.prave_na_smene', 'vyroba.k_vyrobe', 'uzaverky.ke_schvaleni', 'ukoly.dnes',
      'chat.neprectene', 'sklad.dochazi', 'finance.uctenky', 'odkaz']);
  // Plánovaný widget se nekreslí a resolver ho potichu vynechá — TO GO by tak beze stopy
  // přišlo o obsah (dřív „Dnes v podniku"). Každý widget výchozího rozložení musí být hotový.
  eq('výchozí TO GO: každý widget ve výchozím rozložení je hotový (žádný plánovaný, který by potichu zmizel)',
    Object.values(stranka('vedeni.togo')!.vychozi).flat().filter(q => q!.w !== 'nastroj' && KATALOG_WIDGETU.find(w => w.id === q!.w)?.stav !== 'hotovo').map(q => q!.w), []);
  eq('výchozí TO GO: odkaz vede na Postupy (zkratka místo dřívější dlaždice)',
    vyresRozlozeni({ stranka: stranka('vedeni.togo')!, divak: vlastnik, osobni: null, vychozi: [] }).polozky.find(x => x.widget === 'odkaz')?.nastaveni, { cil: 'view:procedures' });
  ok('výchozí TO GO pro Provozní (N2): žádná tržba ani týden tržeb', !vid('vedeni.togo', role('provozni')).some(w => w === 'pokladna.dnes' || w === 'trzby.po_dnech'));
  eq('výchozí Finance pro Účetní: souhrn, podíl mezd, účtenky… a kniha výdajů na konci',
    vid('vedeni.finance', role('ucetni')).filter(w => w.startsWith('finance.') || w === 'nastroj'),
    ['finance.souhrn_mesice', 'finance.trzby_vs_mzdy', 'finance.uctenky', 'finance.kam_sly_penize', 'finance.ztraty', 'nastroj']);
  ok('výchozí Finance bez tarifu Max: marže (tarif max) se nekreslí, souhrn ano',
    (() => { const w = vid('vedeni.finance', { ...vlastnik, tarif: 'zdarma' }); return w.includes('finance.souhrn_mesice') && !w.includes('finance.marze'); })());
  eq('výchozí Všech podniků: součty (M) a seznam podniků', vid('vedeni.vsechny_podniky', vlastnik), ['organizace.podniky', 'nastroj']);

  // ---- pojistky nad zdrojáky ----
  const api = zdroj('app/api/finance/route.ts');
  ok('API financí (N8): posílá stockTop i cíl podílu mezd', /stockTop,\s*\n\s*laborTargetPct: target/.test(api));
  for (const soubor of ['components/widgety/oblasti/trzby.tsx', 'components/widgety/oblasti/finance.tsx', 'components/widgety/oblasti/organizace.tsx']) {
    const s = zdroj(soubor);
    const cteni = [...s.matchAll(/fetch\(([^)]*)\)/g)].filter(m => !/method:/.test(s.slice(m.index!, m.index! + 200)));
    eq(`${soubor}: fetch jen pro zápis (čtení přes useDataWidgetu)`, cteni.map(m => m[0]), []);
    ok(`${soubor}: widget nikdy s limetkou ani pulzováním`, !/variant="accent"|animate-(pulse|ping)|btn-accent/.test(s));
  }
  const klice = (s: string) => [...(s.split('export const KOMPONENTY')[1] ?? '').matchAll(/'([a-z_.]+)':/g)].map(m => m[1]).sort();
  eq('oblasti B5b: komponenty = hotové widgety katalogu (AK-20)',
    [...klice(zdroj('components/widgety/oblasti/trzby.tsx')), ...klice(zdroj('components/widgety/oblasti/finance.tsx')), ...klice(zdroj('components/widgety/oblasti/organizace.tsx'))].sort(),
    moje.map(w => w.id).sort());
  const stranky = ['components/employer/FinanceView.tsx', 'components/employer/ToGoMode.tsx', 'components/employer/OrgOverview.tsx', 'components/employer/ReceiptsPanel.tsx', 'components/employer/LiveRevenue.tsx', 'components/employer/FinanceAdvice.tsx'].map(kod).join('\n');
  ok('stránky B5b: plocha s widgety na Financích, v TO GO i na Všech podnicích',
    ['stranka="vedeni.finance"', 'stranka="vedeni.togo"', 'stranka="vedeni.vsechny_podniky"'].every(x => stranky.includes(x)));
  ok('stránky B5b: žádné ruční okno, confirm(), kolečko ani natvrdo „Kč"', !/modal-overlay|confirm\(|className="spinner|'Kč'| Kč</.test(stranky));
  ok('TO GO: bez vynuceného světlého motivu, vlastního pozadí a odstínu mimo paletu', !/setForcedLight|#D8FF6B|radial-gradient/.test(kod('components/employer/ToGoMode.tsx')));
  ok('TO GO: pozdrav z lib/greeting (přes hlavičku Přehledu), ne z hodin prohlížeče', /useHlavickaPrehledu/.test(zdroj('components/employer/ToGoMode.tsx')) && !/getHours\(\)/.test(kod('components/employer/ToGoMode.tsx')));
}
