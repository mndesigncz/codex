// Kolo 7, balík R7-4 (Úkoly a plánování) — jednotkové testy.
//
// Čistá logika je v lib/ukolyPrehled.ts a lib/ukolyFiltr.ts, UI i API ji jen volají:
//  - stav úkolu při zápisu (Čeká / Probíhá / Hotovo jedním slovníkem pro vedení, zaměstnance, widget i tablet),
//  - čas termínu „do 14:00": řazení uvnitř dne, „po čase" podle pražských hodin (i kolem půlnoci),
//    validace vstupu API a přenos do dalších výskytů série, text push oznámení,
//  - jeden úkol víc lidem (runBulk, každé res.ok, toast s plurálem, částečné selhání jménem),
//  - fotka jako důkaz: serverová brána validujDukaz, jen /api/upload/<id>, výskyty dědí require_photo, ne fotku,
//  - karta v Plánování: autor z GET /api/planning a stáří karty („před 3 dny", „před 2 týdny"),
//  - úkol z karty: koncept ve tvaru formuláře TaskManageru, který lib/draft opravdu obnoví.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  jeStavZapisu, stavPoOdskrtnuti, STAVY_ZAPISU, vyberUkoly, rozdelPoDnech, validujCasTerminu, doplnkyVyskytu, textOznameniUkolu, casNeboNull,
  platnaFotka, chceFotku, validujDukaz, vyberKarty, stariKarty, krestniJmeno, prazdnyFormularUkolu, konceptUkoluZKarty,
} from '../../lib/ukolyPrehled.ts';
import { slouceni, maSeObnovit } from '../../lib/draft.ts';
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
    [doplnkyVyskytu({ due_time: '10:00' }).due_time, doplnkyVyskytu({ due_time: 'x' }).due_time, doplnkyVyskytu({}).due_time, doplnkyVyskytu(null).due_time],
    ['10:00', null, null, null]);
  eq('push: „do 14:00" podle dne — dnes, zítra, jindy datum; bez času jen název', [
    textOznameniUkolu('Objednat pečivo', DNES, '10:00', DNES), textOznameniUkolu('Objednat pečivo', ZITRA, '10:00', DNES),
    textOznameniUkolu('Objednat pečivo', '2026-11-03', '10:00', DNES), textOznameniUkolu('Objednat pečivo', DNES, null, DNES),
  ], ['Objednat pečivo · dnes do 10:00', 'Objednat pečivo · zítra do 10:00', 'Objednat pečivo · 3. 11. do 10:00', 'Objednat pečivo']);
  eq('čas: casNeboNull z DB textu', [casNeboNull('07:05'), casNeboNull(' 07:05 '), casNeboNull('7:05'), casNeboNull(null)], ['07:05', '07:05', null, null]);
  const api = zdroj('app/api/tasks/route.ts');
  ok('API: POST i PATCH validují čas (validujCasTerminu), shape vrací dueTime, top-up i přestavba série čas přenesou',
    (api.match(/validujCasTerminu\(/g) ?? []).length >= 2 && /dueTime: r\.due_date \? casNeboNull\(r\.due_time\)/.test(api)
    && /zapisDoplnky\(doplnkyVyskytu\(vzor\), \{ seriesId, dny: inserts \}\)/.test(api) && /await zapisDoplnky\(\{ due_time: cas, require_photo: chceFoto \}, cilPovinny\)/.test(api));
  ok('formulář: Termín a „Do kdy" sdílí řádek i na telefonu (grid-cols-2), čas bez data zamčený',
    /<div className="grid grid-cols-2 gap-3 sm:gap-4">\s*<Field id=\{fid\('termin'\)\}/.test(zdroj('components/employer/TaskManager.tsx'))
    && /type="time" value=\{form\.dueTime\} disabled=\{!form\.dueDate\}/.test(zdroj('components/employer/TaskManager.tsx')));

  // ---- 3) Jeden úkol víc lidem ----
  const tm = zdroj('components/employer/TaskManager.tsx');
  ok('víc lidí: N× POST přes runBulk, každý s okJson (res.ok), koncept se uklidí jen po úplném úspěchu',
    /runBulk\(lide, id =>\s*fetch\(URL_UKOLY, \{ method: 'POST'[^\n]*\)\.then\(okJson\)\)/.test(tm)
    && /if \(failed\.length === 0\) \{\s*koncept\.hotovo\(\); closeForm\(\);/.test(tm));
  ok('víc lidí: toast s plurálem „Úkol je zadaný # lidem", částečné selhání note-wait se jmény',
    tm.includes("t('{n, plural, one {Úkol je zadaný # člověku} few {Úkol je zadaný # lidem} other {Úkol je zadaný # lidem}}'")
    && /<p className="note note-wait text-sm" role="alert">\{castecne\}<\/p>/.test(tm));
  ok('víc lidí: pás pilulek (filter-pill, aria-pressed, výlučné Kdokoli) do 10 lidí, nad 10 seznam se SelectBox a vlastním posuvem',
    /members\.length <= 10 \?/.test(tm) && /aria-pressed=\{form\.komu\.length === 0\}/.test(tm) && /overflow-x-auto overscroll-x-contain/.test(tm)
    && /max-h-\[16\.5rem\] overflow-y-auto/.test(tm) && /<SelectBox checked=\{on\}/.test(tm));
  ok('víc lidí: úprava zůstává na jednom člověku (Select), výběr víc lidí jen při zakládání s ukoly.zadavat',
    /const vyberVic = zadava && editingId == null;/.test(tm));

  // ---- 4) Fotka jako důkaz ----
  ok('fotka: platná je jen adresa nahraného souboru /api/upload/<id>',
    platnaFotka('/api/upload/123') && platnaFotka('/api/upload/abc_D-9') && !platnaFotka('https://evil.example/x.jpg') && !platnaFotka('/api/upload/1/../2')
    && !platnaFotka('/api/upload/') && !platnaFotka('javascript:alert(1)') && !platnaFotka(null));
  const foto = vyberUkoly([
    { ...zaklad, id: 21, title: 'Vyčistit lednici', dueDate: DNES, requirePhoto: true },
    { ...zaklad, id: 22, title: 'Umyto', dueDate: DNES, status: 'done', requirePhoto: true, completionPhoto: '/api/upload/77' },
    { ...zaklad, id: 23, title: 'Cizí URL', dueDate: DNES, requirePhoto: 'ano', completionPhoto: 'https://x.cz/a.jpg' },
  ]);
  eq('fotka: výběr — requirePhoto jen true, completionPhoto jen /api/upload/', foto.map(u => [u.requirePhoto, u.completionPhoto]),
    [[true, null], [true, '/api/upload/77'], [false, null]]);
  ok('fotka: okno se otevře u úkolu, který fotku chce a ještě žádnou nemá; s uloženou (vrácený mezi nehotové) ne',
    chceFotku(foto[0]) && !chceFotku(foto[1]) && !chceFotku(foto[2]));
  eq('server: hotovo bez fotky u require_photo = 400 „U tohoto úkolu je potřeba fotka."',
    validujDukaz({ pozadovana: true, ulozena: null, vstup: undefined, hotovo: true }), { ok: false, chyba: 'U tohoto úkolu je potřeba fotka.' });
  eq('server: s fotkou projde a vrátí ji k uložení; uložená z dřívějška stačí; bez require_photo fotka není potřeba', [
    validujDukaz({ pozadovana: true, ulozena: null, vstup: '/api/upload/5', hotovo: true }),
    validujDukaz({ pozadovana: true, ulozena: '/api/upload/4', vstup: null, hotovo: true }),
    validujDukaz({ pozadovana: false, ulozena: null, vstup: '', hotovo: true }),
  ], [{ ok: true, foto: '/api/upload/5' }, { ok: true, foto: null }, { ok: true, foto: null }]);
  ok('server: cizí adresa fotky je 400 i u úkolu bez require_photo; vrácení mezi nehotové fotku nechce ani neukládá',
    !validujDukaz({ pozadovana: false, ulozena: null, vstup: 'https://x.cz/a.jpg', hotovo: true }).ok
    && JSON.stringify(validujDukaz({ pozadovana: true, ulozena: null, vstup: undefined, hotovo: false })) === JSON.stringify({ ok: true, foto: null }));
  eq('série: další výskyt zdědí require_photo, fotku ze splnění ne', doplnkyVyskytu({ due_time: '10:00', require_photo: true, completion_photo: '/api/upload/9' }),
    { due_time: '10:00', require_photo: true });
  const apiF = zdroj('app/api/tasks/route.ts');
  ok('API: PATCH status projde validujDukaz před výrobou i zápisem, fotka musí být nahraná v podniku, zápis do historie ukoly.fotka',
    apiF.indexOf('validujDukaz(') > 0 && apiF.indexOf('validujDukaz(') < apiF.indexOf("task.source === 'production'")
    && /SELECT id FROM uploads WHERE id = \$\{idSouboru\} AND team_id = \$\{c\.teamId\}/.test(apiF) && /'ukoly\.fotka'/.test(apiF)
    && /completionPhoto: platnaFotka\(r\.completion_photo\)/.test(apiF) && /requirePhoto: r\.require_photo === true/.test(apiF));
  const okno = zdroj('components/ukoly/PrilozFoto.tsx');
  ok('okno Přilož fotku: Modal sm, input image/* s capture (zadní fotoaparát), POST /api/upload, náhled max-h-48 max-w-full, „Označit" až po nahrání',
    /<Modal open onClose=\{onClose\} size="sm"/.test(okno) && /type="file" accept="image\/\*" capture="environment"/.test(okno)
    && /fetch\('\/api\/upload', \{ method: 'POST', body: fd \}\)\.then\(okJson\)/.test(okno) && /max-h-48 w-auto max-w-full/.test(okno)
    && /disabled=\{!url \|\| nahravam\}/.test(okno) && /size="lg" block icon="camera"/.test(okno));
  eq('okno Přilož fotku volají všechna místa odškrtnutí (vedení, zaměstnanec, widget, tablet)',
    ['components/employer/TaskManager.tsx', 'components/employee/Tasks.tsx', 'components/widgety/oblasti/ukoly.tsx', 'components/kiosk/KioskTasks.tsx']
      .filter(f => !/<PrilozFoto\b/.test(zdroj(f)) || !/chceFotku\(/.test(zdroj(f))), []);
  ok('tablet: fotka i splnění jdou za vybraného člověka (actingAs), okno řekne za koho',
    /actingAs: who\.id, \.\.\.\(fotka \? \{ completionPhotoUrl: fotka \} : \{\}\)/.test(zdroj('components/kiosk/KioskTasks.tsx'))
    && /zaKoho=\{foto\.who\.name\}/.test(zdroj('components/kiosk/KioskTasks.tsx')));

  // ---- 5) Karta v Plánování: autor a stáří ----
  const karty = vyberKarty([
    { id: 1, title: 'Letní terasa', column: 'in_progress', position: 0, created_by: 15, author_name: 'Martin Nemeškal', author_avatar: '🧑', created_at: '2026-10-09T08:00:00.000Z' },
    { id: 2, title: 'Smazaný autor', column: 'ideas', position: 1, created_by: 99, author_name: null, created_at: '2026-10-12 06:30:00' },
    { id: 3, title: 'Stará odpověď', column: 'ideas', position: 2 },
  ]);
  eq('karta: výběr nese autora, avatar a čas založení (bez autora / starý tvar = null)', karty.map(k => [k.autor, k.autorAvatar, k.vytvoreno]), [
    ['Martin Nemeškal', '🧑', '2026-10-09T08:00:00.000Z'], [null, null, '2026-10-12 06:30:00'], [null, null, null],
  ]);
  const TED = Date.parse('2026-10-12T08:00:00.000Z');
  eq('karta: stáří — před 3 dny; TIMESTAMP bez zóny je UTC (06:30 → před 1 h); bez času nevím', [
    stariKarty(karty[0].vytvoreno, TED), stariKarty(karty[1].vytvoreno, TED), stariKarty(karty[2].vytvoreno, TED),
  ], [{ druh: 'den', n: 3 }, { druh: 'h', n: 1 }, { druh: 'nevim' }]);
  eq('karta: stáří po stupních — právě teď, minuty, týdny, měsíce, roky; budoucí čas = právě teď', [
    stariKarty('2026-10-12T07:59:40.000Z', TED), stariKarty('2026-10-12T07:15:00.000Z', TED), stariKarty('2026-09-21T08:00:00.000Z', TED),
    stariKarty('2026-07-01T08:00:00.000Z', TED), stariKarty('2024-09-01T08:00:00.000Z', TED), stariKarty('2026-10-12T09:00:00.000Z', TED),
  ], [{ druh: 'ted' }, { druh: 'min', n: 45 }, { druh: 'tyden', n: 3 }, { druh: 'mesic', n: 3 }, { druh: 'rok', n: 2 }, { druh: 'ted' }]);
  eq('karta: křestní jméno do patky', [krestniJmeno('Eva Testová'), krestniJmeno('  Petr  '), krestniJmeno(null)], ['Eva', 'Petr', '']);
  ok('API plánování: GET s LEFT JOIN users (author_name, author_avatar), karta smazaného autora nezmizí',
    /LEFT JOIN users u ON u\.id = p\.created_by/.test(zdroj('app/api/planning/route.ts')) && /u\.name AS author_name, u\.avatar AS author_avatar/.test(zdroj('app/api/planning/route.ts')));
  ok('tabule: patka karty t-meta s Avatarem xs, truncate a celým jménem s datem v title',
    /<p className="t-meta mt-2\.5 flex items-center gap-1\.5 min-w-0" title=\{presne \|\| undefined\}>/.test(zdroj('components/employer/PlanningBoard.tsx'))
    && /<Avatar emoji=\{card\.autorAvatar\} name=\{card\.autor\} size="xs"/.test(zdroj('components/employer/PlanningBoard.tsx')));

  // ---- 6) Úkol z karty ----
  const prazdny = prazdnyFormularUkolu();
  const koncept = konceptUkoluZKarty({ title: 'Nový ceník', description: 'Ceny od listopadu, tisk A4.' });
  eq('z karty: koncept má přesně klíče formuláře TaskManageru (jinak by ho slouceni zahodilo)', Object.keys(koncept).sort(), Object.keys(prazdny).sort());
  ok('z karty: koncept se obnoví (maSeObnovit) a slouceni vrátí název i popis karty, zbytek prázdný (komu = kdokoli)',
    maSeObnovit({ upravujeSe: false, ulozeny: JSON.parse(JSON.stringify(koncept)), vychozi: prazdny })
    && JSON.stringify(slouceni(prazdny, JSON.parse(JSON.stringify(koncept)))) === JSON.stringify({ ...prazdny, title: 'Nový ceník', description: 'Ceny od listopadu, tisk A4.' }));
  eq('z karty: karta bez popisu → prázdný popis, dlouhý název se uřízne na 200 znaků (jako pole formuláře)',
    [konceptUkoluZKarty({ title: 'x'.repeat(250), description: null }).title.length, konceptUkoluZKarty({ title: 'A', description: null }).description], [200, '']);
  ok('formulář: TaskManager bere prázdný formulář z lib (stejný tvar jako koncept z karty)', /const emptyForm = prazdnyFormularUkolu;/.test(zdroj('components/employer/TaskManager.tsx')));
  const pb = zdroj('components/employer/PlanningBoard.tsx');
  ok('tabule: „Založit úkol z karty" (ikona check) jen s ukoly.zadavat, zapíše koncept a otevře Úkoly na seznamu',
    /const zakladaUkoly = smi\('ukoly\.zadavat'\) && nav\.smiPohled\('tasks'\);/.test(pb) && /label: t\('Založit úkol z karty'\), icon: 'check'/.test(pb)
    && /zapisKoncept\('ukoly', konceptUkoluZKarty\(card\)\)/.test(pb) && /nav\.onNavigate\('tasks', 'pohled:list'\)/.test(pb));
  ok('useDraft: zapisKoncept píše do sessionStorage pod stejným klíčem jako hook a v try/catch',
    /export function zapisKoncept\(jmeno: string, hodnota: Record<string, unknown>\): boolean \{\s*try \{\s*sessionStorage\.setItem\(KLIC\(jmeno\)/.test(zdroj('lib/useDraft.ts')));
}
