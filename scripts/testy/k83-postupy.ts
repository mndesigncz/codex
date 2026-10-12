// Kolo 7, balík R7-5 (Postupy, návody, nápady a odměny) — jednotkové testy.
//
// Hlídá čistou logiku balíku: validaci úpravy odměny (lib/odmenyKatalog.ts).
// Další části balíku (měřená hodnota v kroku, poslední průběhy postupu, fotky
// v návodu) přidávají své testy níž.

import type { Testy } from './_testy.ts';
import { validujOdmenu, jeIkonaOdmeny, grafemy, MAX_NAZEV_ODMENY, MAX_CENA_ODMENY } from '../../lib/odmenyKatalog.ts';

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
}
