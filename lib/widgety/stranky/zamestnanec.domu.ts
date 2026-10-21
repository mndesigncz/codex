// Stránka „Přehled" (zaměstnanec). Plocha je aktivní od kola 68; v kole 69 soubor nikdo nemění,
// výchozí rozložení se ladí v Nastavení → Stránky.
import type { DefiniceStranky } from '../typy.ts';

export const STRANKA: DefiniceStranky = {
  id: 'zamestnanec.domu',
  rozhrani: 'zamestnanec',
  nazev: 'Přehled',
  pohled: 'home',
  pristup: null,
  nastroj: null,
  doporucene: [
    'dochazka.moje_pichacky',
    'moje.nejblizsi_smena',
    'ukoly.za_body',
    'moje-smeny.navic',
    'moje-smeny.tresty',
    'uzaverky.predavka',
    'klient.objednavky_od_stolu',
    'klient.dnesni_rezervace',
    'vyroba.k_vyrobe',
    'uzaverky.moje_uzaverka',
    'ukoly.dnes',
    'ukoly.po_terminu',
    'postupy.povinne_dnes',
    'moje.zpetna_vazba',
    'moje.uroven',
    'moje.tento_mesic',
    'moje.vydelek',
    'dochazka.moje_odpracovano',
    'oznameni.nastenka',
    'akce.nejblizsi',
    'rozvrh.pripominka_dostupnosti',
    'rozvrh.tym_nahled',
    'sklad.dochazi',
    'navody.povinne_cteni',
    'chat.neprectene',
    'sdileni.pripnuta_nabidka',
    'menu.vyprodano',
    'odkaz',
  ],
  vychozi: {
    // Pořadí podle pracovního dne: příchod a směna → co je dnes na mně → co se děje v podniku →
    // konec směny → pomalejší věci (výdělek, zpětná vazba). Dvě malé dlaždice vedle sebe, ne dvacet
    // karet pod sebou; situační widgety (akce, sdílená nabídka) jsou v galerii, ne v základu.
    'typ:zamestnanec': [
      // Audit 2026-10 (Z01, vzor Homebase „Clock in" nahoře): první je píchnutí a dnešní směna —
      // to je důvod, proč člověk aplikaci na začátku směny otevírá. „Moje tresty" (kolo 10) stály
      // úplně nahoře, takže první věc dne byla „trest", ne „příchod"; teď jsou za Navíc (malá karta,
      // v klidu se kreslí, jen když je co potvrdit — bez nepotvrzeného trestu ji plocha vyřadí).
      { w: 'dochazka.moje_pichacky', s: 'M' },
      { w: 'moje.nejblizsi_smena', s: 'M' },
      // Kolo 11: „Úkoly za body" hned za směnou — kdo otevře aplikaci, bez posouvání vidí, co si může vzít
      // za body (Martin: „vůbec netuším, kde to najít").
      { w: 'ukoly.za_body', s: 'M' },
      // Kolo 9 (N1): „Navíc" hned potom — zapsat, co bylo nad rámec, je věc konce směny, ne konce měsíce.
      { w: 'moje-smeny.navic', s: 'M' },
      { w: 'moje-smeny.tresty', s: 'S' },
      { w: 'rozvrh.tym_nahled', s: 'M' },
      { w: 'ukoly.dnes', s: 'M' },
      { w: 'postupy.povinne_dnes', s: 'M' },
      { w: 'oznameni.nastenka', s: 'M' },
      { w: 'chat.neprectene', s: 'S' },
      { w: 'dochazka.moje_odpracovano', s: 'S' },
      { w: 'sklad.dochazi', s: 'M' },
      { w: 'klient.objednavky_od_stolu', s: 'L' },
      { w: 'vyroba.k_vyrobe', s: 'L' },
      { w: 'uzaverky.moje_uzaverka', s: 'M' },
      { w: 'uzaverky.predavka', s: 'L' },
      { w: 'rozvrh.pripominka_dostupnosti', s: 'M' },
      { w: 'moje.tento_mesic', s: 'M' },
      { w: 'moje.zpetna_vazba', s: 'M' },
    ],
  },
  aktivni: true,
};
