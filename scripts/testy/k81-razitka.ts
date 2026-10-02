// Kolo 81 — razítka: úplnost pravidel (kategorie, vyloučené položky, kombinovatelnost,
// vzhled karty, kalendářní pauza mezi kartami, export) a souběhy u kasy (klíč akce,
// ruční položky, storno, jedno počítadlo razítek).
//
// Čisté funkce z lib/razitkaPravidla.ts, lib/stampsPlan.ts a lib/idempotenceKlic.ts se
// zkouší přímo. Co sahá do databáze (lib/stamps.ts, routy), hlídají kontroly zdrojáků:
// jsou tu proto, ať se atomické zápisy a idempotence nedají omylem vrátit do křehké podoby.
// Plán připsání, vypršení karty a okno platnosti zkouší w1-razitka.ts.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  popisOkna, dalsiKartaOd, stavKartyHosta, kartaProHosta, spocitejRazitka, vyberKampane,
  razitkaCsv, udalostiCsv, czDatum, normalizujDny, jeVyloucen,
  type PravidloKampane, type PravidloZaPolozky, type RadekUctu,
} from '../../lib/razitkaPravidla.ts';
import { planAdd, overKampan, type PravidloKarty, type StavKarty } from '../../lib/stampsPlan.ts';
import { ocistiKlic, novyKlic } from '../../lib/idempotenceKlic.ts';

const zdroj = (p: string) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8');

const K: PravidloKampane = {
  required_stamps: 5, stack_cards: true, repeat_mode: 'immediately', days_to_finish: 0, max_completions: 0, daily_cap: 0,
  days_of_week: [], hour_from: null, hour_till: null,
};
const PK: PravidloKarty = K;
const NOW = new Date('2026-10-02T10:00:00Z'); // pátek 12:00 pražského času (letní)
const dnuZpet = (n: number, od = NOW) => new Date(od.getTime() - n * 86400000);
const stav = (o: Partial<StavKarty> = {}): StavKarty => ({ stamps: 0, completed: 0, started_at: null, last_stamp_at: null, last_completed_at: null, ...o });
const ctx = (now: Date) => ({ now, dnesPripsano: 0, dow: 5, hhmm: '12:00' });

