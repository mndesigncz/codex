// Kolo 69, balík B7 (Odměny a hodnocení) — jednotkové testy výpočtů widgetů, katalogu a API.
//
// Výpočty jsou v lib/odmenyPrehled.ts (čistý modul). Hlídá se hlavně to, co se dřív
// pokazilo nebo co by se pokazit mohlo: „Odkud mám body" ukazovalo počty úkolů jako
// body, kalendář počítal jako nehodnocené i budoucí naplánované směny, „Vyměnit"
// počítalo s body, které už drží čekající žádost, a člověk se žebříčkem přišel
// o vlastní body a hodnocení (N12).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  vyberOdmeny, odkudBody, zbyvaDoDalsi, dnyHodnoceni, bodyDne, vyberPoradi, vytkyTymu, nehodnocene, minulyMesic,
  vyberKatalog, nabidka, cekajiciZadosti, vyberPochvaly, pochvalyMesice, urlZebricku,
} from '../../lib/odmenyPrehled.ts';
import { WIDGETY } from '../../lib/widgety/katalog/odmeny.ts';
import { STRANKA as VEDENI } from '../../lib/widgety/stranky/vedeni.odmeny.ts';
import { STRANKA as ZAMESTNANEC } from '../../lib/widgety/stranky/zamestnanec.odmeny.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Zdroják bez řádkových komentářů — komentáře o odstraněném confirm() a 🥇 mluví záměrně. */
const bezKomentaru = (s: string) => s.split('\n').filter(l => !/^\s*(\/\/|\*|\{\/\*)/.test(l)).join('\n');

export default function ({ eq, ok }: Testy) {
  // ---- moje úroveň a body ----
  const odpoved = {
    levels: [{ name: 'Nováček', minPoints: 0, perks: '' }, { name: 'Barista', minPoints: 150, perks: 'Sleva 10 %' }],
    points: { task: 5, procedure: 10, closing: 15 },
    me: {
      points: 212, levelName: 'Barista', levelIndex: 1, perks: 'Sleva 10 %', next: null, pctToNext: 100, pointsIntoLevel: 62, pointsForNext: 0,
      breakdown: { tasks: 10, procedures: 3, closings: 4, reviewPoints: 40, ratedShifts: 6, autoPoints: -8, itemPoints: -30, flagged: 1 },
    },
  };
  const o = vyberOdmeny(odpoved);
  eq('úroveň: vlastní body, úroveň a index', [o.ja?.body, o.ja?.uroven, o.ja?.index, o.urovne.length], [212, 'Barista', 1, 2]);
  ok('úroveň: tablet (bez `me`) → ja = null, ne pád', vyberOdmeny({ levels: [], points: {} }).ja === null);
  let spadlo = false;
  try { vyberOdmeny(null); } catch { spadlo = true; }
  ok('úroveň: nečekaný tvar je chyba widgetu (ErrorState), ne prázdno', spadlo);
  eq('úroveň: kolik chybí do další, nikdy záporně', [zbyvaDoDalsi({ vUrovni: 20, naDalsi: 150 }), zbyvaDoDalsi({ vUrovni: 200, naDalsi: 150 })], [130, 0]);

  // ---- odkud mám body ----
  const radky = odkudBody(o.ja!.rozpad, o.sazebnik);
  eq('odkud body: úkoly, postupy a uzávěrky = počet × sazba (dřív se ukazoval počet)', radky.slice(0, 3).map(r => r.body), [50, 30, 60]);
  eq('odkud body: z hodnocení = body z hodnocení + automatické', radky[3].body, 32);
  // Součet = totalPoints() na serveru (počty × sazba + body z hodnocení, automatické a u položek),
  // takže řádky sedí s celkem nahoře — včetně odečtených odměn.
  eq('odkud body: součet řádků = celkem podle sazby (jako server)', radky.reduce((s, r) => s + r.body, 0), 10 * 5 + 3 * 10 + 4 * 15 + 40 - 8 - 30);
  eq('odkud body: počty zůstávají pro meta řádku (pochvaly od kola 5)', radky.map(r => r.pocet), [10, 3, 4, 6, 0, null]);

  // ---- hodnocení mých směn ----
  const dny = dnyHodnoceni({
    reviews: [
      { work_date: '2026-09-24', rating: 4, points: 16, autoPoints: -2, note: ' Super ', flagged: false, seen_at: '2026-09-25', scope: 'shift' },
      { work_date: '2026-09-20T00:00:00.000Z', rating: 0, points: 0, autoPoints: 0, note: null, flagged: true, seen_at: null },
    ],
    items: [
      { work_date: '2026-09-24', kind: 'task', refId: 5, label: 'Vytřít', points: -3, note: null, flagged: true },
      { work_date: '2026-09-22', kind: 'closing', refId: 9, label: 'Uzávěrka — ranní', points: 2, note: 'Pěkně', flagged: false },
      { work_date: '2026-09-23', kind: 'redemption', refId: 1, label: 'Odměna', points: -100, note: null, flagged: false },
    ],
  });
  eq('dny hodnocení: nejnovější první, den jen s položkou se ukáže, odečet odměny ne', dny.map(d => d.den), ['2026-09-24', '2026-09-22', '2026-09-20']);
  eq('dny hodnocení: výtka u položky označí celý den', [dny[0].vytka, dny[0].poznamka, dny[0].celaSmena], [true, 'Super', true]);
  eq('dny hodnocení: body dne = hodnocení + automatické + položky', bodyDne(dny[0]), 16 - 2 - 3);
  eq('dny hodnocení: nepotvrzená výtka je „nová", den bez hodnocení není', [dny[2].videno, dny[2].vytka, dny[1].maHodnoceni, dny[1].videno], [false, true, false, true]);
  eq('dny hodnocení: rozbitý tvar nespadne', dnyHodnoceni({ reviews: 'x', items: null }), []);

  // ---- žebříček a výtky ----
  const poradi = vyberPoradi({
    standings: [
      { id: 1, name: 'Eva', points: 120, levelName: 'Nováček', next: { name: 'Barista' }, pctToNext: 80, pointsIntoLevel: 120, pointsForNext: 150, flagged: 2, flaggedUnseen: 1, pending: 1, oldestPending: '2026-09-20' },
      { id: 2, name: 'Petr', points: 300, levelName: 'Barista', next: null, pctToNext: 100, pointsIntoLevel: 150, pointsForNext: 0, flagged: 3, flaggedUnseen: 0 },
      { id: 3, name: 'Jana', points: 50, levelName: 'Nováček', flagged: 0 },
    ],
  });
  eq('žebříček: podle bodů, zbývá do další úrovně', [poradi.map(p => p.jmeno), poradi[1].zbyva, poradi[1].dalsi], [['Petr', 'Eva', 'Jana'], 30, 'Barista']);
  eq('žebříček: bez oprávnění server standings nepošle → prázdno, ne pád', vyberPoradi({ me: {} }), []);
  const v = vytkyTymu(poradi);
  eq('výtky: nejdřív nepotvrzené, pak počet; bez výtek se neukazuje', [v.lide.map(p => p.jmeno), v.celkem, v.nepotvrzenych], [['Eva', 'Petr'], 5, 1]);

  // ---- nehodnocené směny ----
  const n = nehodnocene({ days: [
    { date: '2026-09-27', pending: 2, staff: [{}, {}] },   // zítra — naplánovaná, hodnotit nejde
    { date: '2026-09-26', pending: 1, staff: [{}] },       // dnes — ano (Ohodnotit směny nabízí i Dnes)
    { date: '2026-09-03', pending: 2, staff: [{}, {}] },
    { date: '2026-09-10', pending: 0, staff: [{}] },       // vše ohodnoceno
  ] }, '2026-09-26');
  eq('nehodnocené: jen dny do dneška s něčím k hodnocení, nejstarší první', [n.celkem, n.nejstarsi, n.dny.map(d => d.den)], [3, '2026-09-03', ['2026-09-03', '2026-09-26']]);
  eq('nehodnocené: minulý měsíc přes přelom roku', [minulyMesic('2026-01'), minulyMesic('2026-09')], ['2025-12', '2026-08']);

  // ---- katalog odměn ----
  const k = vyberKatalog({
    catalog: [
      { id: 1, title: 'Káva', icon: '☕', cost: 50, active: true },
      { id: 2, title: 'Volno', icon: null, cost: 300, active: true },
      { id: 3, title: 'Stará', cost: 10, active: false },
    ],
    redemptions: [
      { id: 10, reward_id: 1, title: 'Káva', cost: 50, status: 'pending', employee_id: 7, created_at: '2026-09-20' },
      { id: 11, reward_id: 2, title: 'Volno', cost: 300, status: 'pending', employee_id: 8, employee_name: 'Petr', created_at: '2026-09-19' },
      { id: 12, reward_id: 1, title: 'Káva', cost: 50, status: 'approved', employee_id: 7 },
    ],
  });
  const nab = nabidka(k, 120, 7);
  eq('katalog: volné body = body − moje čekající žádosti (žádosti ostatních se nepočítají)', nab.volne, 70);
  eq('katalog: vypnutá odměna se zaměstnanci nenabízí', nab.odmeny.map(x => x.id), [1, 2]);
  eq('katalog: o kávu už žádám (čeká), na volno chybí 230', [nab.odmeny[0].ceka, nab.odmeny[1].dosahnu, nab.odmeny[1].chybi], [true, false, 230]);
  eq('katalog: moje žádosti jen moje', nab.moje.map(z => z.id), [10, 12]);
  eq('katalog: bez vlastního id (tablet) žádné moje žádosti', nabidka(k, 500, null).moje, []);
  eq('žádosti: fronta jen čekajících, nejstarší první', cekajiciZadosti(k).map(z => z.id), [11, 10]);

  // ---- katalog widgetů a stránky ----
  eq('katalog B7: všechny widgety oblasti odměn jsou hotové', WIDGETY.filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  eq('stránky B7: plocha je zapnutá', [VEDENI.aktivni, ZAMESTNANEC.aktivni], [true, true]);
  for (const st of [VEDENI, ZAMESTNANEC]) {
    const vychozi = Object.values(st.vychozi).flatMap(x => x ?? []);
    eq(`stránky B7: výchozí ${st.id} nemá plánovaný widget (AK-20)`, vychozi.map(p => p.w).filter(w => w !== 'nastroj' && widget(w)?.stav !== 'hotovo'), []);
    ok(`stránky B7: ${st.id} má nástroj ve výchozím`, Object.values(st.vychozi).every(x => (x ?? []).some(p => p.w === 'nastroj')));
    eq(`stránky B7: doporučené ${st.id} existují a patří rozhraní stránky`, st.doporucene.filter(w => !widget(w)?.rozhrani.includes(st.rozhrani)), []);
    eq(`stránky B7: velikosti ve výchozím ${st.id} widget umí`, vychozi.filter(p => p.w !== 'nastroj' && p.s && !widget(p.w)?.velikosti.includes(p.s)).map(p => p.w), []);
  }
  ok('stránky B7: Zpětná vazba na Odměnách zaměstnance střední (velká by zopakovala historii Hodnocení mých směn)',
    (ZAMESTNANEC.vychozi['typ:zamestnanec'] ?? []).find(p => p.w === 'moje.zpetna_vazba')?.s === 'M');

  // ---- oprávnění ----
  eq('oprávnění: Výtky v týmu chtějí žebříček i hodnocení (vse)', widget('odmeny.vytky_tymu')?.opravneni.vse, ['odmeny.zebricek', 'hodnoceni.zobrazit']);
  eq('oprávnění: Žádosti o odměny chtějí odmeny.schvalovat', widget('odmeny.zadosti')?.opravneni.vse, ['odmeny.schvalovat']);
  eq('oprávnění: Nehodnocené směny chtějí hodnoceni.zobrazit', widget('hodnoceni.nehodnocene')?.opravneni.vse, ['hodnoceni.zobrazit']);
  eq('oprávnění: Katalog čte každý, správa jen s odmeny.katalog', [widget('odmeny.katalog')?.opravneni.vse, widget('odmeny.katalog')?.opravneni.pole?.['akce:spravovat_katalog']], [[], 'odmeny.katalog']);
  const oblast = precti('components/widgety/oblasti/odmeny.tsx');
  ok('oprávnění: brána widgetu chce VŠECHNY klíče (every), ne kterýkoli', /klice\.every\(k => ma\(k\)\)/.test(oblast));

  // ---- API: N12 a výtky ----
  const api = precti('app/api/rewards/route.ts');
  ok('N12: větev se žebříčkem vrací i vlastní část (me, reviews)', /standings, \.\.\.\(c\.kiosk \? \{\} : await vlastni\(/.test(api));
  ok('N12: tablet vlastní body nedostane', /kiosk: c\.role\.typ === 'kiosk'/.test(api));
  ok('výtky: nepotvrzené výtky jen s hodnoceni.zobrazit', /flaggedUnseen: vidiHodnoceni \?/.test(api));

  // ---- komponenty: čtení přes useDataWidgetu, žádné emoji ikony ani confirm() ----
  const cteni = [...oblast.matchAll(/fetch\(([^)]*)\)/g)].map(m => m[1]).filter(a => !/method:/.test(oblast.slice(oblast.indexOf(a), oblast.indexOf(a) + 160)));
  eq('oblast odměn: fetch jen pro zápis (čtení přes useDataWidgetu)', cteni, []);
  ok('oblast odměn: widget nikdy s limetkou (variant="accent")', !/variant="accent"/.test(oblast));
  for (const soubor of ['components/employer/RewardsView.tsx', 'components/employee/MyRewards.tsx', 'components/employer/ShiftReviewCalendar.tsx']) {
    const kod = bezKomentaru(precti(soubor));
    ok(`${soubor}: bez confirm(), medailí 🥇🥈🥉, „✓", „★" a náhradního 👤`, !/\bconfirm\(/.test(kod) && !/[🥇🥈🥉✓★👤]/u.test(kod));
    ok(`${soubor}: bez animate-pulse a ručně psané limetky`, !/animate-pulse/.test(kod) && !/rounded-full bg-\[#C8F542\] text-black/.test(kod));
    ok(`${soubor}: data přes useDataWidgetu (stejná mezipaměť jako widgety)`, /useDataWidgetu\(/.test(kod));
  }
  const stranka = bezKomentaru(precti('components/employer/RewardsView.tsx'));
  ok('RewardsView: přepínač částí je v `aside`, ne v `primary` hlavičky (audit, telefon)', /aside: casti\.length > 1/.test(stranka) && !/primary=\{<Segmented/.test(stranka));
  ok('RewardsView: plocha stránky vedeni.odmeny', /stranka="vedeni\.odmeny"/.test(stranka));
  ok('MyRewards: plocha stránky zamestnanec.odmeny (hlavička vždy, i bez dat)', /stranka="zamestnanec\.odmeny"/.test(precti('components/employee/MyRewards.tsx')));

  // ---- review B7 ----
  // Fronta žádostí se neusekne na pět: velký widget ji ukáže celou a „Vybrat vše" bere celou frontu.
  ok('review: Žádosti o odměny umí L (celá fronta)', !!widget('odmeny.zadosti')?.velikosti.includes('L'));
  ok('review: „Vybrat vše" počítá z celé fronty, ne z viditelných', /totalLabel=\{t\('Vybrat vše \(\{pocet\}\)', \{ pocet: cislo\(fronta\.length\) \}\)\}/.test(oblast)
    && /selectAll\(fronta\.map/.test(oblast));
  // Odkaz „Odměny ›" na stránce Odměny by vedl na tutéž stránku: obě plochy to widgetům řeknou.
  ok('review: widgety nemají natvrdo odkaz „Odměny" (jen přes useOdkazOdmeny)', !/popisek: 'Odměny', pohled: 'rewards' \}\}/.test(oblast));
  for (const soubor of ['components/employer/RewardsView.tsx', 'components/employee/MyRewards.tsx']) {
    ok(`review: ${soubor} obaluje plochu NaStranceOdmen`, /<NaStranceOdmen\.Provider value>/.test(precti(soubor)));
  }
  ok('review: „Kalendář ›" u Ohodnotit směny jde přes otevriKalendar', /pohled === 'rewards' \? otevriKalendar\(nav, datum\)/.test(oblast));
  // Žebříček: stavové chipy v meta, v ocasu řádku jen body — čísla v jednom sloupci.
  ok('review: žebříček nemá chipy v `right`', !/right=\{stav\}/.test(stranka));
  // Okno hodnocení: „Něco je špatně" je Switch, ne ručně psaná pilulka s aria-pressed.
  const okno = bezKomentaru(precti('components/employer/ShiftReviewModal.tsx'));
  ok('review: ShiftReviewModal — „Něco je špatně" je Switch, ne ručně psaná pilulka', !/aria-pressed=\{isFlagged\}/.test(okno) && !/Označeno jako špatně/.test(okno) && /<Switch checked=\{isFlagged\}/.test(okno));

  // ---- kolo 5: pochvaly s body + žebříček za období ----
  // Pochvala je zdroj bodů jako hodnocení: součet „Odkud mám body" musí sedět s celkem.
  const sPochvalou = vyberOdmeny({ ...odpoved, me: { ...odpoved.me, points: 177, breakdown: { ...odpoved.me.breakdown, awards: 35, awardCount: 2 } } });
  const radkyP = odkudBody(sPochvalou.ja!.rozpad, sPochvalou.sazebnik);
  eq('pochvaly: řádek Pochvaly s body a počtem', radkyP.find(r => r.klic === 'pochvaly') && [radkyP.find(r => r.klic === 'pochvaly')!.body, radkyP.find(r => r.klic === 'pochvaly')!.pocet], [35, 2]);
  eq('pochvaly: součet řádků = celkem i s pochvalou (142 + 35)', radkyP.reduce((a, r) => a + r.body, 0), 177);
  // lib/pointsBalance sahá na databázi (neon), tak jen zdroják: pochvaly jsou v součtu i v prázdném rozpadu.
  const balance = precti('lib/pointsBalance.ts');
  ok('pochvaly: server počítá pochvaly do celku (totalPoints + awards)', /\+ b\.itemPoints \+ \(b\.awards \?\? 0\)/.test(balance) && /awards: 0, awardCount: 0/.test(balance));
  eq('pochvaly: bez pole awards (starší odpověď) nula, ne NaN', [sPochvalou.ja!.rozpad.pochvaly, vyberOdmeny(odpoved).ja!.rozpad.pochvaly], [35, 0]);
  // Pochvala ve zpětné vazbě: položka druhu award u dne, kdy přišla.
  const dnyP = dnyHodnoceni({ reviews: [], items: [{ work_date: '2026-10-05', kind: 'award', refId: 7, label: 'Zaskočila za kolegyni', points: 20, note: null, flagged: false }] });
  eq('pochvaly: ve dnech zpětné vazby jako položka award s body', [dnyP.length, dnyP[0]?.polozky[0]?.druh, bodyDne(dnyP[0])], [1, 'award', 20]);
  const poch = vyberPochvaly({ awards: [
    { id: 7, userId: 2, name: 'Eva', avatar: '👩', points: 20, reason: 'Za kolegyni', givenBy: 'Martin', createdAt: '2026-10-05T15:10:00.000Z' },
    { id: 6, userId: 3, name: 'Jakub', avatar: null, points: 10, reason: null, givenBy: null, createdAt: '2026-09-28T19:40:00.000Z' },
  ] });
  eq('pochvaly: parser (jméno, body, důvod, kdo dal)', [poch.length, poch[0].jmeno, poch[0].body, poch[1].duvod, poch[1].dal], [2, 'Eva', 20, null, null]);
  eq('pochvaly: tento měsíc jen od 1. dne (zářijová se nepočítá)', pochvalyMesice(poch, '2026-10-12'), { pocet: 1, body: 20 });
  let padlo = false; try { vyberPochvaly(null); } catch { padlo = true; }
  ok('pochvaly: nečekaný tvar je chyba widgetu, ne prázdno', padlo);
  eq('žebříček za období: adresa s ?od=1. dne měsíce, celkem bez parametru', [urlZebricku('mesic', '2026-10-12'), urlZebricku('celkem', '2026-10-12')], ['/api/rewards?od=2026-10-01', '/api/rewards']);
  ok('žebříček: widget má nastavení Období (celkem / měsíc)', !!widget('odmeny.zebricek')?.nastaveni?.some(n => n.klic === 'obdobi' && n.moznosti?.some(m => m.id === 'mesic')));
  ok('pochvaly: widget odmeny.pochvaly v katalogu, akce chválit = hodnoceni.hodnotit', widget('odmeny.pochvaly')?.opravneni.pole?.['akce:pochvalit'] === 'hodnoceni.hodnotit');
  // Server: období vynechá odečty za odměny — pořadí za měsíc říká, kdo si body vydělal.
  ok('žebříček za období: shift_review_items bez redemption, když je `od`', /kind <> 'redemption'/.test(balance) && /point_awards/.test(balance));
  ok('pochvaly: API chválí jen s hodnoceni.hodnotit a hlídá členství', /pozaduj\('hodnoceni\.hodnotit'\)/.test(precti('app/api/rewards/awards/route.ts')) && /jeClenem\(userId, c\.teamId\)/.test(precti('app/api/rewards/awards/route.ts')));
}
