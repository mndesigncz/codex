// Kolo 69, balík B5a (Uzávěrky) — jednotkové testy výpočtů widgetů a katalogu.
//
// Výpočty jsou v lib/uzaverkyPrehled.ts (čistý modul): souhrn bývalých
// dlaždic, rozdíl pokladny, trend tržeb, fronty a kalendář. Hlídá se hlavně
// to, co se dřív pokazilo: nuly místo skrytých tržeb (N3), běžící směna jako
// chybějící uzávěrka (N9), pomocné řádky „za kolegu" v součtech a trend, který
// bral den podle UTC.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  souhrnUzaverek, rozdilKasy, trendyTrzeb, chybejiciDny, keSchvaleni, rozdilUzaverky, stavDne, bunkyMesice,
  mojeUzaverky, denUzaverky, vObdobi, mesicPred, denVTydnu, type RadekUzaverky,
} from '../../lib/uzaverkyPrehled.ts';
import { WIDGETY } from '../../lib/widgety/katalog/uzaverky.ts';
import { STRANKA as VEDENI } from '../../lib/widgety/stranky/vedeni.uzaverky.ts';
import { STRANKA as ZAMESTNANEC } from '../../lib/widgety/stranky/zamestnanec.uzaverka.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';

let id = 0;
const r = (x: Partial<RadekUzaverky>): RadekUzaverky => ({
  id: ++id, team_id: 1, created_by: 7, date: '2026-09-20', shift_label: null,
  opening_cash: 1000, cash_revenue: 5000, card_revenue: 3000, tips: 0, expenses: 0, cash_removed: 0,
  self_payout: 0, closing_cash: 6000, customers: 0, notes: null, author_name: 'Eva', ...x,
});

