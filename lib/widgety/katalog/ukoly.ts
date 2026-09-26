// Widgety oblasti „Úkoly" — metadata bez Reactu (kolo 68).
//
// Komponenty jsou v components/widgety/oblasti/ukoly.tsx, výpočty v lib/ukolyPrehled.ts.
// Soubor patří balíku B6a. Kolo 69: všech pět widgetů hotových. Ikony se liší, ať jde widgety
// v galerii i na ploše rozeznat podle ikony, ne jen podle titulku (dřív všech pět „check").
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
          { id: 'moje', nazev: 'Moje' },
          { id: 'moje_a_volne', nazev: 'Moje a pro kohokoli' },
          { id: 'tym', nazev: 'Celý tým', opravneni: 'ukoly.zobrazit_tym' },
        ],
        vychozi: 'moje_a_volne',
      },
    ],
    stav: 'hotovo',
  },
  // Data: GET /api/tasks → [dueDate < dnes && status != done]
  // Pozor: vlastní každý
  {
    id: 'ukoly.po_terminu',
    oblast: 'ukoly',
    nazev: 'Úkoly po termínu',
    popis: 'Nedokončené úkoly po termínu — kolik a čí.',
    ikona: 'clock',
    velikosti: ['S', 'M'],
    vychoziVelikost: 'S',
    rozhrani: ['vedeni', 'zamestnanec', 'kiosk'],
    stranky: ['vedeni.prehled', 'zamestnanec.domu', 'vedeni.ukoly', 'zamestnanec.ukoly'],
    opravneni: { vse: [], nektere: [], pole: { cely_tym: 'ukoly.zobrazit_tym' } },
    tarif: 'zdarma',
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
    stav: 'hotovo',
  },
];
