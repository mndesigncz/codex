// Kolo 81 — razítka: úplnost pravidel (R1–R15) a souběhy (S1–S10).
//
// Čisté funkce z lib/razitkaPravidla.ts a lib/idempotenceKlic.ts se zkouší přímo.
// Co sahá do databáze (lib/stamps.ts, routy), hlídají kontroly zdrojáků: jsou tu
// proto, ať se atomické zápisy a idempotence nedají omylem vrátit do křehké podoby.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  planPripsani, platiTed, popisOkna, stavKampane, dalsiKartaOd, stavKartyHosta, kartaProHosta, spocitejRazitka, vyberKampane,
  polePole, overKampan, razitkaCsv, udalostiCsv, prumerDni, denVTydnu, czDatum, normalizujDny, jeVyloucen,
  type PravidloKampane, type PravidloZaPolozky, type RadekUctu,
} from '../../lib/razitkaPravidla.ts';
import { ocistiKlic, novyKlic } from '../../lib/idempotenceKlic.ts';

const zdroj = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const K: PravidloKampane = {
  required_stamps: 5, stack_cards: true, repeat_mode: 'immediately', days_to_finish: 0, max_completions: 0, daily_cap: 0,
  valid_days: [], hour_from: null, hour_till: null,
};
const prazdny = { stamps: 0, completed: 0, started_at: null, last_completed_at: null };
const NOW = new Date('2026-10-02T10:00:00Z'); // pátek 12:00 pražského času (letní)
const dnuZpet = (n: number, od = NOW) => new Date(od.getTime() - n * 86400000);

