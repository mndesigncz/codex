// Kolo 7, balík R7-6 — Sklad, receptury, uzávěrky a dodavatelé.
//
// Peněžní a počtové výpočty, které UI jen kreslí: jméno exportu uzávěrek podle
// zobrazeného období, hosté a útrata na hosta ze souhrnu uzávěrek, souhrn příjmu
// objednávky po položkách (součet cen, nedodáno, strop 10× objednaného), cena za
// balení v haléřích jen s oprávněním, tón marže proti cíli podniku, řazení
// receptur a vývoj ztrát z inventur.

import type { Testy } from './_testy.ts';
import { nazevExportuUzaverek, popisObdobiExportu } from '../../lib/uzaverkyFiltr.ts';
import { souhrnUzaverek, souhrnUzaverekRozmezi, hodnotyUzaverekPoDnech, maHosty, nejviceHostu, hosteUzaverky, type RadekUzaverky } from '../../lib/uzaverkyPrehled.ts';

export default function ({ eq, ok }: Testy) {
  // ---- 1) Export uzávěrek: jméno souboru podle toho, co je vidět ----
  eq('export: bez omezení', nazevExportuUzaverek('uzaverky', null), 'uzaverky.csv');
  eq('export: měsíc z MonthNav', nazevExportuUzaverek('uzaverky', '2026-10'), 'uzaverky-2026-10.csv');
  eq('export: měsíc zúžený Od/Do', nazevExportuUzaverek('uzaverky', '2026-10', '2026-10-03', '2026-10-12'), 'uzaverky-2026-10-03_2026-10-12.csv');
  eq('export: jen Od uvnitř měsíce = do konce měsíce', nazevExportuUzaverek('uzaverky', '2026-02', '2026-02-10'), 'uzaverky-2026-02-10_2026-02-28.csv');
  eq('export: Od/Do přes celý měsíc = jméno měsíce', nazevExportuUzaverek('uzaverky', '2026-10', '2026-09-01', '2026-11-30'), 'uzaverky-2026-10.csv');
  eq('export: rozmezí bez měsíce', nazevExportuUzaverek('ucetni-podklad', null, '2026-09-01', '2026-10-15'), 'ucetni-podklad-2026-09-01_2026-10-15.csv');
  eq('export: jeden den (z kalendáře)', nazevExportuUzaverek('uzaverky', null, '2026-10-05', '2026-10-05'), 'uzaverky-2026-10-05.csv');
  eq('export: jen od', nazevExportuUzaverek('uzaverky', null, '2026-09-01'), 'uzaverky-od-2026-09-01.csv');
  eq('export: jen do', nazevExportuUzaverek('uzaverky', null, '', '2026-09-30'), 'uzaverky-do-2026-09-30.csv');
  eq('export: popis období — měsíc', popisObdobiExportu('2026-10'), '2026-10');
  eq('export: popis období — vše', popisObdobiExportu(null), 'vše');
  eq('export: popis období — rozmezí', popisObdobiExportu(null, '2026-10-03', '2026-10-12'), '2026-10-03 – 2026-10-12');

  // ---- 2) Hosté z uzávěrek: součet vyplněných a útrata na hosta jen z uzávěrek s hosty ----
  const u = (x: Partial<RadekUzaverky> & { date: string }): RadekUzaverky => ({
    id: 1, team_id: 1, created_by: 1, opening_cash: 1000, cash_revenue: 6000, card_revenue: 4000, expenses: 0,
    cash_removed: 0, self_payout: 0, tips: 0, closing_cash: 7000, customers: 0, notes: null, covered_by: null, ...x,
  }) as RadekUzaverky;
  const sHosty = [
    u({ date: '2026-10-03', customers: 80 }),                                   // sobota, tržba 10 000
    u({ date: '2026-10-05', customers: 40, cash_revenue: 2000, card_revenue: 2000, closing_cash: 3000 }), // pondělí, tržba 4 000
    u({ date: '2026-10-06', customers: null as any }),                          // nevyplněno — do Ø se nepočítá
    u({ date: '2026-10-06', customers: 30, covered_by: 7 }),                    // pomocný řádek kolegy — hosté ne
  ];
  const sh = souhrnUzaverekRozmezi(sHosty, '2026-10-01', '2026-10-31');
  eq('hosté: součet jen vyplněných hlavních uzávěrek', sh.zakaznici, 120);
  eq('hosté: Ø na hosta = tržba uzávěrek s hosty / jejich hosté (14 000 / 120)', Math.round(sh.naZakaznika! * 100) / 100, 116.67);
  eq('hosté: tržba celkem dál ze všech uzávěrek', sh.trzba, 24000);
  eq('hosté: měsíční souhrn počítá totéž', [souhrnUzaverek(sHosty, 'tento_mesic', '2026-10-12').zakaznici, Math.round(souhrnUzaverek(sHosty, 'tento_mesic', '2026-10-12').naZakaznika!)], [120, 117]);
  const bez = [u({ date: '2026-10-03' }), u({ date: '2026-10-04', customers: null as any })];
  const sb = souhrnUzaverekRozmezi(bez, '2026-10-01', '2026-10-31');
  eq('hosté: bez vyplněných — 0 a Ø null, ostatní čísla beze změny', [sb.zakaznici, sb.naZakaznika, sb.trzba, sb.pocet, sb.rozdil], [0, null, 20000, 2, 0]);
  ok('hosté: maHosty pozná vyplněné / nevyplněné', maHosty(sHosty) && !maHosty(bez));
  ok('hosté: 0, prázdné a nesmysl jsou nevyplněno', hosteUzaverky({ customers: 0 }) === null && hosteUzaverky({ customers: '' }) === null && hosteUzaverky({ customers: 'x' }) === null && hosteUzaverky({ customers: '84' }) === 84);
  eq('hosté: graf po dnech (metrika hoste)', hodnotyUzaverekPoDnech(sHosty, 'hoste', '2026-10-03', '2026-10-06').map(x => x.hodnota), [80, 0, 40, 0]);
  eq('hosté: nejvíc hostů v průměru — sobota (5)', nejviceHostu(sHosty), { den: 5, prumer: 80 });
  eq('hosté: bez vyplněných žádný den', nejviceHostu(bez), null);
}
