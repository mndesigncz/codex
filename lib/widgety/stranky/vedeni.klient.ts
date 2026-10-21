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
    'klient.pruvodce',
    'klient.zdravi',
    'klient.pred_smenou',
    'klient.razitka_14',
    'klient.automatizace',
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
    // Kolo 92 (audit C §4.1, koncept B „A"): Přehled je jen o hostech. „Čeká na tebe" z Managera
    // (žádosti o volno, hlášení ze skladu, tresty) ve výchozím rozložení není — jde přidat z galerie.
    // Nahoře průvodce nastavením, pod ním zdraví programu, pak „před směnou" a razítka za 14 dní,
    // drobné fronty (objednávky, hodnocení) a automatizace jako řádek.
    'typ:vedeni': [
      { w: 'klient.pruvodce', s: 'L' },
      { w: 'klient.zdravi', s: 'L' },
      { w: 'klient.pred_smenou', s: 'M' },
      { w: 'klient.razitka_14', s: 'M' },
      { w: 'klient.objednavky_od_stolu', s: 'S' },
      { w: 'klient.hodnoceni', s: 'S' },
      { w: 'klient.clenove', s: 'S' },
      { w: 'klient.dnesni_rezervace', s: 'S' },
      { w: 'klient.automatizace', s: 'L' },
    ],
  },
  aktivni: true,
};
