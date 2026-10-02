// Věrnost: propadání bodů (FIFO podle deníku) a bonusové akce (násobič bodů, razítka navíc).
//
// Čistá logika bez databáze (lib/propadaniBodu.ts, lib/bonusAkce.ts) plus hlídání napojení:
// že se bonus uplatňuje na všech místech, kde se body a razítka připisují, a že denní úloha
// propadání je zasazená do denního cronu.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { planPropadani, normalizujDny, VAROVANI_DNI, rozlisDenik, smiVarovat, denKratce } from '../../lib/propadaniBodu.ts';
import {
  normalizujPravidlo, tvarPravidla, platiTed, vyberBonus, bodySBonusem, poznamkaRazitek, popisNasobice, dokdyDnes, prazskeTed, ZADNY_BONUS,
  type BonusPravidlo,
} from '../../lib/bonusAkce.ts';

const zdroj = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- Propadání bodů -----------------------------------------------------------
  const D = '2026-10-01';
  const radek = (delta: number, day: string) => ({ delta, day });

  eq('propadání: vypnuto (0 dní) nic nepropadne', planPropadani([radek(100, '2025-01-01')], 100, D, 0), { propadne: 0, varovat: 0, varovatDo: null });
  eq('propadání: nulový zůstatek nic nepropadne', planPropadani([radek(100, '2025-01-01'), radek(-100, '2025-02-01')], 0, D, 30), { propadne: 0, varovat: 0, varovatDo: null });
  eq('propadání: staré body propadnou celé', planPropadani([radek(100, '2026-01-01')], 100, D, 90).propadne, 100);
  eq('propadání: hranice dne, v den D+N už propadne', planPropadani([radek(50, '2026-09-01')], 50, '2026-10-01', 30).propadne, 50);
  eq('propadání: den před hranicí ještě ne', planPropadani([radek(50, '2026-09-01')], 50, '2026-09-30', 30).propadne, 0);
  eq('propadání: nové body nepropadnou', planPropadani([radek(100, '2026-01-01'), radek(40, '2026-09-25')], 140, D, 90),
    { propadne: 100, varovat: 0, varovatDo: null });

  // FIFO: utracené body ubírají nejstarší várky, takže propadne jen zbytek.
  eq('FIFO: utracení nejstarších bodů, propadne méně', planPropadani([radek(100, '2026-01-01'), radek(100, '2026-09-20'), radek(-100, '2026-02-01')], 100, D, 90).propadne, 0);
  eq('FIFO: částečné propadnutí', planPropadani([radek(100, '2026-01-01'), radek(100, '2026-09-20'), radek(-30, '2026-02-01')], 170, D, 90).propadne, 70);
  eq('FIFO: utrácení přes víc várek', planPropadani([radek(40, '2026-01-01'), radek(40, '2026-01-05'), radek(40, '2026-09-25'), radek(-60, '2026-02-01')], 60, D, 90).propadne, 20);
  eq('FIFO: dřívější propadnutí (záporný řádek) se nepočítá podruhé',
    planPropadani([radek(100, '2026-01-01'), radek(-100, '2026-04-01'), radek(30, '2026-09-25')], 30, D, 90).propadne, 0);
  eq('FIFO: výdaj se bere jen z várek, které už existovaly', planPropadani([radek(-50, '2026-01-01'), radek(100, '2026-01-02')], 50, D, 90).propadne, 50);
  eq('propadání: nikdy víc než zůstatek (ruční odečet pod nulu)', planPropadani([radek(100, '2026-01-01')], 40, D, 90).propadne, 40);
  eq('propadání: body bez řádku v deníku (import) nepropadají', planPropadani([radek(10, '2026-01-01')], 500, D, 90).propadne, 10);

  // Opakované spuštění téhož dne: po odepsání už není co odepsat.
  const poOdepsani = planPropadani([radek(100, '2026-01-01'), radek(-100, D)], 0, D, 90);
  eq('propadání: opakované spuštění po odepsání nic nedá', poOdepsani.propadne, 0);

  // Zapnutí propadání nesmí smazat starý zůstatek najednou.
  eq('propadání: stáří se počítá od dne zapnutí', planPropadani([radek(100, '2025-01-01')], 100, D, 90, '2026-09-20').propadne, 0);
  eq('propadání: po uplynutí doby od zapnutí propadne', planPropadani([radek(100, '2025-01-01')], 100, '2026-12-20', 90, '2026-09-20').propadne, 100);

  // Upozornění.
  const varov = planPropadani([radek(60, '2026-07-05'), radek(40, '2026-09-30')], 100, D, 90);
  eq('upozornění: body propadnou do týdne', varov, { propadne: 0, varovat: 60, varovatDo: '2026-10-03' });
  eq('upozornění: za hranicí týdne se nevaruje', planPropadani([radek(60, '2026-07-20')], 60, D, 90).varovat, 0);
  eq('upozornění: do zůstatku se neřadí, co propadne dnes', planPropadani([radek(50, '2026-05-01'), radek(30, '2026-07-05')], 80, D, 90), { propadne: 50, varovat: 30, varovatDo: '2026-10-03' });
  ok('upozornění: týden předem', VAROVANI_DNI === 7);

  // Vstup bez překvapení: nic nekončí NaN.
  eq('normalizujDny: text, záporné a NaN = vypnuto', [normalizujDny('abc'), normalizujDny(-5), normalizujDny(NaN), normalizujDny(undefined), normalizujDny('')], [0, 0, 0, 0, 0]);
  eq('normalizujDny: strop a zaokrouhlení', [normalizujDny(99999), normalizujDny('30'), normalizujDny(29.6)], [3650, 30, 30]);
  eq('propadání: poškozený deník se přeskočí', planPropadani([{ delta: NaN, day: D }, { delta: 10, day: 'x' }, radek(20, '2026-01-01')], 20, D, 90).propadne, 20);

  // Čtení deníku z databáze.
  const denik = [
    { delta: 100, kind: 'order', ref: 'ord:1', created_at: new Date('2026-01-10T10:00:00Z') },
    { delta: 0, kind: 'expire', ref: 'warn:2026-09-25', created_at: new Date('2026-09-25T10:00:00Z') },
    { delta: -20, kind: 'expire', ref: 'exp:2026-10-01', created_at: new Date('2026-10-01T03:00:00Z') },
  ];
  const r = rozlisDenik(denik, '2026-10-01');
  eq('deník: upozornění není výdaj a pamatuje se jeho den', [r.vstup.length, r.poslednVarovani, r.dnesUz], [2, '2026-09-25', true]);
  eq('deník: po týdnu se smí varovat znovu', [smiVarovat('2026-09-25', '2026-10-01'), smiVarovat('2026-09-24', '2026-10-01'), smiVarovat(null, D)], [false, true, true]);
  eq('deník: datum česky', denKratce('2026-11-02'), '2. 11.');

  // ---- Bonusové akce ---------------------------------------------------------
  const pravidlo = (p: Partial<BonusPravidlo> = {}): BonusPravidlo => ({
    id: 1, name: 'Happy hour', multiplier: 2, stampBonus: 0, days: [], hourFrom: 14, hourTill: 18, validSince: null, validTill: null, active: true, ...p,
  });
  // 2026-10-01 je čtvrtek; v říjnu je Praha na letním čase (UTC+2).
  const ted = (iso: string) => prazskeTed(new Date(iso));
  eq('pražské teď: čtvrtek 15:30 letního času', ted('2026-10-01T13:30:00Z'), { day: '2026-10-01', dow: 4, minuty: 15 * 60 + 30 });
  eq('pražské teď: po půlnoci UTC je v Praze ještě předchozí den', ted('2026-10-01T21:30:00Z').day, '2026-10-01');
  eq('pražské teď: neděle má číslo 7', ted('2026-10-04T10:00:00Z').dow, 7);
  ok('bonus: v okně platí', platiTed(pravidlo(), ted('2026-10-01T13:30:00Z')));
  ok('bonus: konec hodiny je výlučný (18:00 už ne)', !platiTed(pravidlo(), ted('2026-10-01T16:00:00Z')));
  ok('bonus: začátek hodiny je včetně (14:00 ano)', platiTed(pravidlo(), ted('2026-10-01T12:00:00Z')));
  ok('bonus: před oknem neplatí', !platiTed(pravidlo(), ted('2026-10-01T11:59:00Z')));
  ok('bonus: jen vybrané dny (čtvrtek ano, pátek ne)', platiTed(pravidlo({ days: [4] }), ted('2026-10-01T13:30:00Z')) && !platiTed(pravidlo({ days: [5] }), ted('2026-10-01T13:30:00Z')));
  ok('bonus: platnost od–do včetně krajních dnů', platiTed(pravidlo({ validSince: '2026-10-01', validTill: '2026-10-01' }), ted('2026-10-01T13:30:00Z'))
    && !platiTed(pravidlo({ validTill: '2026-09-30' }), ted('2026-10-01T13:30:00Z')) && !platiTed(pravidlo({ validSince: '2026-10-02' }), ted('2026-10-01T13:30:00Z')));
  ok('bonus: vypnutá akce neplatí', !platiTed(pravidlo({ active: false }), ted('2026-10-01T13:30:00Z')));
  ok('bonus: celý den 0–24 platí i v 23:59', platiTed(pravidlo({ hourFrom: 0, hourTill: 24 }), ted('2026-10-01T21:59:00Z')));

  const t0 = ted('2026-10-01T13:30:00Z');
  eq('bonus: žádné pravidlo = žádný bonus', vyberBonus([], t0), ZADNY_BONUS);
  eq('bonus: neplatící pravidla = žádný bonus', vyberBonus([pravidlo({ days: [1] })], t0), ZADNY_BONUS);
  const vyber = vyberBonus([pravidlo({ id: 1, name: 'A', multiplier: 1.5, stampBonus: 2 }), pravidlo({ id: 2, name: 'B', multiplier: 3 })], t0);
  eq('bonus: víc akcí se nesčítá, bere se nejvyšší násobič a razítka', [vyber.nasobic, vyber.razitka, vyber.nazev], [3, 2, 'B']);
  eq('bonus: dokdy dnes', [dokdyDnes(vyber), dokdyDnes(vyberBonus([pravidlo({ hourFrom: 0, hourTill: 24 })], t0)), dokdyDnes(ZADNY_BONUS)], [18, null, null]);

  eq('body s bonusem: dvojnásobek s poznámkou do deníku', bodySBonusem(25, vyberBonus([pravidlo()], t0)), { body: 50, poznamka: ' — dvojnásobné body (Happy hour)' });
  eq('body s bonusem: 1,5× se zaokrouhlí', bodySBonusem(5, vyberBonus([pravidlo({ multiplier: 1.5 })], t0)).body, 8);
  eq('body s bonusem: bez bonusu beze změny a bez poznámky', bodySBonusem(25, ZADNY_BONUS), { body: 25, poznamka: '' });
  eq('body s bonusem: nula zůstane nula, záporné a NaN neprojde', [bodySBonusem(0, vyberBonus([pravidlo()], t0)).body, bodySBonusem(-5, vyberBonus([pravidlo()], t0)).body, bodySBonusem(NaN, vyberBonus([pravidlo()], t0)).body], [0, 0, 0]);
  eq('body s bonusem: nikdy míň než základ', bodySBonusem(3, { ...ZADNY_BONUS, nasobic: 1.01, nazev: 'x' }).body >= 3, true);
  eq('razítka navíc: poznámka se správným tvarem', [poznamkaRazitek(vyberBonus([pravidlo({ multiplier: 1, stampBonus: 1 })], t0)), poznamkaRazitek(vyberBonus([pravidlo({ multiplier: 1, stampBonus: 3 })], t0)), poznamkaRazitek(vyberBonus([pravidlo({ multiplier: 1, stampBonus: 5 })], t0)), poznamkaRazitek(ZADNY_BONUS)],
    [' — 1 razítko navíc (Happy hour)', ' — 3 razítka navíc (Happy hour)', ' — 5 razítek navíc (Happy hour)', '']);
  eq('násobič slovy', [popisNasobice(2), popisNasobice(3), popisNasobice(1.5), popisNasobice(4)], ['dvojnásobné body', 'trojnásobné body', '1,5× body', '4× body']);

  // Kontrola vstupu: násobič 1–10, hodiny 0–24, nic nekončí NaN.
  const platne = { name: ' Happy hour ', multiplier: '2', stampBonus: '', days: [1, 2, 2, '3'], hourFrom: '14', hourTill: '18', validSince: '', validTill: '' };
  const v = normalizujPravidlo(platne);
  ok('vstup: platný formulář projde, dny seřazené a bez duplicit', v.ok && v.value.name === 'Happy hour' && JSON.stringify(v.value.days) === '[1,2,3]' && v.value.stampBonus === 0 && v.value.hourFrom === 14);
  const chyba = (patch: any) => { const x = normalizujPravidlo({ ...platne, ...patch }); return x.ok ? null : x.error; };
  ok('vstup: bez názvu', chyba({ name: '  ' }) !== null);
  ok('vstup: násobič pod 1 a nad 10', chyba({ multiplier: '0.5' }) !== null && chyba({ multiplier: '11' }) !== null);
  ok('vstup: násobič NaN a text', chyba({ multiplier: 'abc' }) !== null && chyba({ multiplier: NaN }) !== null);
  ok('vstup: násobič s čárkou', normalizujPravidlo({ ...platne, multiplier: '1,5' }).ok === true);
  ok('vstup: násobič 1 bez razítek nic nepřidává', chyba({ multiplier: '1', stampBonus: '0' }) !== null && chyba({ multiplier: '1', stampBonus: '2' }) === null);
  ok('vstup: razítka navíc jen celá 0–10', chyba({ stampBonus: '11' }) !== null && chyba({ stampBonus: '-1' }) !== null && chyba({ stampBonus: '1.5' }) !== null);
  ok('vstup: hodiny mimo 0–24 a neceločíselné', chyba({ hourFrom: '-1' }) !== null && chyba({ hourTill: '25' }) !== null && chyba({ hourFrom: '9.5' }) !== null && chyba({ hourFrom: 'x' }) !== null);
  ok('vstup: konec musí být po začátku', chyba({ hourFrom: '18', hourTill: '18' }) !== null && chyba({ hourFrom: '20', hourTill: '2' }) !== null);
  ok('vstup: prázdné hodiny = celý den', (() => { const x = normalizujPravidlo({ ...platne, hourFrom: '', hourTill: '' }); return x.ok && x.value.hourFrom === 0 && x.value.hourTill === 24; })());
  ok('vstup: den v týdnu mimo 1–7', chyba({ days: [8] }) !== null && chyba({ days: [0] }) !== null);
  ok('vstup: špatné datum a konec před začátkem', chyba({ validSince: '1.10.2026' }) !== null && chyba({ validSince: '2026-10-05', validTill: '2026-10-01' }) !== null);
  eq('řádek z databáze: poškozené hodnoty nedají NaN', (() => { const x = tvarPravidla({ id: '3', name: 'x', multiplier: 'zle', stamp_bonus: null, days_of_week: 'nic', hour_from: 'a', hour_till: undefined }); return [x.multiplier, x.stampBonus, x.days, x.hourFrom, x.hourTill]; })(), [1, 0, [], 0, 24]);
  eq('řádek z databáze: NUMERIC přijde jako text', tvarPravidla({ multiplier: '1.50', stamp_bonus: 2, days_of_week: [5, 9], hour_from: 14, hour_till: 18 }).multiplier, 1.5);

  // ---- Napojení ----------------------------------------------------------------
  const init = zdroj('app/api/init/route.ts');
  ok('propadání: denní úloha běží z init cronu vedle narozenin', init.includes("import { propadniBody }") && /await propadniBody\(\)/.test(init) && init.indexOf('awardBirthdays()') < init.indexOf('await propadniBody()'));
  ok('init: tabulka akcí a sloupce propadání v DDL', init.includes('CREATE TABLE IF NOT EXISTS client_bonus_rules') && init.includes('points_expire_days INTEGER') && init.includes('points_expire_since TEXT'));
  ok('propadání: odpis jde do deníku s ref exp:<den> a upozornění s warn:<den>', zdroj('lib/propadaniBoduDb.ts').includes('`exp:${dnes}`') && zdroj('lib/propadaniBoduDb.ts').includes('`warn:${dnes}`'));

  const scan = zdroj('app/api/client/staff/scan/route.ts');
  ok('bonus: kartička u kasy (razítko, účtenka, částka) bonus uplatňuje', (scan.match(/bodySBonusem\(/g) ?? []).length === 2 && scan.includes('1 + bonus.razitka') && scan.includes('stampVisit(u.team_id, c.id, p, \'card\', bonus.razitka') && /applyBillToCampaigns\([^\n]*razitka: bonus\.razitka/.test(scan));
  ok('bonus: hotová objednávka od stolu bonus uplatňuje', zdroj('lib/clientOrders.ts').includes('bodySBonusem(zaklad, bonus)') && zdroj('lib/clientOrders.ts').includes('bonus.razitka'));
  ok('bonus: návštěva z rezervace dává razítka navíc', zdroj('app/api/client/admin/reservations/route.ts').includes('bonus.razitka'));
  ok('bonus: stránka podniku hostovi ukazuje běžící akci', zdroj('app/api/client/b/[slug]/route.ts').includes('aktivniBonus(teamId)') && zdroj('components/client/BusinessPage.tsx').includes('<BonusPruh'));

  const api = zdroj('app/api/client/admin/bonus-rules/route.ts');
  ok('API akcí: čtení vernost.zobrazit, změny vernost.pravidla, rate limit, audit', api.includes("pozaduj('vernost.zobrazit')") && (api.match(/pozaduj\('vernost\.pravidla'\)/g) ?? []).length === 3 && api.includes('hit(`client-bonus-rules:') && (api.match(/audit\(/g) ?? []).length === 4 && api.includes("'client.bonus'"));
  ok('správa: podzáložka Akce a bonusy a pole propadání', zdroj('components/client/LoyaltyTabs.tsx').includes("label: 'Akce a bonusy'") && zdroj('components/client/LoyaltyTabs.tsx').includes('points_expire_days'));
  ok('smazání účtu: tabulka akcí patří podniku', zdroj('lib/smazaniUctu.ts').includes("'client_bonus_rules'"));
}
