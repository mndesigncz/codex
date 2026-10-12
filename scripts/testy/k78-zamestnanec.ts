// Kolo 6 (balík B5) — zaměstnanec na telefonu: čistá logika, kterou drží obrazovky.
//  • výchozí dok zaměstnance má denní věci (Úkoly, Uzávěrku) a krátké štítky, které se
//    vejdou do doku i v němčině a polštině (dřív by „Kassenabschluss" dok přetekl);
//  • Sklad zaměstnance má nástroj se zápisem stavu před Docházejícími zásobami;
//  • Úkoly začínají nástrojem (výchozí rozložení bez widgetů nad ním);
//  • argument z widgetu Docházející zásoby nese filtr i kategorii, který Sklad přijme.
// Chování na obrazovce (průvodce uzávěrkou, úkoly nad ohybem, hromadné uložení) hlídá
// sonda k78-zamestnanec na 390 px.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { VYCHOZI_NAV, MAX_DOK, slozNavigaci } from '../../lib/navigace.ts';
import { STRANKA as SKLAD } from '../../lib/widgety/stranky/zamestnanec.sklad.ts';
import { STRANKA as UKOLY } from '../../lib/widgety/stranky/zamestnanec.ukoly.ts';
import { rozborSkladArg, skladArg } from '../../lib/skladPredani.ts';

const JAZYKY = ['en', 'de', 'sk', 'pl'] as const;
const slovnik = (j: string) => JSON.parse(readFileSync(new URL(`../../locales/${j}/common.json`, import.meta.url), 'utf8')) as Record<string, string>;

export default function ({ eq, ok }: Testy) {
  // ---- dok ----
  const z = slozNavigaci({ rozhrani: 'zamestnanec', smiPohled: () => true, nastaveni: null, jazyk: 'cs' });
  eq('B5 dok: výchozí dok zaměstnance = Domů, Směny, Úkoly, Uzávěrka', z.dok.map(p => p.id), ['home', 'my-shifts', 'tasks', 'closing']);
  ok('B5 dok: vejde se do MAX_DOK', VYCHOZI_NAV.zamestnanec.dok.length <= MAX_DOK);
  const stitky = z.dok.map(p => p.short ?? p.label);
  eq('B5 dok: krátké štítky česky', stitky, ['Domů', 'Směny', 'Úkoly', 'Kasa']);
  // Dok má na 390 px 342 px pro pět položek a Více; 11px štítek o 9 znacích je ~50 px (+24 px odsazení).
  for (const j of JAZYKY) {
    const sl = slovnik(j);
    const preklady = stitky.map(s => sl[`${s}|nav`]);
    ok(`B5 dok: ${j} — každý štítek doku má překlad`, preklady.every(Boolean));
    ok(`B5 dok: ${j} — žádný štítek doku není delší než 9 znaků (${preklady.join(', ')})`, preklady.every(p => (p ?? '').length <= 9));
  }
  ok('B5 dok: Sklad a Chat mimo dok zůstávají v nabídce (list Více)', ['inventory', 'chat'].every(id => z.vse.some(p => p.id === id)));

  // ---- Sklad: zápis stavu nad Docházejícími ----
  const sklad = SKLAD.vychozi['typ:zamestnanec']!.map(x => x.w);
  ok('B5 sklad: nástroj (zápis stavu) je před Docházejícími zásobami', sklad.indexOf('nastroj') >= 0 && sklad.indexOf('nastroj') < sklad.indexOf('sklad.dochazi'));
  eq('B5 sklad: Docházející pod nástrojem jsou M (seznam sám řadí, co dochází, nahoru)', SKLAD.vychozi['typ:zamestnanec']!.find(x => x.w === 'sklad.dochazi')?.s, 'M');

  // ---- Úkoly: začínají úkolem ----
  eq('B5 úkoly: výchozí rozložení je jen nástroj (nic nad prvním úkolem)', UKOLY.vychozi['typ:zamestnanec']!.map(x => x.w), ['nastroj']);

  // ---- předání z Docházejících zásob do Skladu ----
  eq('B5 sklad: řádek Docházejících nese filtr i kategorii', rozborSkladArg(skladArg({ kategorie: 'Dobroty', jenDochazi: true })), { kategorie: 'Dobroty', jenDochazi: true });
  eq('B5 sklad: s položkou ji Sklad umí vybrat', rozborSkladArg(skladArg({ polozkaId: 5, kategorie: 'Dobroty', jenDochazi: true })), { kategorie: 'Dobroty', jenDochazi: true, polozkaId: 5 });
}
