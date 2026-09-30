// Kolo 76: jádro vícejazyčnosti. Plurály pěti jazyků, interpolace, fallback,
// klíče s kontextem, zpětná kompatibilita czech.ts, formáty, předvolby zemí
// a slovníky v locales/ (placeholdery a plurály musí sedět s českou větou).
//
// Čistá logika, žádný prohlížeč; chování na obrazovce hlídá sonda k76-jazyk.

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { JAZYKY, FALLBACK, retezJazyku, cistyJazyk, jazykZAccept, stripeLocale, jeJazyk, LOCALE_PRO_JAZYK } from '../../lib/i18n/config.ts';
import { kategorie, vyberTvar } from '../../lib/i18n/plural.ts';
import { preloz, prelozId, formatuj, jmenaVeZprave, pluralSelektory, slouci } from '../../lib/i18n/core.ts';
import { fmtDatum, fmtCas, fmtDenVTydnu, fmtMesic } from '../../lib/i18n/format.ts';
import { PREDVOLBY_ZEMI, ZEME, navrhNastaveni, predvolbaProZemi, cistaZeme } from '../../lib/i18n/zeme.ts';
import { czForm, czCount, czVerb, POLOZKA, DEN } from '../../lib/czech.ts';
import { czDays } from '../../lib/plan.ts';
import { CURRENCIES } from '../../lib/money.ts';
import { ALERGENY, KODY_ALERGENU, nazevAlergenu, cistiAlergeny } from '../../lib/alergeny.ts';

const HRANICE = [0, 1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 100, 101, 102, 1.5];