export default function ({ eq, ok }: Testy) {
  // ---- R15 kalendářně: den a měsíc podle pražského času ----
  const posl = new Date('2026-10-02T06:00:00Z'); // 8:00 pražského, pátek 2. 10.
  eq('R15: po dni = od dalšího kalendářního dne', dalsiKartaOd('one_day', posl), '2026-10-03');
  eq('R15: po týdnu = o 7 dní', dalsiKartaOd('one_week', posl), '2026-10-09');
  eq('R15: po měsíci = od 1. dne dalšího měsíce', dalsiKartaOd('one_month', posl), '2026-11-01');
  eq('R15: prosinec přeskočí do ledna dalšího roku', dalsiKartaOd('one_month', new Date('2026-12-15T10:00:00Z')), '2027-01-01');
  eq('R15: 23:30 pražského ještě patří do října', dalsiKartaOd('one_month', new Date('2026-10-31T22:30:00Z')), '2026-11-01');
  eq('R15: 00:30 pražského už je listopad (UTC je ještě říjen)', dalsiKartaOd('one_month', new Date('2026-10-31T23:30:00Z')), '2026-12-01');
  eq('R15: hned a jen jednou nemají cooldown', [dalsiKartaOd('immediately', posl), dalsiKartaOd('one_time', posl)], [null, null]);
  const cdDen = planAdd({ ...PK, repeat_mode: 'one_day' }, stav({ last_completed_at: posl }), 1, ctx(NOW));
  ok('R15: tentýž den po dokončení se další karta nesbírá', !cdDen.ok && /3\. 10\. 2026/.test((cdDen as any).duvod));
  const cdDen2 = planAdd({ ...PK, repeat_mode: 'one_day' }, stav({ last_completed_at: dnuZpet(1, posl) }), 1, ctx(NOW));
  ok('R15: následující den už jde', cdDen2.ok);
  const cdMesic = planAdd({ ...PK, repeat_mode: 'one_month' }, stav({ last_completed_at: new Date('2026-10-05T10:00:00Z') }), 1, ctx(new Date('2026-10-31T10:00:00Z')));
  ok('R15: kalendářní měsíc: 31. 10. po dokončení 5. 10. ještě ne', !cdMesic.ok && /1\. 11\. 2026/.test((cdMesic as any).duvod));
  const cdMesic2 = planAdd({ ...PK, repeat_mode: 'one_month' }, stav({ last_completed_at: new Date('2026-10-05T10:00:00Z') }), 1, ctx(new Date('2026-11-01T09:00:00Z')));
  ok('R15: 1. 11. už jde (ne až za 30 dní)', cdMesic2.ok);
  const cdRucne = planAdd({ ...PK, repeat_mode: 'one_day' }, stav({ last_completed_at: posl }), 1, { ...ctx(NOW), rucne: true });
  ok('R15: ruční připsání pauzu mezi kartami obchází', cdRucne.ok);

  // ---- R3 popis okna ----
  eq('R3: popis okna: Po–Pá, 14:00–18:00', popisOkna({ days_of_week: [1, 2, 3, 4, 5], hour_from: '14:00', hour_till: '18:00' }), 'Po–Pá, 14:00–18:00');
  eq('R3: popis okna: nesouvislé dny', popisOkna({ days_of_week: [1, 3], hour_from: null, hour_till: null }), 'Po, St');
  eq('R3: popis okna: všechny dny a bez hodin = prázdné', popisOkna({ days_of_week: [1, 2, 3, 4, 5, 6, 7], hour_from: null, hour_till: null }), '');
  eq('R3: dny se čistí (duplicity, nesmysly, pořadí)', normalizujDny([5, 1, 1, 9, 0, 'x', 3]), [1, 3, 5]);

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

  // ---- R13 validace jako u POST i PATCH ----
  const chyba = (b: any) => { const v = overKampan(b); return 'chyba' in v ? v.chyba : null; };
  const pole = (b: any) => { const v = overKampan({ name: 'X', ...b }); return 'f' in v ? v.f : null; };
  eq('R13: products bez položek i kategorií je chyba', chyba({ name: 'X', ruleType: 'products' }), 'Vyber položky nebo kategorie, za které se razítko připisuje.');
  eq('R13: products jen s kategorií je v pořádku', chyba({ name: 'X', ruleType: 'products', stampSections: [{ sectionId: 3 }] }), null);
  eq('R13: products s položkou je v pořádku', chyba({ name: 'Dýmka', ruleType: 'products', stampItems: [{ itemId: 5 }] }), null);
  eq('R13: min_value bez částky je chyba', chyba({ name: 'X', ruleType: 'min_value' }), 'Zadej minimální útratu pro razítko.');
  eq('R13: prázdný název je chyba', chyba({ ruleType: 'visit' }), 'Zadej název kampaně.');
  ok('R13: vyloučené kategorie u „za návštěvu“ jsou chyba', !!chyba({ name: 'X', ruleType: 'visit', excludedSections: [{ sectionId: 3 }] }));
  ok('R13: vyloučené kategorie u „za položky“ jsou v pořádku', chyba({ name: 'X', ruleType: 'products', stampSections: [{ sectionId: 1 }], excludedSections: [{ sectionId: 3 }] }) === null);
  eq('R11: barva karty jen jako #rrggbb', [pole({ cardColor: '#AABBCC' })?.card_color, chyba({ name: 'X', cardColor: 'red' })], ['#aabbcc', 'Barvu karty zadej jako #RRGGBB.']);
  eq('R11: ikona jen ze seznamu', [pole({ cardIcon: 'star' })?.card_icon, chyba({ name: 'X', cardIcon: '<script>' })], ['star', 'Neznámá ikona karty.']);
  eq('R11: obrázek jen https nebo vlastní /api/client/img', [pole({ cardImage: 'https://a.cz/x.png' })?.card_image, pole({ cardImage: '/api/client/img/12' })?.card_image, chyba({ name: 'X', cardImage: 'javascript:alert(1)' }) !== null, chyba({ name: 'X', cardImage: 'http://a.cz/x.png' }) !== null], ['https://a.cz/x.png', '/api/client/img/12', true, true]);
  eq('R11: podmínky se ořežou na 600 znaků', pole({ conditions: 'a'.repeat(900) })?.conditions.length, 600);
  eq('R4: kategorie z formuláře se čistí', pole({ stampSections: [{ sectionId: '7' }, { sectionId: -1 }, {}] })?.stamp_sections, [{ sectionId: 7 }]);
  eq('R5: kombinovatelnost je ve výchozím stavu zapnutá', [pole({})?.combinable, pole({ combinable: false })?.combinable], [true, false]);

  // ---- R14 a R11: karta očima hosta ----
  const hostC = { ...K, id: 1, name: 'Dýmka', description: '', conditions: 'Neplatí s jinými slevami.', reward_title: 'Dýmka zdarma', rule_type: 'visit' as const, card_color: '#112233', card_icon: 'star', card_image: null, valid_till: null, days_to_finish: 30 };
  const stK = stavKartyHosta(hostC, { stamps: 3, completed: 0, started_at: dnuZpet(10), last_completed_at: null }, NOW, '2026-10-02');
  eq('host: v lhůtě je vidět, do kdy dosbírat', [stK.vyprsela, stK.stamps, stK.dosbiratDo, stK.zbyvaDni], [false, 3, '2026-10-22', 20]);
  const stExp = stavKartyHosta(hostC, { stamps: 3, completed: 0, started_at: dnuZpet(40), last_completed_at: null }, NOW, '2026-10-02');
  eq('host: po vypršení vidí nulu a kolik propadlo', [stExp.vyprsela, stExp.stamps, stExp.vyprselaRazitek], [true, 0, 3]);
  const stPoCteni = stavKartyHosta(hostC, { stamps: 0, completed: 0, started_at: NOW, last_completed_at: null, expired_count: 3 }, NOW, '2026-10-02');
  eq('host: karta vynulovaná při čtení si zprávu o propadnutí nese v expired_count', [stPoCteni.vyprsela, stPoCteni.vyprselaRazitek], [true, 3]);
  eq('host: cooldown ukáže, od kdy jde další karta', stavKartyHosta({ ...hostC, repeat_mode: 'one_month' }, { stamps: 0, completed: 1, started_at: null, last_completed_at: posl }, NOW, '2026-10-02').dalsiKartaOd, '2026-11-01');
  eq('host: jednorázová karta po dokončení = hotovo navždy', stavKartyHosta({ ...hostC, repeat_mode: 'one_time' }, { stamps: 0, completed: 1, started_at: null, last_completed_at: posl }, NOW, '2026-10-02').hotovoNavzdy, true);
  const kh = kartaProHosta({ ...hostC, days_of_week: [1, 2], hour_from: '14:00', hour_till: '18:00' }, null, ['Dýmka malá'], NOW, '2026-10-02');
  eq('R11: karta pro hosta nese podmínky, barvu, ikonu, položky odměny a okno', [kh.conditions, kh.color, kh.icon, kh.rewardItems, kh.okno], ['Neplatí s jinými slevami.', '#112233', 'star', ['Dýmka malá'], { days: [1, 2], from: '14:00', till: '18:00' }]);
  eq('R11: bez okna je okno null', kartaProHosta(hostC, null, [], NOW, '2026-10-02').okno, null);
  eq('R1: karta pro hosta nese limit dokončených karet (jednorázová = 1)', [kartaProHosta({ ...hostC, max_completions: 3 }, null, [], NOW).limit, kartaProHosta({ ...hostC, repeat_mode: 'one_time' }, null, [], NOW).limit], [3, 1]);

  // ---- R10 export CSV ----
  const csv = razitkaCsv([{ host: '=HYPERLINK("x")', email: 'a@b.cz', razitka: 3, dokonceno: 2, zacatek: '1. 10. 2026', posledniRazitko: '', posledniDokonceni: '', vypraselo: 1 }]);
  ok('R10: CSV začíná BOM a hlavičkou se středníky', csv.startsWith('﻿host;e-mail;razítek na kartě'));
  ok('R10: CSV chrání buňky proti vzorcům', !/^=HYPERLINK/m.test(csv.split('\r\n')[1]));
  eq('R10: CSV má hlavičku a jeden řádek', csv.trim().split('\r\n').length, 2);
  ok('R10: CSV deníku má hlavičku', udalostiCsv([]).includes('datum;host;změna razítek'));
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
  const member = zdroj('app/api/client/admin/stamps/member/route.ts');
  const init = zdroj('app/api/init/route.ts');
  const schema = zdroj('lib/stampsSchema.ts');
  const client = zdroj('lib/client.ts');

  ok('S1: razítka se připisují optimisticky (podmínka na rev) a ref se zabere dřív než zápis', /AND rev = \$\{s\.rev\}/.test(stamps) && /ON CONFLICT \(campaign_id, customer_id, ref\)/.test(stamps));
  ok('S2: vyzvednutí kuponu: pád vložení vrací body i kus z limitu', /await vratKus\(c\.id\)\.catch/.test(zdroj('app/api/client/b/[slug]/coupons/[id]/claim/route.ts')) && /award\(teamId, me\.id, cost, 'coupon'/.test(zdroj('app/api/client/b/[slug]/coupons/[id]/claim/route.ts')));
  const promo = zdroj('app/api/client/b/[slug]/promo/route.ts');
  ok('S4: počítadlo promo kódu je atomické (limit přímo v UPDATE) a promo kód hlídá podmínky kuponu', /UPDATE client_promos SET uses = uses \+ 1/.test(promo) && /max_uses IS NULL OR uses < max_uses/.test(promo) && /claimBlocker\(/.test(promo));
  ok('S4: při pádu po zabrání kódu se použití i počítadlo vrací', /vratPouziti\(/.test(promo));
  ok('S6: připisování z účtenky jde po krocích a guard účtenky se při pádu uvolní k převzetí', /spustKrok\(hotove/.test(scan) && /awarded_at = NOW\(\) - INTERVAL '1 minute'/.test(scan));
  ok('S7: ruční částka u kasy spouští kampanie „za útratu“ a ruční položky umí server (action items i položky u částky)', /action === 'points'/.test(scan) && /rucniPolozky: polozky/.test(scan) && /action === 'items'/.test(scan));
  ok('S9: POST u kasy běží přes sIdempotenci (klíč akce vrací původní odpověď)', /return sIdempotenci\(u\.team_id, req, b,/.test(scan));
  ok('S9: idempotence uvolní klíč po chybě a vrací uloženou odpověď', /opakovani: true/.test(zdroj('lib/idempotence.ts')) && /DELETE FROM client_kasa_idem/.test(zdroj('lib/idempotence.ts')));
  ok('S10: se zapnutými kampaněmi „za návštěvu“ se staré počítadlo razítek nezvyšuje', /const legacy = !\(await maKampane\(teamId\)\)/.test(client) && /rule_type = 'visit' LIMIT 1/.test(stamps));
  ok('S10: razítko u kasy nespotřebuje denní zámek, když žádná kartička teď neplatí', /Žádná kartička „za návštěvu“ teď neběží/.test(scan) && /nk\.vse\.length && !nk\.platne\.length/.test(scan));
  ok('S10: peněženka, seznam členů i detail čtou razítka z kampaní', /maKampane/.test(zdroj('lib/walletDb.ts')) && /maKampane/.test(zdroj('lib/clenoveDb.ts')) && /kampane\.length \? kampane\.reduce/.test(zdroj('app/api/client/admin/loyalty/route.ts')));

  // R9, R7, R14 na straně serveru
  ok('R9: storno poslední akce u kasy (jedno: body, kredit i razítka) vrací kartu ze snímku, uvolní zámek návštěvy a ruší neuplatněné odměny', /stornujPosledniAkci/.test(scan) && /stornoPodleRef/.test(zdroj('lib/kasaStornoDb.ts')) && /last_visit_at = NULL/.test(zdroj('lib/stampsAdmin.ts')) && /redeemed_at IS NOT NULL/.test(zdroj('lib/stampsAdmin.ts')));
  ok('R9: ruční připsání a odebrání má povinný důvod a vlastní oprávnění', /vernost\.razitka_upravit/.test(member) && /Napiš důvod/.test(zdroj('lib/stampsAdmin.ts')));
  ok('R9: hromadně přes skupinu nebo výběr, strop 200', /MAX_HROMADNE = 200/.test(member) && /groupId/.test(member) && /customerIds/.test(member));
  ok('R14: odměny nevytvářejí řádek kuponu na každé dokončení (jeden na kampaň a lhůtu, nárok nese událost)', /campaign_id = \$\{c\.id\} AND kind = 'stamps'/.test(stamps) && /stamp_event_id/.test(stamps));
  ok('R12: položky odměny jdou do popisu kuponu', /Odměna: \$\{jmena\.join/.test(stamps));
  ok('R10: export je v admin routě a chráněn oprávněním kampaně', /export/.test(admin) && /Export nese e-maily členů/.test(admin));
  ok('R3: okno platnosti se kontroluje při návštěvě i účtence', /platiTed\(c, dow, hhmm\)/.test(stamps) && /platiTed\(p, k\.dow, k\.hhmm\)/.test(zdroj('lib/stampsPlan.ts')));

  // Schéma: init a lazy kopie musí být totéž, a tabulky musí znát smazání účtu
  const nove = ['client_stamp_campaigns.stamp_sections', 'client_stamp_campaigns.excluded_sections', 'client_stamp_campaigns.combinable', 'client_stamp_campaigns.card_color', 'client_stamp_campaigns.card_icon', 'client_stamp_campaigns.card_image', 'client_coupon_claims.stamp_event_id'];
  const maSloupec = (zdrojak: string, x: string) => { const [t, c] = x.split('.'); return new RegExp(`ALTER TABLE ${t} ADD COLUMN IF NOT EXISTS ${c}\\b`).test(zdrojak); };
  eq('schéma: každý nový sloupec je v init i v lazy zajištění', nove.filter(x => !maSloupec(init, x) || !maSloupec(schema, x)), []);
  ok('schéma: tabulka klíčů akcí je v init i lazy', /CREATE TABLE IF NOT EXISTS client_kasa_idem/.test(init) && /CREATE TABLE IF NOT EXISTS client_kasa_idem/.test(schema));
  const smazani = zdroj('lib/smazaniUctu.ts');
  ok('smazání účtu zná nové tabulky', /client_stamp_events: 'smazat'/.test(smazani) && /'client_kasa_idem'/.test(smazani));
  ok('audit: akce razítek mají popisek', /'client\.stamps':/.test(zdroj('lib/auditPopisky.ts')) && /'client\.stamps\.manual':/.test(zdroj('lib/auditPopisky.ts')));

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
  const tabs = zdroj('components/client/LoyaltyTabs.tsx');
  ok('správa: editor kartičky je jeden (KampanEditor s náhledem pohledem hosta) a ruční razítka hromadně jsou v nabídce kartičky', /<KampanEditor form=/.test(tabs) && /<RucniRazitka kampan=/.test(tabs));
  ok('host: stránka podniku používá kartu pohledem hosta a skončené kartičky', /<KartaRazitek karta=\{cp\}/.test(zdroj('components/client/BusinessPage.tsx')) && /endedCampaigns/.test(zdroj('components/client/BusinessPage.tsx')));
}
