// CSV rozvrhu — export a import se musí potkat (lib/rozvrhCsv.ts).
//
// Chyba z auditu: export psal skutečné názvy typů a směny vedení, import typ
// přepsal na „flexible“ a vedení nenašel. Test drží hlavně round-trip: co
// export napíše, to import vrátí beze ztráty; a že nečitelný čas nepropadne.

import type { Testy } from './_testy.ts';
import { sestavCsv, rozeberCsv, platnyCas, platneDatum, rozdelRadek } from '../../lib/rozvrhCsv.ts';

export default function ({ eq, ok }: Testy) {
  const lide = [
    { id: 1, name: 'Anna Nováková', email: 'anna@priklad.cz' },
    { id: 2, name: 'Marek "Šéf" Vedoucí', email: 'marek@priklad.cz' }, // vedení, uvozovky ve jméně
    { id: 3, name: 'Jan; Novák', email: 'jan@priklad.cz' },           // středník ve jméně
  ];
  const smeny = [
    { date: '2026-10-05', employeeName: 'Marek "Šéf" Vedoucí', startTime: '07:00', endTime: '15:00', type: 'Ranní' },
    { date: '2026-10-03', employeeName: 'Anna Nováková', startTime: '14:00', endTime: '22:00', type: 'Odpolední' },
    { date: '2026-10-03', employeeName: 'Jan; Novák', startTime: '22:00', endTime: '06:00', type: 'Noční, víkend' },
    { date: '2026-10-04', employeeName: 'Anna Nováková', startTime: '08:00', endTime: '14:00', type: 'morning' },
  ];

  // ---- round-trip ----
  const csv = sestavCsv(smeny);
  const zpet = rozeberCsv('﻿' + csv, lide);
  eq('csv: vlastní export se načte bez chyb', zpet.errors, []);
  eq('csv: nic se neztratí', zpet.rows.length, smeny.length);
  const serazene = smeny.slice().sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));
  eq('csv: typ zůstane přesně jak byl (název typu i legacy klíč, i s čárkou)',
    zpet.rows.map(r => r.type), serazene.map(s => s.type));
  eq('csv: čas, datum i člověk zůstanou',
    zpet.rows.map(r => [r.date, r.startTime, r.endTime, r.employeeId]),
    serazene.map(s => [s.date, s.startTime, s.endTime, lide.find(l => l.name === s.employeeName)!.id]));
  ok('csv: směna vedení se najde (import hledá i mimo „zaměstnance“)', zpet.rows.some(r => r.employeeId === 2));
  eq('csv: uvozovky a středník ve jméně přežijí', rozdelRadek('2026-10-03;"Jan; Novák";22:00;06:00;Noční'), ['2026-10-03', 'Jan; Novák', '22:00', '06:00', 'Noční']);

  // ---- čárka jako oddělovač a e-mail místo jména ----
  const carka = rozeberCsv('datum,zaměstnanec,od,do,typ\n2026-10-03,ANNA@priklad.cz,8:00,14:00,', lide);
  eq('csv: e-mail bez ohledu na velikost písmen, čárka jako oddělovač', carka.rows.map(r => r.employeeId), [1]);
  eq('csv: H:MM se doplní na HH:MM', [carka.rows[0].startTime, carka.rows[0].endTime], ['08:00', '14:00']);
  eq('csv: prázdný typ = flexible', carka.rows[0].type, 'flexible');

  // ---- co nesmí propadnout ----
  const spatne = rozeberCsv([
    '2026-10-03;anna@priklad.cz;25:99;xx;morning',
    '2026-10-03;anna@priklad.cz;08:00;ráno;morning',
    '2026-02-30;anna@priklad.cz;08:00;14:00;morning',
    '2026-10-03;nikdo@priklad.cz;08:00;14:00;morning',
    '2026-10-03;anna@priklad.cz;08:00;14:00;morning',
  ].join('\n'), lide);
  eq('csv: nečitelný čas, neexistující den a neznámý člověk se přeskočí', spatne.rows.length, 1);
  eq('csv: každý problém má svou chybu', spatne.errors.length, 4);
  ok('csv: chyba času jmenuje špatnou hodnotu', spatne.errors[0].includes('25:99') && spatne.errors[1].includes('ráno'));

  const dvojmeni = rozeberCsv('2026-10-03;Anna;08:00;14:00;x\n2026-10-03;anna@a.cz;08:00;14:00;x',
    [{ id: 1, name: 'Anna', email: 'anna@a.cz' }, { id: 9, name: 'Anna', email: 'anna2@a.cz' }]);
  eq('csv: dvakrát stejné jméno se neuhodne, e-mail ano', [dvojmeni.rows.map(r => r.employeeId), dvojmeni.errors.length], [[1], 1]);
  eq('csv: prázdný soubor', rozeberCsv('  \n', lide).errors, ['Soubor je prázdný.']);

  // ---- validátory ----
  eq('cas: 8:00 → 08:00', platnyCas('8:00'), '08:00');
  eq('cas: sekundy se zahodí', platnyCas('08:30:00'), '08:30');
  eq('cas: 24:00 ne', platnyCas('24:00'), null);
  eq('cas: 12:60 ne', platnyCas('12:60'), null);
  eq('cas: text ne', platnyCas('ráno'), null);
  ok('datum: 29. 2. 2028 ano, 2026 ne', platneDatum('2028-02-29') && !platneDatum('2026-02-29'));
}
