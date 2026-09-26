// Stránka „Dostupnost" (zaměstnanec). Katalog widgetů ji nezná; kolo 69 (balík B1) plochu zapnulo.
// Nástroj = kalendář dostupnosti na měsíc s preferencí a poznámkou pro vedení
// (components/scheduling/AvailabilitySubmit.tsx). Žádost o volno pod plochou kreslí
// EmployeeLayout (jiný balík).
//
// Widgety jsou jen ty, které rozhodování „kdy můžu" usnadní: moje volno (ať si člověk
// neoznačí dovolenou podruhé), kdo má kdy směnu a nejbližší vlastní směna. Výchozí je
// střídmé — hlavní věc je kalendář, volno pod ním.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.dostupnost',
  rozhrani: 'zamestnanec',
  nazev: 'Dostupnost',
  pohled: 'availability',
  pristup: null,
  nastroj: { nazev: 'Dostupnost', ikona: 'swap', popis: 'Kdy můžeš příští měsíc pracovat a poznámka pro vedení.' },
  doporucene: ['moje.schvalene_volno', 'rozvrh.tym_nahled', 'moje.nejblizsi_smena'],
  vychozi: {
    'typ:zamestnanec': [
      { w: 'nastroj' },
      { w: 'moje.schvalene_volno', s: 'M' },
    ],
  },
  aktivni: true,
};
