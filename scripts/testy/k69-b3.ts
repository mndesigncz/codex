// Kolo 69, balík B3 (Sklad a výroba) — jednotkové testy výpočtů widgetů, katalogu a stránek.
//
// Výpočty jsou v lib/skladPrehled.ts (čistý modul). Hlídá se hlavně to, co se
// dřív pokazilo: Přehled a Sklad hlásily jiný počet docházejících (N7),
// hodnota zásob se počítala dvakrát jinak (N8), „chybí cena" u všech surovin
// pro roli bez cen (N4) — a že nákupní seznam, inventura, hlášení, objednávky
// a pohyby čtou odpovědi API tak, jak je server opravdu posílá.

import type { Testy } from './_testy.ts';
import {
  jeAktivni, stavZasoby, navrhMnozstvi, nakupniSeznam, poDodavatelich, hodnotaZasob, chybiUdaje,
  podstrom, souhrnKategorie, stavInventury, vyberHlaseni, cekajiciObjednavky, historieObjednavek, utrataZaMesic, vyberPohyby, jeZKasy, vyberKategorie,
  type PolozkaSkladu,
} from '../../lib/skladPrehled.ts';
import { WIDGETY } from '../../lib/widgety/katalog/sklad.ts';
import { STRANKA as VEDENI } from '../../lib/widgety/stranky/vedeni.sklad.ts';
import { STRANKA as ZAMESTNANEC } from '../../lib/widgety/stranky/zamestnanec.sklad.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { filtrujViditelne, jeViditelny, vychoziZKodu } from '../../lib/widgety/rozlozeni.ts';
import { SYSTEMOVE_ROLE, sZavislostmi } from '../../lib/opravneni.ts';
import { readFileSync } from 'node:fs';

let id = 0;
const p = (x: Partial<PolozkaSkladu>): PolozkaSkladu => ({
  id: ++id, name: `Položka ${id}`, quantity: 10, minQuantity: 5, criticalQuantity: 2, maxQuantity: 20, unit: 'ks', ...x,
});

