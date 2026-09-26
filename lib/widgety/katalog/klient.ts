// Widgety oblasti „Managero client" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/klient.tsx. Widget se stavem 'planovany' komponentu
// ještě nemá: nekreslí se ani nenabízí, dokud ho balík B8 v kole 69 nenapíše a nepřepne na 'hotovo'.
// Soubor patří balíku B8; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/client/admin/summary → enabled, orders{new,today}, reservations{requested,today}, members,
  // newMembers30, reviews{avg,new7,low7}
  // Pozor: katalog říká „dlaždice podle dalších oprávnění" — dnešní widget ukazuje všechny tři čísla každému s
  // klient.prehled
  {
    id: 'klient.hoste_vernost',
    oblast: 'klient',
    nazev: 'Hosté a věrnost',
    popis: 'Objednávky od stolu, rezervace, členové a hodnocení hostů.',
    ikona: 'gift',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled'],
    opravneni: {
      vse: ['klient.prehled'],
      nektere: [],
      pole: {
        objednavky: 'objednavky.zobrazit',
        rezervace: 'rezervace.zobrazit',
        clenove: 'zakaznici.zobrazit',
        hodnoceni: 'zakaznici.recenze',
      },
    },
    tarif: 'max',
    kostra: { M: 'cislo', L: 'cislo' },
    stav: 'hotovo',
  },
  // Data: GET /api/client/admin/reservations?range=today →
  // reservations[{time,customer_name,party,table_name,status}]
  {
    id: 'klient.dnesni_rezervace',
    oblast: 'klient',
    nazev: 'Dnešní rezervace',
    popis: 'Čas, host, počet osob, stůl, stav — potvrdit, usadit.',
    ikona: 'cup',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.prehled', 'zamestnanec.domu', 'vedeni.klient', 'kiosk.smena'],
    opravneni: {
      vse: ['rezervace.zobrazit'],
      nektere: [],
      pole: {
        e_mail_hosta: 'zakaznici.kontakty',
        'akce:potvrdit_odmitnout': 'rezervace.schvalovat',
        'akce:usadit': 'rezervace.usadit',
      },
    },
    tarif: 'max',
    stav: 'planovany',
  },
  // Data: GET /api/client/staff/inbox → orders[], reservations[] (s rezervace.zobrazit), newCount, stuck, pos
  {
    id: 'klient.objednavky_od_stolu',
    oblast: 'klient',
    nazev: 'Objednávky od stolu',
    popis: 'Nové objednávky od hostů u stolu k přijetí.',
    ikona: 'cup',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['zamestnanec.domu', 'vedeni.klient', 'kiosk.smena'],
    opravneni: { vse: ['objednavky.zobrazit'], nektere: [], pole: { 'akce:vyridit': 'objednavky.vyridit' } },
    tarif: 'max',
    stav: 'hotovo',
  },
  // Data: GET /api/client/admin/reviews → reviews[{rating,note,created_at,customer_name}], count, avg, dist[5]
  {
    id: 'klient.hodnoceni',
    oblast: 'klient',
    nazev: 'Hodnocení od hostů',
    popis: 'Průměr, rozložení 1–5 hvězd, poslední komentáře a slabá hodnocení za týden.',
    ikona: 'cup',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.klient', 'vedeni.klient_zakaznici'],
    opravneni: { vse: ['zakaznici.recenze'], nektere: [] },
    tarif: 'max',
    stav: 'planovany',
  },
  // Data: GET /api/client/admin/summary → members, newMembers30; GET /api/client/admin/customers →
  // customers[{name,points,visits,last_visit_at,joined_at}]
  {
    id: 'klient.clenove',
    oblast: 'klient',
    nazev: 'Členové klubu',
    popis: 'Počet členů, noví za 30 dní; u větší velikosti nejvěrnější hosté.',
    ikona: 'cup',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.klient', 'vedeni.klient_zakaznici'],
    opravneni: { vse: ['klient.prehled'], nektere: [], pole: { jmena: 'zakaznici.zobrazit' } },
    tarif: 'max',
    nastaveni: [
      {
        klic: 'razeni',
        nazev: 'Řadit',
        typ: 'vyber',
        moznosti: [
          { id: 'navstevy', nazev: 'Návštěvy' },
          { id: 'body', nazev: 'Body' },
          { id: 'nejnovejsi', nazev: 'Nejnovější' },
        ],
        vychozi: 'navstevy',
      },
    ],
    stav: 'planovany',
  },
  // Data: GET /api/client/admin/loyalty →
  // summary{members,points,credit,couponsOpen,couponsRedeemed,pointsGiven30,pointsSpent30},
  // series[{day,active,points_given,points_spent,new_members,redeemed}]
  {
    id: 'klient.vernost_30dni',
    oblast: 'klient',
    nazev: 'Věrnost za 30 dní',
    popis: 'Aktivní hosté po dnech, rozdané a utracené body, noví členové, uplatněné kupony.',
    ikona: 'cup',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.klient'],
    opravneni: { vse: ['vernost.zobrazit'], nektere: [] },
    tarif: 'max',
    stav: 'planovany',
  },
  // Data: GET /api/client/admin/summary → setup{enabled,menu,tables,tablesPaired,pos,location,loyaltyOn,…}
  {
    id: 'klient.propojeni',
    oblast: 'klient',
    nazev: 'Propojení Clientu',
    popis: 'Co je nastavené: zapnuto pro hosty, menu, stoly (spárované s kasou), pokladna, poloha, věrnost.',
    ikona: 'cup',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.klient'],
    opravneni: {
      vse: ['klient.prehled'],
      nektere: [],
      pole: { 'akce:nastavit': ['klient.nastaveni', 'stoly.upravit', 'vernost.pravidla'] },
    },
    tarif: 'max',
    stav: 'planovany',
  },
];
