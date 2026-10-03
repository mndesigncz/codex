// Chytrý nákupní seznam (lib/nakupSeznam.ts): filtr kategorií, hledání bez diakritiky,
// seskupení, řazení, součty a zapamatovaný stav. Hlídá hlavně to, co by v obchodě
// vadilo: zmizelá položka kvůli filtru, kterého si nikdo nevšiml, a „odškrtnuté“ z včerejška.

import type { Testy } from './_testy.ts';
import {
  sestavKontext, kategoriePolozky, filtruj, seradit, seskup, souhrn, moznostiKategorii, cenaRadku,
  nactiStav, nactiOdskrtnute, serializujOdskrtnute, postup, odskrtnuteDolu, pocetFiltru,
  PRAZDNY_FILTR, VYCHOZI_STAV, BEZ, klicKategorie, type PolozkaNakupu,
} from '../../lib/nakupSeznam.ts';

export default function ({ eq, ok }: Testy) {
  const kat = [
    { id: 1, name: 'Nápoje', position: 0 },
    { id: 2, name: 'Čaje', parentId: 1, position: 0 },
    { id: 3, name: 'Suroviny', position: 1 },
    { id: 4, name: 'Drogerie', position: 2 },
  ];
  const ctx = sestavKontext(kat);
  const p = (id: number, name: string, o: Partial<PolozkaNakupu> = {}): PolozkaNakupu => ({
    id, name, category: null, categoryId: null, supplier: null, unit: 'ks', unitCost: null, stav: 'low', naVyrobu: false, navrh: 1, ...o,
  });
  const polozky = [
    p(1, 'Sencha', { categoryId: 2, supplier: 'Čajový dům', stav: 'critical', navrh: 5, unitCost: 120.5 }),
    p(2, 'Mražená malina', { categoryId: 3, supplier: 'Makro', stav: 'low', navrh: 2, unitCost: 80 }),
    p(3, 'Jar na nádobí', { categoryId: 4, supplier: 'Makro', stav: 'low' }),
    p(4, 'Mouka', { categoryId: 3, stav: 'ok', naVyrobu: true, navrh: 3 }),
    p(5, 'Starý kousek', { category: 'Smazaná kategorie', stav: 'low' }),
    p(6, 'Bez zařazení', { stav: 'critical' }),
    p(7, 'Matcha', { category: 'čaje', supplier: 'Čajový dům', stav: 'low', navrh: 1, unitCost: 300 }),
    p(8, 'Přidáno ručně', { stav: 'ok' }),
  ];

  // ---- kategorie podle kořene stromu ----
  eq('kořen: podkategorie patří pod nadřazenou', kategoriePolozky(polozky[0], ctx), { klic: 'k1', nazev: 'Nápoje' });
  eq('kořen: položka jen se jménem kategorie se najde bez ohledu na velikost písmen', kategoriePolozky(polozky[6], ctx).klic, 'k1');
  eq('kořen: smazaná kategorie se drží podle jména', kategoriePolozky(polozky[4], ctx), { klic: 'j:smazana kategorie', nazev: 'Smazaná kategorie' });
  eq('kořen: bez kategorie', kategoriePolozky(polozky[5], ctx), { klic: BEZ, nazev: null });
  const cyklus = sestavKontext([{ id: 1, name: 'A', parentId: 2 }, { id: 2, name: 'B', parentId: 1 }]);
  ok('kořen: zacyklený strom nezavěsí aplikaci', cyklus.koreny.size === 2);

  // ---- filtr ----
  eq('filtr: bez omezení projdou všechny', filtruj(polozky, PRAZDNY_FILTR, ctx).length, 8);
  eq('filtr: vynechaná kategorie vezme i podkategorie', filtruj(polozky, { ...PRAZDNY_FILTR, vynechane: ['k1'] }, ctx).map(x => x.id), [2, 3, 4, 5, 6, 8]);
  eq('filtr: vynechat „bez kategorie“', filtruj(polozky, { ...PRAZDNY_FILTR, vynechane: [BEZ] }, ctx).some(x => x.id === 6), false);
  eq('filtr: jen kritické', filtruj(polozky, { ...PRAZDNY_FILTR, nalehavost: 'critical' }, ctx).map(x => x.id), [1, 6]);
  eq('filtr: jen dochází', filtruj(polozky, { ...PRAZDNY_FILTR, nalehavost: 'low' }, ctx).map(x => x.id), [2, 3, 5, 7]);
  eq('filtr: jen na výrobu = chybí kvůli výrobě a samo pod limitem není', filtruj(polozky, { ...PRAZDNY_FILTR, nalehavost: 'vyroba' }, ctx).map(x => x.id), [4]);
  eq('filtr: jiné = nad limitem a nechybí na výrobu (ručně přidané)', filtruj(polozky, { ...PRAZDNY_FILTR, nalehavost: 'jine' }, ctx).map(x => x.id), [8]);
  eq('filtr: hledání bez diakritiky', filtruj(polozky, { ...PRAZDNY_FILTR, hledani: 'mrazena' }, ctx).map(x => x.id), [2]);
  eq('filtr: hledání najde i podle dodavatele', filtruj(polozky, { ...PRAZDNY_FILTR, hledani: 'cajovy dum' }, ctx).map(x => x.id), [1, 7]);
  eq('filtr: jen jeden dodavatel', filtruj(polozky, { ...PRAZDNY_FILTR, dodavatel: 'Makro' }, ctx).map(x => x.id), [2, 3]);
  eq('filtr: jen položky bez dodavatele', filtruj(polozky, { ...PRAZDNY_FILTR, dodavatel: BEZ }, ctx).map(x => x.id), [4, 5, 6, 8]);
  eq('filtr: kombinace se násobí', filtruj(polozky, { hledani: 'a', vynechane: ['k3'], nalehavost: 'low', dodavatel: null }, ctx).map(x => x.id), [3, 5, 7]);
  eq('filtr: vstup se nemění', polozky.length, 8);

  // ---- řazení ----
  eq('řazení: naléhavost', seradit(polozky, 'nalehavost').map(x => x.stav), ['critical', 'critical', 'low', 'low', 'low', 'low', 'ok', 'ok']);
  eq('řazení: abeceda česky (Č za C, ne na konec)', seradit([p(1, 'Čaj'), p(2, 'Cukr'), p(3, 'Dýně')], 'abeceda').map(x => x.name), ['Cukr', 'Čaj', 'Dýně']);
  eq('řazení: cena — nejdražší první, bez ceny na konec', seradit(polozky, 'cena').slice(0, 3).map(x => x.id), [1, 7, 2]);
  ok('řazení: položky bez ceny jsou až za těmi s cenou', seradit(polozky, 'cena').slice(3).every(x => cenaRadku(x) == null));

  // ---- cena ----
  eq('cena: haléře se nezaokrouhlují (5 × 120,50)', cenaRadku(polozky[0]), 602.5);
  eq('cena: bez ceny je null', cenaRadku(polozky[3]), null);
  eq('cena: nulová a záporná cena se bere jako žádná', [cenaRadku(p(1, 'a', { unitCost: 0 })), cenaRadku(p(2, 'b', { unitCost: -4 }))], [null, null]);

  // ---- seskupení ----
  const podleDodavatele = seskup(polozky, 'dodavatel', ctx);
  eq('skupiny dodavatel: abecedně, bez dodavatele nakonec', podleDodavatele.map(s => s.klic), ['Čajový dům', 'Makro', BEZ]);
  const podleKategorie = seskup(polozky, 'kategorie', ctx);
  eq('skupiny kategorie: pořadí z podniku, neznámé po nich, „bez“ nakonec', podleKategorie.map(s => s.klic), ['k1', 'k3', 'k4', 'j:smazana kategorie', BEZ]);
  eq('skupiny kategorie: podkategorie ve skupině nadřazené', podleKategorie[0].polozky.map(x => x.id), [1, 7]);
  eq('skupiny naléhavost: kritické, dochází, na výrobu, jiné', seskup(polozky, 'nalehavost', ctx).map(s => s.klic), ['critical', 'low', 'vyroba', 'jine']);
  eq('skupiny: bez seskupení je jedna', seskup(polozky, 'zadne', ctx).length, 1);
  eq('skupiny: prázdný seznam nemá žádnou', seskup([], 'zadne', ctx), []);
  eq('skupiny: nic se neztratí', seskup(polozky, 'kategorie', ctx).reduce((n, s) => n + s.polozky.length, 0), 8);

  // ---- součty ----
  const s = souhrn(polozky);
  eq('souhrn: počty podle naléhavosti', [s.pocet, s.kriticke, s.dochazi, s.naVyrobu, s.jine], [8, 2, 4, 1, 1]);
  eq('souhrn: odhad ceny jen z položek s cenou', s.odhadCeny, 602.5 + 160 + 300);
  eq('souhrn: kolik položek cenu nemá', s.bezCeny, 5);
  eq('souhrn: prázdný seznam', souhrn([]), { pocet: 0, kriticke: 0, dochazi: 0, naVyrobu: 0, jine: 0, odhadCeny: 0, bezCeny: 0 });

  // ---- nabídka kategorií ----
  const m = moznostiKategorii(polozky, [], ctx);
  eq('nabídka: kořeny s počty, v pořadí podniku', m.map(x => [x.klic, x.pocet]), [['k1', 2], ['k3', 2], ['k4', 1], ['j:smazana kategorie', 1], [BEZ, 2]]);
  const mVynechana = moznostiKategorii(polozky.filter(x => x.categoryId !== 4), [klicKategorie(4), BEZ], ctx);
  ok('nabídka: vynechaná kategorie zůstane k dispozici, i když v ní nic nechybí', mVynechana.some(x => x.klic === 'k4' && x.pocet === 0 && x.nazev === 'Drogerie'));

  // ---- zapamatovaný stav ----
  eq('stav: nesmysl dá výchozí', nactiStav('{rozbité'), VYCHOZI_STAV);
  eq('stav: null dá výchozí', nactiStav(null), VYCHOZI_STAV);
  eq('stav: neznámé hodnoty se nahradí výchozími', nactiStav({ nalehavost: 'hodně', seskupit: 'x', razeni: 5, vynechane: 'k1', sbalene: [1, 2] }), VYCHOZI_STAV);
  eq('stav: platný stav projde, duplicity se zahodí', nactiStav({ vynechane: ['k4', 'k4', BEZ], nalehavost: 'critical', seskupit: 'kategorie', razeni: 'cena', sbalene: ['Makro'] }),
    { vynechane: ['k4', BEZ], nalehavost: 'critical', seskupit: 'kategorie', razeni: 'cena', sbalene: ['Makro'] });
  eq('stav: obrovský seznam se ořízne', nactiStav({ vynechane: Array.from({ length: 900 }, (_, i) => `k${i}`) }).vynechane.length, 200);

  // ---- odškrtnuté jen ten den ----
  const dnes = '2026-10-03';
  const ulozeno = serializujOdskrtnute([2, 5], dnes);
  eq('odškrtnuté: ten samý den se načtou', Array.from(nactiOdskrtnute(ulozeno, dnes)).sort(), [2, 5]);
  eq('odškrtnuté: včerejšek neplatí', nactiOdskrtnute(ulozeno, '2026-10-04').size, 0);
  eq('odškrtnuté: nesmysl dá prázdno', nactiOdskrtnute('není to json', dnes).size, 0);
  eq('odškrtnuté: nečísla a záporná se zahodí', Array.from(nactiOdskrtnute({ den: dnes, ids: [3, -1, 'x', 1.5, null, 4] }, dnes)).sort(), [3, 4]);
  eq('postup: odškrtnutá položka mimo filtr se nepočítá', postup(polozky.slice(0, 3), new Set([1, 7, 99])), { hotovo: 1, celkem: 3 });
  eq('odškrtnuté dolů: pořadí ostatních zůstane', odskrtnuteDolu([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }], new Set([1, 3])).map(x => x.id), [2, 4, 1, 3]);

  // ---- odznak filtrů ----
  eq('odznak filtrů', [pocetFiltru(PRAZDNY_FILTR), pocetFiltru({ ...PRAZDNY_FILTR, hledani: ' ' }), pocetFiltru({ hledani: 'a', vynechane: ['k1'], nalehavost: 'low', dodavatel: null })], [0, 0, 3]);
}