export default function ({ eq, ok }: Testy) {
  // ---- N7: jeden filtr pro zásoby ----
  const archiv = p({ name: 'Archiv', archived: true, status: 'critical' });
  const navrh = p({ name: 'Návrh', approved: false, status: 'critical' });
  const bezny = p({ name: 'Mléko', status: 'critical' });
  eq('sklad (N7): archivované a neschválené návrhy do zásob nepatří', [archiv, navrh, bezny].filter(jeAktivni).map(x => x.name), ['Mléko']);
  eq('sklad: stav bere server (status), jinak náhradní výpočet z prahů',
    [stavZasoby(p({ status: 'ok', quantity: 0 })), stavZasoby(p({ quantity: 1 })), stavZasoby(p({ quantity: 4 })), stavZasoby(p({ quantity: 9 }))],
    ['ok', 'critical', 'low', 'ok']);

  // ---- nákupní seznam ----
  eq('nákup: doplnit do maxima, bez maxima na dvojnásobek minima, vždy aspoň 1',
    [navrhMnozstvi(p({ quantity: 3, maxQuantity: 20 })), navrhMnozstvi(p({ quantity: 3, maxQuantity: 0, minQuantity: 5 })), navrhMnozstvi(p({ quantity: 30, maxQuantity: 20 }))],
    [17, 7, 1]);
  eq('nákup: surovina na výrobu aspoň tolik, kolik na dávky chybí',
    navrhMnozstvi(p({ quantity: 19, maxQuantity: 20, buyFor: [{ itemId: 1, name: 'Limonáda', amount: 4.2 }] })), 5);
  const sklad = [
    p({ name: 'Sirup', status: 'low', supplier: 'Makro', unitCost: 100, quantity: 3, maxQuantity: 6 }),
    p({ name: 'Cukr', status: 'critical', supplier: 'Makro', unitCost: null }),
    p({ name: 'Citron', status: 'ok', supplier: 'Bidfood', buyFor: [{ itemId: 9, name: 'Limonáda', amount: 2 }] }),
    p({ name: 'Limonáda', status: 'critical', madeInHouse: true }),
    p({ name: 'Plné', status: 'ok' }),
    p({ name: 'Odložené', status: 'critical', archived: true }),
  ];
  const nakup = nakupniSeznam(sklad);
  eq('nákup: kritické, pak docházející, pak jen „na výrobu"; vlastní výroba a odložené ne', nakup.map(r => r.nazev), ['Cukr', 'Sirup', 'Citron']);
  eq('nákup: odhad ceny jen s cenou (bez sklad.ceny je unitCost null)', nakup.map(r => r.cena), [null, 300, null]);
  eq('nákup: surovina na výrobu nese, pro co chybí', nakup[2].naVyrobu, ['Limonáda']);
  eq('nákup: filtr dodavatele a jen kriticky málo',
    [nakupniSeznam(sklad, { dodavatel: 'Makro' }).map(r => r.nazev), nakupniSeznam(sklad, { jenKriticke: true }).map(r => r.nazev)],
    [['Cukr', 'Sirup'], ['Cukr']]);
  eq('nákup: po dodavatelích abecedně, bez dodavatele na konec',
    poDodavatelich([{ dodavatel: null, n: 1 }, { dodavatel: 'Makro', n: 2 }, { dodavatel: 'Bidfood', n: 3 }, { dodavatel: 'Makro', n: 4 }]).map(s => [s.dodavatel, s.radky.length]),
    [['Bidfood', 1], ['Makro', 2], [null, 1]]);

  // ---- N8: hodnota zásob stejně jako /api/finance ----
  const h = hodnotaZasob([
    p({ name: 'Víno', quantity: 2, unitCost: 300, packageSize: 0.75, openAmount: 0.25 }), // (2 + 1/3) × 300 = 700
    p({ name: 'Káva', quantity: 3, unitCost: 450 }),                                          // 1350
    p({ name: 'Staré', quantity: 10, unitCost: 1000, archived: true }),                       // archiv ne
    p({ name: 'Bez ceny', quantity: 5, unitCost: null }),
    p({ name: 'Záporné', quantity: -4, unitCost: 10 }),                                        // max(0, …) = 0
  ]);
  eq('hodnota (N8): s podílem načatého balení, bez archivovaných, zaokrouhleno po položkách', [h.hodnota, h.top.map(t => t.nazev)], [2050, ['Káva', 'Víno']]);
  eq('hodnota: kolik aktivních položek nemá cenu (dolní odhad)', h.bezCeny, 1);
  // Vzorec musí sedět se serverem Financí — kdyby se tam změnil, tenhle test to řekne.
  const finance = readFileSync(new URL('../../app/api/finance/route.ts', import.meta.url), 'utf8');
  ok('hodnota (N8): /api/finance počítá stejně (archived IS NOT TRUE, podíl načatého, Math.round po položce)',
    finance.includes('archived IS NOT TRUE') && /openShare = pkg > 0 \? Math\.max\(0, num\(i\.open_amount\)\) \/ pkg/.test(finance)
    && finance.includes('Math.round((Math.max(0, num(i.quantity)) + openShare) * num(i.unit_cost))'));

  // ---- N4: suroviny bez ceny nebo balení ----
  const usage = { [String(sklad[0].id)]: [{}, {}], [String(sklad[1].id)]: [{}], '999': [{}] };
  const s0 = { ...sklad[0], packageSize: 0.7 };
  const chybi = chybiUdaje([s0, sklad[1], sklad[2]], usage);
  eq('chybí údaje: jen suroviny, které kasa používá, s tím, co chybí', chybi.map(r => [r.nazev, r.chybi, r.produktu]), [['Cukr', 'cena i balení', 1]]);
  eq('chybí údaje: bez odpovědi usage nic (ne „všechno chybí")', chybiUdaje(sklad, null), []);
  const ch = widget('sklad.chybi_udaje')!;
  ok('chybí údaje (N4): widget chce receptury.zobrazit I sklad.ceny', ch.opravneni.vse.includes('sklad.ceny') && ch.opravneni.vse.includes('receptury.zobrazit'));
  const provozni = SYSTEMOVE_ROLE.find(r => r.klic === 'provozni')!;
  const dProvozni = { typ: 'vedeni' as const, opravneni: new Set(sZavislostmi(provozni.opravneni)), tarif: 'max' as const };
  ok('chybí údaje (N4): Provozní (bez sklad.ceny) widget nevidí', !jeViditelny(ch, dProvozni));

  // ---- kategorie ----
  const kat = vyberKategorie([{ id: 1, name: 'Sirupy' }, { id: 2, name: 'Ovocné', parentId: 1 }, { id: 3, name: 'Lesní', parentId: 2 }, { id: 4, name: 'Káva' }, { id: 5, name: 'Smyčka', parentId: 5 }]);
  eq('kategorie: podstrom i vnořených, cyklus nezacyklí', [[...podstrom(kat, 1)].sort(), [...podstrom(kat, 5)]], [[1, 2, 3], [5]]);
  const sk = souhrnKategorie([
    p({ name: 'Mango', categoryId: 3, status: 'critical' }), p({ name: 'Jahoda', categoryId: 2, status: 'low' }),
    p({ name: 'Malina', categoryId: 1, status: 'ok' }), p({ name: 'Espresso', categoryId: 4, status: 'critical' }),
    p({ name: 'Návrh', categoryId: 1, status: 'critical', approved: false }),
  ], kat, 1);
  eq('stav kategorie: položek, kriticky, dochází, nejhorší první', [sk.polozek, sk.kriticke, sk.dochazi, sk.nizke.map(n => n.nazev)], [3, 1, 1, ['Mango', 'Jahoda']]);

  // ---- inventura, hlášení, objednávky, pohyby ----
  eq('inventura: běží a kolik je spočítáno', stavInventury({ open: { createdAt: 'X', data: [{ counted: 3 }, { counted: null }, { counted: 0 }] }, history: [{ completedAt: 'H' }] }),
    { bezi: true, celkem: 3, spocitano: 2, zahajena: 'X', posledni: 'H' });
  // Review B3: jen zbytek v načatém balení je taky spočítaná položka — jako v okně Stocktake.
  eq('inventura: spočítané i přes načaté balení (countedOpen), stejně jako okno inventury',
    stavInventury({ open: { createdAt: 'X', data: [{ counted: null, countedOpen: 0.4 }, { counted: null, countedOpen: null }, { counted: 2, countedOpen: 0 }] }, history: [] }).spocitano, 2);
  eq('inventura: neběží → poslední dokončená', stavInventury({ open: null, history: [] }), { bezi: false, celkem: 0, spocitano: 0, zahajena: null, posledni: null });
  const hl = vyberHlaseni({ reports: [
    { id: 1, items: '[{"id":1,"name":"Mléko"},{"id":2,"name":"Cukr"}]', status: 'new', author_name: 'Eva', note: 'rychle' },
    { id: 2, items: 'rozbité', status: 'done' },
  ] });
  eq('hlášení: položky z JSON řetězce, rozbitý JSON nespadne, vyřízené nejsou nové', hl.map(x => [x.polozky, x.nove, x.autor]), [[['Mléko', 'Cukr'], true, 'Eva'], [[], false, 'Někdo z týmu']]);
  const obj = cekajiciObjednavky({ orders: [
    { id: 1, status: 'received', createdAt: '2026-09-01' },
    { id: 2, status: 'ordered', supplier: 'Makro', createdAt: '2026-09-20', items: [{ name: 'Cukr', qty: 5, unit: 'kg' }], totalCost: null },
    { id: 3, status: 'ordered', createdAt: '2026-09-10', items: [] },
  ] });
  eq('objednávky: jen čekající na příjem, nejstarší první', obj.map(o => o.id), [3, 2]);
  eq('objednávky: položky a cena null bez sklad.ceny', [obj[1].polozky, obj[1].cena], [[{ nazev: 'Cukr', mnozstvi: 5, jednotka: 'kg' }], null]);
  // Review B3: historie přijatých a zrušených (nejnovější příjem první) a útrata za měsíc z cen příjmu.
  const hist = historieObjednavek({ orders: [
    { id: 1, status: 'received', createdAt: '2026-08-28', receivedAt: '2026-09-02T10:00:00', totalCost: 3200 },
    { id: 2, status: 'ordered', createdAt: '2026-09-20' },
    { id: 4, status: 'cancelled', createdAt: '2026-09-15' },
    { id: 5, status: 'received', createdAt: '2026-08-01', receivedAt: '2026-08-03T10:00:00', totalCost: 900 },
    { id: 6, status: 'received', createdAt: '2026-09-18', receivedAt: '2026-09-19T10:00:00', totalCost: null },
  ] });
  eq('objednávky: historie bez čekajících, nejnovější první', hist.map(o => o.id), [6, 4, 1, 5]);
  eq('objednávky: útrata za září jen z přijatých s cenou v měsíci', utrataZaMesic(hist, new Date('2026-09-26T12:00:00')), 3200);
  eq('objednávky: bez cen (maskované null) je útrata 0', utrataZaMesic(hist.map(o => ({ ...o, cena: null })), new Date('2026-09-26T12:00:00')), 0);
  const log = [
    { id: 1, itemName: 'Gin', oldQuantity: 3, newQuantity: 3, oldOpen: 0.7, newOpen: 0.66, note: 'Prodej (Storyous)', userName: null },
    { id: 2, itemName: 'Mléko', oldQuantity: 4, newQuantity: 10, note: 'Příjem objednávky', userName: 'Eva' },
  ];
  eq('pohyby: odpis z kasy poznat podle poznámky „Prodej (…)"', [jeZKasy('Prodej (Storyous)'), jeZKasy('Ruční odpis −1'), jeZKasy(null)], [true, false, false]);
  eq('pohyby: filtr druhu a změna jen v načatém balení', [
    vyberPohyby(log, 'prodej_z_kasy').map(x => [x.polozka, x.zmena, Math.round((x.zmenaNacate ?? 0) * 100) / 100]),
    vyberPohyby(log, 'rucni').map(x => [x.polozka, x.zmena]),
  ], [[['Gin', 0, -0.04]], [['Mléko', 6]]]);

  // ---- katalog a stránky ----
  eq('katalog B3: všech 13 widgetů skladu je hotových (AK-20)', WIDGETY.filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  const src = readFileSync(new URL('../../components/widgety/oblasti/sklad.tsx', import.meta.url), 'utf8');
  eq('katalog B3: každý widget má komponentu v KOMPONENTY', WIDGETY.filter(w => !src.includes(`'${w.id}':`)).map(w => w.id), []);
  for (const st of [VEDENI, ZAMESTNANEC]) {
    ok(`stránky B3: ${st.id} je aktivní`, st.aktivni === true);
    const vse = Object.values(st.vychozi).flatMap(v => v ?? []).map(x => x.w).filter(w => w !== 'nastroj');
    eq(`stránky B3: výchozí ${st.id} nemá plánovaný widget (AK-20)`, vse.filter(w => widget(w)?.stav !== 'hotovo'), []);
    ok(`stránky B3: ${st.id} má nástroj ve všech výchozích`, Object.values(st.vychozi).every(v => (v ?? []).some(x => x.w === 'nastroj')));
    eq(`stránky B3: doporučené ${st.id} jen z rozhraní stránky`, st.doporucene.filter(w => w !== 'odkaz' && !widget(w)?.rozhrani.includes(st.rozhrani)), []);
  }
  // Barista vidí na Skladu zaměstnance všechno z výchozího rozložení (nic mu nezmizí pod rukama).
  const barista = SYSTEMOVE_ROLE.find(r => r.klic === 'barista')!;
  const dBarista = { typ: 'zamestnanec' as const, klic: 'barista', zdrojRole: null, opravneni: new Set(sZavislostmi(barista.opravneni)), tarif: 'max' as const };
  eq('stránky B3: barista na Skladu vidí inventuru, zápis, nahlášení i docházející',
    filtrujViditelne(vychoziZKodu(ZAMESTNANEC, dBarista), dBarista).map(x => x.widget).filter(w => w !== 'nastroj'),
    ['sklad.inventura', 'sklad.zapsat_novou', 'sklad.nahlasit', 'sklad.dochazi']);
  const dProv = { ...dProvozni, klic: 'provozni', zdrojRole: null };
  ok('stránky B3: Provozní na Skladu nemá Suroviny bez ceny (N4), návrhy a hlášení ano',
    (() => { const w = filtrujViditelne(vychoziZKodu(VEDENI, dProv), dProv).map(x => x.widget); return !w.includes('sklad.chybi_udaje') && w.includes('sklad.navrhy') && w.includes('sklad.hlaseni'); })());
}
