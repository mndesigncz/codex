// Kolo 7 (balík R7-7) — Nastavení a tablet: čerpání limitu tarifu, souhrn směny po odchodu,
// sklad tabletu s Dochází a minimem, historie změn s hledáním a lidmi, Organizace jako sekce.
// Čistá logika bez databáze a bez prohlížeče.

import type { Testy } from './_testy.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import {
  AUDIT_POPISKY, oblastAkce, maOblast, podminkaOblasti, parametryHistorie, dalsiKurzor, filtrujHistorii, lideHistorie, oblastiHistorie,
  LIMIT_HISTORIE, PORADI_OBLASTI, OBLASTI_AUDITU, type ZaznamHistorie,
} from '../../lib/auditPopisky.ts';
import { stranka } from '../../lib/widgety/stranky/index.ts';
import { zalozkaNastaveni, otevritSekciRovnou, SKUPINA_ZALOZKY, ZALOZKY_NASTAVENI } from '../../lib/nastaveniZalozky.ts';
import { vyuziti, limityTarifu, LIMITS } from '../../lib/plan.ts';
import {
  souhrnOdchodu, SOUHRN_ZAVRIT_S, pocetStavuSkladu, seradSkladTabletu, filtrujSkladTabletu, minimumPolozky, filtrZeSkladArg,
} from '../../lib/kioskPrehled.ts';

