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
import { overPrijem, souhrnPrijmu, rozdilPrijmu, radkyKPrijmu, nedodano, posledniCenyBaleni, polozekUDodavatelu, posledniObjednavkaDodavatelu, dnuOd, type PolozkaObjednavky, type PolozkaSkladu } from '../../lib/skladPrehled.ts';
import { cenaProSloupec } from '../../lib/cena.ts';
import { tonMarze, jePodCilem, cilMarze, prahyRadMarze, seradReceptury } from '../../lib/recepturyPrehled.ts';

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

  // ---- 3) Příjem objednávky po položkách ----
  const obj: PolozkaObjednavky[] = [
    { name: 'Mléko', qty: 12, unit: 'l', itemId: 7 },
    { name: 'Kafe Brazílie', qty: 2, unit: 'kg', itemId: 9 },
    { name: 'Ubrousky', qty: 5, unit: 'bal', itemId: null },
  ];
  const p1 = overPrijem(obj, [{ i: 0, itemId: 7, qty: '10' }, { itemId: 9, qty: 2, unitCost: '459,90' }], true);
  ok('příjem: platný příjem projde', p1.ok);
  if (p1.ok) {
    eq('příjem: přišlo, co se zapsalo; řádek bez zmínky přišel celý', p1.radky.map(r => r.qty), [10, 2, 5]);
    eq('příjem: cena za balení s haléři z textu s čárkou', p1.radky[1].unitCost, 459.9);
    eq('příjem: bez ceny = null (nic se nepřepíše)', [p1.radky[0].unitCost, p1.radky[2].unitCost], [null, null]);
    ok('příjem: chybějící 2 l = částečný', p1.castecny);
  }
  const vse = overPrijem(obj, [{ i: 0, itemId: 7, qty: 12 }, { i: 1, itemId: 9, qty: 2 }, { i: 2, qty: 5 }], false);
  ok('příjem: všechno přesně = není částečný', vse.ok && !vse.castecny);
  const nula = overPrijem(obj, [{ i: 2, qty: 0 }], false);
  ok('příjem: 0 = nepřišlo (smí se), řádek bez itemId podle pořadí', nula.ok && nula.radky[2].qty === 0 && nula.castecny);
  eq('příjem: cizí položka (itemId mimo objednávku) = 400', overPrijem(obj, [{ itemId: 99, qty: 1 }], true), { ok: false, status: 400, chyba: 'Položka v objednávce není.' });
  eq('příjem: pořadí s jiným itemId = cizí položka', (overPrijem(obj, [{ i: 0, itemId: 9, qty: 1 }, { i: 1, itemId: 9, qty: 1 }], true) as any).chyba, 'Položka je v příjmu dvakrát.');
  eq('příjem: víc než 10× objednaného = 400', (overPrijem(obj, [{ i: 1, itemId: 9, qty: 21 }], true) as any).status, 400);
  ok('příjem: přesně 10× objednaného ještě projde', overPrijem(obj, [{ i: 1, itemId: 9, qty: 20 }], true).ok);
  eq('příjem: záporné množství = 400', (overPrijem(obj, [{ i: 0, itemId: 7, qty: -1 }], true) as any).status, 400);
  eq('příjem: nesmysl v množství = 400', (overPrijem(obj, [{ i: 0, itemId: 7, qty: 'hodně' }], true) as any).status, 400);
  eq('příjem: cena bez sklad.ceny_upravit = 403', (overPrijem(obj, [{ i: 0, itemId: 7, qty: 12, unitCost: 25 }], false) as any).status, 403);
  ok('příjem: prázdná cena bez oprávnění nevadí', overPrijem(obj, [{ i: 0, itemId: 7, qty: 12, unitCost: '' }], false).ok);
  eq('příjem: cena, která není číslo = 400', (overPrijem(obj, [{ i: 0, itemId: 7, qty: 12, unitCost: '12a' }], true) as any).status, 400);
  eq('příjem: prázdný seznam = 400', (overPrijem(obj, [], true) as any).status, 400);
  // Haléře: do NUMERIC sloupce s haléři, do INTEGER (před migrací) zaokrouhleně jako dřív.
  eq('příjem: cena za balení do NUMERIC sloupce s haléři', cenaProSloupec(459.9, true), 459.9);
  eq('příjem: cena za balení do INTEGER sloupce zaokrouhleně', cenaProSloupec(459.9, false), 460);

  // Souhrn v okně příjmu: součet řádků (přišlo × cena), nedodáno, navíc.
  const s1 = souhrnPrijmu([{ mnozstvi: 12, prislo: 10, cena: 24.9 }, { mnozstvi: 2, prislo: 2, cena: 459.9 }, { mnozstvi: 5, prislo: 0, cena: null }]);
  eq('příjem: součet řádků 10 × 24,90 + 2 × 459,90 (nepřišlý řádek bez ceny nevadí)', s1.soucet, 1168.8);
  eq('příjem: nedodáno 2 řádky (méně i nula), navíc 0', [s1.nedodano, s1.navic, s1.castecny], [2, 0, true]);
  eq('příjem: přišlý řádek bez ceny → součet se neukáže (chybějící cena není nula)', souhrnPrijmu([{ mnozstvi: 1, prislo: 1, cena: 10 }, { mnozstvi: 1, prislo: 1, cena: null }]).soucet, null);
  eq('příjem: bez jediné ceny součet není', souhrnPrijmu([{ mnozstvi: 1, prislo: 1, cena: null }]).soucet, null);
  eq('příjem: navíc se pozná', souhrnPrijmu([{ mnozstvi: 1, prislo: 3, cena: 2 }]).navic, 1);
  eq('příjem: rozdíl řádku (chybí 2, desetiny)', [rozdilPrijmu({ mnozstvi: 12, prislo: 10 }), rozdilPrijmu({ mnozstvi: 1, prislo: 1.25 })], [-2, 0.25]);

  // Historie: co nedorazilo a poslední zaplacená cena za balení.
  const api = { orders: [
    { id: 5, status: 'received', receivedAt: '2026-10-10T08:00:00Z', items: [{ name: 'Mléko', qty: 12, unit: 'l', itemId: 7, received: 10, unitCost: 24.9 }, { name: 'Kafe', qty: 2, unit: 'kg', itemId: 9, received: 2 }] },
    { id: 4, status: 'received', receivedAt: '2026-10-01T08:00:00Z', items: [{ name: 'Mléko', qty: 12, unit: 'l', itemId: 7, received: 12, unitCost: 22 }, { name: 'Kafe', qty: 2, unit: 'kg', itemId: 9, unitCost: 450 }] },
    { id: 6, status: 'ordered', items: [{ name: 'Mléko', qty: 6, unit: 'l', itemId: 7 }] },
  ] };
  const rk = radkyKPrijmu(api);
  eq('historie: nedodáno 2 l mléka', nedodano(rk[5]), [{ nazev: 'Mléko', chybi: 2, jednotka: 'l' }]);
  eq('historie: objednávka přijatá celá (bez received) nic nedodaného nemá', nedodano(rk[4]).length, 0);
  eq('historie: řádky čekající objednávky s itemId a pořadím', rk[6].map(r => [r.i, r.itemId, r.mnozstvi, r.prislo]), [[0, 7, 6, null]]);
  eq('příjem: poslední zaplacená cena za balení podle položky (nejnovější příjem)', posledniCenyBaleni(api), { 7: 24.9, 9: 450 });

  // ---- 4) Dodavatelé: počet položek a poslední objednávka ----
  const pol = (x: Partial<PolozkaSkladu>): PolozkaSkladu => ({ id: 1, name: 'x', quantity: 1, ...x });
  eq('dodavatelé: počet aktivních položek podle jména (archiv a návrh ne, mezery se ořežou)', polozekUDodavatelu([
    pol({ supplier: 'Makro' }), pol({ supplier: ' Makro ' }), pol({ supplier: 'Makro', archived: true }), pol({ supplier: 'Makro', approved: false }),
    pol({ supplier: 'Bidfood' }), pol({ supplier: null }), pol({ supplier: '' }),
  ]), { Makro: 2, Bidfood: 1 });
  eq('dodavatelé: poslední nezrušená objednávka podle jména', posledniObjednavkaDodavatelu({ orders: [
    { id: 1, supplier: 'Makro', status: 'received', createdAt: '2026-09-24T08:00:00Z' },
    { id: 2, supplier: 'Makro', status: 'cancelled', createdAt: '2026-10-10T08:00:00Z' },
    { id: 3, supplier: 'Makro', status: 'ordered', createdAt: '2026-10-01T08:00:00Z' },
    { id: 4, supplier: null, status: 'ordered', createdAt: '2026-10-11T08:00:00Z' },
  ] }), { Makro: '2026-10-01T08:00:00Z' });
  eq('dodavatelé: dní od objednávky (přes přechod měsíce, nikdy záporně)', [dnuOd('2026-09-24', '2026-10-12'), dnuOd('2026-10-12', '2026-10-12'), dnuOd('2026-10-13', '2026-10-12')], [18, 0, 0]);

  // ---- 5) Cílová marže a řazení receptur ----
  eq('marže: bez cíle dnešní prahy 65 / 45', [70, 65, 64, 45, 44].map(m => tonMarze(m)), ['ok', 'ok', 'wait', 'wait', 'bad']);
  eq('marže: s cílem 60 — ok ≥ 60, wait ≥ 45, bad pod', [60, 59, 45, 44].map(m => tonMarze(m, 60)), ['ok', 'wait', 'wait', 'bad']);
  eq('marže: čajovna s cílem 80 — 70 je už jen „ujde"', [80, 70, 64].map(m => tonMarze(m, 80)), ['ok', 'wait', 'bad']);
  ok('marže: pod cílem (bez cíle pod 65), neznámá marže pod cílem není', jePodCilem(64) && !jePodCilem(65) && jePodCilem(59, 60) && !jePodCilem(60, 60) && !jePodCilem(null, 60));
  eq('marže: cíl z formuláře/DB jen celé 1–95, jinak výchozí (null)', ['60', 1, 95, 0, 96, 60.5, '', null, 'x'].map(cilMarze), [60, 1, 95, null, null, null, null, null, null]);
  eq('marže: prahy rad bez cíle 65 / 50 / 45 jako dřív, s cílem cíl / cíl − 15 / cíl − 20', [prahyRadMarze(null), prahyRadMarze(70)], [{ dobra: 65, ujde: 50, nejhorsi: 45 }, { dobra: 70, ujde: 55, nejhorsi: 50 }]);
  const rec = [
    { nazev: 'Latte', prodano: 120, marze: 72, naklad: 18 },
    { nazev: 'Espresso', prodano: 200, marze: 81, naklad: 9 },
    { nazev: 'Matcha', prodano: 40, marze: 48, naklad: 42 },
    { nazev: 'Limonáda', prodano: 40, marze: null, naklad: null },   // bez receptury / bez ceny suroviny
    { nazev: 'Čaj', prodano: 15, marze: 55, naklad: 30 },
  ];
  const jmena = (r: typeof rec) => r.map(x => x.nazev);
  eq('řazení: podle prodejů (shoda → název)', jmena(seradReceptury(rec, 'prodeje')), ['Espresso', 'Latte', 'Limonáda', 'Matcha', 'Čaj']);
  eq('řazení: marže od nejnižší, bez marže na konec', jmena(seradReceptury(rec, 'marze')), ['Matcha', 'Čaj', 'Latte', 'Espresso', 'Limonáda']);
  eq('řazení: náklad od nejvyššího, bez nákladu na konec', jmena(seradReceptury(rec, 'naklad')), ['Matcha', 'Čaj', 'Latte', 'Espresso', 'Limonáda']);
  eq('řazení: podle názvu česky (Č za C, před D)', jmena(seradReceptury(rec, 'nazev')), ['Čaj', 'Espresso', 'Latte', 'Limonáda', 'Matcha']);
  const kopieRec = JSON.stringify(rec);
  seradReceptury(rec, 'marze');
  ok('řazení: vstup se nemění', JSON.stringify(rec) === kopieRec);
}
