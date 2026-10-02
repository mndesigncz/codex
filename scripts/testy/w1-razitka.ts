// W1 — razítkové kampaně a integrita připisování u kasy.
//
// Čistá logika z lib/stampsPlan.ts: plán připsání (platnost, vypršení od začátku
// karty, limity, přebytek), optimistický zápis proti souběhu (sCasem), validace
// kampaně pro POST i PATCH, statistika a otisk akce pro idempotenci.

import type { Testy } from './_testy.ts';
import {
  planAdd, planOdebrani, platiTed, dnyTextem, vyprselaKarta, vyprsiKdy, sCasem, overKampan,
  rozpadPoDnech, prumerDnu, otiskAkce, spustKrok,
  type PravidloKarty, type StavKarty, type KontextPlanu,
} from '../../lib/stampsPlan.ts';

const PRAVIDLO: PravidloKarty = {
  required_stamps: 10, repeat_mode: 'immediately', stack_cards: true, days_to_finish: 0,
  max_completions: 0, daily_cap: 0, days_of_week: [], hour_from: null, hour_till: null,
};
const dnes = new Date('2026-10-07T10:00:00Z'); // středa
const stav = (o: Partial<StavKarty> = {}): StavKarty => ({ stamps: 0, completed: 0, started_at: null, last_stamp_at: null, last_completed_at: null, ...o });
const kontext = (o: Partial<KontextPlanu> = {}): KontextPlanu => ({ now: dnes, dnesPripsano: 0, dow: 3, hhmm: '12:00', ...o });
const dnuPred = (n: number) => new Date(dnes.getTime() - n * 86400000);

