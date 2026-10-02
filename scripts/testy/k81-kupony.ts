// Kolo 81 — kupony a promo kódy v plné síle (sekce K kontrolního seznamu).
// Čistá logika bez databáze: okno platnosti i přes půlnoc, stav kuponu, hodnoty
// a kontrola z editoru, historie změn, kontrola uplatnění (útrata, 18+), souhrn
// s ROI, CSV, dávka promo kódů, náhled pohledem hosta. Nad zdrojáky pojistky, že
// souběh a kompenzace zůstávají (atomický počítadlo, vydejKod, ON CONFLICT).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  windowOk, presPulnoc, pragueDow, cileniBlocker, urovenBlocker, stavKuponu, jeVeVerejne, hodnotyKuponu, kontrolaKuponu, popisZmen,
  kontrolaUplatneni, castkaZTela, odhadSlevy, souhrnUplatneni, kuponyCsv, claimyCsv, promoCsv, promoPouzitiCsv, promoBlocker, stavPromo,
  davkaKodu, cistyKod, hodnotyPromo, kontrolaPromo, nahledKuponuHosta, nahledPromo, vetaORozeslani, shapeCoupon,
} from '../../lib/kuponyPravidla.ts';
import { benefitLabel, conditionBadges, vyloucenoText } from '../../lib/kuponyPopisky.ts';
import { AUDIT_POPISKY } from '../../lib/auditPopisky.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- K9: noční okno hodin (22–02) ----
  const noc = { hour_from: '22:00', hour_till: '02:00' };
  ok('22–02 je přes půlnoc', presPulnoc(noc));
  ok('9–17 není přes půlnoc', !presPulnoc({ hour_from: '09:00', hour_till: '17:00' }));
  eq('noční okno: 23:30 platí', windowOk(noc, { today: '2026-10-02', hm: '23:30' }), null);
  eq('noční okno: 01:00 platí', windowOk(noc, { today: '2026-10-03', hm: '01:00' }), null);
  eq('noční okno: 02:00 ještě platí', windowOk(noc, { today: '2026-10-03', hm: '02:00' }), null);
  eq('noční okno: poledne ne', windowOk(noc, { today: '2026-10-02', hm: '12:00' }), 'Kupon platí jen 22:00–02:00.');
  eq('noční okno: 03:00 ne', windowOk(noc, { today: '2026-10-03', hm: '03:00' }), 'Kupon platí jen 22:00–02:00.');
  // Pátek večer (2026-10-02 je pátek): po půlnoci v sobotu se den počítá ještě k pátku.
  const patek = { ...noc, days_of_week: [5] };
  eq('pátek 23:00 platí', windowOk(patek, { today: '2026-10-02', hm: '23:00' }), null);
  eq('sobota 01:00 platí (okno začalo v pátek)', windowOk(patek, { today: '2026-10-03', hm: '01:00' }), null);
  eq('sobota 23:00 ne (sobota není vybraná)', windowOk(patek, { today: '2026-10-03', hm: '23:00' }), 'Dnes kupon neplatí.');
  eq('pátek 01:00 ne (okno začalo ve čtvrtek)', windowOk(patek, { today: '2026-10-02', hm: '01:00' }), 'Včerejší večer kupon neplatil.');
  eq('běžné okno 9–17 uvnitř', windowOk({ hour_from: '09:00', hour_till: '17:00' }, { today: '2026-10-02', hm: '12:00' }), null);
  eq('běžné okno 9–17 mimo', windowOk({ hour_from: '09:00', hour_till: '17:00' }, { today: '2026-10-02', hm: '18:00' }), 'Kupon platí jen 09:00–17:00.');
  eq('platí až od', windowOk({ valid_since: '2026-12-01' }, { today: '2026-10-02', hm: '12:00' }), 'Platí až od 2026-12-01.');
  eq('už neplatí', windowOk({ valid_until: '2026-09-30' }, { today: '2026-10-02', hm: '12:00' }), 'Kupon už neplatí.');
  eq('den v týdnu: pátek', pragueDow('2026-10-02'), 5);
  eq('den v týdnu: neděle', pragueDow('2026-10-04'), 7);

  // ---- Kontrola hodnot z editoru ----
  const zaklad = { title: 'Káva', benefitKind: 'percent', percentOff: 10 };
  eq('hodnoty: výchozí stav je živý', hodnotyKuponu(zaklad).status, 'live');
  eq('hodnoty: koncept', hodnotyKuponu({ ...zaklad, status: 'draft' }).status, 'draft');
  eq('hodnoty: cizí stav = živý', hodnotyKuponu({ ...zaklad, status: 'hack' }).status, 'live');
  eq('hodnoty: limit kusů', hodnotyKuponu({ ...zaklad, totalLimit: '50' }).total_limit, 50);
  eq('hodnoty: prázdný limit = bez limitu', hodnotyKuponu({ ...zaklad, totalLimit: '' }).total_limit, null);
  eq('hodnoty: záporný limit = bez limitu', hodnotyKuponu({ ...zaklad, dailyLimit: -3 }).daily_limit, null);
  eq('hodnoty: položka nabídky', hodnotyKuponu({ ...zaklad, menuItemId: 12 }).menu_item_id, 12);
  eq('hodnoty: vyloučené položky bez duplicit', hodnotyKuponu({ ...zaklad, excludedItems: [3, 3, 4, 'x', -1] }).excluded_items, [3, 4]);
  eq('hodnoty: vyloučené kategorie bez duplicit a prázdných', hodnotyKuponu({ ...zaklad, excludedCategories: ['Víno', ' Víno ', '', 'Pivo'] }).excluded_categories, ['Víno', 'Pivo']);
  eq('hodnoty: X+Y strukturovaně', (() => { const h = hodnotyKuponu({ title: 'Čaj', benefitKind: 'xy', xyBuy: '2', xyFree: '1' }); return [h.xy_buy, h.xy_free]; })(), [2, 1]);
  eq('hodnoty: X+Y bez X je chyba', kontrolaKuponu(hodnotyKuponu({ title: 'Čaj', benefitKind: 'xy' })), 'Zadej, kolik kusů host kupuje (X z X+Y).');
  eq('kontrola: bez názvu', kontrolaKuponu(hodnotyKuponu({ benefitKind: 'text' })), 'Kupon potřebuje název.');
  eq('kontrola: procenta bez hodnoty', kontrolaKuponu(hodnotyKuponu({ title: 'A', benefitKind: 'percent' })), 'Zadej, kolik procent slevy kupon dává.');
  eq('kontrola: noční okno je v pořádku', kontrolaKuponu(hodnotyKuponu({ ...zaklad, hourFrom: '22:00', hourTill: '02:00' })), null);
  eq('kontrola: stejné hodiny jsou chyba', kontrolaKuponu(hodnotyKuponu({ ...zaklad, hourFrom: '10:00', hourTill: '10:00' })), 'Hodiny „od" a „do" jsou stejné. Pro celý den je nech prázdné.');
  eq('kontrola: jen jedna hodina je chyba', kontrolaKuponu(hodnotyKuponu({ ...zaklad, hourFrom: '10:00' })), 'Vyplň hodiny „od" i „do", nebo obě nech prázdné.');
  eq('kontrola: platnost od po do', kontrolaKuponu(hodnotyKuponu({ ...zaklad, validSince: '2026-12-01', validUntil: '2026-11-01' })), 'Kupon nemůže platit „do" dřív než „od".');
  eq('kontrola: položka nemůže být vyloučená', kontrolaKuponu(hodnotyKuponu({ ...zaklad, menuItemId: 5, excludedItems: [5] })), 'Položka, na kterou kupon platí, nemůže být zároveň vyloučená.');

  // ---- K4: stav kuponu (koncept / naplánováno / archiv) ----
  const dnes = '2026-10-02';
  eq('stav: aktivní', stavKuponu({ active: true, status: 'live' }, dnes), 'aktivni');
  eq('stav: koncept', stavKuponu({ active: true, status: 'draft' }, dnes), 'koncept');
  eq('stav: archiv má přednost', stavKuponu({ active: true, status: 'archived', valid_until: '2020-01-01' }, dnes), 'archiv');
  eq('stav: naplánováno', stavKuponu({ active: true, status: 'live', valid_since: '2026-11-01' }, dnes), 'naplanovano');
  eq('stav: prošlý', stavKuponu({ active: true, status: 'live', valid_until: '2026-09-01' }, dnes), 'prosly');
  eq('stav: pozastaveno', stavKuponu({ active: false, status: 'live' }, dnes), 'pozastaveno');
  eq('stav: vyčerpáno', stavKuponu({ active: true, status: 'live', total_limit: 5, issued: 5 }, dnes), 'vycerpano');
  eq('stav: zbývá kus', stavKuponu({ active: true, status: 'live', total_limit: 5, issued: 4 }, dnes), 'aktivni');
  eq('stav: starý řádek bez stavu je aktivní', stavKuponu({ active: true }, dnes), 'aktivni');
  ok('veřejně: živý a zapnutý', jeVeVerejne({ status: 'live', active: true }));
  ok('veřejně: starý řádek bez stavu', jeVeVerejne({ active: true }));
  ok('veřejně ne: koncept', !jeVeVerejne({ status: 'draft', active: true }));
  ok('veřejně ne: archiv', !jeVeVerejne({ status: 'archived', active: true }));
  ok('veřejně ne: vypnutý', !jeVeVerejne({ status: 'live', active: false }));

  // ---- K4: historie změn ----
  eq('historie: beze změny je prázdná', popisZmen({ title: 'A', cost_points: 100, active: true }, { title: 'A', cost_points: 100, active: true }), []);
  eq('historie: cena a název', popisZmen({ title: 'A', cost_points: 100 }, { title: 'B', cost_points: 150 }), ['název: A → B', 'cena: 100 b. → 150 b.']);
  eq('historie: vypnutí', popisZmen({ active: true }, { active: false }), ['zapnutý: ano → ne']);
  eq('historie: archivace', popisZmen({ status: 'live' }, { status: 'archived' }), ['stav: živý → archiv']);
  eq('historie: pole, které se neposílalo, se nepíše', popisZmen({ title: 'A', cost_points: 5 }, { title: 'A' }), []);
  eq('historie: seznam úrovní', popisZmen({ target_tiers: [] }, { target_tiers: ['gold'] }), ['úrovně: všem → Zlatý host']);
  eq('historie: limit kusů z prázdna', popisZmen({ total_limit: null }, { total_limit: 20 }), ['limit kusů: — → 20']);

  // ---- K8: kontrola uplatnění u kasy ----
  const minKupon = { min_order_value: 200 };
  eq('uplatnění: min. útrata bez částky', kontrolaUplatneni(minKupon, { amount: null, vekOvereny: false, birthday: null }), { ok: false, kod: 'castka', zprava: 'Zadej útratu hosta. Kupon platí od 200 Kč.' });
  eq('uplatnění: nízká útrata', kontrolaUplatneni(minKupon, { amount: 150, vekOvereny: false, birthday: null }), { ok: false, kod: 'min', zprava: 'Útrata 150 Kč nestačí, kupon platí od 200 Kč.' });
  eq('uplatnění: útrata přesně na hranici', kontrolaUplatneni(minKupon, { amount: 200, vekOvereny: false, birthday: null }), { ok: true });
  eq('uplatnění: eurová měna ve zprávě', (kontrolaUplatneni({ min_order_value: 20 }, { amount: null, vekOvereny: false, birthday: null }, n => `${n} €`) as any).zprava, 'Zadej útratu hosta. Kupon platí od 20 €.');
  eq('uplatnění: bez minima nic nechce', kontrolaUplatneni({}, { amount: null, vekOvereny: false, birthday: null }), { ok: true });
  const dosp = { adult_only: true };
  eq('18+: nezletilý podle data narození', (kontrolaUplatneni(dosp, { amount: null, vekOvereny: true, birthday: '2015-01-01', today: dnes }) as any).kod, 'nezletily');
  eq('18+: dospělý podle data narození', kontrolaUplatneni(dosp, { amount: null, vekOvereny: false, birthday: '1990-01-01', today: dnes }), { ok: true });
  eq('18+: bez data narození chce potvrzení', (kontrolaUplatneni(dosp, { amount: null, vekOvereny: false, birthday: null, today: dnes }) as any).kod, 'vek');
  eq('18+: bez data narození s potvrzením projde', kontrolaUplatneni(dosp, { amount: null, vekOvereny: true, birthday: null, today: dnes }), { ok: true });
  eq('18+: osmnácté narozeniny dnes projdou', kontrolaUplatneni(dosp, { amount: null, vekOvereny: false, birthday: '2008-10-02', today: dnes }), { ok: true });
  eq('18+: den před osmnáctinami neprojde', (kontrolaUplatneni(dosp, { amount: null, vekOvereny: false, birthday: '2008-10-03', today: dnes }) as any).kod, 'nezletily');
  eq('částka z těla: číslo', castkaZTela('350'), 350);
  eq('částka z těla: čárka a mezera', castkaZTela('1 250,4'), 1250);
  eq('částka z těla: prázdná = nezadáno', castkaZTela(''), null);
  eq('částka z těla: nesmysl = nezadáno', castkaZTela('abc'), null);
  eq('částka z těla: záporná = nezadáno', castkaZTela(-5), null);
  eq('částka z těla: nula je platná', castkaZTela(0), 0);
  eq('sleva: procenta', odhadSlevy({ benefit_kind: 'percent', percent_off: 15 }, 400), 60);
  eq('sleva: pevná částka nepřesáhne útratu', odhadSlevy({ benefit_kind: 'amount', amount_off: 100 }, 80), 80);
  eq('sleva: X+Y nelze spočítat', odhadSlevy({ benefit_kind: 'xy', xy_buy: 2 }, 400), 0);
  eq('sleva: bez útraty nula', odhadSlevy({ benefit_kind: 'percent', percent_off: 15 }, null), 0);

  // ---- K5: souhrn uplatnění s ROI ----
  const radky = [
    { claimed_at: '2026-09-01 10:00:00', redeemed_at: '2026-09-03 10:00:00', redeemed_amount: 400, valid_until: '2026-12-31', source: 'points', staff_name: 'Eva', benefit_kind: 'percent', percent_off: 10 },
    { claimed_at: '2026-09-01 10:00:00', redeemed_at: '2026-09-02 10:00:00', redeemed_amount: 600, valid_until: '2026-12-31', source: 'promo', staff_name: 'Eva', benefit_kind: 'percent', percent_off: 10 },
    { claimed_at: '2026-09-01 10:00:00', redeemed_at: null, valid_until: '2026-09-15', source: 'send' },
    { claimed_at: '2026-09-01 10:00:00', redeemed_at: null, valid_until: '2026-12-31', source: 'welcome' },
    { claimed_at: '2026-09-01 10:00:00', redeemed_at: '2026-09-01 12:00:00', redeemed_amount: null, valid_until: null, source: null, staff_name: null },
  ];
  const sh = souhrnUplatneni(radky, dnes);
  eq('souhrn: vydáno', sh.vydano, 5);
  eq('souhrn: uplatněno', sh.uplatneno, 3);
  eq('souhrn: propadlo', sh.propadlo, 1);
  eq('souhrn: čeká', sh.otevrene, 1);
  eq('souhrn: míra uplatnění', sh.miraUplatneni, 60);
  eq('souhrn: útrata a počet s útratou', [sh.utrata, sh.sUtratou, sh.prumUtrata], [1000, 2, 500]);
  eq('souhrn: odhad slevy a ROI', [sh.sleva, sh.roi], [100, 10]);
  eq('souhrn: průměrná doba do uplatnění ve dnech', sh.prumDnuDoUplatneni, 1);
  eq('souhrn: obsluha seřazená', sh.obsluha, [{ jmeno: 'Eva', pocet: 2 }, { jmeno: 'Neznámá obsluha', pocet: 1 }]);
  eq('souhrn: zdroje', sh.zdroje.map(z => z.id).sort(), ['points', 'promo', 'send', 'unknown', 'welcome']);
  eq('souhrn: prázdný seznam', souhrnUplatneni([], dnes).miraUplatneni, null);
  eq('souhrn: bez spočítatelné slevy není ROI', souhrnUplatneni([{ claimed_at: '2026-09-01 10:00:00', redeemed_at: '2026-09-02 10:00:00', redeemed_amount: 300, benefit_kind: 'xy', source: 'points' }], dnes).roi, null);

  // ---- K6: CSV exporty ----
  const csvKupony = kuponyCsv([{ title: '=SUM(A1)', benefit_kind: 'percent', percent_off: 10, cost_points: 100, active: true, status: 'live', claimed: 4, redeemed: 2, welcome: true, total_limit: 50, item_name: 'Matcha' }], dnes);
  ok('CSV kupony: BOM pro Excel', csvKupony.charCodeAt(0) === 0xFEFF);
  ok('CSV kupony: hlavička se středníky', csvKupony.includes('Název;Stav;Výhoda;Cena (body)'));
  ok('CSV kupony: vzorec je zneškodněný', csvKupony.includes("'=SUM(A1)"));
  ok('CSV kupony: stav česky', csvKupony.includes(';Aktivní;Sleva 10 % na Matcha;'));
  ok('CSV kupony: řádky končí CRLF', csvKupony.endsWith('\r\n'));
  const csvEuro = kuponyCsv([{ title: 'A', benefit_kind: 'amount', amount_off: 5, active: true, status: 'live' }], dnes, n => `${n} €`);
  ok('CSV kupony: částka v měně podniku', csvEuro.includes('Sleva 5 €'));
  const csvClaimy = claimyCsv([
    { title: 'Káva', code: 'ABC-DEF', customer_name: 'Jana; "Nováková"', claimed_at: '2026-09-01 10:00:00', redeemed_at: '2026-09-02 10:00:00', redeemed_amount: 250, staff_name: 'Eva', source: 'promo' },
    { title: 'Káva', code: 'GHJ-KLM', customer_name: 'Petr', claimed_at: '2026-08-01 10:00:00', redeemed_at: null, valid_until: '2026-08-31', source: 'send' },
  ], dnes);
  ok('CSV claimy: uvozovky ve jménu zdvojené', csvClaimy.includes('"Jana; ""Nováková"""'));
  ok('CSV claimy: uplatněno s útratou a obsluhou', csvClaimy.includes(';250;Eva;Promo kód;1;uplatněno'));
  ok('CSV claimy: propadlo', csvClaimy.includes(';Poslal podnik;;propadlo'));
  const csvPromo = promoCsv([{ code: 'JARO26', title: 'Leták', points: 50, uses: 3, max_uses: 10, valid_until: '2026-12-31', active: true, coupon_title: 'Dezert' }], dnes);
  ok('CSV promo: kód, stav a použití', csvPromo.includes('JARO26;Leták;Aktivní;50;Dezert;3;10;;2026-12-31'));
  ok('CSV použití promo kódu', promoPouzitiCsv([{ code: 'JARO26', customer_name: 'Jana', used_at: '2026-09-02 10:00:00' }]).includes('JARO26;Jana;2026-09-02'));

  // ---- K1/K10: promo kód — platnost, limity, stav ----
  eq('promo: aktivní projde', promoBlocker({ active: true, uses: 0 }, dnes), null);
  eq('promo: vypnutý', promoBlocker({ active: false }, dnes), 'Tenhle kód neplatí.');
  eq('promo: ještě neplatí', promoBlocker({ active: true, valid_since: '2026-11-01' }, dnes), 'Kód platí až od 2026-11-01.');
  eq('promo: prošel', promoBlocker({ active: true, valid_until: '2026-09-01' }, dnes), 'Tenhle kód neplatí.');
  eq('promo: vyčerpaný', promoBlocker({ active: true, uses: 10, max_uses: 10 }, dnes), 'Kód už je vyčerpaný.');
  eq('promo: bez limitu nikdy nevyčerpá', promoBlocker({ active: true, uses: 9999, max_uses: null }, dnes), null);
  eq('promo stav: naplánovaný', stavPromo({ active: true, valid_since: '2026-11-01' }, dnes), 'naplanovano');
  eq('promo stav: vyčerpaný', stavPromo({ active: true, uses: 3, max_uses: 3 }, dnes), 'vycerpano');
  eq('promo stav: prošlý má přednost před vypnutým', stavPromo({ active: false, valid_until: '2026-01-01' }, dnes), 'prosly');
  eq('kód: velká písmena a číslice', cistyKod(' jaro-26! '), 'JARO26');
  eq('kód: nejvýš 16 znaků', cistyKod('A'.repeat(40)).length, 16);
  eq('promo hodnoty: prázdný limit', hodnotyPromo({ title: 'A', points: 5, max_uses: '' }).max_uses, null);
  eq('promo hodnoty: body se ořežou', hodnotyPromo({ title: 'A', points: 99999 }).points, 10000);
  eq('promo kontrola: bez názvu', kontrolaPromo(hodnotyPromo({ points: 5 })), 'Promo kód potřebuje název.');
  eq('promo kontrola: bez body i kuponu', kontrolaPromo(hodnotyPromo({ title: 'A', points: 0 })), 'Kód musí dávat body, kupon, nebo obojí.');
  eq('promo kontrola: jen kupon stačí', kontrolaPromo(hodnotyPromo({ title: 'A', points: 0, coupon_id: 4 })), null);
  eq('promo kontrola: platnost naopak', kontrolaPromo(hodnotyPromo({ title: 'A', points: 5, valid_since: '2026-12-01', valid_until: '2026-11-01' })), 'Kód nemůže platit „do" dřív než „od".');

  // ---- K6: dávková generace promo kódů ----
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const davka = davkaKodu({ prefix: 'jaro', pocet: 50 }, new Set(), rnd);
  eq('dávka: počet', davka.length, 50);
  eq('dávka: všechny unikátní', new Set(davka).size, 50);
  ok('dávka: všechny s předponou', davka.every(k => k.startsWith('JARO')));
  ok('dávka: délka v mezích', davka.every(k => k.length >= 7 && k.length <= 16));
  ok('dávka: bez zaměnitelných znaků', davka.every(k => !/[01OI]/.test(k.slice(4))));
  const obs = new Set(davka.slice(0, 10));
  ok('dávka: nevyrábí už obsazené kódy', davkaKodu({ prefix: 'jaro', pocet: 20 }, obs, rnd).every(k => !obs.has(k)));
  eq('dávka: strop 200', davkaKodu({ prefix: 'x1', pocet: 5000 }, new Set(), rnd).length, 200);
  eq('dávka: nula kódů', davkaKodu({ prefix: 'jaro', pocet: 0 }, new Set(), rnd).length, 0);

  // ---- K7: náhled pohledem hosta ----
  const zlaty = { title: 'Dezert', benefit_kind: 'free_item', item_name: 'Cheesecake', cost_points: 80, target_tiers: ['gold'], active: true, status: 'live' };
  const okno = { today: dnes, hm: '12:00' };
  eq('náhled: výhoda s položkou', nahledKuponuHosta(zlaty, { tierId: 'gold' }, okno).benefit, 'Zdarma: Cheesecake');
  eq('náhled: zlatý host nemá překážku', nahledKuponuHosta(zlaty, { tierId: 'gold' }, okno).blocked, null);
  eq('náhled: člen vidí důvod', nahledKuponuHosta(zlaty, { tierId: 'bronze' }, okno).blocked, 'Jen pro Zlatý host.');
  eq('náhled: cena v bodech', nahledKuponuHosta(zlaty, { tierId: 'gold' }, okno).costText, '80 b.');
  eq('náhled: zdarma', nahledKuponuHosta({ ...zlaty, cost_points: 0 }, { tierId: 'gold' }, okno).costText, 'zdarma');
  eq('náhled: koncept host nevidí', nahledKuponuHosta({ ...zlaty, status: 'draft' }, { tierId: 'gold' }, okno).blocked, 'Host kupon nevidí (koncept nebo archiv).');
  eq('náhled: vypnutý host nevidí', nahledKuponuHosta({ ...zlaty, active: false }, { tierId: 'gold' }, okno).blocked, 'Host kupon nevidí (je vypnutý).');
  eq('náhled: vyčerpaný', nahledKuponuHosta({ ...zlaty, total_limit: 3, issued: 3 }, { tierId: 'gold' }, okno).blocked, 'Kupon je vyčerpaný.');
  eq('náhled: mimo hodiny', nahledKuponuHosta({ ...zlaty, hour_from: '14:00', hour_till: '16:00' }, { tierId: 'gold' }, okno).blocked, 'Kupon platí jen 14:00–16:00.');
  eq('náhled: 18+ bez data narození počítá s dospělým', nahledKuponuHosta({ ...zlaty, adult_only: true }, { tierId: 'gold' }, okno).blocked, null);
  eq('náhled: 18+ nezletilý', nahledKuponuHosta({ ...zlaty, adult_only: true }, { tierId: 'gold', birthday: '2015-05-05' }, okno).blocked, 'Kupon je jen pro plnoleté.');
  eq('náhled promo kódu: body a kupon', nahledPromo({ title: 'Leták', points: 50, coupon_title: 'Dezert' }), 'Leták: +50 bodů a kupon Dezert.');
  eq('náhled promo kódu: jen body', nahledPromo({ title: 'Leták', points: 50 }), 'Leták: +50 bodů.');
  eq('úrovně: bez cílení projde každý', urovenBlocker({ target_tiers: [] }, 'bronze'), null);
  eq('cílení: úroveň a 18+ v jednom', cileniBlocker({ target_tiers: ['gold'], adult_only: true }, { tierId: 'gold', birthday: '1990-01-01', today: dnes }), null);

  // ---- K2: položky nabídky, vyloučení, X+Y ve štítcích ----
  eq('štítek: sleva na položku', benefitLabel({ benefit_kind: 'percent', percent_off: 20, item_name: 'Matcha' }), 'Sleva 20 % na Matcha');
  eq('štítek: X+Y na položku', benefitLabel({ benefit_kind: 'xy', xy_buy: 2, xy_free: 1, item_name: 'Čaj' }), '2+1 zdarma na Čaj');
  eq('štítek: X+Y bez Y je 1+1 minimálně', benefitLabel({ benefit_kind: 'xy', xy_buy: 3 }), '3+1 zdarma');
  eq('štítek: zdarma bez položky', benefitLabel({ benefit_kind: 'free_item' }), 'Položka zdarma');
  eq('vyloučeno: kategorie a položky', vyloucenoText({ excluded_categories: ['Víno'], excluded_item_names: ['Pivo'] }), 'mimo Víno, Pivo');
  eq('vyloučeno: více než tři se zkrátí', vyloucenoText({ excluded_categories: ['A', 'B', 'C', 'D', 'E'] }), 'mimo A, B, C a 2 další');
  eq('vyloučeno: nic', vyloucenoText({}), '');
  ok('štítky podmínek nesou vyloučení', conditionBadges({ excluded_categories: ['Víno'] }).includes('mimo Víno'));
  const tvar = shapeCoupon({ id: 1, title: 'T', benefit_kind: 'xy', xy_buy: 2, xy_free: 1, menu_item_id: 9, item_name: 'Čaj', excluded_items: [4, 'x'], excluded_categories: ['Víno'], total_limit: 10, daily_limit: 2, issued: 3, status: 'draft' });
  eq('tvar: strukturované X+Y a položka', [tvar.xyBuy, tvar.xyFree, tvar.menuItemId, tvar.itemName], [2, 1, 9, 'Čaj']);
  eq('tvar: limity a stav', [tvar.totalLimit, tvar.dailyLimit, tvar.issued, tvar.status], [10, 2, 3, 'draft']);
  eq('tvar: vyloučené položky', [tvar.excludedItems, tvar.excludedCategories], [[4], ['Víno']]);
  eq('tvar: starý řádek je živý bez limitů', (() => { const t = shapeCoupon({ id: 2, title: 'S' }); return [t.status, t.totalLimit, t.menuItemId]; })(), ['live', null, null]);

  // ---- K3: věta o výsledku rozeslání ----
  eq('rozeslání: bez přeskočených', vetaORozeslani(12, { drzi: 0, cileni: 0, limit: 0, vycerpano: 0, neclen: 0 }), 'Odesláno: 12.');
  eq('rozeslání: důvody přeskočení', vetaORozeslani(10, { drzi: 2, cileni: 1, limit: 0, vycerpano: 0, neclen: 0 }), 'Odesláno: 10. Přeskočeno: 2 už kupon drží, 1 mimo cílení kuponu.');
  eq('rozeslání: došly kusy', vetaORozeslani(3, { drzi: 0, cileni: 0, limit: 0, vycerpano: 1, neclen: 0 }), 'Odesláno: 3. Přeskočeno: došly kusy kuponu.');

  // ---- Audit s popiskem ----
  for (const k of ['client.coupon', 'client.coupon.send', 'client.coupon.redeem', 'client.promo']) ok(`audit popisek: ${k}`, !!AUDIT_POPISKY[k]);

  // ---- Souběh a integrita: pojistky nad zdrojáky ----
  const redeem = zdroj('app/api/client/admin/redeem/route.ts');
  ok('redeem: kontroluje min. útratu a 18+ (kontrolaUplatneni)', redeem.includes('kontrolaUplatneni('));
  ok('redeem: zapisuje obsluhu a částku', redeem.includes('redeemed_by') && redeem.includes('redeemed_amount'));
  ok('redeem: denní limit rezervuje atomicky a vrací při prohře', redeem.includes('rezervujUplatneni(') && redeem.includes('vratUplatneni('));
  ok('redeem: uplatnění zůstává podmíněné redeemed_at IS NULL', redeem.includes('redeemed_at IS NULL RETURNING'));
  ok('redeem: auditní záznam', redeem.includes("'client.coupon.redeem'"));
  ok('redeem: náhled říká, co obsluha musí zadat', redeem.includes('needsAmount') && redeem.includes('needsAgeCheck'));
  const db = zdroj('lib/kuponyDb.ts');
  ok('limit kusů je jeden UPDATE na řádku kuponu', db.includes('SET issued = COALESCE(issued') && db.includes('total_limit IS NULL OR'));
  ok('vydání vrací kus, když vložení selže', db.includes('await vratKus(o.couponId)'));
  ok('denní limit uplatnění je jeden UPDATE', db.includes('redeem_count < daily_limit'));
  const claim = zdroj('app/api/client/b/[slug]/coupons/[id]/claim/route.ts');
  ok('claim: jen živé kupony', claim.includes("status = 'live'"));
  ok('claim: kód vydává vydejKod a při odmítnutí vrací body', claim.includes('vydejKod(') && claim.includes('vraceni:'));
  const promo = zdroj('app/api/client/b/[slug]/promo/route.ts');
  ok('promo: kupon z kódu prochází claimBlocker', promo.includes('claimBlocker('));
  ok('promo: použití hosta ON CONFLICT DO NOTHING', promo.includes('ON CONFLICT DO NOTHING'));
  ok('promo: počítadlo se zvyšuje podmíněně (limit)', promo.includes('max_uses IS NULL OR uses < max_uses'));
  ok('promo: kompenzace při pádu', promo.includes('vratPouziti(') && promo.includes('catch {'));
  ok('promo: platnost přes promoBlocker', promo.includes('promoBlocker('));
  const kup = zdroj('app/api/client/admin/coupons/route.ts');
  ok('kupony: auditují se změny s popisem', kup.includes("'client.coupon'") && kup.includes('popisZmen('));
  ok('kupony: hromadné akce a duplikace a CSV', kup.includes('Array.isArray(b.ids)') && kup.includes('duplicateOf') && kup.includes("=== 'csv'"));
  ok('kupony: položka nabídky se ověřuje na tým', kup.includes('overNabidku('));
  ok('kupony: smazání s otevřenými kódy je 409 (dialog to říká)', kup.includes('status: 409') && zdroj('components/client/loyalty/KuponyStranka.tsx').includes('openClaims > 0'));
  const verejne = zdroj('app/api/client/b/[slug]/route.ts');
  ok('stránka podniku: jen živé kupony', verejne.includes("status = 'live'"));
  const coup = zdroj('lib/coupons.ts');
  ok('uvítací kupony: přes rozesliKupon (úrovně, 18+, limit)', coup.includes('rozesliKupon(teamId, c, [customerId]'));
  ok('rozeslání: cílení a limit na hosta', coup.includes('cileniBlocker(') && coup.includes('per > 0'));
  const init = zdroj('app/api/init/route.ts');
  for (const sl of ['total_limit', 'daily_limit', 'menu_item_id', 'excluded_items', 'excluded_categories', 'redeemed_by', 'redeemed_amount']) ok(`init: sloupec ${sl}`, init.includes(`ADD COLUMN IF NOT EXISTS ${sl} `));
  ok('init: promo má platnost od', init.includes('client_promos ADD COLUMN IF NOT EXISTS valid_since'));

  // ---- Zapojení do správy ----
  const admin = zdroj('components/client/ClientAdmin.tsx');
  ok('členové: poslat kupon jednomu i segmentu (KuponyOdeslat)', admin.includes('<KuponyOdeslat') && admin.includes('Poslat kupon'));
  ok('kasa: CardScan uplatňuje přes okno KuponUplatnit', zdroj('components/client/CardScan.tsx').includes('<KuponUplatnit'));
  ok('čtečka: kupon s útratou nebo věkem se dokončí v okně', zdroj('components/client/CteckaKasa.tsx').includes('<KuponUplatnit') && zdroj('components/client/CteckaKasa.tsx').includes('status === 422'));
  ok('věrnost: kupony ve vlastní stránce', zdroj('components/client/LoyaltyTabs.tsx').includes('<KuponyStranka'));
  const send = zdroj('app/api/client/admin/coupons/send/route.ts');
  ok('rozeslání: nejde rozeslat koncept ani archiv', send.includes('jeVeVerejne(c)'));
  ok('rozeslání: hostovi přijde oznámení', send.includes('notifyUsers('));
}
