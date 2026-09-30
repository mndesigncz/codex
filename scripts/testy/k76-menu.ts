// Kolo 76: veřejný jídelní lístek ve více jazycích (lib/menu.ts publicShape).
// Pravidla: chybějící překlad padá na výchozí text, překlad nikdy nemění cenu
// ani „vyprodáno", neznámý nebo nenabízený jazyk není chyba, alergeny mimo 1–14
// se zahodí a prázdné alergeny se nikdy nevydávají za „bez alergenů".

import type { Testy } from './_testy.ts';
import { buildBoard, publicShape, cleanLangs, cleanI18n, zvolenyJazyk, desetinyMeny, menaListku, nastavPreklad, chybiPreklad, POZNAMKA_VYCHOZI, POZNAMKA_ALERGENY, SEED_BOARD, POLE_POLOZKY, MAX_POLOZKA_I18N } from '../../lib/menu.ts';

const deska = (extra: any = {}) => ({
  id: 1, slug: 'cafe', name: 'Café', eyebrow: 'Venkovní akce', title: 'Speciální nabídka', note: SEED_BOARD.note,
  wifi_ssid: null, wifi_password: null, currency: 'Kč', enabled: true, theme: null,
  langs: { vychozi: 'cs', nabizet: ['cs', 'en', 'de'] },
  i18n: { en: { title: 'Special offer', eyebrow: 'Outdoor event' }, de: { title: 'Sonderangebot' } },
  ...extra,
});
const sekce = [
  { id: 10, title: 'Nápoje', column_no: 1, position: 0, i18n: { en: { title: 'Drinks' } } },
  { id: 11, title: 'Jídlo', column_no: 2, position: 1, i18n: null },
];
const polozky = [
  { id: 100, section_id: 10, name: 'Ledový Tuareg', price: 69, description: 'Osvěžující', sold_out: false, position: 0,
    allergens: [7, 1], tags: ['vegan', 'nesmysl'], i18n: { en: { name: 'Iced Tuareg', description: 'Refreshing' }, de: { name: 'Eistee Tuareg' } } },
  { id: 101, section_id: 10, name: 'Gin tonic', price: 119.5, description: null, sold_out: true, position: 1, allergens: [], tags: [], i18n: { en: { name: 'Gin and tonic' } } },
  { id: 102, section_id: 11, name: 'Full plate', price: 139, description: 'Od každého trošku', sold_out: false, position: 0, allergens: '{1,3,99}', tags: null, i18n: null },
];
const board = () => buildBoard(deska(), sekce, polozky);

