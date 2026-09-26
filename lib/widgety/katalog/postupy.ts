// Widgety oblasti „Postupy" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/postupy.tsx, výpočty v lib/postupyPrehled.ts.
// Soubor patří balíku B6b; převedeno z katalogu widgetů jednorázovým skriptem (spec §2.2),
// v kole 69 hotové všechny. Ikony: dřív měly všechny „clipboard" jako nástroj stránky, takže
// by se ve výchozím rozložení opakovaly (AK-19) — každý teď nese svou (zámek = bez něj
// nepůjde uzávěrka, zvonek = připomínka, play = spustit…).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/procedures → procedures[requireBeforeClosing=true]; GET /api/procedures/runs?today=team →
  // runs[{procedure_id,status}]
  {
    id: 'postupy.povinne_dnes',
    oblast: 'postupy',
    nazev: 'Povinné postupy dnes',
    popis: 'Postupy povinné před uzávěrkou: hotovo / čeká. Bez nich nepůjde odeslat uzávěrka.',
    ikona: 'lock',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: [
      'vedeni.prehled',
      'zamestnanec.domu',
      'vedeni.uzaverky',
      'zamestnanec.uzaverka',
      'vedeni.ukoly',
      'zamestnanec.ukoly',
      'vedeni.postupy',
      'zamestnanec.postupy',
      'kiosk.smena',
    ],
    opravneni: {
      vse: ['postupy.zobrazit'],
      nektere: ['uzaverky.vytvorit', 'postupy.prubehy_tymu'],
      pole: { 'akce:spustit': 'postupy.spoustet' },
    },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/procedures/runs →
  // runs[{procedure_name,user_name,status,completed_at,duration_seconds,checked_items,total_items}]
  // Pozor: vlastní průběhy každý
  {
    id: 'postupy.posledni_prubehy',
    oblast: 'postupy',
    nazev: 'Poslední průběhy',
    popis: 'Kdo, kdy a jak rychle prošel postup; nedokončené kroky oranžově.',
    ikona: 'clock',
    velikosti: ['M', 'L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.postupy', 'zamestnanec.postupy'],
    opravneni: { vse: [], nektere: [], pole: { prubehy_tymu: 'postupy.prubehy_tymu' } },
    tarif: 'zdarma',
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
  // Data: GET /api/procedures/runs → runs[{skipped_items,skip_reasons,procedure_name,user_name}]
  // Pozor: API vrací posledních 50 průběhů — období je nanejvýš tolik.
  {
    id: 'postupy.preskocene_kroky',
    oblast: 'postupy',
    nazev: 'Přeskočené kroky',
    popis: 'Které kroky se přeskakují a s jakým důvodem — kandidáti na úpravu postupu nebo na rozhovor.',
    ikona: 'warning',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.postupy'],
    opravneni: { vse: ['postupy.prubehy_tymu'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'obdobi',
        nazev: 'Období',
        typ: 'vyber',
        moznosti: [{ id: '7_dni', nazev: '7 dní' }, { id: '30_dni', nazev: '30 dní' }],
        vychozi: '7_dni',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/procedures → procedures[{id,name,icon,color}]; GET /api/procedures/runs (poslední dokončení)
  {
    id: 'postupy.spustit',
    oblast: 'postupy',
    nazev: 'Spustit postup',
    popis: 'Dlaždice jednoho postupu (otevírání, zavírání…) — ťuk a běží, včetně „naposledy dokončeno".',
    ikona: 'play',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.postupy', 'zamestnanec.postupy'],
    opravneni: { vse: ['postupy.spoustet'], nektere: [] },
    tarif: 'zdarma',
    nastaveni: [{ klic: 'postup', nazev: 'Postup', typ: 'zdroj', zdroj: 'postupy', vychozi: null }],
    stav: 'hotovo',
  },
  // Data: GET /api/procedures → procedures[approved=false] (API je vrací jen schvalovateli)
  {
    id: 'postupy.navrhy',
    oblast: 'postupy',
    nazev: 'Návrhy postupů',
    popis: 'Postupy navržené týmem ke schválení — Schválit vše.',
    ikona: 'inbox',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.postupy'],
    opravneni: { vse: ['postupy.schvalovat'], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
  // Data: GET /api/procedures → procedures[{remindAt,remindDays,remindAnchor}], openingToday, hasShiftToday
  {
    id: 'postupy.pripominky',
    oblast: 'postupy',
    nazev: 'Připomínky dnes',
    popis: 'Které postupy mají dnes připomínku a kdy (i vůči otevírací době).',
    ikona: 'bell',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.postupy', 'zamestnanec.postupy'],
    opravneni: { vse: ['postupy.zobrazit'], nektere: [] },
    tarif: 'zdarma',
    stav: 'hotovo',
  },
];
