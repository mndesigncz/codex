// Spuštění (balík Q): kartička naskenovaná u kasy se sama spáruje se zaplaceným účtem ze Storyous.
// Čistá logika párování z lib/parovaniUctu.ts (jednoznačný účet, víc kandidátů, mimo okno, stůl a číšník,
// propadnutí) a pojistky nad zdrojáky tam, kde pravidlo žije v SQL nebo v pořadí kroků (idempotence
// podle účtu, vrácení zrušené účtenky, jedna cesta pro ruční výběr i párování).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  naparuj, kandidatiPro, vOkne, propadlo, normJmeno, sediCisnik, casMs, vetaSparovano,
  OKNO_PRED_MIN, OKNO_PO_MIN, PROPADNE_PO_H, SYNC_PO_SKENU_S, type CekajiciParovani, type UcetZPokladny,
} from '../../lib/parovaniUctu.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const money = (n: number) => `${n} Kč`;

const SKEN = '2026-10-14 17:00:00'; // čas z databáze bez zóny = UTC
const posun = (min: number) => new Date(Date.parse('2026-10-14T17:00:00Z') + min * 60_000).toISOString();
const ucet = (billId: string, min: number, x: Partial<UcetZPokladny> = {}): UcetZPokladny =>
  ({ billId, paidAt: posun(min), finalPrice: 412, deskId: '5', createdByName: 'Eva Nováková', paidByName: 'Eva Nováková', ...x });
const ceka = (id: number, x: Partial<CekajiciParovani> = {}): CekajiciParovani =>
  ({ id, customerId: 100 + id, scannedAt: SKEN, deskId: null, waiter: 'Eva Nováková', ...x });

