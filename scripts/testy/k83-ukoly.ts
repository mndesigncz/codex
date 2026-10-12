// Kolo 7, balík R7-4 (Úkoly a plánování) — jednotkové testy.
//
// Čistá logika je v lib/ukolyPrehled.ts a lib/ukolyFiltr.ts, UI i API ji jen volají:
//  - stav úkolu při zápisu (Čeká / Probíhá / Hotovo jedním slovníkem pro vedení, zaměstnance, widget i tablet),

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { jeStavZapisu, stavPoOdskrtnuti, STAVY_ZAPISU } from '../../lib/ukolyPrehled.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

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
}
