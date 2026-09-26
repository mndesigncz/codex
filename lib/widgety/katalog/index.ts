// Registr widgetů — metadata všech oblastí (kolo 68, spec §2.1).
//
// Server z něj validuje rozložení a hlídá oprávnění, testy ho kontrolují
// a klient z něj staví galerii. React tu není: komponenty jsou zvlášť
// v components/widgety/oblasti/*.tsx a stahují se líně po oblastech.
// Každá oblast má vlastní soubor, aby balíky kola 69 nesahaly do stejného
// místa — tenhle index se po kole 68 už nemění.

import type { DefiniceWidgetu, IdOblasti, Oblast } from '../typy.ts';
import { WIDGETY as obecne } from './obecne.ts';
import { WIDGETY as trzby } from './trzby.ts';
import { WIDGETY as uzaverky } from './uzaverky.ts';
import { WIDGETY as finance } from './finance.ts';
import { WIDGETY as dochazka } from './dochazka.ts';
import { WIDGETY as rozvrh } from './rozvrh.ts';
import { WIDGETY as mojeSmeny } from './moje-smeny.ts';
import { WIDGETY as sklad } from './sklad.ts';
import { WIDGETY as receptury } from './receptury.ts';
import { WIDGETY as menu } from './menu.ts';
import { WIDGETY as ukoly } from './ukoly.ts';
import { WIDGETY as planovani } from './planovani.ts';
import { WIDGETY as napady } from './napady.ts';
import { WIDGETY as postupy } from './postupy.ts';
import { WIDGETY as navody } from './navody.ts';
import { WIDGETY as odmeny } from './odmeny.ts';
import { WIDGETY as akce } from './akce.ts';
import { WIDGETY as klient } from './klient.ts';
import { WIDGETY as tym } from './tym.ts';
import { WIDGETY as organizace } from './organizace.ts';

/** Oblasti v pevném pořadí galerie (spec §3.6) s výchozí ikonou (spec §2.2). */
export const OBLASTI: readonly Oblast[] = [
  { id: 'obecne', nazev: 'Obecné', ikona: 'overview' },
  { id: 'trzby', nazev: 'Tržby a pokladna', ikona: 'receipt' },
  { id: 'uzaverky', nazev: 'Uzávěrky', ikona: 'trend' },
  { id: 'finance', nazev: 'Finance', ikona: 'coins' },
  { id: 'dochazka', nazev: 'Docházka', ikona: 'clock' },
  { id: 'rozvrh', nazev: 'Rozvrh', ikona: 'calendar' },
  { id: 'moje-smeny', nazev: 'Moje směny', ikona: 'calendar' },
  { id: 'sklad', nazev: 'Sklad a výroba', ikona: 'box' },
  { id: 'receptury', nazev: 'Receptury', ikona: 'leaf' },
  { id: 'menu', nazev: 'Menu', ikona: 'tag' },
  { id: 'ukoly', nazev: 'Úkoly', ikona: 'check' },
  { id: 'planovani', nazev: 'Plánování', ikona: 'kanban' },
  { id: 'napady', nazev: 'Nápady', ikona: 'bulb' },
  { id: 'postupy', nazev: 'Postupy', ikona: 'clipboard' },
  { id: 'navody', nazev: 'Návody', ikona: 'book' },
  { id: 'odmeny', nazev: 'Odměny a hodnocení', ikona: 'award' },
  { id: 'akce', nazev: 'Akce', ikona: 'calendarCheck' },
  { id: 'klient', nazev: 'Managero client', ikona: 'cup' },
  { id: 'tym', nazev: 'Tým', ikona: 'users' },
  { id: 'organizace', nazev: 'Organizace', ikona: 'chart' },
];

/** Widgety po oblastech — klíč = soubor v katalogu i v components/widgety/oblasti. */
export const WIDGETY_OBLASTI: Readonly<Record<IdOblasti, readonly DefiniceWidgetu[]>> = {
  obecne, trzby, uzaverky, finance, dochazka, rozvrh, 'moje-smeny': mojeSmeny, sklad, receptury, menu,
  ukoly, planovani, napady, postupy, navody, odmeny, akce, klient, tym, organizace,
};

/** Všechny widgety v pořadí oblastí. */
export const KATALOG_WIDGETU: readonly DefiniceWidgetu[] = OBLASTI.flatMap(o => WIDGETY_OBLASTI[o.id]);

const PODLE_ID = new Map(KATALOG_WIDGETU.map(w => [w.id, w]));

/** Definice widgetu podle id, nebo undefined (neznámé id, 'nastroj'). */
export function widget(id: string): DefiniceWidgetu | undefined {
  return PODLE_ID.get(id);
}

/** Oblast podle id. */
export function oblast(id: string): Oblast | undefined {
  return OBLASTI.find(o => o.id === id);
}
