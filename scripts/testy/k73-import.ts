// Kolo 73 — import členů z jiné věrnostní aplikace (lib/importKarticka.ts).
//
// Hlídá, co by v ostrém provozu stálo důvěru: český Excel (středník, čárka jako desetinná), vložení
// z tabulky (tabulátor), přesné rozpoznání sloupců podle názvu, čísla v různých zápisech
// („1 250,50 Kč“, „1.250“), data a to, že jeden překlep neshodí celý řádek ani nikoho neobdaruje milionem bodů.

import type { Testy } from './_testy.ts';
import {
  rozeberTabulku, navrhniMapovani, prevedRadky, parseCislo, parseDatum, cistiTelefon, ocistiRadek, souhrnImportu, MAX_HODNOTA,
} from '../../lib/importKarticka.ts';

export default function ({ eq, ok }: Testy) {
  /** Klíče podle abecedy: pořadí, v jakém se pole přiřadila, je detail. */
  const razene = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : 1)));
  // ---- čtení tabulky ----
  const t1 = rozeberTabulku('﻿Jméno;Příjmení;E-mail;Body\r\nAnna;Nováková;anna@x.cz;120\r\n"Jan; ml.";Svoboda;jan@x.cz;"1 250"\r\n');
  eq('tabulka: středník, BOM a CRLF', t1.hlavicka, ['Jméno', 'Příjmení', 'E-mail', 'Body']);
  eq('tabulka: středník ve jméně v uvozovkách zůstane v poli', t1.radky[1], ['Jan; ml.', 'Svoboda', 'jan@x.cz', '1 250']);
  eq('tabulka: rozdělovač je středník', t1.rozdelovac, ';');
  const t2 = rozeberTabulku('jmeno,email,body\nAnna,anna@x.cz,5\n');
  eq('tabulka: čárka', t2.rozdelovac, ',');
  const t3 = rozeberTabulku('Jméno\tE-mail\tBody\nAnna\tanna@x.cz\t5\n');
  eq('tabulka: tabulátor (vložení z Excelu)', t3.radky, [['Anna', 'anna@x.cz', '5']]);
  const t4 = rozeberTabulku('a;b\n"řádek\nna dva";2\n');
  eq('tabulka: odřádkování uvnitř uvozovek je jedno pole', t4.radky, [['řádek\nna dva', '2']]);
  eq('tabulka: prázdné řádky se přeskočí', rozeberTabulku('a;b\n\n;\n1;2\n').radky, [['1', '2']]);

  // ---- mapování sloupců ----
  const m1 = navrhniMapovani(['Jméno a příjmení', 'E-mail', 'Telefon', 'Datum narození', 'Počet razítek', 'Stav bodů', 'Cashback (Kč)', 'Poslední návštěva', 'Slevová skupina', 'Číslo karty']);
  eq('mapování: česky s diakritikou', razene(m1), razene({ email: 1, jmeno: 0, telefon: 2, narozeniny: 3, body: 5, kredit: 6, razitka: 4, posledniNavsteva: 7, skupina: 8, cisloKarty: 9 }));
  const m2 = navrhniMapovani(['First name', 'Last name', 'Email', 'Phone', 'Birthday', 'Stamps', 'Points', 'Credit', 'Visits']);
  eq('mapování: anglicky', razene(m2), razene({ jmeno: 0, prijmeni: 1, email: 2, telefon: 3, narozeniny: 4, razitka: 5, body: 6, kredit: 7, navstevy: 8 }));
  ok('mapování: jeden sloupec nepatří dvěma polím', (() => { const m = navrhniMapovani(['Jméno', 'Příjmení', 'E-mail']); const v = Object.values(m); return new Set(v).size === v.length; })());
  eq('mapování: neznámé sloupce se nemapují', navrhniMapovani(['Foo', 'Bar']), {});

  // ---- čísla ----
  eq('číslo: tisíce mezerou a desetinná čárka', parseCislo('1 250,50 Kč'), 1250.5);
  eq('číslo: nezlomitelná mezera', parseCislo('1 250'), 1250);
  eq('číslo: tečka jako tisícový oddělovač', parseCislo('1.250'), 1250);
  eq('číslo: tečka jako desetinná', parseCislo('12.5'), 12.5);
  eq('číslo: čárka jako desetinná', parseCislo('12,5'), 12.5);
  eq('číslo: evropský zápis 1.234,56', parseCislo('1.234,56'), 1234.56);
  eq('číslo: anglický zápis 1,234.56', parseCislo('1,234.56'), 1234.56);
  eq('číslo: víc tisícových 1.234.567', parseCislo('1.234.567'), 1234567);
  eq('číslo: prázdné je null', parseCislo(''), null);
  eq('číslo: text je null', parseCislo('hodně'), null);
  eq('číslo: e-mail v kolonce bodů je null', parseCislo('a@b.cz'), null);

  // ---- data a telefon ----
  eq('datum: ISO', parseDatum('1990-03-05'), '1990-03-05');
  eq('datum: české s mezerami', parseDatum('5. 3. 1990'), '1990-03-05');
  eq('datum: české s tečkami', parseDatum('05.03.1990'), '1990-03-05');
  eq('datum: s lomítky', parseDatum('5/3/1990'), '1990-03-05');
  eq('datum: ISO s časem', parseDatum('2026-01-02T10:11:12Z'), '2026-01-02');
  eq('datum: neexistující den', parseDatum('30. 2. 1990'), null);
  eq('datum: bez roku', parseDatum('5. 3.'), null);
  eq('telefon: mezery a předvolba', cistiTelefon('+420 777 123 456'), '+420777123456');
  eq('telefon: příliš krátký', cistiTelefon('123'), null);

  // ---- převod řádků ----
  const hlav = ['Jméno', 'Příjmení', 'E-mail', 'Telefon', 'Datum narození', 'Body', 'Kredit', 'Razítka', 'Návštěvy', 'Skupina'];
  const map = navrhniMapovani(hlav);
  const r = prevedRadky([
    ['Anna', 'Nováková', 'Anna@X.cz ', '+420 777 123 456', '5. 3. 1990', '1 250', '85,50', '7', '12', 'Štamgasti'],
    ['Jan', 'Svoboda', 'jan@x.cz', 'nevím', '30. 2. 1990', 'hodně', '-5', '', '', ''],
    ['Bez', 'Mailu', '', '', '', '10', '', '', '', ''],
    ['Zlý', 'Mail', 'neni-email', '', '', '10', '', '', '', ''],
    ['Dvojník', 'Anny', 'anna@x.cz', '', '', '999', '', '', '', ''],
    ['Obr', 'Bodů', 'obr@x.cz', '', '', String(MAX_HODNOTA + 1), '', '', '', ''],
  ], map);
  eq('převod: platní členi', r.radky.map(x => x.email), ['anna@x.cz', 'jan@x.cz', 'obr@x.cz']);
  eq('převod: Anna kompletně', r.radky[0], {
    radek: 2, jmeno: 'Anna Nováková', email: 'anna@x.cz', telefon: '+420777123456', narozeniny: '1990-03-05',
    razitka: 7, body: 1250, kredit: 86, navstevy: 12, posledniNavsteva: null, skupina: 'Štamgasti', cisloKarty: null,
  });
  ok('převod: kredit s haléři se zaokrouhlí a ohlásí', r.upozorneni.some(u => u.radek === 2 && /zaokrouhlen/.test(u.text)));
  eq('převod: nečitelné body a záporný kredit dají 0, ne zahozený řádek', [r.radky[1].body, r.radky[1].kredit], [0, 0]);
  ok('převod: nečitelný telefon a datum se ohlásí', r.upozorneni.filter(u => u.radek === 3).length >= 4);
  eq('převod: chyby řádků', r.chyby.map(c => [c.radek, c.duvod.slice(0, 18)]), [[4, 'Chybí e-mail.'], [5, 'E-mail nevypadá sp'], [6, 'Stejný e-mail už j']]);
  eq('převod: obrovská hodnota se nezapíše', r.radky[2].body, 0);

  const jenMail = prevedRadky([['x@y.cz']], { email: 0 });
  eq('převod: jen e-mail stačí, jméno je z adresy', [jenMail.radky[0].jmeno, jenMail.radky[0].body], ['x', 0]);

  const s = souhrnImportu(r.radky);
  eq('souhrn: součty a skupiny', [s.clenu, s.body, s.kredit, s.razitka, s.sRazitky, s.skupiny], [3, 1250, 86, 7, 1, [{ nazev: 'Štamgasti', pocet: 1 }]]);

  // ---- řádek z API: nevěří se ničemu ----
  eq('API řádek: nesmysl je null', ocistiRadek('x', 2), null);
  eq('API řádek: bez e-mailu je null', ocistiRadek({ jmeno: 'A' }, 2), null);
  const o = ocistiRadek({ email: ' A@B.cz ', jmeno: 'A\u0000B', body: -5, kredit: '12.6', razitka: 1e12, narozeniny: '1990-02-31', telefon: '12' }, 7);
  eq('API řádek: ořez a meze', o, {
    radek: 7, jmeno: 'A B', email: 'a@b.cz', telefon: null, narozeniny: null, razitka: MAX_HODNOTA, body: 0, kredit: 13, navstevy: 0,
    posledniNavsteva: null, skupina: null, cisloKarty: null,
  });
}
