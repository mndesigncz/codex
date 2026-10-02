// W3 — kupony a promo kódy: atomický limit kusů a použití kódu, noční okno hodin,
// varování při uplatnění, stav kuponu (koncept / archiv), dávky promo kódů s CSV,
// přehled uplatnění s ROI a rozesílání hostům. Čistá logika + pojistky nad zdrojáky
// (databázi testy nemají): pořadí kroků v routách a atomické SQL podmínky.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  windowOk, hodinyOk, jeNocniOkno, varovaniUplatneni, stavKuponu, kusyZbyva, jeVolnyKus, denniLimitOk,
  duvodPreskoceni, jeVidetelnyHostum, ageFrom,
} from '../../lib/kuponyPravidla.ts';
import { normalizujKupon, zkontrolujKupon } from '../../lib/kuponyPole.ts';
import {
  cistiKod, zkontrolujPromo, zkontrolujDavku, navrhniKody, nahodnyKod, davkaCsv, csvBunka, rozpadPouziti, stavPromo, MAX_DAVKA,
} from '../../lib/promoKody.ts';
import { souhrnKuponu, odhadSlevy, dobaPopis } from '../../lib/kuponyPrehled.ts';
import { cistiPublikum } from '../../lib/kuponyPublikum.ts';
import { benefitLabel } from '../../lib/kuponyPopisky.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const kc = (n: number) => `${n} Kč`;

/** Zrcadlo SQL `UPDATE ... SET issued = issued + 1 WHERE issued < max_total`: čtení a zápis bez přerušení (řádkový zámek). */
function pocitadlo(max: number | null) {
  const c = { issued: 0 };
  return {
    c,
    rezervuj: async () => { await Promise.resolve(); if (!jeVolnyKus(c.issued, max)) return false; c.issued += 1; return true; },
  };
}