export default function ({ eq, ok }: Testy) {
  // ---- R: plán připsání ----
  const p1 = planPripsani(K, prazdny, 1, NOW);
  eq('plán: jedno razítko na prázdnou kartu', [p1.added, p1.rest, p1.completions, p1.lost], [1, 1, 0, 0]);
  const p7 = planPripsani(K, prazdny, 7, NOW);
  eq('plán: sedm razítek přeteče na další kartu (přenos)', [p7.added, p7.rest, p7.completions, p7.lost], [7, 2, 1, 0]);
  const nostack = planPripsani({ ...K, stack_cards: false }, prazdny, 7, NOW);
  eq('plán: bez přenosu se přebytek neztratí potichu, ale hlásí se jako lost', [nostack.added, nostack.rest, nostack.completions, nostack.lost], [5, 0, 1, 2]);
  ok('plán: bez přenosu je důvod srozumitelný', !!nostack.lostWhy && /přeb/i.test(nostack.lostWhy));
  const nostack2 = planPripsani({ ...K, stack_cards: false }, { ...prazdny, stamps: 3 }, 4, NOW);
  eq('plán: bez přenosu doplní jen zbytek karty', [nostack2.added, nostack2.completions, nostack2.lost], [2, 1, 2]);

  // R1 max_completions
  const max1 = planPripsani({ ...K, max_completions: 1 }, { ...prazdny, completed: 1 }, 1, NOW);
  ok('R1: host s maximem dokončených karet už razítko nedostane', !!max1.skipped && max1.added === 0);
  const max2 = planPripsani({ ...K, max_completions: 2 }, { ...prazdny, completed: 1 }, 12, NOW);
  eq('R1: poslední povolená karta: zbytek se nepřipíše a hlásí', [max2.completions, max2.rest, max2.lost], [1, 0, 7]);
  const max3 = planPripsani({ ...K, max_completions: 2 }, { ...prazdny, completed: 0 }, 12, NOW);
  eq('R1: dvě povolené karty z jedné dávky', [max3.completions, max3.rest, max3.lost], [2, 0, 2]);
  const bezMax = planPripsani(K, { ...prazdny, completed: 99 }, 1, NOW);
  eq('R1: 0 = bez omezení', bezMax.skipped, undefined);

  // R2 denní strop
  const cap0 = planPripsani({ ...K, daily_cap: 2 }, prazdny, 1, NOW, 2);
  ok('R2: vyčerpaný denní strop razítko nepřipíše', !!cap0.skipped && /strop/i.test(cap0.skipped));
  const cap1 = planPripsani({ ...K, daily_cap: 2 }, prazdny, 3, NOW, 1);
  eq('R2: do stropu se připíše jen zbytek, zbytek je lost', [cap1.added, cap1.lost], [1, 2]);
  const capOk = planPripsani({ ...K, daily_cap: 3 }, prazdny, 2, NOW, 0);
  eq('R2: pod stropem projde vše', [capOk.added, capOk.lost], [2, 0]);

  // R14 vypršení karty počítané OD ZAČÁTKU karty
  const exp = planPripsani({ ...K, days_to_finish: 7 }, { ...prazdny, stamps: 3, started_at: dnuZpet(10) }, 1, NOW);
  eq('R14: vypršelá karta: propadnou rozdělaná razítka a začíná nová', [exp.expiredCount, exp.rest, exp.added], [3, 1, 1]);
  eq('R14: nová karta začíná teď', exp.startedAt.getTime(), NOW.getTime());
  const neexp = planPripsani({ ...K, days_to_finish: 7 }, { ...prazdny, stamps: 3, started_at: dnuZpet(5) }, 1, NOW);
  eq('R14: v lhůtě nic nepropadá', [neexp.expiredCount, neexp.rest], [0, 4]);
  const dok = planPripsani(K, { ...prazdny, stamps: 4, started_at: dnuZpet(3) }, 1, NOW);
  eq('R14: doba sbírání dokončené karty ve dnech', [dok.completions, dok.tookDays], [1, 3]);
  const novaPoPreteku = planPripsani(K, { ...prazdny, stamps: 4, started_at: dnuZpet(3) }, 3, NOW);
  eq('R14: zbytek po dokončení je už nová karta (začíná teď)', [novaPoPreteku.rest, novaPoPreteku.startedAt.getTime()], [2, NOW.getTime()]);

  // jednorázová karta
  const jednou = planPripsani({ ...K, repeat_mode: 'one_time' }, { ...prazdny, completed: 1 }, 1, NOW);
  ok('jednorázová karta po dokončení nic nepřipíše', !!jednou.skipped);
  const jednou2 = planPripsani({ ...K, repeat_mode: 'one_time' }, prazdny, 9, NOW);
  eq('jednorázová karta: zbytek po dokončení se nehromadí', [jednou2.completions, jednou2.rest, jednou2.lost], [1, 0, 4]);

  // ---- R15 kalendářně: den a měsíc podle pražského času ----
  const posl = new Date('2026-10-02T06:00:00Z'); // 8:00 pražského, pátek 2. 10.
  eq('R15: po dni = od dalšího kalendářního dne', dalsiKartaOd('one_day', posl), '2026-10-03');
  eq('R15: po týdnu = o 7 dní', dalsiKartaOd('one_week', posl), '2026-10-09');
  eq('R15: po měsíci = od 1. dne dalšího měsíce', dalsiKartaOd('one_month', posl), '2026-11-01');
  eq('R15: prosinec přeskočí do ledna dalšího roku', dalsiKartaOd('one_month', new Date('2026-12-15T10:00:00Z')), '2027-01-01');
  eq('R15: 23:30 pražského ještě patří do října', dalsiKartaOd('one_month', new Date('2026-10-31T22:30:00Z')), '2026-11-01');
  eq('R15: 00:30 pražského už je listopad (UTC je ještě říjen)', dalsiKartaOd('one_month', new Date('2026-10-31T23:30:00Z')), '2026-12-01');
  eq('R15: hned a jen jednou nemají cooldown', [dalsiKartaOd('immediately', posl), dalsiKartaOd('one_time', posl)], [null, null]);
  const cdDen = planPripsani({ ...K, repeat_mode: 'one_day' }, { ...prazdny, last_completed_at: posl }, 1, NOW);
  ok('R15: tentýž den po dokončení se další karta nesbírá', !!cdDen.skipped && /3\. 10\. 2026/.test(cdDen.skipped));
  const cdDen2 = planPripsani({ ...K, repeat_mode: 'one_day' }, { ...prazdny, last_completed_at: dnuZpet(1, posl) }, 1, NOW);
  eq('R15: následující den už jde', cdDen2.skipped, undefined);
  const cdMesic = planPripsani({ ...K, repeat_mode: 'one_month' }, { ...prazdny, last_completed_at: new Date('2026-10-05T10:00:00Z') }, 1, new Date('2026-10-31T10:00:00Z'));
  ok('R15: kalendářní měsíc: 31. 10. po dokončení 5. 10. ještě ne', !!cdMesic.skipped && /1\. 11\. 2026/.test(cdMesic.skipped));
  const cdMesic2 = planPripsani({ ...K, repeat_mode: 'one_month' }, { ...prazdny, last_completed_at: new Date('2026-10-05T10:00:00Z') }, 1, new Date('2026-11-01T09:00:00Z'));
  eq('R15: 1. 11. už jde (ne až za 30 dní)', cdMesic2.skipped, undefined);

  // ---- R3 dny a hodiny ----
  eq('R3: dny v týdnu (so = 6, po = 1)', [denVTydnu('2026-10-03'), denVTydnu('2026-10-05'), denVTydnu('2026-10-04')], [6, 1, 7]);
  const pracovni = { valid_days: [1, 2, 3, 4, 5], hour_from: null, hour_till: null };
  eq('R3: pracovní dny: sobota ne', platiTed(pracovni, NOW, '2026-10-03', '12:00').ok, false);
  eq('R3: pracovní dny: pondělí ano', platiTed(pracovni, NOW, '2026-10-05', '12:00').ok, true);
  const odpoledne = { valid_days: [], hour_from: '14:00', hour_till: '18:00' };
  eq('R3: hodiny: 13:59 ne, 14:00 ano, 17:59 ano, 18:00 ne', ['13:59', '14:00', '17:59', '18:00'].map(h => platiTed(odpoledne, NOW, '2026-10-05', h).ok), [false, true, true, false]);
  const noc = { valid_days: [], hour_from: '22:00', hour_till: '02:00' };
  eq('R3: noční okno 22–02 platí večer i ráno, ne v poledne', ['23:00', '01:30', '12:00', '02:00', '22:00'].map(h => platiTed(noc, NOW, '2026-10-05', h).ok), [true, true, false, false, true]);
  eq('R3: stejné od a do = celý den', platiTed({ valid_days: [], hour_from: '10:00', hour_till: '10:00' }, NOW, '2026-10-05', '03:00').ok, true);
  const mimo = platiTed(pracovni, NOW, '2026-10-03', '12:00');
  ok('R3: mimo okno je důvod srozumitelný', /Po–Pá/.test(mimo.proc ?? ''));
  eq('R3: popis okna: Po–Pá, 14:00–18:00', popisOkna({ valid_days: [1, 2, 3, 4, 5], hour_from: '14:00', hour_till: '18:00' }), 'Po–Pá, 14:00–18:00');
  eq('R3: popis okna: nesouvislé dny', popisOkna({ valid_days: [1, 3], hour_from: null, hour_till: null }), 'Po, St');
  eq('R3: popis okna: všechny dny a bez hodin = prázdné', popisOkna({ valid_days: [1, 2, 3, 4, 5, 6, 7], hour_from: null, hour_till: null }), '');
  eq('R3: dny se čistí (duplicity, nesmysly, pořadí)', normalizujDny([5, 1, 1, 9, 0, 'x', 3]), [1, 3, 5]);

  // ---- R6 stav kampaně ----
  const dnes = '2026-10-02';
  const zaklad = { active: true, draft: false, archived_at: null, valid_since: null, valid_till: null };
  eq('R6: běží', stavKampane(zaklad, dnes), 'live');
  eq('R6: pozastaveno', stavKampane({ ...zaklad, active: false }, dnes), 'paused');
  eq('R6: koncept', stavKampane({ ...zaklad, draft: true, active: false }, dnes), 'draft');
  eq('R6: archiv přebíjí všechno', stavKampane({ ...zaklad, draft: true, archived_at: '2026-01-01' }, dnes), 'archived');
  eq('R6: naplánováno (začíná zítra)', stavKampane({ ...zaklad, valid_since: '2026-10-03' }, dnes), 'scheduled');
  eq('R6: skončila (včera)', stavKampane({ ...zaklad, valid_till: '2026-10-01' }, dnes), 'ended');
  eq('R6: poslední den ještě běží', stavKampane({ ...zaklad, valid_till: '2026-10-02' }, dnes), 'live');

  // ---- R4 kategorie a vyloučené položky ----
  const pravidlo: PravidloZaPolozky = {
    rule_type: 'products', stamp_items: [{ itemId: 1 }], stamp_sections: [{ sectionId: 10 }], excluded_items: [{ itemId: 3 }], excluded_sections: [{ sectionId: 20 }],
    min_value: null, min_value_multiple: false, one_per_order: false,
  };
  const r = (itemId: number | null, sectionId: number | null, qty = 1, price: number | null = null): RadekUctu => ({ itemId, sectionId, qty, price });
  eq('R4: vybraná položka dává razítko za kus', spocitejRazitka(pravidlo, { total: 100, radky: [r(1, 99, 3)] }).count, 3);
  eq('R4: celá kategorie místo jednotlivých položek', spocitejRazitka(pravidlo, { total: 100, radky: [r(2, 10, 2), r(5, 10, 1)] }).count, 3);
  eq('R4: vyloučená položka v kategorii razítko nedá', spocitejRazitka(pravidlo, { total: 100, radky: [r(3, 10, 2)] }).count, 0);
  eq('R4: vyloučená kategorie přebíjí vybranou položku', spocitejRazitka(pravidlo, { total: 100, radky: [r(1, 20, 2)] }).count, 0);
  eq('R4: položka mimo vybrané nic nedá', spocitejRazitka(pravidlo, { total: 100, radky: [r(7, 77, 4), r(null, null, 2)] }).count, 0);
  eq('R4: nejvýš jedno razítko z účtenky', spocitejRazitka({ ...pravidlo, one_per_order: true }, { total: 100, radky: [r(1, 10, 5)] }).count, 1);
  eq('R4: jeVyloucen', [jeVyloucen(pravidlo, r(3, 1)), jeVyloucen(pravidlo, r(9, 20)), jeVyloucen(pravidlo, r(9, 9))], [true, true, false]);
  const utrata: PravidloZaPolozky = { ...pravidlo, rule_type: 'min_value', min_value: 300, min_value_multiple: true };
  eq('útrata: za každých 300 jedno razítko', spocitejRazitka(utrata, { total: 650, radky: [] }).count, 2);
  eq('útrata: pod hranicí nic', spocitejRazitka(utrata, { total: 299, radky: [] }).count, 0);
  eq('útrata bez násobků: vždy jedno', spocitejRazitka({ ...utrata, min_value_multiple: false }, { total: 1000, radky: [] }).count, 1);
  const bezVyl = spocitejRazitka(utrata, { total: 650, radky: [r(3, 1, 1, 400)] });
  eq('R4: vyloučená položka se z útraty odečte (cena z pokladny)', [bezVyl.utrata, bezVyl.count], [250, 0]);
  const bezCeny = spocitejRazitka(utrata, { total: 650, radky: [r(3, 1, 1, null)] });
  eq('R4: bez ceny se útrata nesnižuje, ale ví se o tom', [bezCeny.utrata, bezCeny.bezCeny], [650, true]);

  // ---- R5 kombinovatelnost ----
  const hit = (id: number, count: number, combinable = true) => ({ c: { id, combinable }, count });
  eq('R5: kombinovatelné kampaně se sčítají', vyberKampane([hit(1, 1), hit(2, 2)]).vybrane.map(x => x.c.id), [1, 2]);
  const exkl = vyberKampane([hit(1, 1), hit(2, 3, false), hit(3, 1, false)]);
  eq('R5: nekombinovatelná si účtenku bere sama (první podle pořadí)', [exkl.vybrane.map(x => x.c.id), exkl.vynechane.map(x => x.c.id)], [[2], [1, 3]]);
  eq('R5: kampaň bez zásahu se neúčastní', vyberKampane([hit(1, 0, false), hit(2, 1)]).vybrane.map(x => x.c.id), [2]);

  // ---- R13 validace jako u POST ----
  const dobra = { name: 'Dýmka', ruleType: 'products', stampItems: [{ itemId: 5 }] };
  eq('R13: products bez položek i kategorií je chyba', overKampan(polePole({ name: 'X', ruleType: 'products' })), 'Vyber položky nebo kategorie, za které se razítko připisuje.');
  eq('R13: products jen s kategorií je v pořádku', overKampan(polePole({ name: 'X', ruleType: 'products', stampSections: [{ sectionId: 3 }] })), null);
  eq('R13: products s položkou je v pořádku', overKampan(polePole(dobra)), null);
  eq('R13: min_value bez částky je chyba', overKampan(polePole({ name: 'X', ruleType: 'min_value' })), 'Zadej minimální útratu pro razítko.');
  eq('R13: min_value se zápornou částkou je chyba', overKampan(polePole({ name: 'X', ruleType: 'min_value', minValue: -5 })), 'Zadej minimální útratu pro razítko.');
  eq('R13: prázdný název je chyba', overKampan(polePole({ ruleType: 'visit' })), 'Zadej název kampaně.');
  eq('R13: konec před začátkem je chyba', overKampan(polePole({ name: 'X', validSince: '2026-10-10', validTill: '2026-10-01' })), 'Konec platnosti je dřív než začátek.');
  ok('R13: půlka hodin je chyba', !!overKampan(polePole({ name: 'X', hourFrom: '10:00' }), { hourFrom: '10:00' }));
  ok('R13: špatný formát hodin je chyba', !!overKampan(polePole({ name: 'X', hourFrom: '25:00', hourTill: '10:00' }), { hourFrom: '25:00', hourTill: '10:00' }));
  eq('R13: hodiny se ukládají jako HH:MM', [polePole({ name: 'X', hourFrom: '8:00', hourTill: '9:30' }).hour_from, polePole({ name: 'X', hourFrom: '8:00', hourTill: '9:30' }).hour_till], ['08:00', '09:30']);
  eq('R13: čísla se ořežou do rozsahu', [polePole({ name: 'X', requiredStamps: 999 }).required_stamps, polePole({ name: 'X', requiredStamps: 0 }).required_stamps, polePole({ name: 'X', dailyCap: 999 }).daily_cap, polePole({ name: 'X', maxCompletions: -4 }).max_completions], [50, 1, 50, 0]);
  eq('R13: koncept je vždy i vypnutý (starý kód zná jen active)', [polePole({ name: 'X', draft: true, active: true }).active, polePole({ name: 'X', draft: true }).draft], [false, true]);
  eq('R11: barva karty jen jako #rrggbb', [polePole({ name: 'X', cardColor: '#AABBCC' }).card_color, polePole({ name: 'X', cardColor: 'red' }).card_color], ['#aabbcc', null]);
  eq('R11: ikona jen ze seznamu', [polePole({ name: 'X', cardIcon: 'star' }).card_icon, polePole({ name: 'X', cardIcon: '<script>' }).card_icon], ['star', null]);
  eq('R11: obrázek jen https nebo vlastní /api/client/img', [polePole({ name: 'X', cardImage: 'https://a.cz/x.png' }).card_image, polePole({ name: 'X', cardImage: '/api/client/img/12' }).card_image, polePole({ name: 'X', cardImage: 'javascript:alert(1)' }).card_image, polePole({ name: 'X', cardImage: 'http://a.cz/x.png' }).card_image], ['https://a.cz/x.png', '/api/client/img/12', null, null]);
  ok('R11: nepovolený obrázek hlásí chybu', !!overKampan(polePole({ name: 'X', cardImage: 'http://a.cz/x.png' }), { cardImage: 'http://a.cz/x.png' }));
  eq('R11: podmínky se ořežou na 600 znaků', polePole({ name: 'X', conditions: 'a'.repeat(900) }).conditions.length, 600);
  eq('R4: kategorie z formuláře se čistí', polePole({ name: 'X', stampSections: [{ sectionId: '7' }, { sectionId: -1 }, {}] }).stamp_sections, [{ sectionId: 7 }]);

  // ---- R14 a R11: karta očima hosta ----
  const hostC = { ...K, id: 1, name: 'Dýmka', description: '', conditions: 'Neplatí s jinými slevami.', reward_title: 'Dýmka zdarma', rule_type: 'visit' as const, card_color: '#112233', card_icon: 'star', card_image: null, valid_till: null, days_to_finish: 30 };
  const stK = stavKartyHosta(hostC, { stamps: 3, completed: 0, started_at: dnuZpet(10), last_completed_at: null }, NOW, '2026-10-02');
  eq('host: v lhůtě je vidět, do kdy dosbírat', [stK.vyprsela, stK.stamps, stK.dosbiratDo, stK.zbyvaDni], [false, 3, '2026-10-22', 20]);
  const stExp = stavKartyHosta(hostC, { stamps: 3, completed: 0, started_at: dnuZpet(40), last_completed_at: null }, NOW, '2026-10-02');
  eq('host: po vypršení vidí nulu a kolik propadlo', [stExp.vyprsela, stExp.stamps, stExp.vyprselaRazitek], [true, 0, 3]);
  eq('host: cooldown ukáže, od kdy jde další karta', stavKartyHosta({ ...hostC, repeat_mode: 'one_month' }, { stamps: 0, completed: 1, started_at: null, last_completed_at: posl }, NOW, '2026-10-02').dalsiKartaOd, '2026-11-01');
  eq('host: jednorázová karta po dokončení = hotovo navždy', stavKartyHosta({ ...hostC, repeat_mode: 'one_time' }, { stamps: 0, completed: 1, started_at: null, last_completed_at: posl }, NOW, '2026-10-02').hotovoNavzdy, true);
  const kh = kartaProHosta({ ...hostC, valid_days: [1, 2], hour_from: '14:00', hour_till: '18:00' }, null, ['Dýmka malá'], NOW, '2026-10-02');
  eq('R11: karta pro hosta nese podmínky, barvu, ikonu, položky odměny a okno', [kh.conditions, kh.color, kh.icon, kh.rewardItems, kh.okno], ['Neplatí s jinými slevami.', '#112233', 'star', ['Dýmka malá'], { days: [1, 2], from: '14:00', till: '18:00' }]);
  eq('R11: bez okna je okno null', kartaProHosta(hostC, null, [], NOW, '2026-10-02').okno, null);

  // ---- R10 export CSV ----
  const csv = razitkaCsv([{ host: '=HYPERLINK("x")', email: 'a@b.cz', razitka: 3, dokonceno: 2, zacatek: '1. 10. 2026', posledniRazitko: '', posledniDokonceni: '', vypraselo: 1 }]);
  ok('R10: CSV začíná BOM a hlavičkou se středníky', csv.startsWith('﻿host;e-mail;razítek na kartě'));
  ok('R10: CSV chrání buňky proti vzorcům', !/^=HYPERLINK/m.test(csv.split('\r\n')[1]));
  eq('R10: CSV má hlavičku a jeden řádek', csv.trim().split('\r\n').length, 2);
  ok('R10: CSV deníku má hlavičku', udalostiCsv([]).includes('datum;host;změna razítek'));
  eq('R8: průměr dní na dokončení', [prumerDni([2, 3, 4]), prumerDni([]), prumerDni([1, 2])], [3, null, 1.5]);
  eq('czDatum', czDatum('2026-11-01'), '1. 11. 2026');

  // ---- S9 idempotenční klíč ----
  eq('S9: klíč se čistí (kratší než 8 znaků ne)', ocistiKlic('abc'), null);
  eq('S9: platný klíč projde', ocistiKlic('0f8b2c1e-aaaa-4bbb-8ccc-123456789abc'), '0f8b2c1e-aaaa-4bbb-8ccc-123456789abc');
  eq('S9: nepovolené znaky klíč zruší', ocistiKlic('abcdefgh ijkl; DROP'), null);
  eq('S9: příliš dlouhý klíč se zahodí', ocistiKlic('a'.repeat(81)), null);
  ok('S9: nový klíč je platný', ocistiKlic(novyKlic()) !== null);
  ok('S9: dva nové klíče se liší', novyKlic() !== novyKlic());

  // ---- Zdroje: souběhy a integrita ----
  const stamps = zdroj('lib/stamps.ts');
  const scan = zdroj('app/api/client/staff/scan/route.ts');
  const admin = zdroj('app/api/client/admin/stamps/route.ts');
  const init = zdroj('app/api/init/route.ts');
  const schema = zdroj('lib/stampsSchema.ts');

  ok('S1: addStamps zapisuje optimisticky (podmínka na ver) a při souběhu opakuje', /AND ver = \$\{cur\.ver\}/.test(stamps) && /for \(let pokus = 0; pokus < 6/.test(stamps));
  ok('S1: addStamps nemá starý dvojkrokový zápis (UPDATE bez podmínky na ver)', !/UPDATE client_stamp_progress SET\s+stamps = \$\{rest\}/.test(stamps));
  ok('S1: při pádu po zápisu se průběh i vydané kódy vrací', /DELETE FROM client_coupon_claims WHERE id = ANY\(\$\{claimIds\}\) AND redeemed_at IS NULL/.test(stamps) && /ver = \$\{novaVer\}/.test(stamps));
  ok('S2: vyzvednutí kuponu: pád vložení vrací body', /catch \{\s*\n\s*if \(cost > 0\) await award/.test(zdroj('app/api/client/b/[slug]/coupons/[id]/claim/route.ts')));
  ok('S3: spendPoints je před vložením a kompenzace je i při výjimce', /spendPoints\(/.test(zdroj('app/api/client/b/[slug]/coupons/[id]/claim/route.ts')) && /Kupon se nepodařilo vydat, body ti zůstaly/.test(zdroj('app/api/client/b/[slug]/coupons/[id]/claim/route.ts')));
  const promo = zdroj('app/api/client/b/[slug]/promo/route.ts');
  ok('S4: počítadlo promo kódu je atomické (limit přímo v UPDATE)', /UPDATE client_promos SET uses = uses \+ 1\s+WHERE id = \$\{promo\.id\} AND \(max_uses IS NULL OR max_uses = 0 OR uses < max_uses\) RETURNING uses/.test(promo));
  ok('S4: při pádu po zabrání kódu se použití i počítadlo vrací', /GREATEST\(0, uses - 1\)/.test(promo) && /DELETE FROM client_promo_uses/.test(promo));
  ok('S5: razítko u kasy se opírá o atomický zámek ve stampVisit, ne o předčasnou kontrolu', /r\.already/.test(scan) && !/before\.stampedToday/.test(scan));
  ok('S6: pád po zabrání účtenky uvolní zámek client_bill_awards', /catch \(e\) \{\s*\n\s*await sql`DELETE FROM client_bill_awards/.test(scan));
  ok('S7: ruční částka u kasy spouští kampaně „za útratu“', /action === 'points'[\s\S]*applyBillToCampaigns\([^\n]*`ruc:\$\{ref\}`/.test(scan));
  ok('S7: ruční položky umí server (action items a items u účtenky)', /action === 'items'/.test(scan) && /rucniPolozky\(b\.items\)/.test(scan));
  ok('S8: účtenka zapíše návštěvu (stampVisit nebo zapisNavstevuZUctenky)', /stampVisit\(u\.team_id, c\.id, p, `bill:\$\{billId\}`/.test(scan) && /zapisNavstevuZUctenky/.test(scan));
  ok('S9: POST u kasy běží přes sIdempotenci', /return sIdempotenci\(u\.team_id, req, b,/.test(scan));
  ok('S9: idempotence uvolní klíč po chybě a vrací uloženou odpověď', /opakovani: true/.test(zdroj('lib/idempotence.ts')) && /DELETE FROM client_kasa_idem/.test(zdroj('lib/idempotence.ts')));
  const client = zdroj('lib/client.ts');
  ok('S10: se zapnutými kampaněmi se staré počítadlo razítek nezvyšuje', /const prirustek = kampane \? 0 : 1 \+ navic/.test(client) && /const target = kampane \? 0/.test(client));
  ok('S10: jednoduché razítko vypínají jen kampaně „za návštěvu“, ne kampaně za položky', /rule_type = 'visit' LIMIT 1/.test(stamps) && /Žádná kartička „za návštěvu“ teď neběží/.test(scan));
  ok('S10: peněženka, seznam členů i detail čtou razítka z kampaní', /maKampane/.test(zdroj('lib/walletDb.ts')) && /maKampane/.test(zdroj('app/api/client/admin/customers/route.ts')) && /kampane\.length \? kampane\.reduce/.test(zdroj('app/api/client/admin/loyalty/route.ts')));

  // R9, R7, R14 na straně serveru
  ok('R9: storno poslední akce (kasa i admin) vrací průběh ze snímku a ruší neuplatněné odměny', /stornujPosledni/.test(scan) && /stamps_before/.test(stamps) && /redeemed_at IS NOT NULL/.test(stamps));
  ok('R9: ruční připsání a odebrání má povinný důvod a oprávnění upravit_body', /action === 'manual' \|\| action === 'storno' \? 'vernost\.upravit_body'/.test(admin) && /Napiš důvod/.test(admin));
  ok('R9: hromadně přes skupinu nebo výběr, strop 200', /MAX_HROMADNE = 200/.test(admin) && /groupId/.test(admin) && /customerIds/.test(admin));
  ok('R7: duplikát vzniká jako koncept a pořadí se mění jedním příkazem', /draft: true/.test(admin) && /unnest\(\$\{poradi\}::int\[\]\)/.test(admin));
  ok('R14: smazání s nasbíranými razítky bez force server odmítne (409, needsForce)', /needsForce: true/.test(admin) && /status: 409/.test(admin));
  ok('R14: archiv nechává postup a vypíná kampaň', /archived_at = NOW\(\), active = FALSE/.test(admin));
  ok('R14: odměny nevytvářejí řádek kuponu na každé dokončení (jeden na kampaň a lhůtu)', /campaign_id = \$\{c\.id\} AND kind = 'stamps'/.test(stamps));
  ok('R12: položky odměny jdou do popisu kuponu', /Odměna: \$\{jmena\.join/.test(stamps));
  ok('R10: export je v admin routě a chráněn oprávněním kampaně', /export'/.test(admin) && /Export nese e-maily členů/.test(admin));
  ok('R8: statistiky mají odměny, dobu sbírání, top hosty, výnosnost a dny', /statistikyKampane/.test(admin) && /prumernaDobaDni/.test(stamps) && /topHoste/.test(stamps) && /poDnech/.test(stamps) && /utrataZUctu/.test(stamps));
  ok('R3: okno platnosti se kontroluje při návštěvě i účtence', /platiTed\(c\)/.test(stamps));

  // Schéma: init a lazy kopie musí být totéž, a tabulky musí znát smazání účtu
  const sloupceInit = Array.from(init.matchAll(/ALTER TABLE (client_stamp_campaigns|client_stamp_progress|client_coupons) ADD COLUMN IF NOT EXISTS (\w+)/g)).map(m => `${m[1]}.${m[2]}`).filter(x => !/^client_coupons\.(?!campaign_id)/.test(x));
  const sloupceLib: string[] = [];
  for (const m of schema.matchAll(/ALTER TABLE (client_stamp_campaigns|client_stamp_progress|client_coupons)\s+((?:ADD COLUMN IF NOT EXISTS [^`]*?))`/g)) {
    for (const c of m[2].matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)) sloupceLib.push(`${m[1]}.${c[1]}`);
  }
  const nove = sloupceInit.filter(x => /^(client_stamp_campaigns\.(max_completions|daily_cap|valid_days|hour_from|hour_till|excluded_items|stamp_sections|excluded_sections|combinable|draft|archived_at|card_color|card_icon|card_image)|client_stamp_progress\.(ver|expired_stamps|expired_at)|client_coupons\.campaign_id)$/.test(x));
  eq('schéma: každý nový sloupec je v init i v lazy zajištění', nove.filter(x => !sloupceLib.includes(x)), []);
  eq('schéma: nových sloupců je 18', nove.length, 18);
  ok('schéma: tabulky deníku a idempotence jsou v init i lazy', /CREATE TABLE IF NOT EXISTS client_stamp_events/.test(init) && /CREATE TABLE IF NOT EXISTS client_stamp_events/.test(schema) && /CREATE TABLE IF NOT EXISTS client_kasa_idem/.test(init) && /CREATE TABLE IF NOT EXISTS client_kasa_idem/.test(schema));
  const smazani = zdroj('lib/smazaniUctu.ts');
  ok('smazání účtu zná nové tabulky', /client_stamp_events: 'smazat'/.test(smazani) && /'client_stamp_events', 'client_kasa_idem'/.test(smazani));
  ok('audit: nové akce mají popisek', /'client\.stamps':/.test(zdroj('lib/auditPopisky.ts')) && /'client\.stamps\.manual':/.test(zdroj('lib/auditPopisky.ts')));

  // UI čtečky: klíč akce, ruční položky, expiredCount, storno
  const card = zdroj('components/client/CardScan.tsx');
  const kasa = zdroj('components/client/CteckaKasa.tsx');
  const ui = zdroj('components/client/loyalty/RazitkaKasa.tsx');
  ok('S9: Kartička hosta posílá Idempotency-Key', /hlavickyAkce\(klic\)/.test(card) && /Idempotency-Key/.test(ui));
  ok('S9: Čtečka u kasy posílá Idempotency-Key', /hlavickyAkce\(klic\)/.test(kasa));
  ok('čtečky ukazují expiredCount a lost', /expiredCount: x\.expiredCount/.test(card) && /expiredCount: x\.expiredCount/.test(kasa) && /<UpozorneniRazitek/.test(card) && /<UpozorneniRazitek/.test(kasa));
  ok('čtečky umí ruční položky a storno', /<RucniPolozky/.test(card) && /<RucniPolozky/.test(kasa) && /<StornoRazitek/.test(card) && /<StornoRazitek/.test(kasa));
  ok('čtečky: zablokovaná (už připsaná) účtenka nejde vybrat', /bl\.awarded/.test(card) && /bl\.awarded/.test(kasa));
  ok('klíč akce zůstává po výpadku sítě a uvolní se po odmítnutí', /pochybe\(status: number \| null\) \{ if \(status != null && status < 500\)/.test(ui));
  ok('správa: smazání jde přes archiv a potvrzení, ne přímo', /Radši archivovat/.test(zdroj('components/client/loyalty/StampsAdmin.tsx')) && /force=1/.test(zdroj('components/client/loyalty/StampsAdmin.tsx')));
  ok('správa: Věrnost používá novou obrazovku razítek', /<StampsAdmin toast=\{toast\}/.test(zdroj('components/client/LoyaltyTabs.tsx')));
  ok('host: stránka podniku i Moje používají kartu pohledem hosta', /<KartaRazitek karta=\{cp\}/.test(zdroj('components/client/BusinessPage.tsx')) && /endedCampaigns/.test(zdroj('components/client/BusinessPage.tsx')));
}
