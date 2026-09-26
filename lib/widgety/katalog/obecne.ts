// Widgety oblasti „Obecné" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/obecne.tsx. Oblast je hotová v kole 68 a v kole 69 je
// soubor zamčený (spec §6.2); převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
import type { DefiniceWidgetu } from '../typy.ts';

/**
 * Odkud „Čeká na tebe" bere každou frontu (klíč = id fronty v nastavení i v `opravneni.pole`).
 * Dotaz se pošle až po useSmi(pole[fronta]), a proto musí klíč fronty sám otevřít bránu endpointu —
 * přímo, nebo přes `vyzaduje` v katalogu oprávnění (role se ukládají se závislostmi). Hlídá to test
 * v scripts/testy/k68-widgety.ts, který čte pozaduj() z GET routy.
 */
export const ZDROJE_FRONT: Readonly<Record<string, string>> = {
  volno: '/api/timeoff',
  vymeny: '/api/shifts/offers',
  uzaverky: '/api/closings',
  navrhy_skladu: '/api/inventory',
  hlaseni: '/api/inventory/reports',
  odmeny: '/api/rewards/catalog',
  postupy: '/api/procedures',
  navody: '/api/guides',
  rezervace: '/api/client/admin/reservations',
  objednavky: '/api/client/staff/inbox',
  slaba_hodnoceni: '/api/client/admin/summary',
};

