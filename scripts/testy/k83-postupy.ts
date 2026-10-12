// Kolo 7, balík R7-5 (Postupy, návody, nápady a odměny) — jednotkové testy.
//
// Hlídá čistou logiku balíku: validaci úpravy odměny (lib/odmenyKatalog.ts),
// poslední průběhy jednoho postupu (lib/postupyPrehled.ts), fotky v návodu
// (lib/navodObsah.ts). Měřená hodnota v kroku přidává své testy níž.

import type { Testy } from './_testy.ts';
import { validujOdmenu, jeIkonaOdmeny, grafemy, MAX_NAZEV_ODMENY, MAX_CENA_ODMENY } from '../../lib/odmenyKatalog.ts';
import { prubehyPostupu, PRUBEHU_V_DETAILU, type PrubehApi } from '../../lib/postupyPrehled.ts';
import { radekFotky, popisZNazvuSouboru, zapisFotky, vlozFotku, cistyPopis, MAX_POPIS_FOTKY } from '../../lib/navodObsah.ts';

export default function ({ eq, ok }: Testy) {
  // ---- odměny: validace přidání a úpravy ----
  eq('odměna: přidání s názvem, cenou a emoji projde a ořízne mezery',
    validujOdmenu({ title: '  Volný pátek ', cost: '150', icon: ' 🏖️ ' }, true), { ok: true, hodnoty: { title: 'Volný pátek', cost: 150, icon: '🏖️' } });
  eq('odměna: přidání bez názvu = nazev-chybi', validujOdmenu({ title: '   ', cost: 10 }, true), { ok: false, chyba: 'nazev-chybi' });
  eq('odměna: přidání bez ceny = cena', validujOdmenu({ title: 'Káva' }, true), { ok: false, chyba: 'cena' });
  eq(`odměna: název na ${MAX_NAZEV_ODMENY} znaků projde`, validujOdmenu({ title: 'a'.repeat(MAX_NAZEV_ODMENY), cost: 1 }, true).ok, true);
  eq(`odměna: název přes ${MAX_NAZEV_ODMENY} znaků = nazev-dlouhy`, validujOdmenu({ title: 'a'.repeat(MAX_NAZEV_ODMENY + 1), cost: 1 }, true), { ok: false, chyba: 'nazev-dlouhy' });
  eq('odměna: cena 0 = cena', validujOdmenu({ title: 'Káva', cost: 0 }, true), { ok: false, chyba: 'cena' });
  eq('odměna: cena desetinná = cena (ne tiché zaokrouhlení)', validujOdmenu({ title: 'Káva', cost: 12.5 }, true), { ok: false, chyba: 'cena' });
  eq('odměna: cena „12,5" = cena', validujOdmenu({ title: 'Káva', cost: '12,5' }, true), { ok: false, chyba: 'cena' });
  eq(`odměna: cena ${MAX_CENA_ODMENY} projde`, validujOdmenu({ title: 'Káva', cost: MAX_CENA_ODMENY }, true).ok, true);
  eq(`odměna: cena „100 000" s mezerou projde`, validujOdmenu({ title: 'Káva', cost: '100 000' }, true), { ok: true, hodnoty: { title: 'Káva', cost: 100000 } });
  eq(`odměna: cena přes ${MAX_CENA_ODMENY} = cena`, validujOdmenu({ title: 'Káva', cost: MAX_CENA_ODMENY + 1 }, true), { ok: false, chyba: 'cena' });
  eq('odměna: cena true/null/text = cena', [true, null, 'abc', ''].map(c => validujOdmenu({ title: 'Káva', cost: c }, true).ok), [false, false, false, false]);
  eq('odměna: úprava jen ceny nechá název a ikonu být', validujOdmenu({ cost: 120 }, false), { ok: true, hodnoty: { cost: 120 } });
  eq('odměna: úprava s prázdnou ikonou ji smaže (null)', validujOdmenu({ icon: '' }, false), { ok: true, hodnoty: { icon: null } });
  eq('odměna: úprava s ikonou null ji smaže', validujOdmenu({ icon: null }, false), { ok: true, hodnoty: { icon: null } });
  eq('odměna: úprava s prázdným názvem = nazev-chybi', validujOdmenu({ title: '' }, false), { ok: false, chyba: 'nazev-chybi' });
  eq('odměna: ikona z písmen = ikona', validujOdmenu({ title: 'Káva', cost: 5, icon: 'AB' }, true), { ok: false, chyba: 'ikona' });
  ok('ikona: jedno emoji', jeIkonaOdmeny('☕'));
  ok('ikona: dvě emoji', jeIkonaOdmeny('☕🍰'));
  ok('ikona: tři emoji ne', !jeIkonaOdmeny('☕🍰🎁'));
  ok('ikona: emoji se ZWJ (👩‍🍳) je jeden grafém', jeIkonaOdmeny('👩‍🍳') && grafemy('👩‍🍳').length === 1);
  ok('ikona: vlajka (dva regionální indikátory) je jedno emoji', jeIkonaOdmeny('🇨🇿'));
  ok('ikona: číslice ani písmeno ne', !jeIkonaOdmeny('1') && !jeIkonaOdmeny('a'));
  ok('ikona: prázdná = bez ikony', jeIkonaOdmeny('  '));

  // ---- detail postupu: poslední průběhy jednoho postupu ----
  const beh = (id: number, postup: number | null, kdy: string, o: Partial<PrubehApi> = {}): PrubehApi => ({
    id, procedure_id: postup, procedure_name: 'Zavírání', user_name: `Člověk ${id}`, status: 'completed', total_items: 3,
    checked_items: [0, 1, 2], started_at: kdy, completed_at: kdy, duration_seconds: 600, ...o,
  });
  const behy: PrubehApi[] = [
    beh(1, 2, '2026-10-01 20:00:00'),
    beh(2, 1, '2026-10-09 07:40:00'),
    beh(3, 2, '2026-10-08 20:10:00', { checked_items: [0], skipped_items: [1] }),
    beh(4, 2, '2026-10-02 20:00:00'),
    beh(5, 2, '2026-10-03 20:00:00'),
    beh(6, 2, '2026-10-04 20:00:00'),
    beh(7, 2, '2026-10-05 20:00:00'),
    beh(8, null, '2026-10-10 20:00:00'),
    beh(9, 2, '2026-10-11 20:00:00', { status: 'running', completed_at: null, checked_items: [0] }),
  ];
  const r2 = prubehyPostupu(behy, 2);
  eq(`průběhy postupu: jen tohoto postupu (podle ID), nejnovější nahoře, nejvýš ${PRUBEHU_V_DETAILU}`, r2.map(r => r.id), [9, 3, 7, 6, 5]);
  eq('průběhy postupu: běžící je „nehotový" s počtem odškrtnutých', [r2[0].hotovo, r2[0].odskrtano, r2[0].celkem], [false, 1, 3]);
  eq('průběhy postupu: nedokončený (1 ze 3) má nedokonceno 2', r2[1].nedokonceno, 2);
  eq('průběhy postupu: celý hotový má nedokonceno 0', r2[2].nedokonceno, 0);
  eq('průběhy postupu: jiný postup a průběh bez postupu se nemíchají', prubehyPostupu(behy, 1).map(r => r.id), [2]);
  eq('průběhy postupu: postup bez průběhů = prázdno', prubehyPostupu(behy, 3), []);
  eq('průběhy postupu: id jako text z API páruje taky', prubehyPostupu([beh(1, '4' as unknown as number, '2026-10-01 10:00:00')], 4).length, 1);
  eq('průběhy postupu: vlastní počet', prubehyPostupu(behy, 2, 2).map(r => r.id), [9, 3]);

  // ---- návod: fotky v obsahu ----
  eq('fotka: řádek ![popis](/api/upload/id) = fotka', radekFotky('![Pěna na flat white](/api/upload/41)'), { popis: 'Pěna na flat white', url: '/api/upload/41' });
  eq('fotka: okrajové mezery řádku nevadí', radekFotky('  ![x](/api/upload/a_B-9)  '), { popis: 'x', url: '/api/upload/a_B-9' });
  eq('fotka: prázdný popis projde', radekFotky('![](/api/upload/5)'), { popis: '', url: '/api/upload/5' });
  eq('fotka: cizí doména = text', radekFotky('![pixel](https://sledovani.example.com/p.gif)'), null);
  eq('fotka: protokol-relativní cizí adresa = text', radekFotky('![x](//evil.example/a.png)'), null);
  eq('fotka: jiná naše cesta = text', radekFotky('![x](/api/menu/public/u-lipy/qr)'), null);
  eq('fotka: výstup z cesty (../) = text', radekFotky('![x](/api/upload/../teams)'), null);
  eq('fotka: parametry za id = text', radekFotky('![x](/api/upload/5?x=1)'), null);
  eq('fotka: uprostřed věty = text', radekFotky('Viz ![x](/api/upload/5) níž'), null);
  eq('fotka: javascript: = text', radekFotky('![x](javascript:alert(1))'), null);
  eq('fotka: odrážka ani obyčejný text fotkou nejsou', [radekFotky('- mléko'), radekFotky('Dvojité espresso.')], [null, null]);
  eq('popis z názvu souboru: bez přípony', popisZNazvuSouboru('IMG_2041.HEIC'), 'IMG_2041');
  eq('popis z názvu souboru: bez závorek a zalomení', popisZNazvuSouboru('latte [nový] (2).jpg'), 'latte nový 2');
  eq(`popis: nejvýš ${MAX_POPIS_FOTKY} znaků`, cistyPopis('x'.repeat(200)).length, MAX_POPIS_FOTKY);
  eq('zápis fotky: náš upload', zapisFotky('Pěna', '/api/upload/77'), '![Pěna](/api/upload/77)');
  eq('zápis fotky: cizí adresa se nezapíše', zapisFotky('x', 'https://evil.example/a.png'), null);
  eq('vložení: do prázdného obsahu bez prázdných řádků', vlozFotku('', 0, '![a](/api/upload/1)'), { text: '![a](/api/upload/1)', kurzor: 19 });
  eq('vložení: na konec řádku = nový řádek pod ním', vlozFotku('Napěň mléko.\nPak nalij.', 12, '![a](/api/upload/1)'),
    { text: 'Napěň mléko.\n![a](/api/upload/1)\nPak nalij.', kurzor: 32 });
  eq('vložení: uprostřed řádku = zalomení před i za fotkou', vlozFotku('AB', 1, '![a](/api/upload/1)'), { text: 'A\n![a](/api/upload/1)\nB', kurzor: 21 });
  eq('vložení: na začátek řádku = fotka nad ním', vlozFotku('A\nB', 2, '![a](/api/upload/1)'), { text: 'A\n![a](/api/upload/1)\nB', kurzor: 21 });
  eq('vložení: pozice mimo text = na konec', vlozFotku('A', 99, '![a](/api/upload/1)'), { text: 'A\n![a](/api/upload/1)', kurzor: 21 });
  ok('vložená fotka je po vložení zase řádek fotky', vlozFotku('A', 1, zapisFotky('p', '/api/upload/9')!).text.split('\n').some(r => radekFotky(r) != null));
}
