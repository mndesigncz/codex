// Okno dne v plánovači rozvrhu — stav člověka na den z dostupnosti, řazení
// týmu, překryv směn, výchozí typ a přepočet návrhu po ruční úpravě
// (lib/rozvrhDen.ts).
//
// Hlídá se hlavně to, co by se v okně dne tiše pokazilo: schválené volno
// musí přebít „může", denní „nemůže" přebít obecnou preferenci, noční směna
// přes půlnoc se musí překrývat s večerní a kdo už ten den stojí, nesmí se
// míchat mezi kandidáty nahoře.

import type { Testy } from './_testy.ts';
import {
  stavClenaDne, seradRadky, poradiRadku, prekryvaSe, kolize, usek, vychoziTyp, prepocitejDen, type TypDne,
} from '../../lib/rozvrhDen.ts';

export default function ({ eq, ok }: Testy) {
  const typy = [{ id: 1, name: 'Ranní', start: '07:00' }, { id: 2, name: 'Odpolední', start: '14:00' }];
  const D = '2026-10-06';

  // ---- stav dne ----
  eq('rozvrh-den: bez dostupnosti = nevyplněno', stavClenaDne(D, null, [], typy).stav, 'nevyplneno');
  eq('rozvrh-den: nevyplněno má tlumený tón', stavClenaDne(D, null, [], typy).ton, 'muted');
  const muze = stavClenaDne(D, { unavailableDates: [], dayPreferences: {}, preferredShift: 'morning', note: '  Škola ve středu ' }, [], typy);
  eq('rozvrh-den: prázdný den = může (ok)', [muze.stav, muze.ton, muze.popis], ['muze', 'ok', 'může']);
  eq('rozvrh-den: obecná preference jde do popisku', muze.preferuje, 'preferuje ranní');
  eq('rozvrh-den: poznámka oříznutá', muze.poznamka, 'Škola ve středu');
  eq('rozvrh-den: nemůže z unavailableDates', stavClenaDne(D, { unavailableDates: [D] }, [], typy).stav, 'nemuze');
  eq('rozvrh-den: nemůže z denní volby off', stavClenaDne(D, { dayPreferences: { [D]: 'off' } }, [], typy).ton, 'bad');
  const jen = stavClenaDne(D, { dayPreferences: { [D]: 'type:2' } }, [], typy);
  eq('rozvrh-den: denní volba typu = omezení „jen Odpolední"', [jen.stav, jen.popis, jen.volba, jen.ton], ['omezeni', 'jen Odpolední', 'type:2', 'info']);
  eq('rozvrh-den: stará binární volba = jen odpolední', stavClenaDne(D, { dayPreferences: { [D]: 'afternoon' } }, [], typy).popis, 'jen odpolední');
  eq('rozvrh-den: flexible není omezení', stavClenaDne(D, { dayPreferences: { [D]: 'flexible' } }, [], typy).stav, 'muze');
  const vol = stavClenaDne(D, { dayPreferences: {} }, [{ fromDate: '2026-10-05', toDate: '2026-10-07T00:00:00Z', type: 'vacation' }], typy);
  eq('rozvrh-den: schválené volno přebije „může" (i s časem v datu)', [vol.stav, vol.ton, vol.popis], ['volno', 'wait', 'schválené volno · dovolená']);
  eq('rozvrh-den: volno mimo den se nepočítá', stavClenaDne(D, { dayPreferences: {} }, [{ fromDate: '2026-10-07', toDate: '2026-10-09' }], typy).stav, 'muze');
  eq('rozvrh-den: volno platí i bez vyplněné dostupnosti', stavClenaDne(D, null, [{ fromDate: D, toDate: D }], typy).stav, 'volno');
  eq('rozvrh-den: poznámka ke dni, když v datech je', stavClenaDne(D, { poznamkyDnu: { [D]: 'až od 10' } }, [], typy).poznamkaDne, 'až od 10');
  eq('rozvrh-den: denní omezení nemá obecnou preferenci navíc', jen.preferuje, null);

  // ---- řazení ----
  const r = (id: number, jmeno: string, stav: any, maSmenu = false) => ({ id, jmeno, stav, maSmenu });
  const serazeno = seradRadky([
    r(1, 'Zdena', 'nevyplneno'), r(2, 'Adam', 'nemuze'), r(3, 'Běla', 'omezeni'), r(4, 'Cyril', 'muze', true),
    r(5, 'Čeněk', 'muze'), r(6, 'Alena', 'muze'), r(7, 'Dana', 'volno'), r(8, 'Eva', 'nevyplneno', true),
  ]).map(x => x.jmeno);
  eq('rozvrh-den: pořadí může → omezení → má směnu → nemůže/volno → nevyplněno', serazeno,
    ['Alena', 'Čeněk', 'Běla', 'Cyril', 'Eva', 'Adam', 'Dana', 'Zdena']);
  ok('rozvrh-den: české řazení (Č za C)', 'Cyril'.localeCompare('Čeněk', 'cs') < 0);
  eq('rozvrh-den: kdo má směnu, není mezi kandidáty nahoře', poradiRadku(r(1, 'X', 'muze', true)), 2);

  // ---- překryv ----
  eq('rozvrh-den: noční přes půlnoc', usek('22:00', '06:00'), { start: 1320, end: 1800 });
  ok('rozvrh-den: 08–14 a 14–22 se jen dotýkají', !prekryvaSe({ startTime: '08:00', endTime: '14:00' }, { startTime: '14:00', endTime: '22:00' }));
  ok('rozvrh-den: 08–16 a 14–22 se překrývají', prekryvaSe({ startTime: '08:00', endTime: '16:00' }, { startTime: '14:00', endTime: '22:00' }));
  ok('rozvrh-den: večerní a noční se překrývají', prekryvaSe({ startTime: '18:00', endTime: '23:00' }, { startTime: '22:00', endTime: '06:00' }));
  ok('rozvrh-den: kolize s jednou z více směn', kolize([{ startTime: '06:00', endTime: '08:00' }, { startTime: '12:00', endTime: '13:00' }], { startTime: '10:00', endTime: '12:30' }));
  ok('rozvrh-den: nečitelný čas nekoliduje', !prekryvaSe({ startTime: '', endTime: '' }, { startTime: '08:00', endTime: '10:00' }));

  // ---- výchozí typ ----
  const td: TypDne[] = [{ id: 1, name: 'Ranní', start: '07:00', od: '08:00', do: '14:00' }, { id: 2, name: 'Odpolední', start: '14:00', od: '14:00', do: '22:00' }];
  eq('rozvrh-den: denní volba typu vyhrává', vychoziTyp(td, 'type:2', ['Ranní'], [])?.id, 2);
  eq('rozvrh-den: bez volby první chybějící', vychoziTyp(td, null, ['Odpolední'], [])?.id, 2);
  eq('rozvrh-den: bez volby i díry první typ', vychoziTyp(td, null, [], [])?.id, 1);
  eq('rozvrh-den: typ, který koliduje se směnou, se přeskočí', vychoziTyp(td, 'type:1', [], [{ startTime: '09:00', endTime: '12:00' }])?.id, 2);
  eq('rozvrh-den: když kolidují všechny, nic', vychoziTyp(td, null, [], [{ startTime: '06:00', endTime: '23:00' }]), null);
  eq('rozvrh-den: stará volba „afternoon" podle pořadí typů', vychoziTyp(td, 'afternoon', [], [])?.id, 2);

  // ---- přepočet návrhu ----
  const oh = { open: '08:00', close: '22:00', closed: false };
  const zaklad = { gaps: [{ date: '2026-10-01', from: '08:00', to: '10:00', minutes: 120 }], understaffed: [{ date: D, shiftTypeName: 'Odpolední' }] };
  const poPridani = prepocitejDen(zaklad, D, oh, [{ startTime: '08:00', endTime: '14:00', type: 'Ranní' }, { startTime: '14:00', endTime: '22:00', type: 'Odpolední' }], { pridanTyp: 'odpolední' });
  eq('rozvrh-den: přidaný typ zmizí z neobsazených (bez ohledu na velikost písmen)', poPridani.understaffed, []);
  eq('rozvrh-den: jiné dny se nepřepočítávají', poPridani.gaps, zaklad.gaps);
  const poOdebrani = prepocitejDen(zaklad, D, oh, [{ startTime: '14:00', endTime: '22:00', type: 'Odpolední' }], { odebranTyp: 'Ranní' });
  eq('rozvrh-den: po odebrání ranní díra 08–14 a chybí Ranní', [poOdebrani.gaps.filter(g => g.date === D), poOdebrani.understaffed.map(m => m.shiftTypeName)],
    [[{ date: D, from: '08:00', to: '14:00', minutes: 360 }], ['Odpolední', 'Ranní']]);
  const dvaRanni = prepocitejDen({ gaps: [], understaffed: [] }, D, oh, [{ startTime: '08:00', endTime: '14:00', type: 'Ranní' }, { startTime: '14:00', endTime: '22:00', type: 'X' }], { odebranTyp: 'Ranní' });
  eq('rozvrh-den: odebraný typ, který ten den ještě někdo má, nechybí', dvaRanni.understaffed, []);
  eq('rozvrh-den: zavřený den bez děr', prepocitejDen({ gaps: [], understaffed: [] }, D, { closed: true }, [], {}).gaps, []);
}
