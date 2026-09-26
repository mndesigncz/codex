// Stránka „Přehled Clientu" (vedení). Kolo 68 založilo metadata z katalogu; plochu zapne (aktivni:
// true) a doporučené i výchozí rozložení upřesní balík B8 v kole 69.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'vedeni.klient',
  rozhrani: 'vedeni',
  nazev: 'Přehled Clientu',
  pohled: 'klient:overview',
  pristup: ['klient.prehled'],
  nastroj: null,
  doporucene: [
    'prehled.ceka_na_tebe',
    'klient.objednavky_od_stolu',
    'klient.dnesni_rezervace',
    'klient.clenove',
    'klient.hodnoceni',
    'klient.vernost_30dni',
    'klient.propojeni',
    'akce.nejblizsi',
    'akce.vysledek',
    'menu.vyprodano',
    'menu.stav',
    'finance.hoste_vernost',
  ],
  vychozi: {
    'typ:vedeni': [
      { w: 'prehled.ceka_na_tebe', s: 'L' },
      { w: 'klient.objednavky_od_stolu', s: 'S' },
      { w: 'klient.dnesni_rezervace', s: 'S' },
      { w: 'klient.clenove', s: 'S' },
      { w: 'klient.hodnoceni', s: 'S' },
      { w: 'klient.vernost_30dni', s: 'M' },
      { w: 'klient.propojeni', s: 'M' },
    ],
  },
  aktivni: false,
};