export default function ({ eq, ok }: Testy) {
  // ---- plurály: kategorie ----
  const kat = (j: any) => HRANICE.map(n => kategorie(j, n));
  eq('plurál cs: one/few/other (0 a 5+ = other)', kat('cs'),
    ['other', 'one', 'few', 'few', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other']);
  eq('plurál sk: stejně jako cs', kat('sk'), kat('cs'));
  eq('plurál en: one jen pro 1', kat('en'),
    ['other', 'one', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other', 'other']);
  eq('plurál de: jako angličtina', kat('de'), kat('en'));
  eq('plurál pl: few je 2–4 a 22–24 (ne 12–14), many 0 a 5–21, 25+', kat('pl'),
    ['many', 'one', 'few', 'few', 'many', 'many', 'many', 'many', 'many', 'few', 'many', 'many', 'many', 'few', 'other']);

  // ---- czForm: stejný výstup jako před přechodem na společné jádro ----
  const staryCzForm = (n: number) => { const a = Math.abs(n); return a === 1 ? 'one' : a >= 2 && a <= 4 ? 'few' : 'many'; };
  const w = { one: 'one', few: 'few', many: 'many' };
  let shoda = true;
  for (let n = -30; n <= 300; n++) if (czForm(n, w) !== staryCzForm(n)) shoda = false;
  for (const n of [0.5, 1.5, 2.5, 4.5, 5.5]) if (czForm(n, w) !== staryCzForm(n)) shoda = false;
  ok('czForm: pro celá čísla i zlomky přesně jako dřív', shoda);
  eq('czCount: 1 položka / 3 položky / 5 položek / 0 položek',
    [czCount(1, POLOZKA), czCount(3, POLOZKA), czCount(5, POLOZKA), czCount(0, POLOZKA)],
    ['1 položka', '3 položky', '5 položek', '0 položek']);
  eq('czVerb: čeká / čekají', [czVerb(1, 'čeká', 'čekají'), czVerb(3, 'čeká', 'čekají'), czVerb(5, 'čeká', 'čekají')], ['čeká', 'čekají', 'čeká']);
  eq('czDays přes společné jádro: 1 den, 3 dny, 7 dní', [czDays(1), czDays(3), czDays(7)], ['1 den', '3 dny', '7 dní']);
  eq('czCount(DEN): 22 dní', czCount(22, DEN), '22 dní');

  // ---- vyberTvar ----
  eq('vyberTvar: =0 má přednost', vyberTvar('cs', 0, { '=0': 'žádná', one: 'jedna', other: 'víc' }), 'žádná');
  eq('vyberTvar: chybí-li few, padá na other', vyberTvar('cs', 3, { one: 'a', other: 'b' }), 'b');
  eq('vyberTvar: other chybí, vezme se many (CzNoun)', vyberTvar('cs', 9, { one: 'a', many: 'm' }), 'm');
  eq('vyberTvar: prázdné tvary nikdy undefined', vyberTvar('en', 3, {}), '');

  // ---- formátování zprávy ----
  const PL_CS = '{n, plural, one {# položka} few {# položky} other {# položek}}';
  eq('ICU cs: 1 / 3 / 5', [1, 3, 5].map(n => formatuj(PL_CS, { n }, 'cs')), ['1 položka', '3 položky', '5 položek']);
  const PL_EN = '{n, plural, one {# item} other {# items}}';
  eq('ICU en: 1 / 2', [1, 2].map(n => formatuj(PL_EN, { n }, 'en')), ['1 item', '2 items']);
  const PL_PL = '{n, plural, one {# pozycja} few {# pozycje} many {# pozycji} other {# pozycji}}';
  eq('ICU pl: 1 / 2 / 5 / 12 / 22 / 25', [1, 2, 5, 12, 22, 25].map(n => formatuj(PL_PL, { n }, 'pl')),
    ['1 pozycja', '2 pozycje', '5 pozycji', '12 pozycji', '22 pozycje', '25 pozycji']);
  eq('ICU de: 1 Artikel / 4 Artikel', [1, 4].map(n => formatuj('{n, plural, one {# Artikel} other {# Artikel}}', { n }, 'de')), ['1 Artikel', '4 Artikel']);
  eq('ICU =0 přednost před kategorií', formatuj('{n, plural, =0 {nic} one {# věc} other {# věcí}}', { n: 0 }, 'cs'), 'nic');
  eq('ICU: # se formátuje podle locale (tisíce)', formatuj('{n, plural, one {# x} other {# x}}', { n: 1500 }, 'en'), '1,500 x');
  eq('interpolace {jmeno}', formatuj('Smazat položku {name}?', { name: 'Káva' }, 'cs'), 'Smazat položku Káva?');
  eq('chybějící parametr zůstane jako {name}, nikdy výjimka', formatuj('Ahoj {name}', {}, 'cs'), 'Ahoj {name}');
  eq('chybějící číslo v plurálu: other a # zůstane', formatuj(PL_CS, {}, 'cs'), '# položek');
  eq('osamocená závorka je obyčejný znak', formatuj('a { b', {}, 'cs'), 'a { b');
  eq('text bez závorek se nezpracovává', formatuj('Uložit', undefined, 'cs'), 'Uložit');
  eq('parametr číslo 0 se vloží', formatuj('{n} ks', { n: 0 }, 'cs'), '0 ks');
  ok('hodnota parametru se nevykládá jako zpráva (žádná injekce)', formatuj('Ahoj {name}', { name: '{n, plural, other {x}}' }, 'cs') === 'Ahoj {n, plural, other {x}}');
  eq('jmenaVeZprave: parametry i číslo z plurálu', jmenaVeZprave('{n, plural, one {# {co}} other {# {co}}} od {kdo}'), ['co', 'kdo', 'n']);
  eq('pluralSelektory', pluralSelektory(PL_PL), [['one', 'few', 'many', 'other']]);

  // ---- překlad a fallback ----
  const S = {
    en: { 'Uložit': 'Save', 'Sklad|nav': 'Stock', 'Sklad': 'Warehouse', 'Jen anglicky': 'English only', '#alergen.1': 'Gluten', 'Smazat {name}?': 'Delete {name}?',
      [PL_CS]: PL_EN },
    de: { 'Uložit': 'Speichern', 'Smazat {name}?': '{name} löschen?' },
    sk: { 'Uložit': 'Uložiť' },
    pl: { 'Uložit': 'Zapisz' },
  };
  eq('cs: česká věta je klíč a nic nenačítá', preloz({}, 'cs', 'Uložit'), 'Uložit');
  eq('cs ignoruje slovník (zdroj je kód)', preloz(S, 'cs', 'Uložit'), 'Uložit');
  eq('en: překlad', preloz(S, 'en', 'Uložit'), 'Save');
  eq('de: vlastní překlad má přednost před en', preloz(S, 'de', 'Uložit'), 'Speichern');
  eq('de → en: chybí v de, bere se anglicky', preloz(S, 'de', 'Jen anglicky'), 'English only');
  eq('pl → en → cs: chybí všude, vrátí se česká věta', preloz(S, 'pl', 'Neznámá věta'), 'Neznámá věta');
  eq('sk → cs: slovenština nepadá na angličtinu', preloz(S, 'sk', 'Jen anglicky'), 'Jen anglicky');
  eq('sk: vlastní překlad', preloz(S, 'sk', 'Uložit'), 'Uložiť');
  eq('kontext: Sklad|nav', preloz(S, 'en', 'Sklad', undefined, 'nav'), 'Stock');
  eq('bez kontextu: druhý význam', preloz(S, 'en', 'Sklad'), 'Warehouse');
  eq('kontext chybí v de: bere se anglický (de → en)', preloz(S, 'de', 'Sklad', undefined, 'nav'), 'Stock');
  eq('kontext chybí ve slovníku sk: česká věta', preloz(S, 'sk', 'Sklad', undefined, 'nav'), 'Sklad');
  eq('interpolace v překladu', preloz(S, 'de', 'Smazat {name}?', { name: 'Kaffee' }), 'Kaffee löschen?');
  eq('plurál v překladu se sází pravidly jazyka překladu (en)', [1, 3].map(n => preloz(S, 'en', PL_CS, { n })), ['1 item', '3 items']);
  eq('plurál bez překladu: čeština s českými tvary', [1, 3, 5].map(n => preloz(S, 'pl', PL_CS.replace('položka', 'položka'), { n })).length, 3);
  eq('katalog podle id', prelozId(S, 'en', 'alergen.1', 'Lepek'), 'Gluten');
  eq('katalog podle id: chybí → česká hodnota', prelozId(S, 'de', 'alergen.1', 'Lepek'), 'Gluten');
  eq('katalog podle id: cs', prelozId(S, 'cs', 'alergen.1', 'Lepek'), 'Lepek');
  eq('slouci: pozdější přepíše dřívější', slouci({ a: '1', b: '1' }, { b: '2' }, undefined), { a: '1', b: '2' });
  eq('prázdný překlad se bere jako chybějící', preloz({ en: { 'Uložit': '' } }, 'en', 'Uložit'), 'Uložit');

  // ---- konfigurace ----
  eq('jazyky', [...JAZYKY], ['cs', 'en', 'de', 'sk', 'pl']);
  eq('fallback: sk→cs, en/de/pl→en→cs', [FALLBACK.sk, FALLBACK.en, FALLBACK.de, FALLBACK.pl], [[], [], ['en'], ['en']]);
  eq('řetěz jazyků', [retezJazyku('de'), retezJazyku('sk'), retezJazyku('cs')], [['de', 'en'], ['sk'], ['cs']]);
  eq('cistyJazyk: neznámé a nesmysly', [cistyJazyk('en-GB'), cistyJazyk('DE'), cistyJazyk('fr'), cistyJazyk(null), cistyJazyk(42), cistyJazyk('')], ['en', 'de', undefined, undefined, undefined, undefined]);
  ok('jeJazyk nepustí prototypové názvy', !jeJazyk('constructor') && !jeJazyk('__proto__') && jeJazyk('pl'));
  eq('Accept-Language: cs má přednost podle q', jazykZAccept('de;q=0.5,cs-CZ,en;q=0.8'), 'cs');
  eq('Accept-Language: de-AT → de', jazykZAccept('de-AT,fr;q=0.9'), 'de');
  eq('Accept-Language: jen nepodporované', jazykZAccept('fr-FR,ja;q=0.8'), undefined);
  eq('Accept-Language: q=0 je zakázáno', jazykZAccept('en;q=0,pl;q=0.3'), 'pl');
  eq('Accept-Language: omezeno na jazyky lístku', jazykZAccept('en,de;q=0.8', ['de', 'cs']), 'de');
  eq('Stripe locale: pětice a auto', [stripeLocale('cs'), stripeLocale('pl'), stripeLocale('xx'), stripeLocale(undefined)], ['cs', 'pl', 'auto', 'auto']);

  // ---- formáty ----
  eq('dny v týdnu (0 = pondělí) cs', [0, 6].map(i => fmtDenVTydnu(i, { jazyk: 'cs' })), ['po', 'ne']);
  eq('dny v týdnu de dlouze', [0, 6].map(i => fmtDenVTydnu(i, { jazyk: 'de', styl: 'dlouhy' })), ['Montag', 'Sonntag']);
  eq('dny v týdnu pl dlouze', fmtDenVTydnu(0, { jazyk: 'pl', styl: 'dlouhy' }), 'poniedziałek');
  eq('den 7 = pondělí (modulo), záporný = neděle', [fmtDenVTydnu(7, { jazyk: 'en', styl: 'dlouhy' }), fmtDenVTydnu(-1, { jazyk: 'en', styl: 'dlouhy' })], ['Monday', 'Sunday']);
  eq('měsíc z RRRR-MM', [fmtMesic('2026-09', { jazyk: 'cs' }), fmtMesic('2026-09', { jazyk: 'de' }), fmtMesic(3, { jazyk: 'pl' })], ['září', 'September', 'marzec']);
  eq('datum jako kalendářní den se neposune pásmem', fmtDatum('2026-01-01', { jazyk: 'cs', styl: 'kratce' }), '1. 1.');
  eq('čas HH:MM 24 h', fmtCas('14:30', { jazyk: 'de', hodiny: 24 }), '14:30');
  ok('čas HH:MM 12 h nese dopoledne/odpoledne', /2:30/.test(fmtCas('14:30', { jazyk: 'en', hodiny: 12 })) && /pm/i.test(fmtCas('14:30', { jazyk: 'en', hodiny: 12 })));
  eq('locale pro jazyk', [LOCALE_PRO_JAZYK.cs, LOCALE_PRO_JAZYK.de, LOCALE_PRO_JAZYK.pl], ['cs-CZ', 'de-DE', 'pl-PL']);

  // ---- předvolby zemí ----
  eq('země MVP', [...ZEME], ['CZ', 'SK', 'DE', 'AT', 'PL']);
  ok('každá předvolba: známá měna, jazyk, sazby DPH k ověření, pásmo CET', ZEME.every(z => {
    const p = PREDVOLBY_ZEMI[z];
    return p.zeme === z && jeJazyk(p.jazyk) && CURRENCIES.some((c: any) => c.code === p.mena) && p.overit === true
      && p.dph.length >= 2 && p.dph.every(d => d.sazba > 0 && d.sazba < 30) && /^Europe\//.test(p.pasmo) && /^\+\d+$/.test(p.telefonPredvolba);
  }));
  eq('CZ: cs, CZK, cs-CZ, týden od pondělí, 24 h', navrhNastaveni('cz'), { defaultLang: 'cs', currency: 'CZK', locale: 'cs-CZ', weekStart: 1, timeFormat: '24', timezone: 'Europe/Prague' });
  eq('AT: němčina, EUR, de-AT', [predvolbaProZemi('AT')?.jazyk, predvolbaProZemi('AT')?.mena, predvolbaProZemi('AT')?.locale], ['de', 'EUR', 'de-AT']);
  eq('PL: pl, PLN', [predvolbaProZemi('PL')?.jazyk, predvolbaProZemi('PL')?.mena], ['pl', 'PLN']);
  eq('neznámá země nic nepředvyplní', [navrhNastaveni('GB'), navrhNastaveni(null), cistaZeme('constructor')], [undefined, undefined, undefined]);

  // ---- alergeny ----
  eq('alergeny: 14 kódů', KODY_ALERGENU, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);
  ok('alergeny: každý kód má název ve všech pěti jazycích', KODY_ALERGENU.every(k => JAZYKY.every(j => (ALERGENY[k] as any)[j]?.length > 2)));
  eq('alergeny: název v jazyce, neznámý kód prázdný', [nazevAlergenu(7, 'cs'), nazevAlergenu(7, 'de'), nazevAlergenu(99 as any, 'en')], ['Mléko', 'Milch', '']);
  eq('alergeny: mimo 1–14 a duplicity pryč, seřazeno', cistiAlergeny([7, 1, 7, 0, 15, '3', 'x', null, 14.5, 3]), [1, 3, 7]);
  eq('alergeny: nepole', cistiAlergeny('1,2'), []);

  // ---- slovníky v locales/: placeholdery a plurály musí sedět s českou větou ----
  const koren = new URL('../../locales/', import.meta.url);
  const jazyky = ['en', 'de', 'sk', 'pl'];
  let zlych: string[] = [];
  let pocet = 0;
  for (const j of jazyky) {
    const dir = new URL(`${j}/`, koren);
    if (!existsSync(dir)) continue;
    for (const f of readdirSync(dir).filter(x => x.endsWith('.json'))) {
      const data = JSON.parse(readFileSync(new URL(f, dir), 'utf8')) as Record<string, string>;
      for (const [klic, hodnota] of Object.entries(data)) {
        pocet++;
        if (klic.startsWith('#')) continue; // katalog podle id: zdroj je v kódu
        const cs = klic.split('|')[0];
        if (JSON.stringify(jmenaVeZprave(cs)) !== JSON.stringify(jmenaVeZprave(String(hodnota)))) zlych.push(`${j}/${f}: parametry „${klic}“`);
        if (/[<>&]/.test(String(hodnota))) zlych.push(`${j}/${f}: HTML ve zprávě „${klic}“`);
        for (const sel of pluralSelektory(String(hodnota))) {
          const potreba = j === 'pl' ? ['one', 'few', 'many', 'other'] : j === 'sk' ? ['one', 'few', 'other'] : ['one', 'other'];
          if (!potreba.every(p => sel.includes(p))) zlych.push(`${j}/${f}: plurál bez ${potreba.join('/')} „${klic}“`);
        }
      }
    }
  }
  ok(`slovníky: ${pocet} překladů má stejné parametry, žádné HTML a plné plurály (${zlych.slice(0, 3).join('; ')})`, zlych.length === 0);
}