export default function ({ eq, ok }: Testy) {
  const dnes = '2026-09-26'; // sobota

  // ---- období ----
  eq('uzávěrky: obchodní den = shift_date, jinak date', [denUzaverky({ date: '2026-09-21', shift_date: '2026-09-20' }), denUzaverky({ date: '2026-09-21' })], ['2026-09-20', '2026-09-21']);
  eq('uzávěrky: minulý měsíc přes přelom roku', [mesicPred('2026-01'), mesicPred('2026-09')], ['2025-12', '2026-08']);
  eq('uzávěrky: období', [vObdobi('2026-09-01', 'tento_mesic', dnes), vObdobi('2026-08-31', 'tento_mesic', dnes), vObdobi('2026-08-31', 'minuly_mesic', dnes), vObdobi('2020-01-01', 'vse', dnes)], [true, false, true, true]);
  eq('uzávěrky: den v týdnu nezávisle na pásmu (0 = pondělí)', [denVTydnu('2026-09-21'), denVTydnu('2026-09-26'), denVTydnu('2026-09-27')], [0, 5, 6]);

  // ---- souhrn ----
  const radky = [
    r({ date: '2026-09-20' }),                                                   // sedí
    r({ date: '2026-09-21', closing_cash: 5900, self_payout: 0 }),               // manko 100
    r({ date: '2026-09-21', covered_by: 99, cash_revenue: 0, card_revenue: 0, closing_cash: 0, opening_cash: 0, self_payout: 800 }), // pomocný řádek
    r({ date: '2026-08-30', cash_revenue: 100000 }),                            // minulý měsíc
  ];
  const s = souhrnUzaverek(radky, 'tento_mesic', dnes);
  eq('souhrn: tržba bez pomocných řádků a bez jiného měsíce', [s.trzba, s.hotove, s.kartou, s.pocet], [16000, 10000, 6000, 2]);
  eq('souhrn: výplata kolegy „za kterého se zavřelo" se počítá (opravdu odešla z kasy)', s.vyplaceno, 800);
  eq('souhrn: rozdíl kasy jen z hlavních uzávěrek (fantom pomocného řádku ne)', s.rozdil, -100);
  eq('souhrn: bez skrytých polí není skryto', s.skryto, false);
  const skryte = souhrnUzaverek([r({ trzbaSkryta: true, cash_revenue: undefined as any, closing_cash: undefined as any })], 'tento_mesic', dnes);
  ok('souhrn (N3): řádek bez tržby → skryto, žádná nula a žádné NaN', skryte.skryto && skryte.trzba === 0 && !Number.isNaN(skryte.rozdil));

  // ---- rozdíl pokladny ----
  const rk = rozdilKasy([
    r({ date: '2026-09-25', closing_cash: 5800, author_name: 'Petr' }),  // −200
    r({ date: '2026-09-24', closing_cash: 6030 }),                       // +30 (pod prahem)
    r({ date: '2026-09-10', closing_cash: 5000 }),                       // mimo 7 dní
  ], '7_dni', 50, dnes);
  eq('rozdíl kasy: součet, absolutně a dny nad práh (7 dní)', [rk.soucet, rk.absolutne, rk.dny.map(d => d.den), rk.porovnano], [-170, 230, ['2026-09-25'], 2]);
  eq('rozdíl kasy: autor u dne s rozdílem', rk.dny[0].autor, 'Petr');
  eq('rozdíl kasy: měsíc bere i 10. září', rozdilKasy([r({ date: '2026-09-10', closing_cash: 5000 })], 'tento_mesic', 50, dnes).soucet, -1000);

  // ---- trendy ----
  ok('trendy: méně než čtyři dny → null (trend ze tří čísel je náhoda)', trendyTrzeb([r({ date: '2026-09-25' }), r({ date: '2026-09-24' })], dnes) === null);
  const t = trendyTrzeb([
    r({ date: '2026-09-21', cash_revenue: 1000, card_revenue: 0 }),   // po tento týden
    r({ date: '2026-09-26', cash_revenue: 3000, card_revenue: 0 }),   // so tento týden
    r({ date: '2026-09-14', cash_revenue: 2000, card_revenue: 0 }),   // po minulý týden
    r({ date: '2026-09-19', cash_revenue: 6000, card_revenue: 0 }),   // so minulý týden
    r({ date: '2026-09-20', cash_revenue: 500, card_revenue: 0 }),    // ne minulý týden (mimo okno po–so)
  ], dnes)!;
  eq('trendy: tento týden po–dnes proti stejným dnům minulého', [t.tentoTyden, t.minulyTyden, Math.round(t.zmena!)], [4000, 8000, -50]);
  eq('trendy: nejsilnější den (sobota) a rekord', [t.nejsilnejsiDen, t.prumerNejsilnejsiho, t.rekordDen, t.rekord], [5, 4500, '2026-09-19', 6000]);

  // ---- chybějící (N9) ----
  const ch = chybejiciDny({
    missingClosings: [{ date: '2026-09-26', employees: [{ id: 1, name: 'Eva' }] }, { date: '2026-09-24', employees: [{ id: 2, name: 'Petr' }] }],
  }, dnes, false);
  eq('chybějící (N9): dnešek se nepočítá, i když ho starší server poslal', [ch.dny.map(d => d.date), ch.dnes], [['2026-09-24'], null]);
  const chD = chybejiciDny({ missingClosings: [], missingToday: { date: '2026-09-26', employees: [{ id: 1, name: 'Eva' }] } }, dnes, true);
  eq('chybějící: s volbou „Počítat i dnešek" přijde dnešek zvlášť', chD.dnes?.date, '2026-09-26');
  eq('chybějící: rozbitý tvar nespadne', chybejiciDny({ missingClosings: 'x' as any }, dnes, true), { dny: [], dnes: null });
  const route = readFileSync(new URL('../../app/api/closings/route.ts', import.meta.url), 'utf8');
  ok('chybějící (N9): API filtruje missingClosings na „< dnes" a posílá missingToday', /d < today/.test(route) && /missingToday,/.test(route));

  // ---- ke schválení a rozdíl uzávěrky ----
  const fronta = keSchvaleni([r({ approved: false, date: '2026-09-20' }), r({ approved: false, date: '2026-09-22' }), r({ approved: false, covered_by: 3 }), r({})]);
  eq('ke schválení: jen neschválené hlavní, nejnovější první', fronta.map(c => c.date), ['2026-09-22', '2026-09-20']);
  eq('rozdíl uzávěrky: bez tržby null (chip se nekreslí), jinak číslo', [rozdilUzaverky(r({ trzbaSkryta: true })), rozdilUzaverky(r({ closing_cash: 6100 }))], [null, 100]);

  // ---- kalendář ----
  const den = (x: Partial<{ hasClosing: boolean; onShift: any[] }>) => ({ onShift: [], closedBy: [], hasClosing: false, missing: false, ...x });
  eq('kalendář: stavy dne', [
    stavDne(den({ hasClosing: true }), '2026-09-20', dnes),
    stavDne(den({ onShift: [{ id: 1 }] }), '2026-09-20', dnes),
    stavDne(den({ onShift: [{ id: 1 }] }), dnes, dnes),
    stavDne(undefined, dnes, dnes),
  ], ['hotovo', 'chybi', 'ceka', 'nic']);
  const zari = bunkyMesice('2026-09', 1);
  eq('kalendář: září 2026 od pondělí — 1. je úterý, celé týdny', [zari.indexOf('2026-09-01'), zari.length % 7, zari.filter(Boolean).length], [1, 0, 30]);
  eq('kalendář: týden od neděle posune první den', bunkyMesice('2026-09', 0).indexOf('2026-09-01'), 2);

  // ---- moje uzávěrky ----
  eq('moje uzávěrky: jen vlastní (vedení dostává ze seznamu všechny)', mojeUzaverky([r({ created_by: 7, date: '2026-09-01' }), r({ created_by: 8 }), r({ created_by: 7, date: '2026-09-05' })], 7).map(c => c.date), ['2026-09-05', '2026-09-01']);

  // ---- katalog a stránky ----
  eq('katalog B5a: všechny widgety oblasti uzávěrek jsou hotové', WIDGETY.filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  ok('katalog B5a: žádný widget s ikonou „trend" víckrát než jednou (galerie je rozliší)', WIDGETY.filter(w => w.ikona === 'trend').length <= 1);
  eq('stránky B5a: plocha je zapnutá', [VEDENI.aktivni, ZAMESTNANEC.aktivni], [true, true]);
  const vlastni = (id: string) => id.startsWith('uzaverky.');
  for (const st of [VEDENI, ZAMESTNANEC]) {
    const vychozi = Object.values(st.vychozi).flatMap(v => v ?? []).map(p => p.w).filter(w => w !== 'nastroj');
    eq(`stránky B5a: výchozí ${st.id} nemá plánovaný widget uzávěrek (AK-20)`, vychozi.filter(vlastni).filter(w => widget(w)?.stav !== 'hotovo'), []);
    ok(`stránky B5a: ${st.id} má nástroj ve výchozím`, Object.values(st.vychozi).every(v => (v ?? []).some(p => p.w === 'nastroj')));
    eq(`stránky B5a: doporučené ${st.id} existují v katalogu`, st.doporucene.filter(w => !widget(w)), []);
  }
  ok('stránky B5a: kuchař (jen uzaverky.predavka) má na stránce Uzávěrka co vidět', (ZAMESTNANEC.vychozi['typ:zamestnanec'] ?? []).some(p => p.w === 'uzaverky.predavka'));
  // Provozní bez finance.trzby: peněžní widgety nesmí mít prázdné `vse` (N3).
  for (const wid of ['uzaverky.souhrn', 'uzaverky.rozdil_kasy', 'uzaverky.trendy']) {
    ok(`oprávnění (N3): ${wid} chce finance.trzby`, !!widget(wid)?.opravneni.vse.includes('finance.trzby'));
  }
  ok('oprávnění: Měsíc v číslech chce finance.zobrazit i finance.mzdy', ['finance.zobrazit', 'finance.mzdy'].every(k => widget('uzaverky.mesic_v_cislech')!.opravneni.vse.includes(k)));

  // ---- komponenty: žádný vlastní fetch pro čtení, bez accent ----
  const oblast = readFileSync(new URL('../../components/widgety/oblasti/uzaverky.tsx', import.meta.url), 'utf8');
  const cteni = [...oblast.matchAll(/fetch\(([^)]*)\)/g)].map(m => m[1]).filter(a => !/method:/.test(oblast.slice(oblast.indexOf(a), oblast.indexOf(a) + 120)));
  eq('oblast uzávěrek: fetch jen pro zápis (čtení přes useDataWidgetu)', cteni, []);
  ok('oblast uzávěrek: widget nikdy s limetkou (variant="accent")', !/variant="accent"/.test(oblast));
  // Bez komentářů — ty o odstraněném confirm() a „Krok N/4" mluví záměrně.
  const formular = readFileSync(new URL('../../components/employee/CashClosing.tsx', import.meta.url), 'utf8')
    .split('\n').filter(l => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join('\n');
  ok('formulář uzávěrky: bez confirm(), bez „Krok N/4" a bez vytištěného názvu ikony', !/\bconfirm\(/.test(formular) && !/Krok \{num\}/.test(formular) && !/\{p\.icon \?\? '/.test(formular));
  ok('formulář uzávěrky: jediná limetka je Odeslat uzávěrku', (formular.match(/variant="accent"/g) ?? []).length === 1);
}
