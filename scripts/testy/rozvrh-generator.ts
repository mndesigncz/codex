// Generátor rozvrhu (lib/rozvrhGenerator.ts) — povinná otevírací směna,
// žádoucí druhá, výhled při výběru člověka a volitelné doporučení počtu lidí
// podle tržeb.
//
// Hlídá se hlavně Martinova věta: „hlavní je, aby byla pokrytá směna, která
// otvírá — bez ní se prostor neotevře; druhá, když je kdo". Dřív šla delší
// odpolední před kratší otvíračkou a jediný volný člověk skončil odpoledne.

import type { Testy } from './_testy.ts';
import {
  navrhniRozvrh, oteviraciTypy, vyberKandidata, ocekavaneTrzby, navrhPrahu, lidiPodleTrzby, vycistiNastaveniTrzeb,
  type ClovekGeneratoru, type TypSmeny, type VstupGeneratoru,
} from '../../lib/rozvrhGenerator.ts';
import { urovenDiry } from '../../lib/coverage.ts';

export default function ({ eq, ok }: Testy) {
  // Říjen 2026: 5. je pondělí. Otevřeno jen v pondělí, ať se dá mluvit o dnech.
  const MESIC = '2026-10';
  const D = '2026-10-05';
  const zavreno = { open: '08:00', close: '20:00', closed: true };
  const oh: VstupGeneratoru['openingHours'] = { '0': { open: '08:00', close: '20:00', closed: false } };
  for (let i = 1; i <= 6; i++) oh[String(i)] = zavreno;

  // Otvíračka je kratší (6 h) než odpolední (8 h) — přesně případ, kdy
  // původní řazení „víc pokryje = dřív" poslalo jediného člověka odpoledne.
  const typy: TypSmeny[] = [
    { id: 1, name: 'Otvíračka', start_time: '08:00', end_time: '14:00', starts_at_open: true },
    { id: 2, name: 'Odpolední', start_time: '12:00', end_time: '20:00', ends_at_close: true },
  ];
  const clovek = (id: number, name: string, extra: Partial<ClovekGeneratoru> = {}): ClovekGeneratoru => ({
    id, name, unavailable: [], dayPrefs: {}, preferredShift: null, maxShifts: null, maxConsecutive: null, maxHours: null, ...extra,
  });
  const naDen = (v: ReturnType<typeof navrhniRozvrh>, d = D) => ({
    smeny: v.proposed.filter(p => p.date === d).map(p => [p.employeeName, p.shiftTypeName]),
    diry: v.gaps.filter(g => g.date === d).map(g => [g.from, g.to, g.uroven]),
    chybi: v.understaffed.filter(m => m.date === d).map(m => [m.shiftTypeName, m.uroven]),
  });

  // ---- otevírací typy ----
  eq('generátor: otevírací = „od otevření"', [...oteviraciTypy(typy, { open: '08:00', close: '20:00' })], [1]);
  eq('generátor: otevírací i s pevným časem shodným s otevřením', [...oteviraciTypy([{ id: 5, name: 'X', start_time: '08:00', end_time: '12:00' }, typy[1]], { open: '08:00', close: '20:00' })], [5]);
  eq('generátor: když nic nezačíná v otevření, otvírá nejdřívější', [...oteviraciTypy([typy[1], { id: 7, name: 'Y', start_time: '09:00', end_time: '15:00' }], { open: '08:00', close: '20:00' })], [7]);

  // ---- 1) otevírací přednostně, i když je jen jeden člověk ----
  const jeden = navrhniRozvrh({ month: MESIC, lide: [clovek(1, 'Eva')], typy, openingHours: oh });
  const j = naDen(jeden);
  eq('generátor: jediný člověk dostane otvíračku, ne delší odpolední', j.smeny, [['Eva', 'Otvíračka']]);
  eq('generátor: neobsazená druhá je jen žádoucí', j.chybi, [['Odpolední', 'zadouci']]);
  eq('generátor: prázdno odpoledne je žádoucí díra, ne povinná', j.diry, [['14:00', '20:00', 'zadouci']]);
  ok('generátor: upozornění „otevře se s jedním člověkem"', jeden.warnings.some(w => w.startsWith('5.10.') && w.includes('druhá směna „Odpolední"') && w.includes('otevře se s jedním člověkem')));
  ok('generátor: otevírací směna je v návrhu označená', jeden.proposed.find(p => p.date === D)?.oteviraci === true);

  // ---- 2) nikdo = povinná díra ----
  const nikdo = navrhniRozvrh({ month: MESIC, lide: [clovek(1, 'Eva', { unavailable: [D] })], typy, openingHours: oh });
  const n = naDen(nikdo);
  eq('generátor: bez nikoho povinná díra přes celý den', n.diry, [['08:00', '20:00', 'povinna']]);
  eq('generátor: neobsazená otvíračka je povinná, odpolední žádoucí', n.chybi, [['Otvíračka', 'povinna'], ['Odpolední', 'zadouci']]);
  ok('generátor: „NIKDO NEOTEVŘE" je v upozorněních nahoře', nikdo.warnings[0].includes('NIKDO NEOTEVŘE') || nikdo.warnings[0].includes('neotevře'));
  const dvaNaOtvirani = navrhniRozvrh({ month: MESIC, lide: [clovek(1, 'Eva', { dayPrefs: { [D]: 'type:2' } })], typy, openingHours: oh });
  eq('generátor: kdo může jen odpolední, na otevření nejde (povinná díra zůstane)', naDen(dvaNaOtvirani).diry.map(x => x[2]), ['povinna']);

  // ---- 3) výhled: otvírá ten, kdo nevezme jedinou možnost druhé směně ----
  // Adam (dřív podle abecedy) může obojí, Bára jen otvíračku. Bez výhledu by
  // otevřel Adam a odpolední by zůstala prázdná.
  const vyhled = navrhniRozvrh({
    month: MESIC, typy, openingHours: oh,
    lide: [clovek(1, 'Adam'), clovek(2, 'Bára', { dayPrefs: { [D]: 'type:1' } })],
  });
  eq('generátor: s výhledem jsou obsazené obě směny', naDen(vyhled).smeny.sort(), [['Adam', 'Odpolední'], ['Bára', 'Otvíračka']]);
  eq('generátor: vyberKandidata vezme prvního, kdo nevezme jedinou možnost', vyberKandidata([{ id: 1 }, { id: 2 }], [{ kandidati: [1], povinna: false }])?.id, 2);
  eq('generátor: když to nejde, první v pořadí', vyberKandidata([{ id: 1 }], [{ kandidati: [1], povinna: false }])?.id, 1);
  eq('generátor: povinnou chrání přednostně', vyberKandidata([{ id: 1 }, { id: 2 }], [{ kandidati: [1], povinna: true }, { kandidati: [2], povinna: false }])?.id, 2);

  // ---- 4) tržby: 1 vs 2 lidé ----
  // „Stačí jeden" = jeden člověk na CELÝ den. S typem od otevření do
  // zavření se druhá směna vynechá; s Ranní + Odpolední by jeden znamenal
  // zavřít v půli dne, takže se druhá obsadí a doporučení to přizná.
  const dva = [clovek(1, 'Eva'), clovek(2, 'Filip')];
  const celodenni: TypSmeny[] = [
    { id: 3, name: 'Celý den', start_time: '08:00', end_time: '20:00', starts_at_open: true, ends_at_close: true },
    { id: 2, name: 'Odpolední', start_time: '12:00', end_time: '20:00', ends_at_close: true },
  ];
  const pod = navrhniRozvrh({ month: MESIC, lide: dva, typy: celodenni, openingHours: oh, trzby: { prah: 10000, dny: { '0': { prumer: 8000, vzorek: 8 } } } });
  eq('tržby: pod prahem jen otevírací směna na celý den', naDen(pod).smeny, [['Eva', 'Celý den']]);
  eq('tržby: pod prahem druhá ani nechybí a díra není', [naDen(pod).chybi, naDen(pod).diry], [[], []]);
  eq('tržby: doporučení „stačí jeden" s tržbou a úsporou hodin', pod.doporuceni?.find(x => x.date === D), { date: D, lidi: 1, trzba: 8000, vzorek: 8, usporaHodin: 8 });
  eq('tržby: úspora za měsíc (4 pondělí × 8 h)', pod.hodiny.usporaDoporucenim, 32);
  const podPulka = navrhniRozvrh({ month: MESIC, lide: dva, typy, openingHours: oh, trzby: { prah: 10000, dny: { '0': { prumer: 8000, vzorek: 8 } } } });
  eq('tržby: bez typu na celý den se „jeden" neuplatní (podnik by zavřel ve 14:00)', naDen(podPulka).smeny.length, 2);
  eq('tržby: …doporučení to přizná (nepokryjeJeden, nic se neušetřilo)', podPulka.doporuceni?.find(x => x.date === D), { date: D, lidi: 1, trzba: 8000, vzorek: 8, usporaHodin: 0, nepokryjeJeden: true });
  ok('tržby: …a upozornění poradí typ od otevření do zavření', podPulka.warnings.some(w => w.includes('4 dny stačil jeden člověk') && w.includes('od otevření do zavření')));
  eq('tržby: …bez díry 14–20', naDen(podPulka).diry, []);
  const nad = navrhniRozvrh({ month: MESIC, lide: dva, typy, openingHours: oh, trzby: { prah: 10000, dny: { '0': { prumer: 12000, vzorek: 8 } } } });
  eq('tržby: nad prahem obě směny', naDen(nad).smeny.length, 2);
  eq('tržby: nad prahem doporučení dva', nad.doporuceni?.find(x => x.date === D)?.lidi, 2);
  const bezDat = navrhniRozvrh({ month: MESIC, lide: dva, typy, openingHours: oh, trzby: { prah: 10000, dny: {} } });
  eq('tržby: bez dat pro den se chová jako bod 1 (obě směny, bez doporučení)', [naDen(bezDat).smeny.length, bezDat.doporuceni], [2, []]);

  // ---- 5) vypnuto = o tržbách ani slovo ----
  const vyp = navrhniRozvrh({ month: MESIC, lide: dva, typy, openingHours: oh });
  ok('tržby vypnuté: odpověď nemá doporučení', !('doporuceni' in vyp));
  eq('tržby vypnuté: obě směny', naDen(vyp).smeny.length, 2);
  eq('tržby vypnuté: nastavení je výchozí vypnuté', vycistiNastaveniTrzeb(undefined), { podleTrzeb: false, prah: null });
  eq('tržby: jen výslovné true zapíná', vycistiNastaveniTrzeb({ podleTrzeb: 'ano', prah: '12500.4' }), { podleTrzeb: false, prah: 12500 });
  eq('tržby: nesmyslný práh = null', vycistiNastaveniTrzeb({ podleTrzeb: true, prah: -5 }).prah, null);
  eq('generátor: hodiny celkem (4 pondělí × 14 h)', vyp.hodiny.celkem, 56);

  // ---- výpočty tržeb ----
  const historie = [
    { date: '2026-09-21', trzba: 9000 }, { date: '2026-09-14', trzba: 11000 },       // pondělí
    { date: '2026-09-07', trzba: 0 },                                               // pondělí bez tržby
    { date: '2026-09-27', trzba: 5000 },                                            // neděle — zavřeno
    { date: '2026-07-06', trzba: 99999 },                                           // mimo 8 týdnů
    { date: '2026-09-26', trzba: 3000 }, { date: '2026-09-26', trzba: 1000 },        // sobota, dvě uzávěrky
  ];
  const dny = ocekavaneTrzby(historie, '2026-09-28', { '6': { closed: true } });
  eq('tržby: průměr stejného dne, bez nul, zavřených a staré historie', dny, { '0': { prumer: 10000, vzorek: 2 }, '5': { prumer: 4000, vzorek: 1 } });
  eq('tržby: dnešek se nepočítá', ocekavaneTrzby([{ date: '2026-09-28', trzba: 5000 }], '2026-09-28'), {});
  eq('tržby: návrh prahu = medián, zaokrouhlený', navrhPrahu({ '0': { prumer: 8240, vzorek: 4 }, '4': { prumer: 14100, vzorek: 4 }, '5': { prumer: 21000, vzorek: 4 } }), 14000);
  eq('tržby: z jednoho dne návrh nedělá', navrhPrahu({ '0': { prumer: 8000, vzorek: 3 } }), null);
  eq('tržby: dva lidé až když práh PŘESÁHNE', [lidiPodleTrzby(10000, 10000), lidiPodleTrzby(10001, 10000), lidiPodleTrzby(null, 10000)], [1, 2, null]);

  // ---- 6) otevírací směny mají přednost v celém MĚSÍCI, ne jen v rámci dne ----
  // Září 2026, otevřeno každý den (30 dní), dva lidé s max 15 směnami.
  // Den po dni by oba dostali obě směny prvních 15 dní a od 16. by nikdo
  // neotevřel. Správně: všech 30 otvíraček, druhé směny ze zbytku kapacity.
  const vsedni: VstupGeneratoru['openingHours'] = {};
  for (let i = 0; i <= 6; i++) vsedni[String(i)] = { open: '08:00', close: '20:00', closed: false };
  const rp: TypSmeny[] = [
    { id: 1, name: 'Ranní', start_time: '08:00', end_time: '14:00', starts_at_open: true },
    { id: 2, name: 'Odpolední', start_time: '14:00', end_time: '20:00', ends_at_close: true },
  ];
  const mesic = navrhniRozvrh({ month: '2026-09', typy: rp, openingHours: vsedni,
    lide: [clovek(1, 'Adam', { maxShifts: 15 }), clovek(2, 'Bára', { maxShifts: 15 })] });
  eq('měsíc: žádný den bez otevírací směny (limit 2 × 15 = 30 otvíraček)', mesic.gaps.filter(g => g.uroven === 'povinna').length, 0);
  eq('měsíc: otvíračka každý den', mesic.proposed.filter(p => p.oteviraci).length, 30);
  eq('měsíc: limit směn nikdo nepřekročil', [1, 2].map(id => mesic.proposed.filter(p => p.employeeId === id).length), [15, 15]);
  const rada5 = navrhniRozvrh({ month: '2026-09', typy: rp, openingHours: vsedni,
    lide: [clovek(1, 'Adam', { maxConsecutive: 5 }), clovek(2, 'Bára', { maxConsecutive: 5 })] });
  eq('měsíc: s max 5 dní v řadě otevře každý den (druhé směny limit nevyčerpají)', rada5.gaps.filter(g => g.uroven === 'povinna').length, 0);
  const dnyCloveka = (id: number) => rada5.proposed.filter(p => p.employeeId === id).map(p => p.date).sort();
  const nejdelsiRada = (dates: string[]) => {
    let best = 0, cur = 0, prev = '';
    for (const d of Array.from(new Set(dates))) {
      const ocekavany = prev ? new Date(Date.parse(prev + 'T12:00:00Z') + 86400000).toISOString().slice(0, 10) : '';
      cur = d === ocekavany ? cur + 1 : 1; prev = d; best = Math.max(best, cur);
    }
    return best;
  };
  ok('měsíc: limit dní v řadě platí i po doplnění druhých směn (oběma směry)', nejdelsiRada(dnyCloveka(1)) <= 5 && nejdelsiRada(dnyCloveka(2)) <= 5);

  // ---- 7) pevný den bez typu nevezme otvíračku jedinému, kdo ji může dát ----
  // Adam má pevné pondělí bez typu a preferuje odpoledne, Bára ten den nemůže.
  const pevny = navrhniRozvrh({ month: MESIC, typy, openingHours: oh,
    lide: [clovek(1, 'Adam', { preferredShift: 'afternoon' }), clovek(2, 'Bára', { unavailable: [D] })],
    pevne: [{ employeeId: 1, weekday: 0, shiftTypeId: null }] });
  eq('pevný den: když nikdo jiný neotevře, dostane pevný člověk otvíračku', naDen(pevny).smeny, [['Adam', 'Otvíračka']]);
  ok('pevný den: …a upozornění to vysvětlí', pevny.warnings.some(w => w.startsWith('5.10.') && w.includes('nikdo jiný ten den neotevře')));
  const pevnySDalsim = navrhniRozvrh({ month: MESIC, typy, openingHours: oh,
    lide: [clovek(1, 'Adam', { preferredShift: 'afternoon' }), clovek(2, 'Bára')],
    pevne: [{ employeeId: 1, weekday: 0, shiftTypeId: null }] });
  eq('pevný den: když otevřít může i jiný, preference platí', naDen(pevnySDalsim).smeny.sort(), [['Adam', 'Odpolední'], ['Bára', 'Otvíračka']]);

  // ---- 8) uložené směny, které zůstanou, jsou už obsazené ----
  const sUlozenou = navrhniRozvrh({ month: MESIC, typy, openingHours: oh, lide: dva,
    ulozene: [{ employeeId: 1, date: D, startTime: '08:00', endTime: '14:00', type: 'Otvíračka' }] });
  eq('uložené: otvíračka uložená → navrhne se jen odpolední, jinému', naDen(sUlozenou).smeny, [['Filip', 'Odpolední']]);
  eq('uložené: žádná falešná díra ani „nikdo neotevře"', [naDen(sUlozenou).diry, sUlozenou.warnings.some(w => w.startsWith('5.10.') && w.includes('NEOTEVŘE'))], [[], false]);
  const jenUlozene = navrhniRozvrh({ month: MESIC, typy, openingHours: oh, lide: [clovek(1, 'Eva')],
    ulozene: [{ employeeId: 1, date: D, startTime: '08:00', endTime: '20:00', type: 'Vlastní' }] });
  eq('uložené: vlastní celodenní směna pokryje den, Eva podruhé nedostane nic', [naDen(jenUlozene).smeny, naDen(jenUlozene).diry], [[], []]);

  // ---- úroveň díry ----
  eq('díra: od otevření povinná, později žádoucí', [urovenDiry({ start: 480, end: 1200 }, { start: 480, end: 600 }), urovenDiry({ start: 480, end: 1200 }, { start: 840, end: 1200 })], ['povinna', 'zadouci']);
}
