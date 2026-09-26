// Stránka „Odměny" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B7) plochu
// zapnulo. Nástroj = žebříček, kalendář hodnocení a nastavení úrovní, bodování a katalogu odměn
// (components/employer/RewardsView.tsx, přepínač částí v `aside` hlavičky); fronta „Žádosti
// o odměny", která dřív visela nad žebříčkem, je teď widget.
//
// Výchozí rozložení je z katalogu: co čeká na člověka (žádosti, nehodnocené směny, výtky) nahoře,
// nástroj pod tím. Role bez odmeny.schvalovat nebo hodnoceni.zobrazit dostane totéž bez widgetů,
// na které nemá (filtr podle oprávnění, spec §1.5) — nástroj zůstává vždy.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.odmeny',
  rozhrani: 'vedeni',
  nazev: 'Odměny',
  pohled: 'rewards',
  pristup: ['odmeny.zebricek', 'odmeny.katalog'],
  nastroj: { nazev: 'Žebříček a hodnocení', ikona: 'award', popis: 'Žebříček, kalendář hodnocení a nastavení úrovní, bodů a katalogu odměn.' },
  doporucene: [
    'odmeny.zadosti',
    'hodnoceni.nehodnocene',
    'hodnoceni.ohodnotit_smeny',
    'odmeny.vytky_tymu',
    'odmeny.zebricek',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'odmeny.zadosti', s: 'M' },
      { w: 'hodnoceni.nehodnocene', s: 'S' },
      { w: 'odmeny.vytky_tymu', s: 'S' },
      { w: 'nastroj' },
    ],
  },
  aktivni: true,
};
