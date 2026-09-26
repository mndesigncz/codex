// Stránka „Menu" (vedení, Managero client). Kolo 68 založilo metadata z katalogu, kolo 69 (balík
// B4) plochu zapnulo. Nástroj = editor menu pro hosty (components/employer/MenuEditor.tsx):
// výběr menu, adresa, sekce a položky, párování s kasou, vzhled a zveřejnění.
//
// Stránka dřív žádné bloky neměla; widgety jsou nové z katalogu: jestli menu hosté vidí (Stav
// menu), co je teď vyprodané s přepnutím na jedno ťuknutí a Wi-Fi pro hosty k ukázání. Všechno
// s tarifem Max (Managero client).
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.menu',
  rozhrani: 'vedeni',
  nazev: 'Menu',
  pohled: 'klient:menu',
  pristup: ['menu.zobrazit'],
  nastroj: {
    nazev: 'Editor menu',
    ikona: 'leaf',
    popis: 'Menu pro hosty: sekce, položky, ceny, párování s kasou, vzhled a zveřejnění.',
  },
  doporucene: ['menu.stav', 'menu.vyprodano', 'menu.wifi', 'trzby.top_produkty'],
  vychozi: {
    'typ:vedeni': [
      { w: 'menu.stav', s: 'S' },
      { w: 'menu.vyprodano', s: 'M' },
      { w: 'menu.wifi', s: 'S' },
      { w: 'nastroj' },
    ],
  },
  aktivni: true,
};
