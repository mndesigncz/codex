// Stránka „Dostupnost" (zaměstnanec). Katalog widgetů ji nezná: kolo 68 založilo jen nástroj ve
// výchozím rozložení; widgety doplní a plochu zapne (aktivni: true) balík B1 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.dostupnost',
  rozhrani: 'zamestnanec',
  nazev: 'Dostupnost',
  pohled: 'availability',
  pristup: null,
  nastroj: { nazev: 'Dostupnost', ikona: 'swap', popis: 'Kdy můžeš příští měsíc pracovat a poznámka pro vedení.' },
  doporucene: [],
  vychozi: { 'typ:zamestnanec': [{ w: 'nastroj' }] },
  aktivni: false,
};