export default function ({ eq, ok }: Testy) {
  // ---- výchozí jazyk a fallback ----
  const cs = publicShape(board());
  eq('bez ?lang: výchozí jazyk lístku', [cs.eyebrow, cs.title, cs.jazyky.zvoleny], ['Venkovní akce', 'Speciální nabídka', 'cs']);
  eq('nabízené jazyky v odpovědi', cs.jazyky, { vychozi: 'cs', nabizet: ['cs', 'en', 'de'], zvoleny: 'cs' });
  const en = publicShape(board(), 'en');
  eq('en: deska, sekce a položky přeložené', [en.eyebrow, en.title, en.sekce[0].nadpis, en.sekce[0].polozky[0].name, en.sekce[0].polozky[0].desc], ['Outdoor event', 'Special offer', 'Drinks', 'Iced Tuareg', 'Refreshing']);
  eq('en: chybí překlad popisu → výchozí text', publicShape(board(), 'en').sekce[0].polozky[1].desc, undefined);
  eq('en: sekce bez překladu → výchozí nadpis', en.sekce[1].nadpis, 'Jídlo');
  eq('en: položka bez překladu → výchozí jméno i popis', [en.sekce[1].polozky[0].name, en.sekce[1].polozky[0].desc], ['Full plate', 'Od každého trošku']);
  const de = publicShape(board(), 'de');
  eq('de: chybí-li pole, padá na výchozí (ne na angličtinu)', [de.eyebrow, de.title, de.sekce[0].polozky[0].desc], ['Venkovní akce', 'Sonderangebot', 'Osvěžující']);
  eq('nenabízený jazyk (pl) → výchozí', publicShape(board(), 'pl').jazyky.zvoleny, 'cs');
  eq('nesmysl (?lang=xx, __proto__, prázdné) → výchozí', ['xx', '__proto__', '', null, 42].map(l => publicShape(board(), l as any).jazyky.zvoleny), ['cs', 'cs', 'cs', 'cs', 'cs']);
  eq('kód s regionem (en-GB) se bere jako en', publicShape(board(), 'en-GB').jazyky.zvoleny, 'en');

  // ---- překlad nikdy nemění cenu ani vyprodáno ----
  const vsechnyCeny = (sh: any) => sh.sekce.flatMap((s: any) => s.polozky.map((p: any) => [p.id, p.price, p.vyprodano]));
  eq('cena a vyprodáno jsou ve všech jazycích stejné', [vsechnyCeny(cs), vsechnyCeny(en), vsechnyCeny(de)], [vsechnyCeny(cs), vsechnyCeny(cs), vsechnyCeny(cs)]);
  eq('ceny s haléři zůstanou (119,5)', cs.sekce[0].polozky[1].price, 119.5);
  eq('vyprodáno zůstane', cs.sekce[0].polozky[1].vyprodano, true);
  const zlyPreklad = buildBoard(deska(), sekce, [{ ...polozky[0], i18n: { en: { name: 'X', price: 1, vyprodano: false, soldOut: false } } }, polozky[1], polozky[2]]);
  eq('překlad s cenou a vyprodáno v těle je ignoruje (jen name/description)', [publicShape(zlyPreklad, 'en').sekce[0].polozky[0].price, publicShape(zlyPreklad, 'en').sekce[0].polozky[0].name], [69, 'X']);

  // ---- čištění překladů ----
  eq('cleanI18n: výchozí jazyk, neznámé jazyky a pole pryč, texty oříznuté', cleanI18n({ cs: { name: 'a' }, en: { name: '  Ice\n\ttea  ', extra: 'x', description: '' }, xx: { name: 'b' }, de: { name: 'y'.repeat(200) } }, POLE_POLOZKY, MAX_POLOZKA_I18N),
    { en: { name: 'Ice tea' }, de: { name: 'y'.repeat(80) } });
  eq('cleanI18n: nesmysly', [cleanI18n(null, POLE_POLOZKY, MAX_POLOZKA_I18N), cleanI18n('x', POLE_POLOZKY, MAX_POLOZKA_I18N), cleanI18n([], POLE_POLOZKY, MAX_POLOZKA_I18N), cleanI18n({ en: 'text' }, POLE_POLOZKY, MAX_POLOZKA_I18N)], [{}, {}, {}, {}]);
  eq('cleanI18n: JSON v řetězci', cleanI18n('{"en":{"name":"Tea"}}', POLE_POLOZKY, MAX_POLOZKA_I18N), { en: { name: 'Tea' } });
  eq('cleanI18n: jazyk = výchozí jazyk lístku se zahazuje (i angličtina)', cleanI18n({ en: { name: 'Tea' }, cs: { name: 'Čaj' } }, POLE_POLOZKY, MAX_POLOZKA_I18N, 'en'), { cs: { name: 'Čaj' } });
  eq('cleanLangs: výchozí je vždy první a mezi nabízenými, pořadí jako JAZYKY', cleanLangs({ vychozi: 'de', nabizet: ['pl', 'en', 'xx', 'de', 'en'] }), { vychozi: 'de', nabizet: ['de', 'en', 'pl'] });
  eq('cleanLangs: nic / nesmysl = jen čeština', [cleanLangs(null), cleanLangs('x'), cleanLangs({}), cleanLangs([])], Array(4).fill({ vychozi: 'cs', nabizet: ['cs'] }));
  eq('zvolenyJazyk', [zvolenyJazyk({ vychozi: 'cs', nabizet: ['cs', 'en'] }, 'en'), zvolenyJazyk({ vychozi: 'cs', nabizet: ['cs'] }, 'en')], ['en', 'cs']);

  // ---- lístek bez nových sloupců (před /api/init) ----
  const starsi = buildBoard({ id: 2, slug: 'stary', name: 'Starý', eyebrow: 'a', title: 'b', note: null, currency: 'Kč', enabled: true, theme: null }, [{ id: 1, title: 'N', column_no: 1, position: 0 }], [{ id: 1, section_id: 1, name: 'Čaj', price: 49, description: null, sold_out: false, position: 0 }]);
  const ss = publicShape(starsi, 'en');
  eq('bez sloupců: jen čeština, žádné překlady, žádné alergeny', [ss.jazyky, ss.sekce[0].polozky[0].name, ss.alergenyPoznamka, ss.alergenyNeuplne, ss.poznamka], [{ vychozi: 'cs', nabizet: ['cs'], zvoleny: 'cs' }, 'Čaj', null, false, null]);
  ok('bez alergenů položka alergeny ani štítky neobsahuje (nic se nevydává za „bez alergenů")', !('alergeny' in ss.sekce[0].polozky[0]) && !('stitky' in ss.sekce[0].polozky[0]));

  // ---- alergeny a štítky ----
  eq('alergeny položky: seřazené, platné', cs.sekce[0].polozky[0].alergeny, [1, 7]);
  eq('alergeny z textového zápisu pole {1,3,99}: 99 pryč', cs.sekce[1].polozky[0].alergeny, [1, 3]);
  eq('štítky: neznámý pryč', cs.sekce[0].polozky[0].stitky, ['vegan']);
  eq('položka bez alergenů je bez pole alergeny', 'alergeny' in cs.sekce[0].polozky[1], false);
  eq('názvy alergenů jen pro použité kódy, v jazyce hosta', [Object.keys(cs.alergenyNazvy), en.alergenyNazvy[7], de.alergenyNazvy[7], publicShape(board(), 'de').alergenyNazvy[1]], [['1', '3', '7'], 'Milk', 'Milch', 'Glutenhaltiges Getreide']);
  eq('názvy štítků v jazyce', [en.stitkyNazvy.vegan, cs.stitkyNazvy.vegan], ['Vegan', 'Vegan']);
  eq('alergeny neúplné: některé položky nemají data', cs.alergenyNeuplne, true);
  eq('věta o alergenech v jazyce hosta', [cs.alergenyPoznamka, en.alergenyPoznamka?.startsWith('Allergens are listed')], [POZNAMKA_ALERGENY.cs, true]);
  eq('výchozí poznámka ustoupí větě o alergenech, jakmile jsou vyplněné', cs.poznamka, null);

  // ---- poznámka ----
  const bezAlergenu = buildBoard(deska(), sekce, polozky.map(p => ({ ...p, allergens: [] })));
  eq('bez alergenů: výchozí poznámka přeložená', [publicShape(bezAlergenu, 'en').poznamka, publicShape(bezAlergenu, 'de').poznamka, publicShape(bezAlergenu).poznamka], [POZNAMKA_VYCHOZI.en, POZNAMKA_VYCHOZI.de, SEED_BOARD.note]);
  const vlastni = buildBoard(deska({ note: 'Dnes jen hotově', i18n: { en: { note: 'Cash only today' } } }), sekce, polozky.map(p => ({ ...p, allergens: [] })));
  eq('vlastní poznámka podniku se nepřekládá sama; přeložená v editoru ano', [publicShape(vlastni, 'de').poznamka, publicShape(vlastni, 'en').poznamka, publicShape(vlastni).poznamka], ['Dnes jen hotově', 'Cash only today', 'Dnes jen hotově']);
  eq('žádná poznámka zůstane žádná', publicShape(buildBoard(deska({ note: null }), sekce, polozky.map(p => ({ ...p, allergens: [] }))), 'en').poznamka, null);

  // ---- měna, locale ----
  eq('měna: symbol Kč → kód CZK, bez desetin', [cs.menaKod, cs.desetiny, cs.mena], ['CZK', 0, 'Kč']);
  const eur = publicShape(buildBoard(deska({ currency: 'EUR' }), sekce, polozky), 'de', { locale: 'de-DE' });
  eq('EUR: dvě desetinná místa a locale podniku', [eur.menaKod, eur.desetiny, eur.locale], ['EUR', 2, 'de-DE']);
  eq('locale bez nastavení podniku podle jazyka lístku', cs.locale, 'cs-CZ');
  eq('desetinyMeny', [desetinyMeny('CZK'), desetinyMeny('HUF'), desetinyMeny('PLN'), desetinyMeny('EUR')], [0, 0, 2, 2]);

  // ---- výchozí jazyk lístku není čeština ----
  const anglicky = buildBoard(deska({ title: 'Special offer', eyebrow: 'Outdoor', langs: { vychozi: 'en', nabizet: ['en', 'cs'] }, i18n: { cs: { title: 'Speciální nabídka' } } }), sekce, polozky);
  eq('výchozí en: bez ?lang anglicky, ?lang=cs česky', [publicShape(anglicky).title, publicShape(anglicky, 'cs').title, publicShape(anglicky).jazyky.nabizet], ['Special offer', 'Speciální nabídka', ['en', 'cs']]);

  // ---- měna z podniku ----
  eq('menaListku: výchozí Kč u eurového podniku = EUR (Kč je výchozí hodnota sloupce, ne volba)', [menaListku('Kč', 'EUR'), menaListku('CZK', 'PLN'), menaListku('Kč', 'CZK'), menaListku('Kč', null), menaListku('Kč')], ['EUR', 'PLN', 'CZK', 'CZK', 'CZK']);
  eq('menaListku: výslovná jiná měna desky vyhrává nad podnikem', [menaListku('EUR', 'CZK'), menaListku('€', 'PLN')], ['EUR', 'EUR']);
  const euroPodnik = publicShape(buildBoard(deska(), sekce, polozky), 'cs', { locale: 'de-DE', currency: 'EUR' });
  eq('veřejný lístek eurového podniku: EUR, dvě desetiny, symbol €', [euroPodnik.menaKod, euroPodnik.desetiny, euroPodnik.mena], ['EUR', 2, '€']);

  // ---- překlady v editoru ----
  eq('nastavPreklad: zapíše a nemění vstup', [nastavPreklad<'name' | 'description'>(undefined, 'en', 'name', 'Tea'), nastavPreklad<'name' | 'description'>({ en: { name: 'A' } }, 'en', 'description', 'B')], [{ en: { name: 'Tea' } }, { en: { name: 'A', description: 'B' } }]);
  eq('nastavPreklad: prázdný text pole odebere, prázdný jazyk odebere celý', [nastavPreklad<'name'>({ en: { name: 'A' } }, 'en', 'name', '  '), nastavPreklad<'name'>({ en: { name: 'A' }, de: { name: 'B' } }, 'en', 'name', '')], [{}, { de: { name: 'B' } }]);
  const orig = { en: { name: 'A' } }; nastavPreklad<'name'>(orig, 'en', 'name', 'Z');
  eq('nastavPreklad nepřepisuje původní objekt', orig, { en: { name: 'A' } });
  const bezPrekladu = board();
  eq('chybiPreklad: názvy bez překladu do jazyka (deska, sekce, položky)', [chybiPreklad(bezPrekladu, 'en'), chybiPreklad(bezPrekladu, 'de'), chybiPreklad(bezPrekladu, 'pl')], [2, 4, 6]);
}
