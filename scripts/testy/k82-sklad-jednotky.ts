// Kolo 82 — Sklad „na první dobrou": jednotky, přepočty balení, souhrn inventury
// a rozšířený argument Skladu (akce:inventura, polozka:id).
//
// Hlídá lib/mnozstvi.ts (čisté výpočty pro formulář položky, inventuru a zápis
// stavu) a lib/skladPredani.ts.

import type { Testy } from './_testy.ts';
import {
  NABIDKA_JEDNOTEK, jeZNabidky, druhJednotky, vedeniPolozky, celkemObsahu, naBaleni, krokMnozstvi,
  rozdilRadku, souhrnInventury, kategorieInventury, filtrujInventuru, type RadekInventury,
} from '../../lib/mnozstvi.ts';
import { rozborSkladArg, skladArg, polozkaArg } from '../../lib/skladPredani.ts';

export default function ({ eq, ok }: Testy) {
  // ---- A: jednotky a vedení položky ----
  eq('nabídka jednotek: ks, balení a čtyři měrné', [...NABIDKA_JEDNOTEK], ['ks', 'balení', 'l', 'kg', 'g', 'ml']);
  eq('z nabídky: ks ano, lahev ne', [jeZNabidky('ks'), jeZNabidky('lahev'), jeZNabidky('')], [true, false, false]);
  eq('druh: ks, balení, l, g, lahev', ['ks', 'balení', 'l', 'g', 'lahev', ''].map(druhJednotky), ['kusy', 'baleni', 'objem', 'hmotnost', 'vlastni', 'kusy']);

  const gin = vedeniPolozky({ unit: 'lahev', packageSize: 0.7, contentUnit: 'l' }, null);
  eq('vedení: lahev 0,7 l — stav v lahvích, receptury v l', [gin.jednotka, gin.baleni, gin.odepisujeV, gin.prahyV, gin.desetiny],
    ['lahev', { velikost: 0.7, jednotka: 'l', zKategorie: false }, 'l', 'lahev', false]);
  eq('vedení: menší jednotky pro recepturu u litrů', gin.mensiJednotky, ['ml', 'cl', 'dl']);
  const kusy = vedeniPolozky({ unit: 'ks' }, null);
  eq('vedení: kusy bez balení — všechno v ks', [kusy.baleni, kusy.odepisujeV, kusy.prahyV, kusy.druh, kusy.mensiJednotky], [null, 'ks', 'ks', 'kusy', []]);
  const kg = vedeniPolozky({ unit: 'kg' }, null);
  eq('vedení: kg má desetiny a menší jednotky g, dkg', [kg.desetiny, kg.mensiJednotky], [true, ['g', 'dkg']]);
  const zKat = vedeniPolozky({ unit: 'balení', packageSize: '', contentUnit: '' }, { defaultPackageSize: 1000, contentUnit: 'g', tracksOpen: true, thresholdUnit: 'content' });
  eq('vedení: balení z kategorie (1 000 g) a prahy podle obsahu', [zKat.baleni, zKat.odepisujeV, zKat.prahyV], [{ velikost: 1000, jednotka: 'g', zKategorie: true }, 'g', 'g']);
  eq('vedení: vlastní velikost vyhrává nad kategorií', vedeniPolozky({ unit: 'balení', packageSize: '0,5', contentUnit: 'kg' }, { defaultPackageSize: 1000, contentUnit: 'g' }).baleni,
    { velikost: 0.5, jednotka: 'kg', zKategorie: false });
  eq('vedení: velikost bez jednotky obsahu balení netvoří', vedeniPolozky({ unit: 'balení', packageSize: 1 }, null).baleni, null);
  eq('vedení: prázdná jednotka je ks', vedeniPolozky({ unit: '' }, null).jednotka, 'ks');

  // ---- B: přepočty ----
  eq('celkem: 3 × 0,7 l + 0,35 l = 2,45 l', celkemObsahu(3, 0.7, 0.35), 2.45);
  eq('celkem: 2 balení × 1 000 g = 2 000 g', celkemObsahu('2', '1000', ''), 2000);
  eq('celkem: česká čárka', celkemObsahu('1', '0,7', '0,2'), 0.9);
  eq('celkem: nikdy záporné', celkemObsahu(-1, 0.7, -2), 0);
  eq('na balení: 2 450 g po 1 000 = 2 + 450', naBaleni(2450, 1000), { baleni: 2, zbytek: 450 });
  eq('na balení: 2,1 l po 0,7 = 3 + 0', naBaleni(2.1, 0.7), { baleni: 3, zbytek: 0 });
  eq('na balení: bez velikosti vše zbytek', naBaleni(5, 0), { baleni: 0, zbytek: 5 });
  eq('krok: z „2" o +1', krokMnozstvi('2', 1), 3);
  eq('krok: z „0,7" o −1 ne pod nulu', krokMnozstvi('0,7', -1), 0);
  eq('krok: bez plovoucí chyby', krokMnozstvi('0,1', 0.2), 0.3);
  eq('krok: prázdné pole je nula', krokMnozstvi('', 1), 1);

  // ---- C: inventura — rozdíly a souhrn ----
  const radky: RadekInventury[] = [
    { itemId: 1, name: 'Mléko', category: 'Mléčné', unit: 'l', expected: 8, counted: 8, unitCost: 25 },
    { itemId: 2, name: 'Ovesné mléko', category: 'Mléčné', unit: 'l', expected: 1, counted: null, unitCost: 55 },
    { itemId: 3, name: 'Gin', category: 'Alkohol', unit: 'lahev', expected: 3, counted: 2, packageSize: 0.7, contentUnit: 'l', expectedOpen: 0.35, countedOpen: 0.7, unitCost: 420 },
    { itemId: 4, name: 'Kelímky', category: null, unit: 'ks', expected: 0, counted: 12, unitCost: 2 },
    { itemId: 5, name: 'Cukr', category: 'Suroviny', unit: 'kg', expected: 5, counted: 4, unitCost: null },
  ];
  eq('rozdíl: sedí', rozdilRadku(radky[0]), { ks: 0, obsah: null, vBalenich: 0, hodnota: 0, spocitano: true, zmena: false });
  eq('rozdíl: nespočítáno', rozdilRadku(radky[1]), { ks: 0, obsah: null, vBalenich: 0, hodnota: 0, spocitano: false, zmena: false });
  eq('rozdíl: gin −1 lahev + 0,35 l = −0,5 balení = −210 Kč', rozdilRadku(radky[2]), { ks: -1, obsah: 0.35, vBalenich: -0.5, hodnota: -210, spocitano: true, zmena: true });
  eq('rozdíl: přebytek kelímků +12 = +24 Kč', rozdilRadku(radky[3]).hodnota, 24);
  eq('rozdíl: bez ceny', rozdilRadku(radky[4]).hodnota, null);
  eq('rozdíl: jen načaté spočítané platí jako spočítáno', rozdilRadku({ itemId: 9, name: 'x', unit: 'lahev', expected: 1, counted: null, packageSize: 0.7, expectedOpen: 0.2, countedOpen: 0.5 }),
    { ks: 0, obsah: 0.3, vBalenich: 0.429, hodnota: null, spocitano: true, zmena: true });

  const s = souhrnInventury(radky);
  eq('souhrn: počty', [s.polozek, s.spocitano, s.nespocitano, s.rozdilu], [5, 4, 1, 3]);
  eq('souhrn: ubylo gin a cukr, přibylo kelímky', [s.ubylo.map(x => x.name), s.pribylo.map(x => x.name)], [['Gin', 'Cukr'], ['Kelímky']]);
  eq('souhrn: peníze', [s.hodnotaUbylo, s.hodnotaPribylo, s.saldo, s.bezCeny, s.sCenami], [-210, 24, -186, 1, true]);
  eq('souhrn: bez práva na ceny nejsou ceny', souhrnInventury(radky.map(r => ({ ...r, unitCost: null }))).sCenami, false);
  eq('souhrn: prázdná inventura', souhrnInventury([]), { polozek: 0, spocitano: 0, nespocitano: 0, rozdilu: 0, ubylo: [], pribylo: [], hodnotaUbylo: 0, hodnotaPribylo: 0, saldo: 0, bezCeny: 0, sCenami: false });
  eq('kategorie v pořadí řádků, bez kategorie jako null', kategorieInventury(radky), ['Mléčné', 'Alkohol', null, 'Suroviny']);
  eq('filtr: jedna kategorie', filtrujInventuru(radky, { kategorie: 'Mléčné' }).map(r => r.itemId), [1, 2]);
  eq('filtr: bez kategorie', filtrujInventuru(radky, { kategorie: null }).map(r => r.itemId), [4]);
  eq('filtr: jen nespočítané', filtrujInventuru(radky, { jenNespocitane: true }).map(r => r.itemId), [2]);
  eq('filtr: nic nezadáno = vše', filtrujInventuru(radky, {}).length, 5);

  // ---- D: argument Skladu ----
  eq('arg: kategorie a dochází jako dřív', rozborSkladArg('stav:dochazi|Nápoje'), { kategorie: 'Nápoje', jenDochazi: true });
  eq('arg: akce inventura', rozborSkladArg('akce:inventura'), { kategorie: undefined, jenDochazi: false, akce: 'inventura' });
  eq('arg: položka k úpravě', rozborSkladArg(polozkaArg(12)), { kategorie: undefined, jenDochazi: false, polozkaId: 12 });
  eq('arg: nesmyslná položka se ignoruje', rozborSkladArg('polozka:abc'), { kategorie: undefined, jenDochazi: false });
  eq('arg: neznámá akce není kategorie', rozborSkladArg('akce:neco'), { kategorie: undefined, jenDochazi: false });
  eq('arg: skládání a rozbor jsou inverzní', rozborSkladArg(skladArg({ akce: 'inventura', kategorie: 'Bar', jenDochazi: true })), { kategorie: 'Bar', jenDochazi: true, akce: 'inventura' });
  eq('arg: prázdné', skladArg({}), undefined);
  ok('arg: polozkaArg má tvar polozka:<id>', polozkaArg(7) === 'polozka:7');
}
