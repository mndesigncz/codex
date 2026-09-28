// Filtr plánovače rozvrhu a přehled „Směny podle lidí" (lib/rozvrhFiltr.ts).
//
// Hlídá se hlavně to, co by se tiše pokazilo: rozbitý záznam v localStorage
// nesmí nechat mřížku prázdnou, počty na pilulkách lidí se nesmí srazit
// výběrem člověka (jen typem), noční směna zavírá i bez otevírací doby,
// „nad max." se nehlásí dvakrát jako „nad průměrem" a vedoucí bez směny
// do přehledu nepatří.

import type { Testy } from './_testy.ts';
import { PRAZDNY_FILTR, jeAktivni, nactiFiltr, klicFiltru, procistiFiltr, muzeAsponDen, prepni, projdeSmena, denProjde, pocetPodleLidi, pocetPodleTypu, lideFiltru, kratkaJmena, lideDoPasu, typyDoPasu, popisFiltru, popisVysledku, jeVikend, jeZaviraci, vyrazneMimo, vytizeni, seradVytizeni, nactiRazeni, type SmenaFiltru } from '../../lib/rozvrhFiltr.ts';

export default function ({ eq, ok }: Testy) {
  // ---- stav filtru ----
  ok('rozvrh-filtr: prázdný filtr není aktivní', !jeAktivni(PRAZDNY_FILTR));
  ok('rozvrh-filtr: jen díry = aktivní', jeAktivni({ ...PRAZDNY_FILTR, jenDiry: true }));
  eq('rozvrh-filtr: načte JSON z localStorage', nactiFiltr('{"lide":[16,"17",16],"typy":["Ranní"," Ranní ",""],"jenDiry":true}'),
    { lide: [16, 17], typy: ['Ranní'], jenDiry: true });
  eq('rozvrh-filtr: rozbitý JSON = prázdný filtr', nactiFiltr('{lide:'), PRAZDNY_FILTR);
  eq('rozvrh-filtr: null = prázdný filtr', nactiFiltr(null), PRAZDNY_FILTR);
  eq('rozvrh-filtr: nesmyslná id a typy se zahodí', nactiFiltr({ lide: [0, -3, 1.5, 'x', 21], typy: [3, null], jenDiry: 'ano' }), { lide: [21], typy: [], jenDiry: false });
  eq('rozvrh-filtr: true ani 1.0 z rozbitého záznamu nejsou člověk s id 1', nactiFiltr({ lide: [true, '7', ' 8 ', '1e1', 9] }).lide, [7, 8, 9]);
  ok('rozvrh-filtr: klíč filtru je zvlášť pro uživatele a podnik', klicFiltru('5', 12) !== klicFiltru('5', 13) && klicFiltru('5', 12) !== klicFiltru('6', 12)
    && klicFiltru('5', 12).startsWith('managero-rozvrh-filtr:'));
  const fP = { lide: [16, 99], typy: ['Ranní'], jenDiry: false };
  eq('rozvrh-filtr: pročištění vyhodí neznámé id (odešel, jiný podnik)', procistiFiltr(fP, new Set([16, 17])), { lide: [16], typy: ['Ranní'], jenDiry: false });
  ok('rozvrh-filtr: pročištění bez změny vrátí tentýž objekt', procistiFiltr(fP, new Set([16, 99])) === fP);
  ok('rozvrh-filtr: nactiFiltr nevrací sdílený objekt (mutace nezmění výchozí)', nactiFiltr(null) !== PRAZDNY_FILTR);
  eq('rozvrh-filtr: pilulka přepíná — přidá', prepni([16], 17), [16, 17]);
  eq('rozvrh-filtr: pilulka přepíná — druhý klik odebere', prepni([16, 17], 16), [17]);

  // ---- filtrování ----
  const S = (employeeId: number, date: string, typ: string, startTime = '08:00', endTime = '16:00', jmeno = ''): SmenaFiltru =>
    ({ employeeId, date, typ, startTime, endTime, jmeno });
  const smeny = [
    S(16, '2026-10-02', 'Ranní'), S(16, '2026-10-03', 'Odpolední', '14:00', '20:00'), S(16, '2026-10-04', 'Ranní'),
    S(17, '2026-10-02', 'Odpolední', '14:00', '20:00'), S(18, '2026-10-05', 'Noční', '22:00', '06:00'),
  ];
  const f1 = { lide: [16], typy: [], jenDiry: false };
  ok('rozvrh-filtr: směna vybraného člověka projde', projdeSmena({ employeeId: 16, typ: 'Ranní' }, f1));
  ok('rozvrh-filtr: směna jiného člověka neprojde', !projdeSmena({ employeeId: 17, typ: 'Ranní' }, f1));
  const f2 = { lide: [16, 17], typy: ['Odpolední'], jenDiry: false };
  eq('rozvrh-filtr: lidé ∧ typ (A ∧ B)', smeny.filter(s => projdeSmena(s, f2)).map(s => `${s.employeeId}/${s.date}`), ['16/2026-10-03', '17/2026-10-02']);
  ok('rozvrh-filtr: bez „jen díry" projde každý den', denProjde(false, f1));
  ok('rozvrh-filtr: „jen díry" pustí jen den s dírou', denProjde(true, { ...f1, jenDiry: true }) && !denProjde(false, { ...f1, jenDiry: true }));

  // ---- počty pro pilulky ----
  eq('rozvrh-filtr: počty lidí bez filtru', [...pocetPodleLidi(smeny, PRAZDNY_FILTR)], [[16, 3], [17, 1], [18, 1]]);
  eq('rozvrh-filtr: výběr člověka nesrazí počty ostatních', [...pocetPodleLidi(smeny, f1)], [[16, 3], [17, 1], [18, 1]]);
  eq('rozvrh-filtr: typ zúží počty lidí (kolik má ranních)', [...pocetPodleLidi(smeny, { ...PRAZDNY_FILTR, typy: ['Ranní'] })], [[16, 2]]);
  eq('rozvrh-filtr: počty typů pod filtrem lidí', [...pocetPodleTypu(smeny, f1)], [['Ranní', 2], ['Odpolední', 1]]);
  const dira = (d: string) => d === '2026-10-02';
  eq('rozvrh-filtr: „jen díry" zúží počty lidí na dny s dírou (pás = mřížka)', [...pocetPodleLidi(smeny, { ...PRAZDNY_FILTR, jenDiry: true }, dira)], [[16, 1], [17, 1]]);
  eq('rozvrh-filtr: bez „jen díry" se dny nefiltrují', [...pocetPodleLidi(smeny, PRAZDNY_FILTR, dira)].length, 3);
  eq('rozvrh-filtr: „jen díry" i v počtech typů', [...pocetPodleTypu(smeny, { ...f1, jenDiry: true }, dira)], [['Ranní', 1]]);

  // ---- kdo je v pásu ----
  const clenove = [
    { id: 15, name: 'Martin Nemeškal', role: 'employer' },
    { id: 16, name: 'Eva Testová', role: 'employee', avatar: '🧑' },
    { id: 17, name: 'Jakub Horák', role: 'employee' },
    { id: 17, name: 'Jakub Přepnutý', role: 'employee' },
    { id: 19, name: 'Ondřej Kučera', role: 'employee' },
  ];
  const lide = lideFiltru(clenove, smeny, null);
  eq('rozvrh-filtr: vedoucí bez směny v pásu není, zaměstnanec bez směny ano, duplicita jednou, host ze směn doplněn',
    lide.map(c => c.id), [16, 17, 19, 18]);
  eq('rozvrh-filtr: vedoucí se zadanou dostupností v pásu je', lideFiltru(clenove, [], [{ employeeId: 15 }]).some(c => c.id === 15), true);
  eq('rozvrh-filtr: náhled bez seznamu týmu — lidé ze směn', lideFiltru([], [S(30, '2026-10-01', 'Ranní', '08:00', '16:00', 'Zdena Nová')], null), [{ id: 30, jmeno: 'Zdena Nová', avatar: null }]);
  eq('rozvrh-filtr: krátká jména — křestní, u shody celé', [...kratkaJmena([{ id: 1, jmeno: 'Eva Testová' }, { id: 2, jmeno: 'Eva Nová' }, { id: 3, jmeno: 'Jakub Horák' }])],
    [[1, 'Eva Testová'], [2, 'Eva Nová'], [3, 'Jakub']]);
  const pas = lideDoPasu(lideFiltru(clenove, smeny, null), pocetPodleLidi(smeny, PRAZDNY_FILTR));
  eq('rozvrh-filtr: pás abecedně česky s počty', pas.map(c => `${c.kratce} ${c.smen}`), ['Bez 1', 'Eva 3', 'Jakub 1', 'Ondřej 0']);
  const typy = typyDoPasu([{ name: 'Ranní', color: '#C8F542' }, { name: 'Odpolední', color: '#3B82F6' }, { name: 'Noční' }],
    new Map([['Ranní', 2], ['Vlastní', 1]]), ['Smazaný']);
  eq('rozvrh-filtr: pás typů — nastavené v pořadí (i s nulou), pak neznámé ze směn, pak vybraný zbylý',
    typy.map(t => `${t.nazev} ${t.smen}`), ['Ranní 2', 'Odpolední 0', 'Noční 0', 'Vlastní 1', 'Smazaný 0']);

  // ---- popis ----
  const jmena = new Map([[16, 'Eva Testová'], [17, 'Jakub Horák']]);
  eq('rozvrh-filtr: popis jednoho člověka jménem', popisFiltru(f1, jmena), 'Eva Testová');
  eq('rozvrh-filtr: popis dvou lidí jmény a typu', popisFiltru(f2, jmena, new Map([[16, 'Eva'], [17, 'Jakub']])), 'Eva, Jakub · Odpolední');
  eq('rozvrh-filtr: bez krátkých jmen celá', popisFiltru(f2, jmena), 'Eva Testová, Jakub Horák · Odpolední');
  const ctyri = new Map([[1, 'Tereza'], [2, 'Zdeněk'], [3, 'Adam'], [4, 'Běla']]);
  eq('rozvrh-filtr: čtyři lidé — „Tereza a 3 další"', popisFiltru({ lide: [1, 2, 3, 4], typy: [], jenDiry: false }, ctyri), 'Tereza a 3 další');
  eq('rozvrh-filtr: sedm lidí — „a 6 dalších"', popisFiltru({ lide: [1, 2, 3, 4, 5, 6, 7], typy: [], jenDiry: false }, new Map([1, 2, 3, 4, 5, 6, 7].map(i => [i, `Č${i}`]))), 'Č1 a 6 dalších');
  eq('rozvrh-filtr: popis pěti lidí, tří typů a děr', popisFiltru({ lide: [1, 2, 3, 4, 5], typy: ['a', 'b', 'c'], jenDiry: true }, jmena), '5 lidí · 3 typy · jen dny s dírou');
  eq('rozvrh-filtr: výsledek v návrhu', popisVysledku(14, true), '14 směn v návrhu');
  eq('rozvrh-filtr: výsledek jedna směna', popisVysledku(1, false), '1 směna');

  // ---- víkend a zavírání ----
  ok('rozvrh-filtr: 3. 10. 2026 je sobota', jeVikend('2026-10-03'));
  ok('rozvrh-filtr: 4. 10. 2026 je neděle (i s časem v datu)', jeVikend('2026-10-04T00:00:00.000Z'));
  ok('rozvrh-filtr: 5. 10. 2026 je pondělí', !jeVikend('2026-10-05'));
  const kavarna = { open: '08:00', close: '20:00' };
  const bar = { open: '16:00', close: '02:00' };
  ok('rozvrh-filtr: noční přes půlnoc zavírá i bez otevírací doby', jeZaviraci({ startTime: '22:00', endTime: '06:00' }, null));
  ok('rozvrh-filtr: konec v čas zavření = zavírá', jeZaviraci({ startTime: '14:00', endTime: '20:00' }, kavarna));
  ok('rozvrh-filtr: konec před zavřením nezavírá', !jeZaviraci({ startTime: '08:00', endTime: '16:00' }, kavarna));
  ok('rozvrh-filtr: bez otevírací doby se nehádá', !jeZaviraci({ startTime: '14:00', endTime: '20:00' }, null));
  ok('rozvrh-filtr: noční směna v kavárně do 20:00 zavírá', jeZaviraci({ startTime: '22:00', endTime: '06:00' }, kavarna));
  ok('rozvrh-filtr: bar do 02:00 — denní 10–16 nezavírá', !jeZaviraci({ startTime: '10:00', endTime: '16:00' }, bar));
  ok('rozvrh-filtr: bar do 02:00 — 20:00–01:00 nezavírá', !jeZaviraci({ startTime: '20:00', endTime: '01:00' }, bar));
  ok('rozvrh-filtr: bar do 02:00 — 18:00–02:00 zavírá', jeZaviraci({ startTime: '18:00', endTime: '02:00' }, bar));
  ok('rozvrh-filtr: bar do 02:00 — 20:00–03:00 zavírá', jeZaviraci({ startTime: '20:00', endTime: '03:00' }, bar));
  ok('rozvrh-filtr: zavírá o půlnoci (00:00) — 16:00–00:00 zavírá, 10–16 ne',
    jeZaviraci({ startTime: '16:00', endTime: '00:00' }, { open: '10:00', close: '00:00' }) && !jeZaviraci({ startTime: '10:00', endTime: '16:00' }, { open: '10:00', close: '00:00' }));

  // ---- průměr a odchylka ----
  eq('rozvrh-filtr: ve dvou lidech se průměr nesrovnává', vyrazneMimo(10, 5, 2), null);
  eq('rozvrh-filtr: o dvě a třetinu nad průměrem = nad', vyrazneMimo(8, 5, 4), 'nad');
  eq('rozvrh-filtr: o jednu nad průměrem = šum', vyrazneMimo(6, 5, 4), null);
  eq('rozvrh-filtr: při průměru 12 je práh 4 směny', [vyrazneMimo(15, 12, 4), vyrazneMimo(16, 12, 4)], [null, 'nad']);
  eq('rozvrh-filtr: nula se hlásí jako „bez směny", ne pod průměrem', vyrazneMimo(0, 5, 4), null);

  // ---- vytížení ----
  const tym = [
    { id: 1, jmeno: 'Adam', avatar: null }, { id: 2, jmeno: 'Běla', avatar: null }, { id: 3, jmeno: 'Cyril', avatar: null },
    { id: 4, jmeno: 'Dana', avatar: null }, { id: 5, jmeno: 'Ema', avatar: null },
  ];
  const mnoho = (id: number, n: number, od = 1): SmenaFiltru[] => Array.from({ length: n }, (_, i) =>
    S(id, `2026-10-${String(od + i).padStart(2, '0')}`, 'Ranní', '12:00', '20:00'));
  const v = vytizeni(tym, [...mnoho(1, 9), ...mnoho(2, 4), ...mnoho(3, 4), ...mnoho(4, 4)],
    [{ employeeId: 1, maxShifts: 6 }, { employeeId: 5, maxShifts: null }, { employeeId: 2, maxShifts: 0 }],
    (d) => ({ open: '08:00', close: jeVikend(d) ? '20:00' : '22:00' }));
  const r = (id: number) => v.radky.find(x => x.id === id)!;
  eq('rozvrh-filtr: průměr jen z lidí se směnou (21 / 4)', v.prumer, 5.3);
  eq('rozvrh-filtr: Adam — 9 směn, 72 h, víkendy 2 (3. a 4. 10.), zavírá jen o víkendu', [r(1).smen, r(1).hodiny, r(1).vikend, r(1).zaviraci], [9, 72, 2, 2]);
  eq('rozvrh-filtr: Adam nad max. 6 — a „nad průměrem" se nepřidá podruhé', r(1).upozorneni, ['nad_max']);
  eq('rozvrh-filtr: Ema zadala dostupnost a nemá směnu', r(5).upozorneni, ['bez_smeny']);
  eq('rozvrh-filtr: max 0 = bez stropu (jako v Pravidlech)', r(2).max, null);
  eq('rozvrh-filtr: Dana 4 při průměru 5,3 je v normě', r(4).upozorneni, []);
  eq('rozvrh-filtr: odchylka na desetiny', r(1).odchylka, 3.8);
  eq('rozvrh-filtr: stupnice pruhů = nejvyšší počet nebo strop', v.stupnice, 9);
  ok('rozvrh-filtr: zavírací doba známá', v.zavreniZname);
  const dnyRijna = Array.from({ length: 31 }, (_, i) => `2026-10-${String(i + 1).padStart(2, '0')}`);
  const dovolena = { employeeId: 5, maxShifts: 4, unavailableDates: dnyRijna };
  ok('rozvrh-filtr: kdo odškrtl všechny dny, aspoň den nemůže', !muzeAsponDen(dovolena, dnyRijna));
  ok('rozvrh-filtr: jeden volný den stačí', muzeAsponDen({ ...dovolena, unavailableDates: dnyRijna.slice(1) }, dnyRijna));
  ok('rozvrh-filtr: „off" v preferencích a schválené volno taky znamenají nemůže',
    !muzeAsponDen({ employeeId: 5, unavailableDates: dnyRijna.slice(1), dayPreferences: { '2026-10-01': 'off' } }, dnyRijna)
    && !muzeAsponDen({ employeeId: 5 }, dnyRijna, [{ employeeId: 5, fromDate: '2026-09-28', toDate: '2026-11-02' }])
    && muzeAsponDen({ employeeId: 5 }, dnyRijna, [{ employeeId: 6, fromDate: '2026-09-28', toDate: '2026-11-02' }]));
  const naDovolene = vytizeni(tym, mnoho(1, 3), [dovolena], () => null, { dny: dnyRijna });
  eq('rozvrh-filtr: dovolená na celý měsíc není „bez směny" (falešný poplach)', naDovolene.radky.find(x => x.id === 5)!.upozorneni, []);
  const bezDostupnosti = vytizeni(tym, mnoho(1, 2), null, () => null);
  eq('rozvrh-filtr: bez dostupnosti (role ji nevidí) žádné „bez směny" ani strop', bezDostupnosti.radky.map(x => x.upozorneni.length + (x.max ?? 0)), [0, 0, 0, 0, 0]);
  ok('rozvrh-filtr: bez otevírací doby a nočních sloupec „zavírá" nemá smysl', !bezDostupnosti.zavreniZname);
  const podPrumerem = vytizeni(tym.slice(0, 4), [...mnoho(1, 10), ...mnoho(2, 10), ...mnoho(3, 10), ...mnoho(4, 2)], null, () => null);
  eq('rozvrh-filtr: výrazně pod průměrem = info', podPrumerem.radky.find(x => x.id === 4)!.upozorneni, ['pod_prumerem']);

  // ---- řazení ----
  eq('rozvrh-filtr: řazení podle počtu', seradVytizeni(v.radky, 'smeny').map(x => x.jmeno), ['Adam', 'Běla', 'Cyril', 'Dana', 'Ema']);
  eq('rozvrh-filtr: řazení podle jména (česky)', seradVytizeni([...v.radky].reverse(), 'jmeno').map(x => x.jmeno), ['Adam', 'Běla', 'Cyril', 'Dana', 'Ema']);
  eq('rozvrh-filtr: řazení podle odchylky — nad max., bez směny, pak nejdál od průměru', seradVytizeni(v.radky, 'odchylka').map(x => x.jmeno), ['Adam', 'Ema', 'Běla', 'Cyril', 'Dana']);
  eq('rozvrh-filtr: neznámé řazení = podle počtu', [nactiRazeni('x'), nactiRazeni('jmeno')], ['smeny', 'jmeno']);
}
