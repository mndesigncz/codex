// Widgety oblasti „Odměny a hodnocení" — metadata bez Reactu (kolo 68, doplněno v kole 69).
//
// Komponenty jsou v components/widgety/oblasti/odmeny.tsx, výpočty v lib/odmenyPrehled.ts.
// Soubor patří balíku B7; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2).
// Kolo 69 (B7): všech dvanáct widgetů je hotových. Triviální backend katalogu (vlastní body,
// úroveň a hodnocení i pro toho, kdo má žebříček — nález N12) je v app/api/rewards/route.ts;
// Výtky v týmu tam navíc dostaly `flaggedUnseen` (kolik výtek člověk ještě nepotvrdil).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/shift-reviews?date →
  // list[{id,name,avatar,worked,reviewed,rating,flagged,shiftLabel,startTime,endTime,closingFiled,tasksDone,tasksMissed,stepsSkipped}]
  {
    id: 'hodnoceni.ohodnotit_smeny',
    oblast: 'odmeny',
    nazev: 'Ohodnotit směny',
    popis: 'Včerejší a dnešní směny k ohodnocení jedním ťuknutím.',
    ikona: 'star',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.prehled', 'vedeni.odmeny'],
    opravneni: { vse: ['hodnoceni.zobrazit'], nektere: [], pole: { 'akce:hodnotit': 'hodnoceni.hodnotit' } },
    tarif: 'pro',
    stav: 'hotovo',
  },
  // Data: GET /api/shift-reviews?month → days[{date,pending}]
  {
    id: 'hodnoceni.nehodnocene',
    oblast: 'odmeny',
    nazev: 'Nehodnocené směny',
    popis: 'Kolik směn v měsíci čeká na hodnocení a od kdy.',
    ikona: 'calendarCheck',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.odmeny'],
    opravneni: { vse: ['hodnoceni.zobrazit'], nektere: [] },
    tarif: 'pro',
    nastaveni: [
      {
        klic: 'mesic',
        nazev: 'Měsíc',
        typ: 'vyber',
        moznosti: [{ id: 'tento', nazev: 'Tento' }, { id: 'minuly', nazev: 'Minulý' }],
        vychozi: 'tento',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/rewards → standings[{name,avatar,points,levelName,pctToNext}]
  {
    id: 'odmeny.zebricek',
    oblast: 'odmeny',
    nazev: 'Žebříček',
    popis: 'Body a úrovně týmu — top N s pokrokem k další úrovni.',
    ikona: 'chart',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'kiosk'],
    stranky: ['vedeni.prehled', 'vedeni.odmeny', 'kiosk.smena'],
    opravneni: { vse: ['odmeny.zebricek'], nektere: [], pole: { vytky_a_nehodnocene: 'hodnoceni.zobrazit' } },
    tarif: 'pro',
    nastaveni: [
      {
        klic: 'pocet',
        nazev: 'Kolik řádků',
        typ: 'vyber',
        moznosti: [{ id: '3', nazev: '3' }, { id: '5', nazev: '5' }, { id: '10', nazev: '10' }],
        vychozi: '5',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/rewards/catalog → redemptions[status=pending]
  {
    id: 'odmeny.zadosti',
    oblast: 'odmeny',
    nazev: 'Žádosti o odměny',
    popis: 'Kdo chce vyměnit body za odměnu — Schválit (odečte body) / Zamítnout, i hromadně.',
    ikona: 'gift',
    // L bez stropu (review B7): celá fronta najednou, jako dřív nad žebříčkem.
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.odmeny'],
    opravneni: { vse: ['odmeny.schvalovat'], nektere: [] },
    tarif: 'pro',
    stav: 'hotovo',
  },
  // Data: GET /api/rewards → standings[{name,avatar,flagged,flaggedUnseen}] (flaggedUnseen od kola 69)
  {
    id: 'odmeny.vytky_tymu',
    oblast: 'odmeny',
    nazev: 'Výtky v týmu',
    popis: 'Kolik výtek kdo dostal a jestli je viděl.',
    ikona: 'warning',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.odmeny'],
    opravneni: { vse: ['odmeny.zebricek', 'hodnoceni.zobrazit'], nektere: [] },
    tarif: 'pro',
    stav: 'hotovo',
  },
  // Data: GET /api/rewards/catalog → catalog[{title,icon,cost,active}]; GET /api/rewards → me.points
  // Backend (kolo 69, N12): /api/rewards vrací me/reviews vždy, i se žebříčkem.
  // Pozor: číst každý
  {
    id: 'odmeny.katalog',
    oblast: 'odmeny',
    nazev: 'Katalog odměn',
    popis: 'Co si jde za body vybrat a kolik mi chybí; se správou katalogu i Přidat odměnu.',
    ikona: 'gift',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.odmeny'],
    opravneni: { vse: [], nektere: [], pole: { 'akce:spravovat_katalog': 'odmeny.katalog' } },
    tarif: 'pro',
    stav: 'hotovo',
  },
  // Data: GET /api/rewards → levels[], me.levelIndex
  // Backend (kolo 69, N12): /api/rewards vrací me/reviews vždy, i se žebříčkem.
  // Pozor: každý
  {
    id: 'odmeny.urovne',
    oblast: 'odmeny',
    nazev: 'Úrovně',
    popis: 'Přehled úrovní a benefitů, moje úroveň zvýrazněná.',
    ikona: 'trend',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.odmeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'pro',
    stav: 'hotovo',
  },
  // Data: GET /api/rewards → me{points,levelName,next,pctToNext,pointsIntoLevel,pointsForNext,perks}
  // Backend (kolo 69, N12): `me` i ve větvi se žebříčkem.
  // Pozor: vlastní data
  {
    id: 'moje.uroven',
    oblast: 'odmeny',
    nazev: 'Moje úroveň a body',
    popis: 'Úroveň, body a pokrok k další úrovni (+ benefity).',
    ikona: 'sparkle',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'pro',
    stav: 'hotovo',
  },
  // Data: GET /api/rewards → reviews[{work_date,rating,points,flagged,note,seen_at}], unseenFlagged;
  // POST /api/rewards {markSeen:true}
  // Backend (kolo 69, N12): reviews i ve větvi se žebříčkem.
  // Pozor: vlastní data
  {
    id: 'moje.zpetna_vazba',
    oblast: 'odmeny',
    nazev: 'Zpětná vazba',
    popis: 'Nové hodnocení tvé směny nebo výtka, kterou máš potvrdit.',
    ikona: 'star',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'zamestnanec.odmeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'pro',
    kostra: { M: 'text', L: 'seznam' },
    stav: 'hotovo',
  },
  // Data: GET /api/rewards → reviews[]
  // Backend (kolo 69, N12): /api/rewards vrací me/reviews vždy, i se žebříčkem.
  // Pozor: vlastní data
  {
    id: 'moje.hodnoceni_smen',
    oblast: 'odmeny',
    nazev: 'Hodnocení mých směn',
    popis: 'Historie hodnocení směn: hvězdy, body, poznámka vedení.',
    ikona: 'calendarCheck',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.odmeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'pro',
    nastaveni: [
      {
        klic: 'pocet',
        nazev: 'Kolik řádků',
        typ: 'vyber',
        moznosti: [{ id: '3', nazev: '3' }, { id: '5', nazev: '5' }, { id: '10', nazev: '10' }],
        vychozi: '5',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/rewards → me.breakdown, points (sazebník)
  // Backend (kolo 69, N12): /api/rewards vrací me/reviews vždy, i se žebříčkem.
  // Pozor: vlastní data
  {
    id: 'moje.odkud_body',
    oblast: 'odmeny',
    nazev: 'Odkud mám body',
    popis: 'Rozpad bodů: úkoly, postupy, uzávěrky, hodnocení.',
    ikona: 'coins',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.odmeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'pro',
    stav: 'hotovo',
  },
  // Data: GET /api/attendance → entries[]; GET /api/rewards → reviews[]
  // Backend (kolo 69, N12): /api/rewards vrací me/reviews vždy, i se žebříčkem.
  // Pozor: vlastní data
  {
    id: 'moje.tento_mesic',
    oblast: 'odmeny',
    nazev: 'Tenhle měsíc',
    popis: 'Tvoje odpracované hodiny, hodnocené směny a průměrné hodnocení za měsíc.',
    ikona: 'award',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['zamestnanec.domu', 'zamestnanec.odmeny'],
    opravneni: { vse: [], nektere: [] },
    tarif: 'zdarma',
    kostra: { M: 'cislo' },
    stav: 'hotovo',
  },
];