export default function ({ eq, ok }: Testy) {
  // ---- 1) čerpání limitu tarifu (karta Váš plán) ----
  eq('využití: 2 ze 3 → zbývá jedno místo', vyuziti(2, 3), { pocet: 2, limit: 3, zbyva: 1, stav: 'malo' });
  eq('využití: 1 ze 3 → volno', vyuziti(1, 3), { pocet: 1, limit: 3, zbyva: 2, stav: 'volno' });
  eq('využití: 3 ze 3 → plno', vyuziti(3, 3), { pocet: 3, limit: 3, zbyva: 0, stav: 'plno' });
  eq('využití: přes limit (starší podnik) → plno, zbývá 0, ne záporné', vyuziti(5, 3), { pocet: 5, limit: 3, zbyva: 0, stav: 'plno' });
  eq('využití: sdílený odkaz 1 z 1 → plno, 0 z 1 → zbývá jeden', [vyuziti(1, 1).stav, vyuziti(0, 1).stav], ['plno', 'malo']);
  eq('využití: bez limitu → neomezeno', vyuziti(14, null), { pocet: 14, limit: null, zbyva: null, stav: 'neomezeno' });
  eq('využití: nesmyslný počet → 0', [vyuziti(NaN, 3).pocet, vyuziti(-2, 3).pocet], [0, 0]);
  eq('limity: Zdarma má 3 lidi a 1 odkaz, Pro a Max bez limitu', [limityTarifu({ effective: 'free' }), limityTarifu({ effective: 'pro' }), limityTarifu({ effective: 'max' })],
    [{ members: 3, shareLinks: 1 }, { members: null, shareLinks: null }, { members: null, shareLinks: null }]);
  ok('limity: karta a vymáhání čtou tutéž tabulku LIMITS', limityTarifu({ effective: 'free' }) === LIMITS.free);
  eq('limity: bez stavu tarifu (načítá se) žádné varování', limityTarifu(null).members, null);

  // ---- 2) souhrn směny po odchodu (tablet) ----
  // Říjen = letní čas, Praha je UTC+2.
  const den = souhrnOdchodu({ clockIn: '2026-10-12T06:02:00Z', clockOut: '2026-10-12T13:34:00Z' }, true);
  eq('souhrn: příchod, odchod a délka', den && [den.prichod, den.odchod, den.odpracovano, den.presPulnoc, den.chybiUzaverka], ['08:02', '15:34', '7 h 32 min', false, false]);
  const noc = souhrnOdchodu({ clockIn: '2026-10-12T20:10:00Z', clockOut: '2026-10-13T00:05:00Z' }, false);
  eq('souhrn: noční směna přes půlnoc — 22:10 → 02:05 je 3 h 55 min, další den', noc && [noc.prichod, noc.odchod, noc.odpracovano, noc.presPulnoc], ['22:10', '02:05', '3 h 55 min', true]);
  ok('souhrn: closingDone false → uzávěrka chybí', noc?.chybiUzaverka === true);
  eq('souhrn: čas z databáze bez zóny je UTC (parseDbTime)', souhrnOdchodu({ clockIn: '2026-10-12 06:02:00', clockOut: '2026-10-12 06:47:00' })?.odpracovano, '45 min');
  ok('souhrn: closingDone chybí (starší server) → uzávěrka se nehlásí', souhrnOdchodu({ clockIn: '2026-10-12T06:00:00Z', clockOut: '2026-10-12T07:00:00Z' }, null)?.chybiUzaverka === false);
  eq('souhrn: bez odchodu, nečitelné nebo obrácené → nic', [
    souhrnOdchodu({ clockIn: '2026-10-12T06:00:00Z', clockOut: null }), souhrnOdchodu(null), souhrnOdchodu({ clockIn: 'x', clockOut: 'y' }),
    souhrnOdchodu({ clockIn: '2026-10-12T08:00:00Z', clockOut: '2026-10-12T07:00:00Z' }),
  ], [null, null, null, null]);
  eq('souhrn: okno se zavře samo po 20 s', SOUHRN_ZAVRIT_S, 20);

  // ---- 3) sklad na tabletu: Dochází / Kriticky, řazení, minimum, proklik z widgetu ----
  const sklad = [
    { name: 'Mléko', category: 'Nápoje', quantity: 8, minQuantity: 4, criticalQuantity: 1 },
    { name: 'Matcha', category: 'Čaj', quantity: 1, minQuantity: 2, criticalQuantity: 0 },
    { name: 'Citrony', category: 'Ovoce', quantity: 0, minQuantity: 5, criticalQuantity: 1 },
    { name: 'Avokádo', category: 'Ovoce', quantity: 0, minQuantity: 3, criticalQuantity: 1, archived: true },
    { name: 'Brčka', category: 'Obaly', quantity: 2, minQuantity: 0, criticalQuantity: 0, status: 'low' },
    { name: 'Čokoláda', category: 'Nápoje', quantity: 3, minQuantity: 2, criticalQuantity: 1, status: 'critical' },
  ];
  eq('sklad tabletu: počty bez odložených („nevedeme"); Dochází zahrnuje i kriticky', pocetStavuSkladu(sklad), { dochazi: 4, kriticky: 2 });
  eq('sklad tabletu: stav posílaný serverem má přednost (balení) — jako stavZasoby', pocetStavuSkladu([{ name: 'X', quantity: 9, minQuantity: 2, criticalQuantity: 1, status: 'critical' }]), { dochazi: 1, kriticky: 1 });
  eq('sklad tabletu: řazení kriticky › dochází › ok, pak název česky',
    seradSkladTabletu(sklad.filter(x => !x.archived)).map(x => x.name), ['Citrony', 'Čokoláda', 'Brčka', 'Matcha', 'Mléko']);
  const f = (o: Partial<Parameters<typeof filtrujSkladTabletu>[1]>) => filtrujSkladTabletu(sklad, { nevedeme: false, stav: 'vse', kategorie: null, hledani: '', ...o }).map(x => x.name);
  eq('sklad tabletu: Dochází filtruje low + critical bez odložených', f({ stav: 'dochazi' }), ['Citrony', 'Čokoláda', 'Brčka', 'Matcha']);
  eq('sklad tabletu: Kriticky jen critical', f({ stav: 'kriticky' }), ['Citrony', 'Čokoláda']);
  eq('sklad tabletu: Dochází + kategorie + hledání bez diakritiky', [f({ stav: 'dochazi', kategorie: 'Ovoce' }), f({ hledani: 'cokol' })], [['Citrony'], ['Čokoláda']]);
  eq('sklad tabletu: „Co nevedeme" ukazuje jen odložené a filtr stavu neplatí', f({ nevedeme: true, stav: 'kriticky' }), ['Avokádo']);
  eq('minimum: „min 2 · chybí 1" u dochází', minimumPolozky(sklad[1]), { min: 2, chybi: 1 });
  eq('minimum: v pořádku jen min, žádné chybí', minimumPolozky(sklad[0]), { min: 4, chybi: null });
  eq('minimum: položka bez minima (0) nic — ani „chybí", i když je dochází podle balení', minimumPolozky(sklad[4]), { min: null, chybi: null });
  eq('minimum: stav podle balení nad holým minimem → bez „chybí"', minimumPolozky(sklad[5]), { min: 2, chybi: null });
  eq('minimum: desetiny bez šumu (0,5 bal.)', minimumPolozky({ name: 'Káva', quantity: 0.7, minQuantity: 1.2, criticalQuantity: 0.2 }), { min: 1.2, chybi: 0.5 });
  eq('proklik z widgetu: stav:dochazi|Nápoje → Dochází v kategorii Nápoje', filtrZeSkladArg('stav:dochazi|Nápoje'), { stav: 'dochazi', kategorie: 'Nápoje' });
  eq('proklik z widgetu: jen stav, jen kategorie, nic, položka', [filtrZeSkladArg('stav:dochazi'), filtrZeSkladArg('Čaj'), filtrZeSkladArg(undefined), filtrZeSkladArg('stav:dochazi|polozka:12')],
    [{ stav: 'dochazi', kategorie: null }, { stav: 'vse', kategorie: 'Čaj' }, { stav: 'vse', kategorie: null }, { stav: 'dochazi', kategorie: null }]);

  // ---- 4) týdenní rozpis na tabletu (widget Kdo má směnu) ----
  const tym = widget('rozvrh.tym_nahled');
  ok('rozpis: Kdo má směnu má rozhraní kiosk a nabízí se pro Směnu tabletu', !!tym && tym.rozhrani.includes('kiosk') && tym.stranky.includes('kiosk.smena'));
  ok('rozpis: v doporučených stránky kiosk.smena', !!stranka('kiosk.smena')?.doporucene.includes('rozvrh.tym_nahled'));
  ok('rozpis: NE ve výchozím rozložení tabletu (podnik s vypnutým náhledem ho nesmí dostat sám)',
    !Object.values(stranka('kiosk.smena')?.vychozi ?? {}).some(seznam => (seznam ?? []).some(q => q.w === 'rozvrh.tym_nahled')));
  ok('rozpis: widget chce rozvrh.nahled — bez klíče ho tablet nevidí', JSON.stringify(tym?.opravneni.vse) === JSON.stringify(['rozvrh.nahled']));

  // ---- 5) historie změn: oblasti, parametry API, kurzor, filtr ----
  const bezOblasti = Object.keys(AUDIT_POPISKY).filter(k => !maOblast(k));
  eq('historie: každý klíč z AUDIT_POPISKY má oblast z výslovné mapy (nová předpona = doplnit OBLASTI_AUDITU)', bezOblasti, []);
  ok('historie: mapa míří jen na známé oblasti', Object.values(OBLASTI_AUDITU).every(o => PORADI_OBLASTI.includes(o)));
  eq('historie: oblast podle předpony', [oblastAkce('inventory.delete'), oblastAkce('closing.delete'), oblastAkce('role.assign'), oblastAkce('pos.sync'), oblastAkce('reward.approved'), oblastAkce('client.points'), oblastAkce('organization.settings')],
    ['sklad', 'uzaverky', 'lide', 'kasa', 'odmeny', 'klient', 'nastaveni']);
  eq('historie: výjimka má přednost před předponou (team.settings je nastavení, team.remove lidé)', [oblastAkce('team.settings'), oblastAkce('team.remove'), oblastAkce('kiosk.login'), oblastAkce('kiosk.pin')], ['nastaveni', 'lide', 'nastaveni', 'lide']);
  eq('historie: neznámá akce → ostatní', [oblastAkce('neco.nove'), oblastAkce(''), oblastAkce('bezTecky')], ['ostatni', 'ostatni', 'ostatni']);
  const pl = podminkaOblasti('lide');
  ok('historie SQL: oblast Lidé má předponu team, ale ne team.settings (krome)', pl.predpony.includes('team') && pl.krome.includes('team.settings') && !pl.nezname);
  ok('historie SQL: oblast Nastavení bere team.settings jako výjimku (vcetne)', podminkaOblasti('nastaveni').vcetne.includes('team.settings'));
  ok('historie SQL: Ostatní bere i neznámé předpony', podminkaOblasti('ostatni').nezname && podminkaOblasti('ostatni').znamePredpony.includes('inventory'));
  const q = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  eq('historie API: výchozí parametry', parametryHistorie(q({})), { before: null, limit: 100, user: null, oblast: null });
  eq('historie API: before, limit, user, oblast', parametryHistorie(q({ before: '881', limit: '50', user: '16', oblast: 'sklad' })), { before: 881, limit: 50, user: 16, oblast: 'sklad' });
  eq('historie API: limit nad strop → 200, nesmysly se zahodí', parametryHistorie(q({ limit: '5000', before: '-3', user: 'x', oblast: 'hack' })), { before: null, limit: LIMIT_HISTORIE.max, user: null, oblast: null });
  eq('historie API: nula a desetinné číslo nejsou id', [parametryHistorie(q({ before: '0' })).before, parametryHistorie(q({ user: '1.5' })).user], [null, null]);
  const radky = Array.from({ length: 6 }, (_, i) => ({ id: 100 - i }));
  eq('kurzor: načteno víc než limit → strana a nextBefore = id posledního', [dalsiKurzor(radky, 5).strana.length, dalsiKurzor(radky, 5).nextBefore], [5, 96]);
  eq('kurzor: přesně limit nebo méně → konec', [dalsiKurzor(radky.slice(0, 5), 5).nextBefore, dalsiKurzor([], 5).nextBefore], [null, null]);
  const z = (id: number, action: string, userId: number | null, userName: string, label: string, detail: string | null = null): ZaznamHistorie =>
    ({ id, action, label, detail, userId, userName, createdAt: '2026-10-12 08:00:00' });
  const hist = [
    z(9, 'inventory.delete', 16, 'Eva Testová', 'Smazána položka skladu', 'Mražená malina'),
    z(8, 'role.assign', 15, 'Martin Nemeškal', 'Změněna role člena', 'Jakub → Provozní'),
    z(7, 'closing.delete', 16, 'Eva Testová', 'Smazána uzávěrka'),
    z(6, 'billing.referral', null, 'Systém', 'Měsíc zdarma za doporučení'),
    z(5, 'inventory.create', 17, 'Jakub Horák', 'Přidána položka skladu', 'Citrony'),
  ];
  const ids = (f: Parameters<typeof filtrujHistorii>[1]) => filtrujHistorii(hist, f).map(x => x.id);
  eq('filtr: člověk', ids({ clovek: 16, oblast: null, hledani: '' }), [9, 7]);
  eq('filtr: systém (bez člověka)', ids({ clovek: 'system', oblast: null, hledani: '' }), [6]);
  eq('filtr: oblast', ids({ clovek: null, oblast: 'sklad', hledani: '' }), [9, 5]);
  eq('filtr: hledání v popisu, detailu i jméně bez diakritiky', [ids({ clovek: null, oblast: null, hledani: 'malina' }), ids({ clovek: null, oblast: null, hledani: 'jakub' }), ids({ clovek: null, oblast: null, hledani: 'uzaverka' })], [[9], [8, 5], [7]]);
  eq('filtr: vše dohromady', ids({ clovek: 16, oblast: 'sklad', hledani: 'mraz' }), [9]);
  eq('filtr: bez filtru všechno', ids({ clovek: null, oblast: null, hledani: '  ' }).length, 5);
  eq('pilulky: lidé s počtem, nejčinnější první, systém zvlášť', lideHistorie(hist).map(l => `${l.klic}:${l.pocet}`), ['16:2', '17:1', '15:1', 'system:1']);
  eq('oblasti: jen ty v datech, v pevném pořadí, s počtem', oblastiHistorie(hist), [{ oblast: 'lide', pocet: 1 }, { oblast: 'sklad', pocet: 2 }, { oblast: 'uzaverky', pocet: 1 }, { oblast: 'nastaveni', pocet: 1 }]);

  // ---- 6) Organizace jako vlastní sekce Nastavení (dřív karta pod Tým › Podnik) ----
  eq('organizace: záložka existuje a patří do skupiny Podnik', [zalozkaNastaveni('organizace'), SKUPINA_ZALOZKY.organizace], ['organizace', 'podnik']);
  ok('organizace: řadí se hned za Profil podniku (nastavení podniku pohromadě)', ZALOZKY_NASTAVENI.indexOf('organizace') === ZALOZKY_NASTAVENI.indexOf('podnik') + 1);
  ok('organizace: odkaz z nápovědy „Všechny podniky" a z přepínače podniku (?tab=organizace) otevře sekci rovnou i na telefonu', otevritSekciRovnou('organizace'));
}
