// Kolo 7, balík R7-4 (Úkoly a plánování) — jednotkové testy.
//
// Čistá logika je v lib/ukolyPrehled.ts a lib/ukolyFiltr.ts, UI i API ji jen volají:
//  - stav úkolu při zápisu (Čeká / Probíhá / Hotovo jedním slovníkem pro vedení, zaměstnance, widget i tablet),
//  - čas termínu „do 14:00": řazení uvnitř dne, „po čase" podle pražských hodin (i kolem půlnoci),
//    validace vstupu API a přenos do dalších výskytů série, text push oznámení,

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  jeStavZapisu, stavPoOdskrtnuti, STAVY_ZAPISU, vyberUkoly, rozdelPoDnech, validujCasTerminu, doplnkyVyskytu, textOznameniUkolu, casNeboNull,
} from '../../lib/ukolyPrehled.ts';
import { poCase, seradUkoly, stavUkolu } from '../../lib/ukolyFiltr.ts';
import { pragueDayOf, pragueHM } from '../../lib/pragueTime.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

const DNES = '2026-10-12';
const ZITRA = '2026-10-13';
const zaklad = { status: 'pending', priority: 'medium', assignedTo: 7, createdBy: 1 };

export default function ({ eq, ok }: Testy) {
  // ---- 1) Probíhá: stav při zápisu ----
  eq('stav: zapsat jde jen Čeká, Probíhá a Hotovo', STAVY_ZAPISU, ['pending', 'in_progress', 'done']);
  ok('stav: cokoli jiného (review, prázdno, číslo) server nezapíše', !jeStavZapisu('review') && !jeStavZapisu('') && !jeStavZapisu(1) && jeStavZapisu('in_progress'));
  eq('stav: odškrtnutí = hotovo, ať byl úkol Čeká nebo Probíhá', [stavPoOdskrtnuti(true, 'pending'), stavPoOdskrtnuti(true, 'in_progress')], ['done', 'done']);
  eq('stav: zrušení odškrtnutí vrátí rozpracovaný do Probíhá, ostatní do Čeká',
    [stavPoOdskrtnuti(false, 'in_progress'), stavPoOdskrtnuti(false, 'done'), stavPoOdskrtnuti(false, 'pending'), stavPoOdskrtnuti(false, null)],
    ['in_progress', 'pending', 'pending', 'pending']);
  ok('API: PATCH status projde jeStavZapisu (neplatný stav je 400)', /if \(!jeStavZapisu\(b\.status\)\)/.test(zdroj('app/api/tasks/route.ts')));
  ok('vedení: řádek seznamu kreslí Chip Probíhá a detail dostane onStav (Začít)',
    /uk\.status === 'in_progress' && !done && <Chip tone="info" size="sm">\{t\('Probíhá'\)\}/.test(zdroj('components/employer/TaskManager.tsx'))
    && /onStav=\{smiSplnit\(detail\)/.test(zdroj('components/employer/TaskManager.tsx'))
    && /onStav=\{smiSplnit\(detail\)/.test(zdroj('components/employee/Tasks.tsx')));
  ok('detail: Začít je secondary s ikonou play a jen u nehotového neprobíhajícího úkolu',
    /onStav && !zamceno && !hotovo && ukol\.status !== 'in_progress' && <Button variant="secondary" icon="play"/.test(zdroj('components/ukoly/UkolDetail.tsx')));

  // ---- 2) Čas termínu ----
  const casy = vyberUkoly([
    { ...zaklad, id: 1, title: 'Bez času', dueDate: DNES },
    { ...zaklad, id: 2, title: 'Do 14:00', dueDate: DNES, dueTime: '14:00' },
    { ...zaklad, id: 3, title: 'Do 10:00', dueDate: DNES, dueTime: '10:00' },
    { ...zaklad, id: 4, title: 'Zítra 08:00', dueDate: ZITRA, dueTime: '08:00' },
    { ...zaklad, id: 5, title: 'Čas bez dne', dueDate: null, dueTime: '09:00' },
    { ...zaklad, id: 6, title: 'Nesmysl', dueDate: DNES, dueTime: '25:99' },
    { ...zaklad, id: 7, title: 'Se sekundami', dueDate: DNES, dueTime: '09:30:00' },
  ]);
  eq('čas: výběr nechá HH:MM, zahodí čas bez dne a nesmysl, sekundy uřízne', casy.map(u => u.dueTime), [null, '14:00', '10:00', '08:00', null, null, '09:30']);
  eq('čas: seradUkoly podle termínu — uvnitř dne podle času, bez času na konec dne, zítřek za dneškem, bez dne úplně nakonec',
    seradUkoly(casy, 'termin').map(u => u.id), [7, 3, 2, 1, 6, 4, 5]);
  eq('čas: sekce Dnes v nástroji (rozdelPoDnech) taky podle času, bez termínu napřed (stávající pravidlo)',
    rozdelPoDnech(casy, DNES, '2026-10-19').dnes.map(u => u.id), [5, 7, 3, 2, 1, 6]);
  ok('čas: stavUkolu zůstává denní — dnešní úkol po čase je pořád „dnes", ne „po termínu"', stavUkolu(casy[2], DNES, '2026-10-19') === 'dnes');

  ok('po čase: dnešní nehotový „do 10:00" v 10:05 ano, v 10:00 ještě ne', poCase(casy[2], DNES, '10:05') && !poCase(casy[2], DNES, '10:00'));
  ok('po čase: zítřejší, hotový, bez času ani bez „teď" ne',
    !poCase(casy[3], DNES, '23:59') && !poCase({ ...casy[2], status: 'done' }, DNES, '12:00') && !poCase(casy[0], DNES, '23:59') && !poCase(casy[2], DNES, null));
  // Kolem půlnoci rozhoduje pražský den a čas z pragueTime, ne UTC: 22:30 UTC 12. 10. je v Praze 00:30 13. 10. (CEST).
  const poPulnoci = new Date('2026-10-12T22:30:00Z');
  const denP = pragueDayOf(poPulnoci), tedP = pragueHM(poPulnoci);
  eq('po čase: 22:30 UTC = pražský 13. 10. 00:30', [denP, tedP], ['2026-10-13', '00:30']);
  const noc = vyberUkoly([
    { ...zaklad, id: 11, title: 'Včera do 23:00', dueDate: DNES, dueTime: '23:00' },
    { ...zaklad, id: 12, title: 'Dnes do 00:15', dueDate: '2026-10-13', dueTime: '00:15' },
    { ...zaklad, id: 13, title: 'Dnes do 06:00', dueDate: '2026-10-13', dueTime: '06:00' },
  ]);
  eq('po čase: po půlnoci je včerejší „do 23:00" po termínu (ne po čase), dnešní „do 00:15" po čase, „do 06:00" ještě ne',
    noc.map(u => [poCase(u, denP, tedP), stavUkolu(u, denP, '2026-10-20')]), [[false, 'po_terminu'], [true, 'dnes'], [false, 'dnes']]);

  eq('validace času: prázdno = bez času, HH:MM s dnem projde', [validujCasTerminu('', true), validujCasTerminu(null, false), validujCasTerminu('14:00', true)],
    [{ ok: true, cas: null }, { ok: true, cas: null }, { ok: true, cas: '14:00' }]);
  ok('validace času: špatný tvar (24:00, 9:00, 14:60, číslo) je chyba vstupu',
    ['24:00', '9:00', '14:60', 1400, 'zítra'].every(v => !validujCasTerminu(v, true).ok));
  const bezDne = validujCasTerminu('14:00', false);
  ok('validace času: čas bez dne je chyba („jen s dnem")', !bezDne.ok && /jen s dnem/.test(bezDne.chyba));
  eq('série: další výskyt převezme čas vzoru, nesmysl a chybějící sloupec (před migrací) = bez času',
    [doplnkyVyskytu({ due_time: '10:00' }), doplnkyVyskytu({ due_time: 'x' }), doplnkyVyskytu({}), doplnkyVyskytu(null)],
    [{ due_time: '10:00' }, { due_time: null }, { due_time: null }, { due_time: null }]);
  eq('push: „do 14:00" podle dne — dnes, zítra, jindy datum; bez času jen název', [
    textOznameniUkolu('Objednat pečivo', DNES, '10:00', DNES), textOznameniUkolu('Objednat pečivo', ZITRA, '10:00', DNES),
    textOznameniUkolu('Objednat pečivo', '2026-11-03', '10:00', DNES), textOznameniUkolu('Objednat pečivo', DNES, null, DNES),
  ], ['Objednat pečivo · dnes do 10:00', 'Objednat pečivo · zítra do 10:00', 'Objednat pečivo · 3. 11. do 10:00', 'Objednat pečivo']);
  eq('čas: casNeboNull z DB textu', [casNeboNull('07:05'), casNeboNull(' 07:05 '), casNeboNull('7:05'), casNeboNull(null)], ['07:05', '07:05', null, null]);
  const api = zdroj('app/api/tasks/route.ts');
  ok('API: POST i PATCH validují čas (validujCasTerminu), shape vrací dueTime, top-up i přestavba série čas přenesou',
    (api.match(/validujCasTerminu\(/g) ?? []).length >= 2 && /dueTime: r\.due_date \? casNeboNull\(r\.due_time\)/.test(api)
    && /zapisDoplnky\(doplnkyVyskytu\(vzor\), \{ seriesId, dny: inserts \}\)/.test(api) && /await zapisDoplnky\(\{ due_time: cas \}, cilPovinny\)/.test(api));
  ok('formulář: Termín a „Do kdy" sdílí řádek i na telefonu (grid-cols-2), čas bez data zamčený',
    /<div className="grid grid-cols-2 gap-3 sm:gap-4">\s*<Field id=\{fid\('termin'\)\}/.test(zdroj('components/employer/TaskManager.tsx'))
    && /type="time" value=\{form\.dueTime\} disabled=\{!form\.dueDate\}/.test(zdroj('components/employer/TaskManager.tsx')));
}