export default async function ({ eq, ok }: Testy) {
  // ---- Okno hodin vč. noci ----
  eq('běžné okno: uvnitř', hodinyOk('09:00', '17:00', '12:00'), true);
  eq('běžné okno: venku', hodinyOk('09:00', '17:00', '18:00'), false);
  eq('noční okno: před půlnocí', hodinyOk('22:00', '02:00', '23:30'), true);
  eq('noční okno: po půlnoci', hodinyOk('22:00', '02:00', '01:15'), true);
  eq('noční okno: ve dne ne', hodinyOk('22:00', '02:00', '12:00'), false);
  eq('noční okno: hranice do', hodinyOk('22:00', '02:00', '02:00'), true);
  eq('noční okno: těsně za hranicí', hodinyOk('22:00', '02:00', '02:01'), false);
  eq('bez hodin = celý den', hodinyOk(null, null, '03:00'), true);
  ok('jeNocniOkno', jeNocniOkno('22:00', '02:00') && !jeNocniOkno('09:00', '17:00') && !jeNocniOkno(null, null));
  const noc = { hour_from: '22:00', hour_till: '02:00' };
  eq('windowOk: noční kupon večer', windowOk(noc, { today: '2026-10-02', hm: '23:00' }), null);
  ok('windowOk: noční kupon odpoledne řekne okno', (windowOk(noc, { today: '2026-10-02', hm: '15:00' }) ?? '').includes('22:00–02:00'));
  // 2026-10-02 je pátek (5), 2026-10-03 sobota (6). „Pátek 22–02“ platí i v sobotu v 01:00, ale ne v sobotu ve 23:00.
  const patek = { ...noc, days_of_week: [5] };
  eq('páteční noc: pátek 23:00', windowOk(patek, { today: '2026-10-02', hm: '23:00' }), null);
  eq('páteční noc: sobota 01:00 patří pátku', windowOk(patek, { today: '2026-10-03', hm: '01:00' }), null);
  ok('páteční noc: sobota 23:00 už ne', windowOk(patek, { today: '2026-10-03', hm: '23:00' }) !== null);
  ok('páteční noc: pátek v 01:00 patří čtvrtku', windowOk(patek, { today: '2026-10-02', hm: '01:00' }) !== null);
  ok('platí až od', (windowOk({ valid_since: '2026-12-01' }, { today: '2026-10-02', hm: '10:00' }) ?? '').includes('2026-12-01'));
  eq('už neplatí', windowOk({ valid_until: '2026-09-01' }, { today: '2026-10-02', hm: '10:00' }), 'Kupon už neplatí.');

  // ---- Kontrola polí kuponu (stejná na serveru i v UI) ----
  const zaklad = { title: 'Káva zdarma', benefitKind: 'free_item' };
  eq('platný kupon', zkontrolujKupon(normalizujKupon(zaklad), zaklad), null);
  eq('bez názvu', zkontrolujKupon(normalizujKupon({ title: ' ' })), 'Kupon potřebuje název.');
  ok('procenta bez hodnoty', zkontrolujKupon(normalizujKupon({ title: 'x', benefitKind: 'percent' })) !== null);
  eq('půlka okna', zkontrolujKupon(normalizujKupon({ ...zaklad, hourFrom: '22:00' })), 'Vyplň obě hodiny, nebo žádnou.');
  ok('stejné hodiny', (zkontrolujKupon(normalizujKupon({ ...zaklad, hourFrom: '10:00', hourTill: '10:00' })) ?? '').includes('nesmí rovnat'));
  eq('noční okno je platné', zkontrolujKupon(normalizujKupon({ ...zaklad, hourFrom: '22:00', hourTill: '02:00' })), null);
  ok('od po do', (zkontrolujKupon(normalizujKupon({ ...zaklad, validSince: '2026-12-01', validUntil: '2026-11-01' })) ?? '').includes('po svém konci'));
  ok('nečitelný čas se nezahodí tiše', (zkontrolujKupon(normalizujKupon({ ...zaklad, hourFrom: '25:99', hourTill: '' }), { ...zaklad, hourFrom: '25:99', hourTill: '' }) ?? '') !== '');
  ok('sleva vyšší než minimum', zkontrolujKupon(normalizujKupon({ title: 'x', benefitKind: 'amount', amountOff: 200, minOrderValue: 100 })) !== null);
  ok('denní limit nad celkem', zkontrolujKupon(normalizujKupon({ ...zaklad, maxTotal: 10, dailyLimit: 20 })) !== null);
  ok('uvítací kupon není za body', zkontrolujKupon(normalizujKupon({ ...zaklad, welcome: true, costPoints: 50 })) !== null);
  const n = normalizujKupon({ ...zaklad, maxTotal: '25', dailyLimit: '', draft: true });
  ok('normalizace limitů a konceptu', n.max_total === 25 && n.daily_limit === null && n.draft === true);

  // ---- Stav kuponu ----
  const dnes = '2026-10-02';
  eq('aktivní', stavKuponu({ active: true }, dnes), 'aktivni');
  eq('koncept', stavKuponu({ active: true, draft: true }, dnes), 'koncept');
  eq('archiv přebije koncept', stavKuponu({ active: true, draft: true, archived_at: '2026-01-01' }, dnes), 'archiv');
  eq('naplánováno', stavKuponu({ active: true, valid_since: '2026-11-01' }, dnes), 'naplanovano');
  eq('vypršelo', stavKuponu({ active: true, valid_until: '2026-09-30' }, dnes), 'vyprselo');
  eq('vypnuto', stavKuponu({ active: false }, dnes), 'vypnuto');
  eq('rozebráno', stavKuponu({ active: true, max_total: 5, issued: 5 }, dnes), 'vyprodano');
  ok('koncept a archiv hosté nevidí', !jeVidetelnyHostum({ draft: true }) && !jeVidetelnyHostum({ archived_at: 'x' }) && jeVidetelnyHostum({ active: true }));
  eq('zbývá kusů', kusyZbyva({ max_total: 10, issued: 3 }), 7);
  eq('bez limitu null', kusyZbyva({ max_total: null, issued: 3 }), null);
  eq('nikdy záporně', kusyZbyva({ max_total: 3, issued: 9 }), 0);

  // ---- Souběh: limit kusů a denní limit ----
  const p1 = pocitadlo(10);
  const vysl = await Promise.all(Array.from({ length: 50 }, () => p1.rezervuj()));
  eq('50 souběžných žádostí o 10 kusů vydá přesně 10', vysl.filter(Boolean).length, 10);
  eq('počítadlo skončí na limitu', p1.c.issued, 10);
  const p2 = pocitadlo(null);
  eq('bez limitu projdou všichni', (await Promise.all(Array.from({ length: 20 }, () => p2.rezervuj()))).every(Boolean), true);
  ok('denní limit: nový den začíná od nuly', denniLimitOk({ daily_limit: 5, daily_count: 5, daily_day: '2026-10-01' }, dnes));
  ok('denní limit: dnes vyčerpán', !denniLimitOk({ daily_limit: 5, daily_count: 5, daily_day: dnes }, dnes));
  ok('denní limit: dnes ještě volno', denniLimitOk({ daily_limit: 5, daily_count: 4, daily_day: dnes }, dnes));
  ok('denní limit: bez limitu', denniLimitOk({ daily_limit: null, daily_count: 99, daily_day: dnes }, dnes));
  // Souběh promo kódu: zrcadlo `UPDATE ... WHERE uses < max_uses`, 30 hostů o 5 použití.
  const promo = { uses: 0 };
  const zadej = async () => { await Promise.resolve(); if (promo.uses >= 5) return false; promo.uses += 1; return true; };
  eq('promo: 30 hostů o 5 použití', (await Promise.all(Array.from({ length: 30 }, zadej))).filter(Boolean).length, 5);

  // ---- Varování při uplatnění ----
  const min = { min_order_value: 200 };
  eq('bez částky: připomene minimum', varovaniUplatneni(min, kc, null), ['Kupon platí od 200 Kč útraty. Zkontroluj účtenku.']);
  eq('pod minimem', varovaniUplatneni(min, kc, 150), ['Útrata 150 Kč je pod minimem 200 Kč.']);
  eq('splněné minimum bez varování', varovaniUplatneni(min, kc, 200), []);
  eq('18+ varuje vždy', varovaniUplatneni({ adult_only: true }, kc, null), ['Kupon je jen pro plnoleté. Zkontroluj doklad.']);
  eq('obojí', varovaniUplatneni({ ...min, adult_only: true }, kc, 100).length, 2);
  eq('bez podmínek žádné varování', varovaniUplatneni({}, kc, null), []);
  eq('částky v měně podniku', varovaniUplatneni(min, n2 => `${n2} €`, 5)[0], 'Útrata 5 € je pod minimem 200 €.');

  // ---- Promo kódy ----
  eq('čištění kódu', cistiKod(' jaro-26 ž!'), 'JARO26');
  eq('kód nejvýš 16 znaků', cistiKod('A'.repeat(30)).length, 16);
  ok('promo bez odměny', 'chyba' in zkontrolujPromo({ title: 'x', points: 0 }));
  ok('promo bez názvu', 'chyba' in zkontrolujPromo({ title: '', points: 10 }));
  ok('promo: limit 0 je chyba', 'chyba' in zkontrolujPromo({ title: 'x', points: 10, max_uses: '0' }));
  ok('promo: špatné datum', 'chyba' in zkontrolujPromo({ title: 'x', points: 10, valid_until: '1.1.2027' }));
  const pv = zkontrolujPromo({ title: 'Leták', points: '50', coupon_id: '7', max_uses: '100', valid_until: '2026-12-31' });
  ok('promo platné', 'hodnoty' in pv && pv.hodnoty.couponId === 7 && pv.hodnoty.maxUses === 100 && pv.hodnoty.points === 50);
  ok('dávka: počet 0', 'chyba' in zkontrolujDavku({ count: 0 }));
  ok('dávka: moc kódů', 'chyba' in zkontrolujDavku({ count: MAX_DAVKA + 1 }));
  ok('dávka: předpona s diakritikou', 'chyba' in zkontrolujDavku({ count: 5, prefix: 'ěšč' }));
  eq('dávka: předpona se vyčistí', (zkontrolujDavku({ count: 5, prefix: 'let-ak' }) as any).predpona, 'LETAK');
  let sem = 7;
  const rnd = () => { sem = (sem * 9301 + 49297) % 233280; return sem / 233280; };
  const kody = navrhniKody(200, 'LETAK', rnd);
  eq('dávka vyrobí přesný počet unikátních kódů', new Set(kody).size, 200);
  ok('všechny kódy mají předponu a délku do 16', kody.every(k => k.startsWith('LETAK') && k.length <= 16 && /^[A-Z0-9]+$/.test(k)));
  ok('kódy bez zaměnitelných znaků', kody.every(k => !/[01OI]/.test(k.slice(5))));
  eq('suffix respektuje 16 znaků u dlouhé předpony', navrhniKody(3, 'ABCDEFGH', rnd).every(k => k.length <= 16), true);
  ok('náhodný kód má danou délku', nahodnyKod(6, rnd).length === 6);
  const csv = davkaCsv([{ code: 'LETAK2AB', title: 'Leták; "jaro"', points: 50, coupon_title: '=HYPERLINK("x")', max_uses: 1, valid_until: '2026-12-31', uses: 0 }]);
  ok('CSV začíná BOM a hlavičkou', csv.startsWith('﻿Kód;Název;Body;Kupon;'));
  ok('CSV ošetří středník a uvozovky', csv.includes('"Leták; ""jaro"""'));
  ok('CSV zneškodní vzorec', csv.includes(`"'=HYPERLINK(""x"")"`) || csv.includes("'=HYPERLINK"));
  eq('csvBunka prosté', csvBunka('ABC'), 'ABC');
  eq('stav promo: aktivní', stavPromo({ active: true, uses: 1, max_uses: 5 }, dnes), 'aktivni');
  eq('stav promo: vyčerpáno', stavPromo({ active: true, uses: 5, max_uses: 5 }, dnes), 'vycerpano');
  eq('stav promo: vypršelo', stavPromo({ active: true, valid_until: '2026-01-01' }, dnes), 'vyprselo');
  eq('stav promo: vypnuto', stavPromo({ active: false }, dnes), 'vypnuto');
  // 23:30 UTC 1. 10. je v Praze už 2. 10. (01:30); denní rozpad musí jít podle pražského dne.
  const rozpad = rozpadPouziti([{ used_at: '2026-10-01 23:30:00' }, { used_at: '2026-10-02 08:00:00' }, { used_at: '2026-10-01 10:00:00' }, { used_at: null }]);
  eq('rozpad podle pražského dne', rozpad, [{ den: '2026-10-02', pocet: 2 }, { den: '2026-10-01', pocet: 1 }]);

  // ---- Rozesílání hostům ----
  eq('drží otevřený kód', duvodPreskoceni({}, { drzi: 1, vzato: 1, birthday: null }, dnes), 'drzi');
  eq('limit na hosta', duvodPreskoceni({ per_customer: 2 }, { drzi: 0, vzato: 2, birthday: null }, dnes), 'limit');
  eq('18+ nezletilý se přeskočí', duvodPreskoceni({ adult_only: true }, { drzi: 0, vzato: 0, birthday: '2015-05-05' }, dnes), 'neplnolety');
  eq('18+ s neznámým datem projde (doklad zkontroluje obsluha)', duvodPreskoceni({ adult_only: true }, { drzi: 0, vzato: 0, birthday: null }, dnes), null);
  eq('18+ dospělý projde', duvodPreskoceni({ adult_only: true }, { drzi: 0, vzato: 0, birthday: '1990-01-01' }, dnes), null);
  eq('věk těsně před narozeninami', ageFrom('2008-10-03', dnes), 17);
  eq('věk v den narozenin', ageFrom('2008-10-02', dnes), 18);
  ok('publikum: všichni', 'publikum' in cistiPublikum({ druh: 'vsichni' }));
  ok('publikum: skupina bez id', 'chyba' in cistiPublikum({ druh: 'skupina' }));
  ok('publikum: hosté bez výběru', 'chyba' in cistiPublikum({ druh: 'hoste', hostIds: [] }));
  ok('publikum: příliš mnoho hostů', 'chyba' in cistiPublikum({ druh: 'hoste', hostIds: Array.from({ length: 201 }, (_, i) => i + 1) }));
  eq('publikum: duplicity a smetí pryč', (cistiPublikum({ druh: 'hoste', hostIds: [3, 3, 'x', 5, -1] }) as any).publikum.hostIds, [3, 5]);
  ok('publikum: cizí druh', 'chyba' in cistiPublikum({ druh: 'nikdo' }));

  // ---- Přehled uplatnění a ROI ----
  const radky = [
    { claimed_at: '2026-09-01 10:00:00', redeemed_at: '2026-09-01 16:00:00', order_value: '300.00', valid_until: null, benefit_kind: 'percent', percent_off: 10 },
    { claimed_at: '2026-09-02 10:00:00', redeemed_at: '2026-09-04 10:00:00', order_value: '100', valid_until: null, benefit_kind: 'percent', percent_off: 10 },
    { claimed_at: '2026-09-03 10:00:00', redeemed_at: '2026-09-03 11:00:00', order_value: null, valid_until: null, benefit_kind: 'percent', percent_off: 10 },
    { claimed_at: '2026-08-01 10:00:00', redeemed_at: null, order_value: null, valid_until: '2026-09-01', benefit_kind: 'percent', percent_off: 10 },
    { claimed_at: '2026-09-30 10:00:00', redeemed_at: null, order_value: null, valid_until: null, benefit_kind: 'percent', percent_off: 10 },
  ];
  const s = souhrnKuponu(radky, dnes);
  eq('vydáno / uplatněno / otevřené / propadlé', [s.vydano, s.uplatneno, s.otevrene, s.propadle], [5, 3, 1, 1]);
  eq('míra uplatnění', s.miraUplatneni, 60);
  eq('průměrná útrata jen z účtenek s částkou', [s.sUtratou, s.prumernaUtrata, s.celkemUtrata], [2, 200, 400]);
  eq('medián doby do uplatnění (1 h, 6 h, 48 h)', s.medianHodin, 6);
  eq('odhad slev: 10 % ze 300 a 100', odhadSlevy(radky), 40);
  eq('částkový kupon se započítá i bez účtenky', odhadSlevy([{ claimed_at: 'x', redeemed_at: '2026-01-01 10:00:00', order_value: null, valid_until: null, benefit_kind: 'amount', amount_off: 50 }]), 50);
  eq('prázdný přehled', souhrnKuponu([], dnes).miraUplatneni, null);
  eq('doba: minuty', dobaPopis(0.25), '15 min');
  eq('doba: hodiny', dobaPopis(6), '6 hodin');
  eq('doba: dny', dobaPopis(72), '3 dny');
  eq('doba: bez dat', dobaPopis(null), '—');
  eq('popisek výhody v eurech', benefitLabel({ benefit_kind: 'amount', amount_off: 5 }, n3 => `${n3} €`), 'Sleva 5 €');

  // ---- Pojistky nad zdrojáky: pořadí kroků a atomické podmínky ----
  const kusy = zdroj('lib/kuponyKusy.ts');
  ok('kusy: rezervace je jeden UPDATE s podmínkou', /SET issued = issued \+ 1\s+WHERE id = \$\{couponId\} AND \(max_total IS NULL OR issued < max_total\)/.test(kusy));
  ok('kusy: denní limit v jednom UPDATE', kusy.includes('daily_count < daily_limit') && kusy.includes('IS DISTINCT FROM'));
  const promoRoute = zdroj('app/api/client/b/[slug]/promo/route.ts');
  ok('promo: uses se zvyšuje atomicky s podmínkou', /SET uses = uses \+ 1\s+WHERE id = \$\{promo\.id\} AND active = TRUE AND \(max_uses IS NULL OR uses < max_uses\)/.test(promoRoute));
  ok('promo: použití se zapisuje PŘED odměnou', promoRoute.indexOf('INSERT INTO client_promo_uses') < promoRoute.indexOf('award(teamId'));
  ok('promo: rezervace uses PŘED odměnou', promoRoute.indexOf('SET uses = uses + 1') < promoRoute.indexOf('award(teamId'));
  ok('promo: kupon z kódu prochází claimBlocker', promoRoute.includes('claimBlocker(') && promoRoute.indexOf('claimBlocker(') < promoRoute.indexOf('INSERT INTO client_promo_uses'));
  ok('promo: pád po rezervaci vrací použití (kompenzace)', promoRoute.includes('vratPouziti(') && promoRoute.includes('catch (e)') && promoRoute.includes('throw e'));
  ok('promo: kupon respektuje limit kusů', promoRoute.includes('rezervujKus('));
  const claim = zdroj('app/api/client/b/[slug]/coupons/[id]/claim/route.ts');
  ok('claim: kus se rezervuje před odečtem bodů', claim.indexOf('rezervujKus(') > 0 && claim.indexOf('rezervujKus(') < claim.indexOf('spendPoints('));
  ok('claim: neúspěch vrací kus i body', claim.includes('vratKus(') && claim.includes('vraceni:') && claim.includes('throw e'));
  ok('claim: koncept a archiv se nevydává', claim.includes('draft = FALSE') && claim.includes('archived_at IS NULL'));
  const redeem = zdroj('app/api/client/admin/redeem/route.ts');
  ok('redeem: zapisuje obsluhu a částku', redeem.includes('redeemed_by = ${u.id}') && redeem.includes('order_value = '));
  ok('redeem: varování se musí potvrdit', redeem.includes('needsConfirm') && redeem.includes('b.confirm !== true'));
  ok('redeem: preview nic neuplatňuje a vrací varování', redeem.indexOf('b.preview === true') < redeem.indexOf('SET redeemed_at'));
  ok('redeem: denní limit se bere atomicky před uplatněním', redeem.indexOf('rezervujDenniUplatneni(') < redeem.indexOf('SET redeemed_at') && redeem.includes('vratDenniUplatneni('));
  ok('redeem: audit uplatnění', redeem.includes("'client.kupon.uplatnen'"));
  const adm = zdroj('app/api/client/admin/coupons/route.ts');
  ok('mazání: bez force odmítne s návodem', adm.includes('force') && adm.includes('archivovat'));
  ok('mazání: zrušené kódy vrací body jen za zaplacené', adm.includes("k.source === 'points'"));
  ok('mazání: kupon s historií se nemaže', adm.includes('uplatnene > 0'));
  ok('limit kusů nejde snížit pod vydané', adm.includes('f.max_total < Number(cur.issued)'));
  const init = zdroj('app/api/init/route.ts');
  for (const col of ['max_total', 'issued', 'daily_limit', 'daily_day', 'draft', 'archived_at']) ok(`schéma: client_coupons.${col}`, init.includes(`client_coupons ADD COLUMN IF NOT EXISTS ${col} `));
  for (const col of ['redeemed_by', 'order_value', 'source', 'redeem_note']) ok(`schéma: client_coupon_claims.${col}`, init.includes(`client_coupon_claims ADD COLUMN IF NOT EXISTS ${col} `));
  ok('schéma: client_promos.batch', init.includes('client_promos ADD COLUMN IF NOT EXISTS batch '));
  const popisky = zdroj('lib/auditPopisky.ts');
  for (const k of ['client.kupon', 'client.kupon.uplatnen', 'client.kupon.odeslan', 'client.promo']) ok(`audit popisek ${k}`, popisky.includes(`'${k}':`));
  const guest = zdroj('app/api/client/b/[slug]/route.ts');
  ok('stránka hosta nevidí koncepty a archiv', guest.includes('draft = FALSE AND archived_at IS NULL'));
  ok('uvítací kupony respektují limit kusů a koncept', zdroj('lib/coupons.ts').includes('rezervujKus(c.id)') && zdroj('lib/coupons.ts').includes('draft = FALSE'));
  ok('hostovská část nemá nové napevno české texty mimo server', !zdroj('components/client/BusinessPage.tsx').includes('Kupony došly'));
}
