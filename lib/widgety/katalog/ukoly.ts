// Widgety oblasti „Úkoly" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/ukoly.tsx, výpočty v lib/ukolyPrehled.ts.
// Soubor patří balíku B6a. Kolo 69: všech pět widgetů hotových. Ikony se liší, ať jde widgety
// v galerii i na ploše rozeznat podle ikony, ne jen podle titulku (dřív všech pět „check").
// Po termínu má `fire` (hoří): ve výchozím Přehledu vedení je vedle Moje píchačky (`clock`),
// Úkolů na dnes (`check`) a Čeká na tebe (`inbox`) a ikona se tam nesmí opakovat (AK-19).
import type { DefiniceWidgetu } from '../typy.ts';

export const WIDGETY: DefiniceWidgetu[] = [
  // Data: GET /api/tasks → [{title,dueDate,status,assignedTo,assigneeName,teamTask,priority,checklist,source}]
  // Pozor: vlastní a „pro kohokoli" každý
  {
    id: 'ukoly.dnes',
    oblast: 'ukoly',
    nazev: 'Úkoly na dnes',
    popis: 'Dnešní úkoly s odškrtnutím; co je po termínu, je nahoře.',
    ikona: 'check',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.prehled', 'zamestnanec.domu', 'vedeni.ukoly', 'kiosk.smena'],
    opravneni: { vse: [], nektere: [], pole: { tym: 'ukoly.zobrazit_tym', 'akce:odskrtnout': 'ukoly.plnit' } },
    tarif: 'zdarma',
    nastaveni: [
      {
        klic: 'rozsah',
        nazev: 'Čí úkoly',
        typ: 'vyber',
        moznosti: [
          { id: 'moje', nazev: 'Moje úkoly' },
          { id: 'moje_a_volne', nazev: 'Moje a pro kohokoli' },
          { id: 'tym', nazev: 'Celý tým', opravneni: 'ukoly.zobrazit_tym' },
        ],
        vychozi: 'moje_a_volne',
      },
    ],
    cil: { pohled: 'tasks', arg: 'stav:dnes' },
    stav: 'hotovo',
  },
  // Data: GET /api/tasks → [dueDate < dnes && status != done]
  // Pozor: vlastní každý
  {
    id: 'ukoly.po_terminu',
    oblast: 'ukoly',
    nazev: 'Úkoly po termínu',
    popis: 'Nedokončené úkoly po termínu — kolik a čí.',
    ikona: 'fire',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.prehled', 'zamestnanec.domu', 'vedeni.ukoly', 'zamestnanec.ukoly'],
    opravneni: { vse: [], nektere: [], pole: { cely_tym: 'ukoly.zobrazit_tym' } },
    tarif: 'zdarma',
    cil: { pohled: 'tasks', arg: 'stav:po_terminu' },
    stav: 'hotovo',
  },
  // Data: GET /api/tasks; GET /api/teams → members
  {
    id: 'ukoly.podle_lidi',
    oblast: 'ukoly',
    nazev: 'Úkoly podle lidí',
    popis: 'Kolik má kdo aktivních a po termínu úkolů — proklik filtruje seznam.',
    ikona: 'users',
    velikosti: ['M'],
    vychoziVelikost: 'M',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.ukoly'],
    opravneni: { vse: ['ukoly.zobrazit_tym'], nektere: [] },
    tarif: 'zdarma',
    cil: { pohled: 'tasks' },
    stav: 'hotovo',
  },
  // Data: GET /api/tasks; GET /api/teams → team.week_start
  // Pozor: vlastní každý
  {
    id: 'ukoly.tyden',
    oblast: 'ukoly',
    nazev: 'Úkoly na týden',
    popis: 'Týdenní tabule úkolů po dnech (přetažením se přesouvají).',
    ikona: 'calendar',
    velikosti: ['L'],
    vychoziVelikost: 'L',
    rozhrani: ['vedeni', 'zamestnanec'],
    stranky: ['vedeni.ukoly', 'zamestnanec.ukoly'],
    opravneni: {
      vse: [],
      nektere: [],
      pole: { cely_tym: 'ukoly.zobrazit_tym', 'akce:presunout_cizi': 'ukoly.upravit' },
    },
    tarif: 'zdarma',
    cil: { pohled: 'tasks', arg: 'pohled:week' },
    stav: 'hotovo',
  },
  // Data: GET /api/tasks → [status=done, completedByName]
  // Backend (kolo 69): completedAt v shape() app/api/tasks/route.ts — sloupec se plnil, API ho nevracelo.
  {
    id: 'ukoly.splneno_dnes',
    oblast: 'ukoly',
    nazev: 'Splněno dnes',
    popis: 'Co dnes kdo dokončil.',
    ikona: 'calendarCheck',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni'],
    stranky: ['vedeni.ukoly'],
    opravneni: { vse: ['ukoly.zobrazit_tym'], nektere: [] },
    tarif: 'zdarma',
    cil: { pohled: 'tasks', arg: 'stav:hotove' },
    stav: 'hotovo',
  },
  // Data: GET /api/navic/ukoly(?actingAs=) → { ukoly: UkolNavic[] } — volitelné úkoly za body dne (nabídka navíc
  // s opakováním a kapacitou, kolo 11); „Beru si" / „Vrátit" POST /api/navic/ukoly, „Hotovo" POST /api/navic s offerId.
  // Komponenta components/navic/UkolyZaBodyWidget (balík Z). Pozor: vlastní úkoly — vedení vidí své, tým má widget
  // odmeny.za_body_tymu; na tabletu úkoly toho, kdo u tabletu stojí (bez vybraného se zeptá „Kdo jsi?").
  {
    id: 'ukoly.za_body',
    // Kolo 11: přibyl 14. 10. 2026 — doplní se i do uložených rozložení (lib/widgety/rozlozeni.ts doplnNove).
    pridano: '2026-10-14',
    oblast: 'ukoly',
    nazev: 'Úkoly za body',
    popis: 'Volitelné úkoly za extra body — kdo chce, vezme si, splní a zapíše.',
    // `gift` (odměna): na Domů ani na Směně tabletu ve výchozím rozložení není (AK-19; `star` má Zpětná vazba).
    ikona: 'gift',
    velikosti: ['S', 'M', 'L'],
    vychoziVelikost: 'M',
    rozhrani: ['zamestnanec', 'vedeni', 'kiosk'],
    stranky: ['zamestnanec.domu', 'zamestnanec.ukoly', 'zamestnanec.odmeny', 'kiosk.smena', 'vedeni.moje_smeny'],
    opravneni: { vse: [], nektere: ['navic.zapsat'], pole: { 'akce:vzit': 'navic.zapsat' } },
    tarif: 'zdarma',
    kostra: { S: 'cislo', M: 'seznam', L: 'seznam' },
    stav: 'hotovo',
  },
];
