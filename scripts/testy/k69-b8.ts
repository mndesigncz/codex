// Kolo 69, balík B8 (Managero client a Akce) — jednotkové testy výpočtů, katalogu, stránek a API.
//
// Výpočty jsou v lib/klientPrehled.ts (čistý modul). Hlídá se hlavně to, co se dřív
// pokazilo nebo co by se pokazit mohlo: Přehled Clientu posílal čísla každému
// s klient.prehled (N13), „Věrnost za 30 dní" by z celkového počtu kuponů udělala
// třicetidenní, výsledek akce s uzávěrkou se v seznamu počítal jinak než v detailu,
// rezervaci šlo „potvrdit" i bez rezervace.schvalovat a ruční tvary „stůl/stoly/stolů".

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  vyberRezervace, hlavniKrok, muzeDo, klicPrechodu, souhrnDne, seradDnes, poDnech, vyberHodnoceni, prumerCesky,
  vyberCleny, nejvernejsi, vyberVernost, krokyPropojeni, souhrnPodleOpravneni, vyberAkceSouhrn, akceKPriprave,
  posledniProbehla, vysledekAkce, prepniBod,
} from '../../lib/klientPrehled.ts';
import { WIDGETY as KLIENT } from '../../lib/widgety/katalog/klient.ts';
import { WIDGETY as AKCE } from '../../lib/widgety/katalog/akce.ts';
import { stranka } from '../../lib/widgety/stranky/index.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Zdroják bez řádkových komentářů — komentáře o odstraněném confirm() mluví záměrně. */
const bezKomentaru = (s: string) => s.split('\n').filter(l => !/^\s*(\/\/|\/?\*|\{\/\*)/.test(l)).join('\n');

export default function ({ eq, ok }: Testy) {
  // ---- rezervace ----
  const rez = vyberRezervace({
    reservations: [
      { id: 3, date: '2026-09-26', time: '19:15:00', party: 8, status: 'confirmed', customer_name: 'Tereza', table_id: 2, table_name: 'Velký stůl' },
      { id: 1, date: '2026-09-26', time: '17:30', party: 4, status: 'requested', customer_name: 'Jana', customer_email: 'jana@x.cz', note: ' Oslava ' },
      { id: 2, date: '2026-09-26', time: '12:00', party: 2, status: 'declined', customer_name: 'Petr' },
      { id: 4, date: '2026-09-26', time: '11:00', party: 2, status: 'done', customer_name: 'Klára' },
      { id: 5, date: '2026-09-27', time: '10:00', party: 0, status: 'nesmysl', customer_name: '' },
    ],
    tables: [{ id: 2, name: 'Velký stůl', seats: 8 }],
  });
  eq('rezervace: čas bez sekund, e-mail jen když ho API poslalo (zakaznici.kontakty)', [rez.rezervace[0].cas, rez.rezervace[0].email, rez.rezervace[1].email], ['19:15', null, 'jana@x.cz']);
  eq('rezervace: poznámka ořezaná, neznámý stav → čeká, host bez jména → „Host", aspoň 1 osoba', [rez.rezervace[1].poznamka, rez.rezervace[4].stav, rez.rezervace[4].host, rez.rezervace[4].osob], ['Oslava', 'requested', 'Host', 1]);
  let spadlo = false;
  try { vyberRezervace({ error: 'x' }); } catch { spadlo = true; }
  ok('rezervace: nečekaný tvar je chyba widgetu (ErrorState), ne „nikdo nerezervoval"', spadlo);
  eq('rezervace: dnešek bez odmítnutých a zrušených (dnes, čeká, osob)', souhrnDne(rez.rezervace.slice(0, 4)), { dnes: 3, ceka: 1, osob: 14 });
  eq('rezervace: pořadí dneška — čeká, pak živé podle času, proběhlé a odmítnuté na konci (mezi sebou podle času)', seradDnes(rez.rezervace.slice(0, 4)).map(r => r.id), [1, 3, 4, 2]);
  eq('rezervace: po dnech v pořadí z API', poDnech(rez.rezervace).map(([d, r]) => [d, r.length]), [['2026-09-26', 4], ['2026-09-27', 1]]);
  const vse = () => true;
  const jenUsadit = (k: string) => k === 'rezervace.usadit';
  const jenSchvalit = (k: string) => k === 'rezervace.schvalovat';
  eq('rezervace: hlavní krok podle stavu (vedení)', ['requested', 'confirmed', 'seated', 'done'].map(s => hlavniKrok(s as any, vse)?.popisek ?? null), ['Potvrdit', 'Usadit', 'Hotovo', null]);
  eq('rezervace: bez rezervace.schvalovat žádné „Potvrdit" (Barista u dveří)', [hlavniKrok('requested', jenUsadit), hlavniKrok('confirmed', jenUsadit)?.na], [null, 'seated']);
  eq('rezervace: jen schvalovat — potvrdí, ale neusadí', [hlavniKrok('requested', jenSchvalit)?.na, hlavniKrok('confirmed', jenSchvalit)], ['confirmed', null]);
  ok('rezervace: přechody jako FLOW v API (usazenou nejde odmítnout)', muzeDo('confirmed', 'declined') && !muzeDo('seated', 'declined') && !muzeDo('done', 'confirmed'));
  eq('rezervace: klíč přechodu jako v API', [klicPrechodu('declined'), klicPrechodu('done')], ['rezervace.schvalovat', 'rezervace.usadit']);

  // ---- hodnocení a členové ----
  const h = vyberHodnoceni({ reviews: [{ id: 1, rating: 2, note: '', ref: 'ord:5', created_at: '2026-09-25 10:00:00', customer_name: 'Eva' }], count: 61, avg: 4.62, dist: [1, 2, 3, 20, 35] });
  eq('hodnocení: průměr česky s čárkou a jedním desetinným místem', [prumerCesky(h.prumer), prumerCesky(null)], ['4,6', '–']);
  eq('hodnocení: rozložení a zdroj z ref', [h.rozlozeni, h.posledni[0].zdroj, h.posledni[0].poznamka], [[1, 2, 3, 20, 35], 'objednavka', null]);
  const cl = vyberCleny({ customers: [
    { id: 1, name: 'A', points: 10, visits: 40, joined_at: '2025-01-01' },
    { id: 2, name: 'B', points: 900, visits: 5, joined_at: '2026-09-01' },
    { id: 3, name: 'C', points: 300, visits: 40, joined_at: '2026-03-01' },
  ], total: 148 });
  eq('členové: celkem z API, ne délka stránky', cl.celkem, 148);
  eq('členové: nejvěrnější podle návštěv (shoda → body), bodů a nejnovější', [nejvernejsi(cl.clenove, 'navstevy').map(c => c.id), nejvernejsi(cl.clenove, 'body').map(c => c.id), nejvernejsi(cl.clenove, 'nejnovejsi', 1).map(c => c.id)], [[3, 1, 2], [2, 3, 1], [2]]);

  // ---- věrnost za 30 dní ----
  const v = vyberVernost({
    summary: { pointsGiven30: 2310, pointsSpent30: 1180, couponsRedeemed: 47, newMembers30: 23 },
    series: [{ day: '2026-09-25', active: 3, new_members: 1, redeemed: 2 }, { day: '2026-09-26', active: 0, new_members: 2, redeemed: 1 }],
  });
  eq('věrnost 30 dní: body ze souhrnu, kupony a noví členové z řady (ne „celkem od začátku")', [v.rozdano, v.utraceno, v.kuponu, v.noviClenove], [2310, 1180, 3, 3]);
  eq('věrnost 30 dní: aktivní hosté po dnech pro graf', v.poDnech.map(d => d.aktivnich), [3, 0]);

  // ---- propojení ----
  const kroky = krokyPropojeni({ enabled: true, menu: false, tables: 3, tablesPaired: 1, pos: true, location: false, loyaltyOn: true, pointsPer100: 10 }, '€');
  eq('propojení: šest kroků, hotové podle setup', kroky.map(k => k.hotovo), [true, false, true, true, false, true]);
  eq('propojení: tvary přes czCount (3 stoly, 1 spárovaný), měna podniku', [kroky[2].popisek, kroky[5].popisek], ['3 stoly, 1 spárovaný s pokladnou', 'Věrnost běží: 10 b. za 100 €']);
  eq('propojení: kdo smí krok nastavit (katalog, akce:nastavit)', [...new Set(kroky.map(k => k.klic))].sort(), ['klient.nastaveni', 'stoly.upravit', 'vernost.pravidla']);
  eq('propojení: bez setup nespadne', krokyPropojeni(null).every(k => !k.hotovo), true);

  // ---- N13: souhrn podle oprávnění ----
  const souhrn = { enabled: true, reservations: { requested: 2, today: 3 }, orders: { new: 1, today: 9 }, members: 148, reviews: { avg: 4.6 }, attention: 3 };
  const jen = (klice: string[]) => (k: string) => klice.includes(k);
  const bez = souhrnPodleOpravneni(souhrn, jen(['klient.prehled']));
  eq('N13: jen klient.prehled — rezervace, objednávky a hodnocení null, odznak 0', [bez.reservations, bez.orders, bez.reviews, bez.attention, bez.members], [null, null, null, 0, 148]);
  const obsluha = souhrnPodleOpravneni(souhrn, jen(['objednavky.zobrazit']));
  eq('N13: s objednávkami jen objednávky a odznak z nich', [obsluha.orders, obsluha.reservations, obsluha.attention], [{ new: 1, today: 9 }, null, 1]);
  eq('N13: vedení vidí vše', souhrnPodleOpravneni(souhrn, () => true).attention, 3);

  // ---- akce ----
  const akce = vyberAkceSouhrn({ events: [
    { id: 1, title: 'Koncert', date: '2026-09-20', status: 'done', revenue: 5000, costs: 3000, closingsCount: 1, closingsTotal: 8200, checklist: [] },
    { id: 2, title: 'Degustace', date: '2026-09-24', status: 'planned', revenue: null, costs: null, closingsCount: 0, checklist: [{ text: 'x', done: false }] },
    { id: 3, title: 'Zrušená', date: '2026-09-28', status: 'cancelled', checklist: [{ text: 'a' }] },
    { id: 4, title: 'Výjezd', date: '2026-09-30', startTime: '18:00:00', status: 'confirmed', checklist: [{ text: 'Stan', done: true }, { text: '  ' }, { text: 'Kabel' }] },
    { id: 5, title: 'Přednáška', date: '2026-09-29', status: 'planned', checklist: [] },
  ] });
  eq('akce: tržbu akce s uzávěrkou nese uzávěrka (jako detail), prázdné body checklistu pryč', [akce[0].trzba, akce[3].checklist.length, akce[3].zacatek], [8200, 2, '18:00']);
  eq('akce: příprava = nejbližší nadcházející s checklistem, zrušená ne', akceKPriprave(akce, '2026-09-26')?.id, 4);
  eq('akce: poslední proběhlá s čísly (bez čísel se přeskočí, „0 Kč" by lhalo)', posledniProbehla(akce, '2026-09-26')?.id, 1);
  eq('akce: výsledek = tržba − náklady; bez obojího null', [vysledekAkce(akce[0]), vysledekAkce(akce[1]), vysledekAkce({ trzba: null, naklady: 500 })], [5200, null, -500]);
  eq('akce: odškrtnutí přepne jen jeden bod a nemění vstup', [prepniBod(akce[3].checklist, 1).map(c => c.done), akce[3].checklist[1].done], [[true, true], false]);
  spadlo = false;
  try { vyberAkceSouhrn({}); } catch { spadlo = true; }
  ok('akce: nečekaný tvar je chyba widgetu', spadlo);

  // ---- katalog, komponenty a stránky ----
  eq('katalog B8: všechny widgety Clientu a Akcí jsou hotové', [...KLIENT, ...AKCE].filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  const oblastKlient = precti('components/widgety/oblasti/klient.tsx');
  const oblastAkce = precti('components/widgety/oblasti/akce.tsx');
  for (const w of KLIENT) ok(`komponenta: ${w.id} je v KOMPONENTY`, oblastKlient.includes(`'${w.id}':`));
  for (const w of AKCE) ok(`komponenta: ${w.id} je v KOMPONENTY`, oblastAkce.includes(`'${w.id}':`));
  eq('katalog B8: ikony widgetů Přehledu Clientu se neopakují (AK-19)', new Set(KLIENT.filter(w => w.id !== 'klient.hoste_vernost').map(w => w.ikona)).size, KLIENT.length - 1);
  eq('katalog: Výsledek akce chce akce.finance (API bez něj čísla nepošle)', widget('akce.vysledek')?.opravneni.vse, ['akce.zobrazit', 'akce.finance']);
  const STRANKY_B8 = ['vedeni.klient', 'vedeni.klient_rezervace', 'vedeni.klient_objednavky', 'vedeni.klient_zakaznici', 'vedeni.klient_vernost', 'vedeni.klient_stoly', 'vedeni.akce'];
  eq('stránky B8: plochy jsou zapnuté', STRANKY_B8.filter(id => !stranka(id)?.aktivni), []);
  ok('stránky B8: Přehled Clientu nástroj nemá (celý z widgetů), ostatní ano', stranka('vedeni.klient')?.nastroj === null && STRANKY_B8.slice(1).every(id => !!stranka(id)?.nastroj));
  eq('stránky B8: přístup podle klíčů záložek', ['vedeni.klient_rezervace', 'vedeni.klient_objednavky', 'vedeni.klient_stoly'].map(id => stranka(id)?.pristup), [['rezervace.zobrazit'], ['objednavky.zobrazit'], ['stoly.zobrazit']]);
  ok('stránky B8: každá doporučuje aspoň jeden widget', STRANKY_B8.every(id => (stranka(id)?.doporucene.length ?? 0) > 0));

  const cteniKlient = [...oblastKlient.matchAll(/fetch\(([^)]*)\)/g)].map(m => m[1]);
  ok('oblast klient: fetch jen pro zápis (PATCH), čtení přes useDataWidgetu', cteniKlient.every(a => /URL_PRIJEM|reservations'/.test(a)) && /method: 'PATCH'/.test(oblastKlient));
  ok('oblasti: widget nikdy s limetkou (variant="accent")', !/variant="accent"/.test(oblastKlient) && !/variant="accent"/.test(oblastAkce));
  ok('oblast klient: jména členů jen se zakaznici.zobrazit (URL null bez klíče)', /ok && jmena \? `\/api\/client\/admin\/customers/.test(oblastKlient));

  // ---- zdrojáky stránek: audit ----
  const soubory = ['components/client/ClientAdmin.tsx', 'components/client/StaffInbox.tsx', 'components/client/LoyaltyTabs.tsx', 'components/client/FloorPlanEditor.tsx',
    'components/client/QrDesigner.tsx', 'components/client/CardScan.tsx', 'components/client/BrandTab.tsx', 'components/employer/EventsView.tsx', 'components/employer/ShareSettings.tsx'];
  for (const soubor of soubory) {
    const kod = bezKomentaru(precti(soubor));
    ok(`${soubor}: bez confirm() a prompt()`, !/\b(confirm|prompt)\(/.test(kod));
    // „→" zůstává jen v cestě v nastavení („Nastavení → Pokladna"), ne jako ikona odkazu.
    ok(`${soubor}: bez animate-pulse, „✓", „★", „⬚" a „↗"`, !/animate-pulse/.test(kod) && !/[✓★⬚↗]/u.test(kod));
    ok(`${soubor}: bez přepsaného pole 'field !py-2.5 text-sm'`, !/field !py-2\.5/.test(kod));
  }
  const admin = bezKomentaru(precti('components/client/ClientAdmin.tsx'));
  ok('ClientAdmin: papír z body (bez natvrdo #F1F3ED), bez vlastní funkce chip() a StatCard', !/F1F3ED/.test(admin) && !/const chip =/.test(admin) && !/function StatCard/.test(admin));
  ok('ClientAdmin: plochy stránek Clientu', STRANKY_B8.slice(0, 4).concat(['vedeni.klient_stoly']).every(id => admin.includes(`stranka="${id}"`)));
  ok('ClientAdmin: záložky podle oprávnění a sdílený Dock s odznaky', /moje = TABS\.filter\(t => !t\.klice \|\| ma\(t\.klice\)\)/.test(admin) && /<Dock /.test(admin) && /badge: n/.test(admin));
  ok('ClientAdmin: navigace z widgetů na záložky Clientu zůstává uvnitř', /NavigaceKontext\.Provider value=\{navigace\}/.test(admin));
  ok('ClientAdmin: jeden Toast místo limetkového proužku', /<Toast /.test(admin) && !/toast-in/.test(admin));
  ok('LoyaltyTabs: plocha vedeni.klient_vernost a jedno „Uložit" v hlavičce (atribut form)', /stranka="vedeni\.klient_vernost"/.test(precti('components/client/LoyaltyTabs.tsx'))
    && /form=\{FORM_BODY\} variant="accent"/.test(precti('components/client/LoyaltyTabs.tsx')) && !/function Saver/.test(precti('components/client/LoyaltyTabs.tsx')));
  ok('LoyaltyTabs: bez nativních zaškrtávátek a lokální komponenty Chip', !/type="checkbox"/.test(precti('components/client/LoyaltyTabs.tsx')) && !/function Chip\(/.test(precti('components/client/LoyaltyTabs.tsx')));
  const ev = bezKomentaru(precti('components/employer/EventsView.tsx'));
  ok('EventsView: plocha vedeni.akce bez vlastního odsazení stránky, prázdno EmptyState', /stranka="vedeni\.akce"/.test(ev) && !/"p-4 sm:p-6 space-y-6"/.test(ev) && /<EmptyState icon="calendarCheck"/.test(ev));
  ok('EventsView: „Nová akce" jen s akce.upravit', /primary: spravuje \?/.test(ev) && /ma\('akce\.upravit'\)/.test(ev));
  ok('StaffInbox: „Přijmout" tmavě a jen s objednavky.vyridit', !/variant="accent"/.test(precti('components/client/StaffInbox.tsx')) && /ma\('objednavky\.vyridit'\)/.test(precti('components/client/StaffInbox.tsx')));
  // ---- opravy po review ----
  ok('EventsView: bez alert() — hlášky přes Toast (oznam)', !/\balert\(/.test(ev) && /oznam\((?:t\()?'Tým dostal notifikaci o akci\.'\)?\)/.test(ev) && /<Toast /.test(ev));
  ok('EventsView: Nová akce i detail jsou <Modal>, žádné ruční okno ani useModal vedle', !/modal-overlay|modal-sheet|useModal\(/.test(ev) && (ev.match(/<Modal /g) ?? []).length === 2);
  ok('EventsView: potvrzení a balení jsou krok téhož okna, Escape v kroku jen zpět (window capture)', /onClose=\{krok \? zavriKrok : onClose\}/.test(ev) && /window\.addEventListener\('keydown', naKlavesu, true\)/.test(ev) && /hidden=\{!!krok\}/.test(ev));
  ok('EventsView: stav a místo přes Segmented, lidé PersonChip, pole s Field (bez inputClass a ručních barev)', /ariaLabel=(?:"Stav akce"|\{t\('Stav akce'\)\})/.test(ev) && /ariaLabel=(?:"Kde se akce koná"|\{t\('Kde se akce koná'\)\})/.test(ev)
    && /<PersonChip /.test(ev) && !/inputClass|#0A84FF|#0A5CC0|bg-white\/70|>\+<\/button>/.test(ev) && !/role="radiogroup"/.test(ev));
  ok('EventsView: pole detailu mají popisek (Název akce, Nový úkol k akci)', /label=(?:"Název akce"|\{t\('Název akce'\)\})/.test(ev) && /label=(?:"Nový úkol k akci"|\{t\('Nový úkol k akci'\)\})/.test(ev) && !/placeholder="Název akce"/.test(ev));
  ok('ClientAdmin: souhrn (odznaky) se obnoví při změně záložky a periodicky', /minulaZalozka\.current = tab;\s*obnovSouhrn\(\)/.test(admin) && /setInterval\(\(\) => \{ if \(document\.visibilityState === 'visible'\) obnovSouhrn\(\)/.test(admin));
  ok('StaffInbox a widget Objednávky od stolu obnoví souhrn po změně objednávky', /onZmena\?\.\(\)/.test(precti('components/client/StaffInbox.tsx')) && /<StaffInbox onToast=\{t => oznam\(t\)\} onZmena=\{onZmena\} \/>/.test(admin)
    && /obnovDataWidgetu\('\/api\/client\/admin\/summary'\);\s*\}\s*\};\s*const vse = data\.data\?\.objednavky/.test(precti('components/widgety/oblasti/klient.tsx')));
  ok('ClientAdmin: skupiny člena i bez vernost.zobrazit (deník bodů jen s ním)', /const rozbali = vidiDenik \|\| meniSkupiny/.test(admin) && /useLoad<any\[\]>\(vidiDenik \? /.test(admin));

  for (const l of ['components/employer/EmployerLayout.tsx', 'components/employee/EmployeeLayout.tsx']) {
    ok(`${l}: spodní dok je sdílený Dock`, /<Dock /.test(precti(l)) && !/dock-strong|glass-strong mx-auto max-w-md/.test(precti(l)));
  }

  // ---- API ----
  ok('N13: /api/client/admin/summary filtruje podle oprávnění', /souhrnPodleOpravneni\(/.test(precti('app/api/client/admin/summary/route.ts')));
  const zakaznici = precti('app/api/client/admin/customers/route.ts');
  ok('API členů: řazení a strop pro widget (?sort=&limit=), bez nich beze změny', /CASE WHEN \$\{podleNavstev\} THEN m\.visits END DESC/.test(zakaznici) && /Math\.min\(500/.test(zakaznici));
}