export const WIDGETY: DefiniceWidgetu[] = [
  // Data (URL front v ZDROJE_FRONT): GET /api/timeoff → requests[status=pending]; GET /api/shifts/offers →
  // offers[status=claimed]; GET /api/closings → closings[approved=false && !covered_by]; GET /api/inventory →
  // [approved=false]; GET /api/inventory/reports → reports[status!=done]; GET /api/rewards/catalog →
  // redemptions[status=pending]; GET /api/procedures → procedures[approved=false]; GET /api/guides →
  // guides[approved=false]; GET /api/client/admin/reservations → reservations[status=requested] (60 dní dopředu);
  // GET /api/client/staff/inbox → newCount (orders[status=new]); GET /api/client/admin/summary → reviews.low7
  // Pozor: rezervace a objednávky nejdou přes /api/client/admin/summary — ten chce klient.prehled, který
  // Provozní (rezervace.schvalovat, objednavky.vyridit) nemá, a fronty by skončily na 403.
  // Pozor: Dnes je fronta hlídaná jen smiPohled(view) — chip „žádost o volno" se ukáže i roli, která volno nesmí
  // schválit.
  {
    id: 'prehled.ceka_na_tebe',
    oblast: 'obecne',
    nazev: 'Čeká na tebe',
    popis: 'Všechno, co čeká na tvoje rozhodnutí — volno, výměny, uzávěrky, návrhy a objednávky — s proklikem.',
    ikona: 'inbox',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.klient'],
    opravneni: {
      vse: [],
      nektere: [
        'volno.schvalovat',
        'rozvrh.vymeny_schvalovat',
        'uzaverky.schvalovat',
        'sklad.schvalovat',
        'sklad.hlaseni_vyridit',
        'odmeny.schvalovat',
        'postupy.schvalovat',
        'navody.schvalovat',
        'rezervace.schvalovat',
        'objednavky.vyridit',
      ],
      pole: {
        volno: 'volno.schvalovat',
        vymeny: 'rozvrh.vymeny_schvalovat',
        uzaverky: 'uzaverky.schvalovat',
        navrhy_skladu: 'sklad.schvalovat',
        hlaseni: 'sklad.hlaseni_vyridit',
        odmeny: 'odmeny.schvalovat',
        postupy: 'postupy.schvalovat',
        navody: 'navody.schvalovat',
        rezervace: 'rezervace.schvalovat',
        objednavky: 'objednavky.vyridit',
        slaba_hodnoceni: 'zakaznici.recenze',
      },
    },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'fronty',
        nazev: 'Které fronty',
        typ: 'vicevyber',
        moznosti: [
          { id: 'volno', nazev: 'Žádosti o volno', opravneni: 'volno.schvalovat' },
          { id: 'vymeny', nazev: 'Výměny směn', opravneni: 'rozvrh.vymeny_schvalovat' },
          { id: 'uzaverky', nazev: 'Uzávěrky', opravneni: 'uzaverky.schvalovat' },
          { id: 'navrhy_skladu', nazev: 'Návrhy do skladu', opravneni: 'sklad.schvalovat' },
          { id: 'hlaseni', nazev: 'Hlášení ze skladu', opravneni: 'sklad.hlaseni_vyridit' },
          { id: 'odmeny', nazev: 'Žádosti o odměny', opravneni: 'odmeny.schvalovat' },
          { id: 'postupy', nazev: 'Návrhy postupů', opravneni: 'postupy.schvalovat' },
          { id: 'navody', nazev: 'Návrhy návodů', opravneni: 'navody.schvalovat' },
          { id: 'rezervace', nazev: 'Rezervace', opravneni: 'rezervace.schvalovat' },
          { id: 'objednavky', nazev: 'Objednávky od stolu', opravneni: 'objednavky.vyridit' },
          { id: 'slaba_hodnoceni', nazev: 'Slabá hodnocení', opravneni: 'zakaznici.recenze' },
        ],
        vychozi: 'vse',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/teams → members; GET /api/shifts → shifts.length; GET /api/inventory → length;
  // GET /api/closings → closings.length; localStorage managero-onboarding-dismissed
  // Pozor: každý krok jen s oprávněním jeho obrazovky (dnes smi(view))
  {
    id: 'prehled.prvni_kroky',
    oblast: 'obecne',
    nazev: 'První kroky',
    popis: 'Kontrolní seznam pro nový podnik: první člověk v týmu, směny, sklad a uzávěrka.',
    ikona: 'sparkle',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled'],
    opravneni: {
      vse: [],
      nektere: ['tym.zobrazit', 'rozvrh.zobrazit', 'sklad.zobrazit', 'uzaverky.zobrazit_vse'],
      pole: {
        tym: 'tym.zobrazit',
        smeny: 'rozvrh.zobrazit',
        sklad: 'sklad.zobrazit',
        uzaverka: 'uzaverky.zobrazit_vse',
      },
    },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/inventory/categories (výběr kategorie); GET /api/procedures (výběr postupu); GET /api/guides
  // (výběr návodu)
  // Pozor: Dnes se u postupu a návodu ukládá NÁZEV a proklik vede jen na seznam; nově ukládat id a otevřít
  // rovnou položku (Guides umí openGuideId).
  // Pozor: podle cíle — stejné klíče jako KLICE_POHLEDU v EmployerLayout/EmployeeLayout; na cíl bez oprávnění se
  // dlaždice nekreslí
  {
    id: 'odkaz',
    oblast: 'obecne',
    nazev: 'Odkaz',
    popis: 'Zkratka na záložku, kategorii skladu, postup nebo návod — jako ikona aplikace.',
    ikona: 'chevronRight',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    vicekrat: true,
    maxInstanci: 12,
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: [
      'vedeni.prehled',
      'zamestnanec.domu',
      'vedeni.rozvrh',
      'vedeni.sklad',
      'zamestnanec.sklad',
      'vedeni.togo',
      'vedeni.navody',
      'zamestnanec.navody',
    ],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [{ klic: 'cil', nazev: 'Kam vede', typ: 'odkaz' }],
    kostra: { S: 'text', M: 'text' },
    stav: 'hotovo',
  },
  // Data: GET /api/teams → pinnedShare{token,title,kind}
  // Pozor: každý člen; správa odkazu sdileni.spravovat
  {
    id: 'sdileni.pripnuta_nabidka',
    oblast: 'obecne',
    nazev: 'Připnutá nabídka',
    popis: 'Sdílená stránka pro zákazníky na jedno ťuknutí.',
    ikona: 'external',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.prehled', 'zamestnanec.domu', 'kiosk.smena'],
    opravneni: { vse: [], nektere: [], pole: { 'akce:spravovat': 'sdileni.spravovat' } },
    tarif: 'zdarma',
    kostra: { S: 'text', M: 'text', L: 'text' },
    stav: 'hotovo',
  },
  // Data: GET /api/announcements → announcements[{content,pinned,authorName,createdAt}] (archiv jen s
  // oznameni.spravovat)
  {
    id: 'oznameni.nastenka',
    oblast: 'obecne',
    nazev: 'Nástěnka',
    popis: 'Připnutá oznámení pro tým; kdo je spravuje, tu i píše a připíná.',
    ikona: 'pin',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.prehled', 'zamestnanec.domu', 'kiosk.smena'],
    opravneni: { vse: [], nektere: [], pole: { 'akce:spravovat': 'oznameni.spravovat' } },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'archiv',
        nazev: 'Ukázat i odepnutá',
        typ: 'prepinac',
        vychozi: false,
        opravneni: 'oznameni.spravovat',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/conversations → conversations[{id,name,lastMessage,unreadCount}]
  {
    id: 'chat.neprectene',
    oblast: 'obecne',
    nazev: 'Nepřečtené zprávy',
    popis: 'Kolik máš nepřečtených zpráv a od koho, s proklikem rovnou do vlákna.',
    ikona: 'chat',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.prehled', 'zamestnanec.domu', 'vedeni.togo'],
    opravneni: { vse: ['chat.pouzivat'], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
];
