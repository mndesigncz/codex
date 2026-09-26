// Stránka „Přehled Clientu" (vedení). Kolo 68 založilo metadata z katalogu, kolo 69 (balík B8)
// plochu zapnulo. Nástroj nemá: celý přehled je z widgetů (katalog, hlavni_nastroj) — dřívější
// pevné rozvržení (Čeká na tebe, čtyři šedé dlaždice StatCard, Dnešní rezervace, Členové
// a hodnocení, Propojení) se rozpadlo na widgety, které jde přeskládat.
//
// Výchozí rozložení je z katalogu (fronty nahoře, čtyři malá čísla v řadě, pak věrnost
// a propojení); dnešní rezervace v S — plný seznam má záložka Rezervace. Role bez části
// oprávnění dostane totéž bez widgetů, na které nemá (spec §1.5).
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
  aktivni: true,
};