export default async function ({ eq, ok }: Testy) {
  // ---- základní připsání ----
  const a = planAdd(PRAVIDLO, stav({ stamps: 3, started_at: dnuPred(2) }), 2, kontext());
  ok('plán: obyčejné připsání', a.ok && a.pridano === 2 && a.razitek === 5 && a.dokonceni === 0);
  ok('plán: karta nezačíná znovu, začátek zůstává', a.ok && a.zacatekKarty.getTime() === dnuPred(2).getTime());
  const b = planAdd(PRAVIDLO, stav(), 1, kontext());
  ok('plán: první razítko otevře kartu (started_at = teď)', b.ok && b.kartaZacala && b.zacatekKarty.getTime() === dnes.getTime());
  const c = planAdd(PRAVIDLO, stav({ stamps: 9, started_at: dnuPred(5) }), 1, kontext());
  ok('plán: desáté razítko dokončí kartu', c.ok && c.dokonceni === 1 && c.razitek === 0);
  ok('plán: doba dokončení se počítá od začátku karty', c.ok && c.dokoncenaZacatek?.getTime() === dnuPred(5).getTime());
  const d = planAdd(PRAVIDLO, stav({ stamps: 8, started_at: dnuPred(5) }), 15, kontext());
  ok('plán: přebytek se přenáší do další karty (stack)', d.ok && d.dokonceni === 2 && d.razitek === 3 && d.zahozeno === 0);
  ok('plán: nová karta po přetečení začíná teď', d.ok && d.zacatekKarty.getTime() === dnes.getTime());
  eq('plán: nula razítek nic nedělá', planAdd(PRAVIDLO, stav(), 0, kontext()), { ok: false, duvod: '', vyprselo: 0 });

  // ---- stack_cards = false: přebytek se nezahazuje tiše ----
  const e = planAdd({ ...PRAVIDLO, stack_cards: false }, stav({ stamps: 8 }), 5, kontext());
  ok('bez stackování: karta se dokončí a přebytek je ohlášený', e.ok && e.dokonceni === 1 && e.pridano === 2 && e.zahozeno === 3 && e.razitek === 0);

  // ---- vypršení od ZAČÁTKU karty ----
  const p30 = { ...PRAVIDLO, days_to_finish: 30 };
  ok('vypršení: 31 dní od začátku = vypršelo', vyprselaKarta(p30, stav({ stamps: 4, started_at: dnuPred(31) }), dnes));
  ok('vypršení: 29 dní od začátku = platí', !vyprselaKarta(p30, stav({ stamps: 4, started_at: dnuPred(29) }), dnes));
  ok('vypršení: prázdná karta nevyprší', !vyprselaKarta(p30, stav({ stamps: 0, started_at: dnuPred(99) }), dnes));
  ok('vypršení: bez limitu dní nevyprší nikdy', !vyprselaKarta(PRAVIDLO, stav({ stamps: 4, started_at: dnuPred(999) }), dnes));
  // poslední razítko včera, ale karta začala před 40 dny → vypršela (dřív se počítalo od posledního razítka)
  const f = planAdd(p30, stav({ stamps: 4, started_at: dnuPred(40), last_stamp_at: dnuPred(1) }), 1, kontext());
  ok('vypršení: průběžné sbírání karta nezachrání — počítá se od začátku', f.ok && f.vyprselo === 4 && f.razitek === 1 && f.kartaZacala);
  const g = planAdd({ ...p30, days_of_week: [1] }, stav({ stamps: 4, started_at: dnuPred(40) }), 1, kontext());
  ok('vypršení se hlásí i když se razítko nepřipíše (špatný den)', !g.ok && g.vyprselo === 4);
  eq('vyprsiKdy: začátek + dny', vyprsiKdy(p30, stav({ stamps: 2, started_at: dnuPred(10) }))?.getTime(), dnuPred(10).getTime() + 30 * 86400000);
  eq('vyprsiKdy: bez limitu null', vyprsiKdy(PRAVIDLO, stav({ stamps: 2, started_at: dnuPred(10) })), null);

  // ---- dny v týdnu a hodiny ----
  const okno = { ...PRAVIDLO, days_of_week: [1, 2, 3, 4, 5], hour_from: '08:00', hour_till: '11:00' };
  ok('okno: ve všední den v hodinách platí', platiTed(okno, 3, '09:30').plati);
  ok('okno: o víkendu neplatí', !platiTed(okno, 6, '09:30').plati);
  ok('okno: mimo hodiny neplatí', !platiTed(okno, 3, '11:00').plati);
  ok('okno: začátek hodin platí', platiTed(okno, 3, '08:00').plati);
  const noc = { ...PRAVIDLO, hour_from: '22:00', hour_till: '02:00' };
  ok('okno přes půlnoc: 23:30 platí', platiTed(noc, 1, '23:30').plati);
  ok('okno přes půlnoc: 01:00 platí', platiTed(noc, 1, '01:00').plati);
  ok('okno přes půlnoc: 12:00 neplatí', !platiTed(noc, 1, '12:00').plati);
  const mimo = planAdd(okno, stav(), 1, kontext({ dow: 6, hhmm: '09:00' }));
  ok('plán: mimo okno se nepřipíše a řekne proč', !mimo.ok && mimo.duvod.includes('po–pá'));
  ok('plán: ruční připsání okno obejde', planAdd(okno, stav(), 1, kontext({ dow: 6, hhmm: '09:00', rucne: true })).ok);
  eq('dny textem: pracovní týden', dnyTextem([1, 2, 3, 4, 5]), 'po–pá');
  eq('dny textem: vybrané', dnyTextem([1, 3, 5]), 'po, st, pá');
  eq('dny textem: všechny = denně', dnyTextem([1, 2, 3, 4, 5, 6, 7]), 'denně');
  eq('dny textem: dva sousední se nespojují', dnyTextem([6, 7]), 'so, ne');

  // ---- limity ----
  const lim = { ...PRAVIDLO, max_completions: 2 };
  ok('limit karet: pod limitem jde', planAdd(lim, stav({ completed: 1, stamps: 3 }), 1, kontext()).ok);
  const naLimitu = planAdd(lim, stav({ completed: 2 }), 1, kontext());
  ok('limit karet: na limitu se nepřipíše', !naLimitu.ok && naLimitu.duvod.includes('2×'));
  const posledni = planAdd(lim, stav({ completed: 1, stamps: 9, started_at: dnuPred(3) }), 4, kontext());
  ok('limit karet: poslední povolená karta zbytek nepřenáší, ale hlásí', posledni.ok && posledni.dokonceni === 1 && posledni.razitek === 0 && posledni.zahozeno === 3 && posledni.pridano === 1);
  const dvaNaRaz = planAdd(lim, stav({ completed: 1, stamps: 5 }), 30, kontext());
  ok('limit karet: z dávky se dokončí jen tolik, kolik limit dovolí', dvaNaRaz.ok && dvaNaRaz.dokonceni === 1);
  const jednou = planAdd({ ...PRAVIDLO, repeat_mode: 'one_time' }, stav({ stamps: 9 }), 5, kontext());
  ok('jednorázová karta: dokončí se jednou, zbytek se nepřenáší', jednou.ok && jednou.dokonceni === 1 && jednou.razitek === 0 && jednou.zahozeno === 4);
  ok('jednorázová karta: po dokončení se nepřipisuje', !planAdd({ ...PRAVIDLO, repeat_mode: 'one_time' }, stav({ completed: 1 }), 1, kontext()).ok);
  const cap = { ...PRAVIDLO, daily_cap: 2 };
  const capA = planAdd(cap, stav(), 5, kontext({ dnesPripsano: 0 }));
  ok('denní strop: dávka se ořízne na strop a přebytek je ohlášený', capA.ok && capA.pridano === 2 && capA.zahozeno === 3);
  const capB = planAdd(cap, stav({ stamps: 2 }), 1, kontext({ dnesPripsano: 1 }));
  ok('denní strop: zbývá jedno', capB.ok && capB.pridano === 1);
  const capC = planAdd(cap, stav({ stamps: 2 }), 1, kontext({ dnesPripsano: 2 }));
  ok('denní strop: vyčerpaný se nepřipíše', !capC.ok && capC.duvod.includes('Denní limit'));
  ok('denní strop: ruční připsání ho obejde', planAdd(cap, stav(), 5, kontext({ dnesPripsano: 2, rucne: true })).ok);
  const cd = planAdd({ ...PRAVIDLO, repeat_mode: 'one_week' }, stav({ completed: 1, last_completed_at: dnuPred(2) }), 1, kontext());
  ok('pauza mezi kartami: za 2 dny z 7 ještě ne', !cd.ok && cd.duvod.includes('5 d'));
  ok('pauza mezi kartami: po týdnu jde', planAdd({ ...PRAVIDLO, repeat_mode: 'one_week' }, stav({ completed: 1, last_completed_at: dnuPred(8) }), 1, kontext()).ok);

  // ---- ruční odebrání ----
  eq('odebrání: nejníž na nulu', planOdebrani({ stamps: 3 }, 10), { odebrano: 3, razitek: 0 });
  eq('odebrání: část', planOdebrani({ stamps: 7 }, 2), { odebrano: 2, razitek: 5 });
  eq('odebrání: nic k odebrání', planOdebrani({ stamps: 0 }, 2), { odebrano: 0, razitek: 0 });

  // ---- SOUBĚH: dvacet naráz připíše přesně dvacet, nic se neztratí ----
  type Rad = { stamps: number; completed: number; rev: number };
  const store: Rad = { stamps: 0, completed: 0, rev: 0 };
  const yieldTick = () => new Promise<void>(r => setTimeout(r, Math.random() * 3));
  const pridej = () => sCasem<Rad, ReturnType<typeof planAdd>>({
    pokusu: 100,
    nacti: async () => { const s = { ...store }; await yieldTick(); return s; },
    spocitej: s => planAdd(PRAVIDLO, stav({ stamps: s.stamps, completed: s.completed, started_at: dnuPred(1) }), 1, kontext()),
    zapis: async (s, p) => {
      await yieldTick();
      // UPDATE … WHERE rev = ? — projde jen když se řádek mezitím nezměnil.
      if (store.rev !== s.rev || !p.ok) return false;
      store.stamps = p.razitek; store.completed += p.dokonceni; store.rev++;
      return true;
    },
  });
  await Promise.all(Array.from({ length: 20 }, () => pridej()));
  eq('souběh: 20 razítek = 2 dokončené karty, 0 zbytek, žádná ztráta', [store.completed, store.stamps], [2, 0]);
  ok('souběh: rev vzrostl o přesně 20 zápisů', store.rev === 20);

  // Dvě souběžné dávky u poslední povolené karty nevydají odměnu dvakrát.
  const lim1 = { ...PRAVIDLO, max_completions: 1, required_stamps: 2 };
  const st2: Rad = { stamps: 1, completed: 0, rev: 0 };
  const pridej2 = () => sCasem<Rad, ReturnType<typeof planAdd>>({
    nacti: async () => { const s = { ...st2 }; await yieldTick(); return s; },
    spocitej: s => planAdd(lim1, stav({ stamps: s.stamps, completed: s.completed }), 1, kontext()),
    zapis: async (s, p) => {
      if (!p.ok) return true; // nic k zápisu (limit) — hotovo
      await yieldTick();
      if (st2.rev !== s.rev) return false;
      st2.stamps = p.razitek; st2.completed += p.dokonceni; st2.rev++;
      return true;
    },
  });
  await Promise.all([pridej2(), pridej2(), pridej2()]);
  eq('souběh: limit 1 karta — odměna se vydá jednou', st2.completed, 1);

  // Vyčerpané pokusy → null (volající řekne „zkus to znovu").
  const nic = await sCasem({ pokusu: 3, nacti: async () => 0, spocitej: () => 0, zapis: async () => false });
  eq('souběh: vyčerpané pokusy vrátí null', nic, null);

  // ---- kroky účtenky: po pádu se hotové přeskočí, nic se nezdvojí ----
  const hotove = new Set<string>();
  const zapsano: string[] = []; const provedeno: string[] = [];
  const zapis = async (n: string) => { zapsano.push(n); };
  await spustKrok(hotove, 'visit', async () => { provedeno.push('visit'); }, zapis);
  let spadlo = false;
  try { await spustKrok(hotove, 'stamps', async () => { throw new Error('síť'); }, zapis); } catch { spadlo = true; }
  ok('kroky: selhání se propaguje a krok se nezapíše jako hotový', spadlo && !zapsano.includes('stamps'));
  // druhý pokus (nový Set podle uloženého stavu)
  const hotove2 = new Set(zapsano);
  const r1 = await spustKrok(hotove2, 'visit', async () => { provedeno.push('visit-znovu'); }, zapis);
  const r2 = await spustKrok(hotove2, 'stamps', async () => { provedeno.push('stamps'); }, zapis);
  ok('kroky: hotový krok se při opakování nespustí, chybějící ano', !r1 && r2 && !provedeno.includes('visit-znovu') && provedeno.join() === 'visit,stamps');

  // ---- validace kampaně (POST i PATCH) ----
  const dobre = { name: 'Dýmka', requiredStamps: 10, ruleType: 'visit' };
  ok('validace: základ projde', 'f' in overKampan(dobre));
  const chyba = (b: any) => { const v = overKampan(b); return 'chyba' in v ? v.chyba : ''; };
  ok('validace: název je povinný', chyba({ ...dobre, name: '  ' }).includes('název'));
  ok('validace: razítek mimo rozsah je chyba, ne tiché ořezání', chyba({ ...dobre, requiredStamps: 99 }).includes('1 až 50'));
  ok('validace: desetinné razítko je chyba', chyba({ ...dobre, requiredStamps: 2.5 }).includes('celé číslo'));
  ok('validace: za položky bez položek', chyba({ ...dobre, ruleType: 'products' }).includes('položky'));
  ok('validace: za útratu bez částky', chyba({ ...dobre, ruleType: 'min_value' }).includes('útratu'));
  ok('validace: záporná útrata', chyba({ ...dobre, ruleType: 'min_value', minValue: -5 }).includes('kladná'));
  ok('validace: od po do', chyba({ ...dobre, validSince: '2026-12-01', validTill: '2026-11-01' }).includes('dřív'));
  ok('validace: špatné datum', chyba({ ...dobre, validSince: '1.12.2026' }).includes('Datum'));
  ok('validace: den v týdnu mimo 1–7', chyba({ ...dobre, daysOfWeek: [0] }).includes('1 (pondělí)'));
  ok('validace: hodiny jen z jedné strany', chyba({ ...dobre, hourFrom: '08:00' }).includes('obě'));
  ok('validace: špatný formát hodin', chyba({ ...dobre, hourFrom: '8h', hourTill: '10:00' }).includes('HH:MM'));
  ok('validace: stejné hodiny od i do', chyba({ ...dobre, hourFrom: '08:00', hourTill: '08:00' }).includes('stejné'));
  ok('validace: limit karet mimo rozsah', chyba({ ...dobre, maxCompletions: -1 }).includes('0 až 1000'));
  ok('validace: denní strop mimo rozsah', chyba({ ...dobre, dailyCap: 51 }).includes('0 až 50'));
  ok('validace: vyloučené položky jen u útraty', chyba({ ...dobre, excludedItems: [{ itemId: 1 }] }).includes('za útratu'));
  ok('validace: neznámý stav', chyba({ ...dobre, status: 'smazano' }).includes('stav'));
  ok('validace: neznámé pravidlo', chyba({ ...dobre, ruleType: 'x' }).includes('pravidlo'));
  const plna = overKampan({
    name: 'Čaj', requiredStamps: 5, ruleType: 'min_value', minValue: '300', minValueMultiple: true,
    excludedItems: [{ itemId: 7 }, { itemId: 7 }, { itemId: -1 }], daysOfWeek: [5, 1, 1], hourFrom: '08:00', hourTill: '11:00',
    maxCompletions: 3, dailyCap: 2, status: 'draft',
  });
  ok('validace: plná kampaň projde', 'f' in plna);
  if ('f' in plna) {
    eq('validace: dny se seřadí a zdeduplikují', plna.f.days_of_week, [1, 5]);
    eq('validace: vyloučené položky se zdeduplikují a očistí', plna.f.excluded_items, [{ itemId: 7 }]);
    ok('validace: koncept není aktivní', plna.f.status === 'draft' && plna.f.active === false);
    ok('validace: útrata se zaokrouhlí a násobky platí', plna.f.min_value === 300 && plna.f.min_value_multiple);
  }
  const stareUi = overKampan({ ...dobre, active: false });
  ok('validace: staré UI s active=false = pozastavená', 'f' in stareUi && stareUi.f.status === 'paused' && !stareUi.f.active);
  const bezStavu = overKampan(dobre);
  ok('validace: bez stavu běží', 'f' in bezStavu && bezStavu.f.status === 'active' && bezStavu.f.active);
  const jednaPoložka = overKampan({ name: 'X', ruleType: 'products', stampItems: [{ itemId: 3 }], onePerOrder: true });
  ok('validace: jedno razítko z účtenky u položek', 'f' in jednaPoložka && jednaPoložka.f.one_per_order);
  const jinePravidlo = overKampan({ ...dobre, onePerOrder: true });
  ok('validace: onePerOrder se u návštěvy zahodí', 'f' in jinePravidlo && !jinePravidlo.f.one_per_order);

  // ---- statistika ----
  const dny = rozpadPoDnech([{ den: '2026-10-05', razitek: 4, karet: 1 }, { den: '2026-10-07', razitek: 2, karet: 0 }], '2026-10-07', 5);
  eq('rozpad po dnech: pět dní, chybějící nuly', dny.map(x => [x.den, x.razitek, x.karet]), [
    ['2026-10-03', 0, 0], ['2026-10-04', 0, 0], ['2026-10-05', 4, 1], ['2026-10-06', 0, 0], ['2026-10-07', 2, 0],
  ]);
  eq('rozpad po dnech: přes hranici měsíce', rozpadPoDnech([], '2026-11-01', 3).map(x => x.den), ['2026-10-30', '2026-10-31', '2026-11-01']);
  eq('průměr doby: zaokrouhlí na desetinu', prumerDnu([3, 4, 4]), 3.7);
  eq('průměr doby: bez dat null', prumerDnu([]), null);
  eq('průměr doby: záporné a nečíselné se ignorují', prumerDnu([2, -1, NaN, 4]), 3);

  // ---- otisk akce (idempotence do 5 s) ----
  eq('otisk: stejná akce = stejný otisk', otiskAkce('points', { amount: 250 }), otiskAkce('points', { amount: 250.2 }));
  ok('otisk: jiná částka = jiný otisk', otiskAkce('points', { amount: 250 }) !== otiskAkce('points', { amount: 300 }));
  ok('otisk: jiná účtenka = jiný otisk', otiskAkce('bill', { billId: 'a' }) !== otiskAkce('bill', { billId: 'b' }));
  ok('otisk: jiná akce = jiný otisk', otiskAkce('points', { amount: 100 }) !== otiskAkce('credit', { amount: 100 }));
  eq('otisk: pořadí položek nehraje roli',
    otiskAkce('points', { amount: 0, items: [{ itemId: 1, qty: 2 }, { itemId: 3, qty: 1 }] }),
    otiskAkce('points', { amount: 0, items: [{ itemId: 3, qty: 1 }, { itemId: 1, qty: 2 }] }));
}