export default async function ({ eq, ok }: Testy) {
  // ---- Konstanty ze zadání ----
  eq('okno: 15 min před skenem, 3 h po něm', [OKNO_PRED_MIN, OKNO_PO_MIN], [15, 180]);
  eq('propadnutí po 6 h, synchronizace po skenu nejvýš jednou za 30 s', [PROPADNE_PO_H, SYNC_PO_SKENU_S], [6, 30]);

  // ---- Čas a jména ----
  eq('čas z databáze bez zóny je UTC', casMs(SKEN), Date.parse('2026-10-14T17:00:00Z'));
  eq('čas ISO se zónou', casMs('2026-10-14T19:00:00+02:00'), Date.parse('2026-10-14T17:00:00Z'));
  eq('nesmysl v čase = null', casMs('včera'), null);
  eq('jméno bez diakritiky a pořadí slov', normJmeno('Nováková  Eva'), normJmeno('eva novakova'));
  ok('číšník sedí podle toho, kdo účet založil', sediCisnik('Eva Nováková', { createdByName: 'EVA NOVÁKOVÁ', paidByName: 'Petr' }));
  ok('číšník sedí podle toho, kdo účet zaplatil', sediCisnik('Eva Nováková', { createdByName: 'Petr', paidByName: 'Nováková Eva' }));
  ok('jiný číšník nesedí', !sediCisnik('Eva Nováková', { createdByName: 'Petr Malý', paidByName: null }));
  ok('prázdné jméno obsluhy nikdy nesedí', !sediCisnik('', { createdByName: '', paidByName: '' }));

  // ---- Okno ----
  ok('okno: zaplaceno 15 min před skenem ještě platí', vOkne(SKEN, posun(-15)));
  ok('okno: 16 min před skenem už ne', !vOkne(SKEN, posun(-16)));
  ok('okno: 3 h po skenu platí', vOkne(SKEN, posun(180)));
  ok('okno: 3 h 1 min po skenu ne', !vOkne(SKEN, posun(181)));
  ok('okno: nezaplacený účet ne', !vOkne(SKEN, null));

  // ---- Jednoznačný účet ----
  eq('jednoznačný: jediný účet číšníka v okně se spáruje', naparuj([ceka(1)], [ucet('B1', 40)]), { pary: [{ claimId: 1, billId: 'B1' }], nejasne: [] });
  eq('jednoznačný: se stolem rozhodne stůl, i když číšník je jiný', naparuj([ceka(1, { deskId: '5', waiter: 'Petr Malý' })], [ucet('B1', 30), ucet('B2', 35, { deskId: '9' })]).pary, [{ claimId: 1, billId: 'B1' }]);
  eq('jednoznačný: stůl + číšník přebije účet jen u stolu', naparuj([ceka(1, { deskId: '5' })], [ucet('B1', 30, { createdByName: 'Petr', paidByName: 'Petr' }), ucet('B2', 50)]).pary, [{ claimId: 1, billId: 'B2' }]);
  eq('jednoznačný: dva hosté u dvou stolů, každý svůj účet', naparuj([ceka(1, { deskId: '5' }), ceka(2, { deskId: '7' })], [ucet('B5', 20), ucet('B7', 25, { deskId: '7' })]).pary,
    [{ claimId: 1, billId: 'B5' }, { claimId: 2, billId: 'B7' }]);

  // ---- Víc kandidátů: samo se nepáruje, obsluha vybere ----
  const dva = naparuj([ceka(1)], [ucet('B1', 30), ucet('B2', 60)]);
  eq('víc kandidátů: nic se nespáruje samo', dva.pary, []);
  eq('víc kandidátů: obsluha dostane oba, bližší čas první', dva.nejasne, [{ claimId: 1, billIds: ['B1', 'B2'] }]);
  const spolecny = naparuj([ceka(1, { deskId: '5' }), ceka(2, { deskId: '5' })], [ucet('B1', 30)]);
  eq('jeden účet pro dva hosty u stejného stolu: nespáruje se nikomu', spolecny.pary, []);
  eq('jeden účet pro dva hosty: oba ho mají v nabídce', spolecny.nejasne.map(x => x.billIds), [['B1'], ['B1']]);

  // ---- Mimo okno a bez signálu ----
  eq('mimo okno: účet zaplacený 20 min před skenem se nepáruje', naparuj([ceka(1)], [ucet('B1', -20)]), { pary: [], nejasne: [] });
  eq('mimo okno: účet po 4 h se nepáruje', naparuj([ceka(1)], [ucet('B1', 240)]).pary, []);
  eq('mimo okno: jen ten v okně se spáruje', naparuj([ceka(1)], [ucet('B0', -30), ucet('B1', 45), ucet('B9', 200)]).pary, [{ claimId: 1, billId: 'B1' }]);
  eq('bez stolu a bez známého číšníka se nepáruje nic', naparuj([ceka(1, { waiter: null })], [ucet('B1', 30)]), { pary: [], nejasne: [] });
  eq('stůl vybraný, účet u jiného stolu: nepáruje se ani se stejným číšníkem', naparuj([ceka(1, { deskId: '3' })], [ucet('B1', 30)]).pary, []);
  eq('jiný číšník bez stolu: nepáruje se', naparuj([ceka(1, { waiter: 'Petr Malý' })], [ucet('B1', 30)]).pary, []);

  // ---- Idempotence a vrácení: zrušený, vrácený, připsaný nebo cizí účet není kandidát ----
  eq('připsaný (nebo přiřazený jinému) účet není kandidát', kandidatiPro(ceka(1), [ucet('B1', 30, { obsazeny: true })]), []);
  eq('vrácený účet není kandidát', kandidatiPro(ceka(1), [ucet('B1', 30, { refunded: true })]), []);
  eq('smazaný účet není kandidát', kandidatiPro(ceka(1), [ucet('B1', 30, { deleted: true })]), []);
  eq('nulový účet není kandidát', kandidatiPro(ceka(1), [ucet('B1', 30, { finalPrice: 0 })]), []);
  eq('po připsání druhý běh nic nepáruje (účet je obsazený)', naparuj([ceka(1)], [ucet('B1', 30, { obsazeny: true })]).pary, []);

  // ---- Propadnutí ----
  const sken = Date.parse('2026-10-14T17:00:00Z');
  ok('propadnutí: 5 h 59 min ještě čeká', !propadlo(SKEN, sken + (6 * 60 - 1) * 60_000));
  ok('propadnutí: po 6 h propadne', propadlo(SKEN, sken + 6 * 3600_000 + 1000));

  // ---- Věta výsledku ----
  eq('výsledek: účet a body', vetaSparovano(412, 41, 0, money), 'Spárováno s účtem 412 Kč · +41 b');
  eq('výsledek: kredit', vetaSparovano(412.4, 0, 20, money), 'Spárováno s účtem 412 Kč · +20 Kč kreditu');
  eq('výsledek: bez zisku', vetaSparovano(99, 0, 0, money), 'Spárováno s účtem 99 Kč');

  // ---- Pojistky nad zdrojáky ----
  const jadro = zdroj('lib/vernostZUctu.ts');
  const scan = zdroj('app/api/client/staff/scan/route.ts');
  const claims = zdroj('app/api/client/staff/claims/route.ts');
  const mirror = zdroj('lib/posMirror.ts');
  ok('idempotence: jádro zabírá účet v client_bill_awards s ON CONFLICT (team_id, bill_id)', /INSERT INTO client_bill_awards[\s\S]*ON CONFLICT \(team_id, bill_id\) DO NOTHING/.test(jadro));
  ok('idempotence: rozdělaný pokus převezme jen starší než 30 s', jadro.includes("awarded_at < NOW() - INTERVAL '30 seconds'"));
  ok('vrácení: jádro zapisuje připsané pro storno (zapisPripsaneZaUctenku)', jadro.includes('zapisPripsaneZaUctenku('));
  ok('vrácení: zrušená nebo vrácená účtenka se nepřipíše', /refunded === true \|\| radek\.deleted === true/.test(jadro));
  ok('ruční cesta používá jádro (scan route, action bill)', scan.includes('pripisZUctu(') && !scan.includes('INSERT INTO client_bill_awards (team_id, bill_id, customer_id, done_at'));
  ok('výběr u čekajícího párování používá jádro', claims.includes('pripisZUctu('));
  ok('párování běží po každé synchronizaci pokladny', mirror.includes('parujCekajici'));
  ok('sken v podniku s pokladnou založí párování a vynutí synchronizaci na pozadí', scan.includes('zalozParovani(') && scan.includes('after(() => synchronizujPoSkenu'));
  ok('vynucená synchronizace nejde pod 20 s (zámek pokladny)', /Math\.max\(20, Math\.round\(opts\.throttleSec\)\)/.test(mirror));
  ok('párování se zabírá stavem paruji (souběh tiku, webhooku a obsluhy)', jadro.includes("SET stav = 'paruji'") && jadro.includes("AND stav = 'ceka' RETURNING"));
  ok('po spárování dostane účet hosta (pos_bills.customer_id)', jadro.includes('UPDATE pos_bills SET customer_id'));
  ok('po spárování host dostane oznámení (notifyUser)', jadro.includes('notifyUser('));
  ok('propadnutí po 6 h líně při čtení', jadro.includes("SET stav = 'propadlo'"));
  ok('bez pokladny se nepáruje (claims GET vrací pos: false)', claims.includes('pos: false'));
  ok('schéma párování je i v /api/init', zdroj('app/api/init/route.ts').includes('CREATE TABLE IF NOT EXISTS client_bill_claims'));
}
