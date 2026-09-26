// Kolo 69, balík B2 (Docházka a tým) — jednotkové testy výpočtů widgetů, katalogu a zdrojů.
//
// Výpočty jsou v lib/dochazkaPrehled.ts (čistý modul). Hlídá se hlavně to, co
// se dřív pokazilo nebo na co se snadno zapomene: zapomenutý odchod, který
// přidal do hodin i mzdy třicet hodin; tři různá „Odpracováno" za jeden měsíc;
// směna přes půlnoc; pomocné uzávěrky „za kolegu" v tržbách; sazba „nevidím"
// (null) počítaná jako „nemá"; a hodiny ze všech podniků na Domů (N14).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  ZAPOMENUTY_MS, bezSazby, cekajiciPozvanky, dnesVPodniku, hodinyMinuty, konecSmeny, mujMesic, mzdyZaObdobi, obdobiDni,
  otevrenePrichody, podilMezd, roleSPocty, rozeberZaznam, sazbyZRosteru, seradSouhrn, souhrnHodin, trzbyZaObdobi,
  type ZaznamDochazky,
} from '../../lib/dochazkaPrehled.ts';
import { pragueMomentOf } from '../../lib/pragueTime.ts';
import { WIDGETY as DOCHAZKA } from '../../lib/widgety/katalog/dochazka.ts';
import { WIDGETY as TYM } from '../../lib/widgety/katalog/tym.ts';
import { STRANKA as S_DOCHAZKA } from '../../lib/widgety/stranky/vedeni.dochazka.ts';
import { STRANKA as S_TYM } from '../../lib/widgety/stranky/vedeni.tym.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';

const H = 3600_000;
const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Zdroj bez komentářů — komentáře o odstraněném confirm() a „✓" mluví záměrně. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');

export default function ({ eq, ok }: Testy) {
  // Pevné „teď": 26. 9. 2026 14:00 v Praze (12:00 UTC).
  const dnes = '2026-09-26';
  const ted = Date.parse('2026-09-26T12:00:00Z');
  const z = (id: number, od: string, doCasu: string | null, x: Partial<ZaznamDochazky> = {}): ZaznamDochazky =>
    ({ id: Math.random(), employeeId: id, employeeName: `Člověk ${id}`, clockIn: od, clockOut: doCasu, ...x });

  // ---- jeden záznam ----
  eq('záznam: hotový 8 h', rozeberZaznam(z(1, '2026-09-25 06:00:00', '2026-09-25 14:00:00'), ted), { druh: 'hotovy', ms: 8 * H, delka: 8 * H });
  eq('záznam: čas z databáze bez zóny je UTC (parseDbTime), běží 2 h', rozeberZaznam(z(1, '2026-09-26 10:00:00', null), ted).ms, 2 * H);
  const zap = rozeberZaznam(z(1, '2026-09-25 18:00:00', null), ted);
  ok('záznam: otevřený déle než 16 h = zapomenutý odchod, do hodin 0', zap.druh === 'zapomenuty' && zap.ms === 0 && zap.delka > ZAPOMENUTY_MS);
  eq('záznam: uzavřený nad 24 h se nepočítá (lib/wages)', rozeberZaznam(z(1, '2026-09-20 06:00:00', '2026-09-21 08:00:00'), ted).druh, 'dlouhy');
  eq('záznam: odchod před příchodem = vadný, 0', rozeberZaznam(z(1, '2026-09-25 10:00:00', '2026-09-25 09:00:00'), ted), { druh: 'vadny', ms: 0, delka: 0 });

  // ---- souhrn a mzdy ----
  const entries = [
    z(1, '2026-09-25 06:00:00', '2026-09-25 14:00:00'),           // 8 h
    z(1, '2026-09-24 06:00:00', '2026-09-24 10:30:00'),           // 4,5 h
    z(2, '2026-09-26 10:00:00', null, { employeeName: 'Běží' }),  // 2 h běží
    z(3, '2026-09-25 18:00:00', null, { employeeName: 'Zapomněl' }), // zapomenutý
    z(3, '2026-09-23 06:00:00', '2026-09-23 12:00:00'),           // 6 h
  ];
  const sazby = sazbyZRosteru([{ id: 1, hourlyRate: 200 }, { id: 2, hourlyRate: 0 }, { id: 3, hourlyRate: null }]);
  eq('sazby: nula ani null do mapy nepatří', [...sazby.entries()], [['1', 200]]);
  const souhrn = souhrnHodin(entries, ted, sazby);
  const r1 = souhrn.find(r => r.id === '1')!, r2 = souhrn.find(r => r.id === '2')!, r3 = souhrn.find(r => r.id === '3')!;
  eq('souhrn: hodiny a počet směn po lidech', [r1.ms / H, r1.pocet, r2.ms / H, r2.bezi, r3.ms / H, r3.pocet, r3.vynechano], [12.5, 2, 2, true, 6, 2, 1]);
  eq('souhrn: mzda po záznamu (8 h × 200 + 4,5 h × 200), bez sazby null', [r1.mzda, r2.mzda, r3.mzda], [2500, null, null]);
  eq('souhrn: řazení podle hodin / mzdy / jména', [
    seradSouhrn(souhrn, 'hodiny').map(r => r.id), seradSouhrn(souhrn, 'mzda')[0].id, seradSouhrn(souhrn, 'jmeno').map(r => r.jmeno),
  ], [['1', '3', '2'], '1', ['Běží', 'Člověk 1', 'Zapomněl']]);
  eq('mzdy za období: součet, lidé s hodinami bez sazby, vynechané záznamy', mzdyZaObdobi(entries, ted, sazby), { celkem: 2500, bezSazby: 2, vynechano: 1 });
  eq('hodiny slovy', [hodinyMinuty(12.5 * H), hodinyMinuty(45 * 60000), hodinyMinuty(-5)], ['12 h 30 min', '45 min', '0 min']);

  // ---- tržby a podíl ----
  const uz = [
    { date: '2026-09-25', cash_revenue: 6000, card_revenue: 4000 },
    { date: '2026-09-25', covered_by: 7, cash_revenue: 999, card_revenue: 0 },   // pomocný řádek
    { date: '2026-09-27', shift_date: '2026-09-26', cash_revenue: 1000, card_revenue: 0 }, // po půlnoci, patří k 26.
    { date: '2026-08-01', cash_revenue: 50000, card_revenue: 0 },                // mimo období
  ];
  const o = obdobiDni(7, dnes);
  eq('období 7 dní včetně dneška', o, { od: '2026-09-20', do: '2026-09-26' });
  eq('tržby: jen hlavní uzávěrky v období, den směny rozhoduje', trzbyZaObdobi(uz, o.od, o.do), { trzby: 11000, pocet: 2, skryto: false });
  ok('tržby: uzávěrka bez tržby (role bez finance.trzby) = skryto, ne nula', trzbyZaObdobi([{ date: '2026-09-25', trzbaSkryta: true }], o.od, o.do).skryto);
  eq('podíl mezd: 2 500 z 10 000 = 25 %, bez tržeb null', [podilMezd(2500, 10000), podilMezd(2500, 0)], [25, null]);

  // ---- otevřené příchody ----
  const roster = [
    { id: 1, name: 'Po konci', openSince: '2026-09-26 05:00:00', openEntryId: 11, shiftStart: '07:00', shiftEnd: '13:00' }, // konec 13:00, teď 14:00
    { id: 2, name: 'V čase', openSince: '2026-09-26 08:00:00', openEntryId: 12, shiftStart: '10:00', shiftEnd: '18:00' },
    { id: 3, name: 'Bez plánu dlouho', openSince: '2026-09-25 23:00:00', openEntryId: 13 },                                // 13 h
    { id: 4, name: 'Bez plánu krátce', openSince: '2026-09-26 09:00:00', openEntryId: 14 },
    { id: 5, name: 'Noční', openSince: '2026-09-26 11:00:00', openEntryId: 15, shiftStart: '22:00', shiftEnd: '02:00' },   // konec zítra
    { id: 6, name: 'Nepíchnutý', openSince: null, shiftStart: '07:00', shiftEnd: '13:00' },
  ];
  const otevrene = otevrenePrichody(roster, ted, dnes);
  eq('otevřené příchody: po konci plánu a bez plánu přes 12 h (ne noční ani běžící)', otevrene.map(x => x.id).sort(), ['1', '3']);
  eq('otevřené příchody: u plánu konec a o kolik je přes', [otevrene.find(x => x.id === '1')?.planDo, Math.round((otevrene.find(x => x.id === '1')?.pres ?? 0) / 60000)], ['13:00', 60]);
  // „Ukončit" navrhuje plánovaný konec jako okamžik (Právě na směně i Otevřené příchody), ne „teď".
  eq('otevřené příchody: plánovaný konec jako okamžik pro návrh odchodu', [otevrene.find(x => x.id === '1')?.planKonec?.getTime(), otevrene.find(x => x.id === '3')?.planKonec], [pragueMomentOf(dnes, '13:00')!.getTime(), null]);
  eq('konec směny: přes půlnoc zítra, bez plánu null', [konecSmeny(dnes, '22:00', '02:00')?.getTime(), konecSmeny(dnes, null, null)], [pragueMomentOf('2026-09-27', '02:00')!.getTime(), null]);
  ok('směna přes půlnoc končí zítra', pragueMomentOf('2026-09-27', '02:00')!.getTime() > ted);

  // ---- dnes v podniku ----
  const dnesni = [z(7, '2026-09-26 05:05:00', '2026-09-26 09:00:00')];
  const radky = dnesVPodniku([
    { id: 6, name: 'Nepřišel', openSince: null, shiftStart: '07:00', shiftEnd: '13:00' },
    { id: 2, name: 'Na směně', openSince: '2026-09-26 08:00:00', shiftStart: '10:00', shiftEnd: '18:00' },
    { id: 7, name: 'Odešel', openSince: null, shiftStart: '07:00', shiftEnd: '11:00' },
    { id: 8, name: 'Později', openSince: null, shiftStart: '17:00', shiftEnd: '22:00' },
    { id: 9, name: 'Volno', openSince: null },
  ], dnesni, ted, dnes);
  eq('dnes v podniku: stavy a řazení (nedorazil nahoře, bez směny vůbec ne)', radky.map(r => [r.jmeno, r.stav]), [
    ['Nepřišel', 'nedorazil'], ['Na směně', 'na_smene'], ['Později', 'ceka'], ['Odešel', 'odesel'],
  ]);
  const tablet = dnesVPodniku([{ id: 7, name: 'Odešel?', openSince: null, shiftStart: '07:00', shiftEnd: '11:00' }], null, ted, dnes);
  eq('dnes v podniku: tablet bez záznamů netvrdí „nedorazil" po konci směny', tablet[0].stav, 'po_smene');

  // ---- můj měsíc (Odpracováno, Můj výdělek) ----
  const moje = [
    z(5, '2026-09-02 06:00:00', '2026-09-02 14:00:00'),  // 8 h
    z(5, '2026-09-26 10:00:00', null),                   // běží 2 h
    z(5, '2026-08-31 06:00:00', '2026-08-31 14:00:00'),  // minulý měsíc
    z(5, '2026-09-10 06:00:00', '2026-09-11 08:00:00'),  // nad 24 h
    z(6, '2026-09-03 06:00:00', '2026-09-03 14:00:00'),  // cizí
  ];
  const m = mujMesic(moje, 5, '2026-09', ted, 150);
  eq('můj měsíc: jen moje záznamy v září, běžící do teď, nad 24 h vynechané', [m.ms / H, m.bezi, m.vynechano, m.pocet], [10, true, 1, 3]);
  eq('můj výdělek: po záznamu 8 × 150 + 2 × 150', m.mzda, 1500);
  eq('můj výdělek: bez sazby null (ne nula)', mujMesic(moje, 5, '2026-09', ted, null).mzda, null);

  // ---- tým ----
  eq('pozvánky: jen čekající, nejstarší první', cekajiciPozvanky([
    { id: 1, email: 'b', status: 'pending', created_at: '2026-09-20' },
    { id: 2, email: 'a', status: 'accepted', created_at: '2026-09-01' },
    { id: 3, email: 'c', status: 'pending', created_at: '2026-09-10' },
  ]).map(p => p.id), [3, 1]);
  const role = roleSPocty(
    [{ klic: 'vedeni', nazev: 'Vedení', typ: 'vedeni', pocet: 1 }, { klic: 'barista', nazev: 'Barista', typ: 'zamestnanec', pocet: 4 }, { klic: 'kiosk', nazev: 'Tablet', typ: 'kiosk', pocet: 1 }, { klic: 'kuchar', nazev: 'Kuchař', typ: 'zamestnanec', pocet: 0 }],
    [{ id: 9, nazev: 'Směnový', typ: 'zamestnanec', pocet: 2 }],
  );
  eq('role: podle počtu, bez tabletu, prázdné jen počtem', [role.radky.map(r => [r.nazev, r.pocet, r.vlastni]), role.prazdnych], [[['Barista', 4, false], ['Směnový', 2, true], ['Vedení', 1, false]], 1]);
  eq('bez sazby: nula ano, null (nevidím) ne, vlastník ani tablet ne', bezSazby([
    { id: 15, name: 'Majitel', role: 'employer', hourly_rate: 0 },
    { id: 16, name: 'Eva', role: 'employee', hourly_rate: 0 },
    { id: 17, name: 'Jan', role: 'employee', hourly_rate: 180 },
    { id: 18, name: 'Skrytý', role: 'employee', hourly_rate: null },
    { id: 19, name: 'Tablet', role: 'kiosk', hourly_rate: 0 },
  ], 15).map(x => x.name), ['Eva']);

  // ---- katalog a stránky ----
  eq('katalog B2: všechny widgety docházky a týmu jsou hotové', [...DOCHAZKA, ...TYM].filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  eq('stránky B2: plocha je zapnutá', [S_DOCHAZKA.aktivni, S_TYM.aktivni], [true, true]);
  for (const st of [S_DOCHAZKA, S_TYM]) {
    const vychozi = Object.values(st.vychozi).flatMap(v => v ?? []).map(p => p.w).filter(w => w !== 'nastroj');
    eq(`stránky B2: výchozí ${st.id} nemá plánovaný widget (AK-20)`, vychozi.filter(w => widget(w)?.stav !== 'hotovo'), []);
    ok(`stránky B2: ${st.id} má nástroj ve výchozím`, Object.values(st.vychozi).every(v => (v ?? []).some(p => p.w === 'nastroj')));
    eq(`stránky B2: doporučené ${st.id} existují v katalogu`, st.doporucene.filter(w => !widget(w)), []);
  }
  ok('katalog: Souhrn hodin má volbu „Podle stránky" a je výchozí', (widget('dochazka.souhrn_hodin')?.nastaveni?.find(n => n.klic === 'obdobi') as { vychozi?: unknown } | undefined)?.vychozi === 'stranka');
  // Oprávnění z katalogu (bez klíče widget neexistuje).
  eq('oprávnění: Mzdy chtějí docházku i mzdy, podíl tržby ze všech uzávěrek', [widget('dochazka.mzdy_za_obdobi')?.opravneni.vse, widget('dochazka.mzdy_za_obdobi')?.opravneni.pole?.podil_na_trzbach, widget('dochazka.mzdy_za_obdobi')?.opravneni.pole?.podil_na_trzbach_vsechny_uzaverky], [['dochazka.zobrazit', 'finance.mzdy'], 'finance.trzby', 'uzaverky.zobrazit_vse']);
  eq('oprávnění: Chybí sazba jen s finance.mzdy, Nastavit s finance.sazby_upravit', [widget('tym.bez_sazby')?.opravneni.vse, widget('tym.bez_sazby')?.opravneni.pole?.['akce:nastavit_sazbu']], [['finance.mzdy'], 'finance.sazby_upravit']);
  eq('oprávnění: Pozvánky jen s tym.pozvat, Můj výdělek s vlastní nebo všemi mzdami', [widget('tym.pozvanky')?.opravneni.vse, widget('moje.vydelek')?.opravneni.nektere], [['tym.pozvat'], ['finance.moje_mzda', 'finance.mzdy']]);

  // ---- API ----
  const api = zdroj('app/api/attendance/route.ts');
  const vetevZam = api.slice(api.indexOf('// Zaměstnanec — vlastní záznamy'));
  ok('N14: větev zaměstnance filtruje podnik (záznamy i otevřený příchod)', (vetevZam.match(/team_id = \$\{c\.teamId\} OR team_id IS NULL/g) ?? []).length >= 2);
  ok('Můj výdělek: vlastní sazba jen s finance.moje_mzda / finance.mzdy', /opr\.has\('finance\.moje_mzda'\) \|\| opr\.has\('finance\.mzdy'\)/.test(vetevZam) && /vlastniSazba\(/.test(api));
  ok('profil člena: odpracováno jen z tohoto podniku a bez zapomenutých (rozeberZaznam)', /rozeberZaznam/.test(zdroj('app/api/employees/[id]/route.ts')) && /team_id = \$\{teamId\} OR team_id IS NULL/.test(zdroj('app/api/employees/[id]/route.ts')));

  // ---- komponenty ----
  for (const soubor of ['components/widgety/oblasti/dochazka.tsx', 'components/widgety/oblasti/tym.tsx']) {
    const s = zdroj(soubor);
    const cteni = [...s.matchAll(/fetch\(([^)]*)\)/g)].map(x => x[1]).filter(a => !/method:/.test(s.slice(s.indexOf(a), s.indexOf(a) + 160)));
    eq(`${soubor}: fetch jen pro zápis (čtení přes useDataWidgetu)`, cteni, []);
    ok(`${soubor}: widget bez limetky a bez pulzování`, !/variant="accent"/.test(kod(soubor)) && !/animate-(ping|pulse)/.test(kod(soubor)));
  }
  const stranky = ['components/employer/Attendance.tsx', 'components/TeamManagement.tsx', 'components/employer/EmployeeProfile.tsx', 'components/employer/OrganizationSettings.tsx'];
  for (const soubor of stranky) {
    const s = kod(soubor);
    ok(`${soubor}: bez confirm(), ručního okna, kolečka, emoji 👤 a „✓"`, !/\bconfirm\(/.test(s) && !/modal-overlay/.test(s) && !/className="spinner"|animate-spin/.test(s) && !/👤|✓|⏰|📞/.test(s));
    ok(`${soubor}: bez ručního přepínače (role="switch") a ručně psané limetky`, !/role="switch"/.test(s) && !/bg-\[#C8F542\] text-black/.test(s));
  }
  ok('Docházka a Tým: plocha s widgety', /stranka="vedeni\.dochazka"/.test(zdroj('components/employer/Attendance.tsx')) && /stranka="vedeni\.tym"/.test(zdroj('components/TeamManagement.tsx')));
  ok('Docházka: jediná limetka „Přidat záznam" a jen s dochazka.upravit', (kod('components/employer/Attendance.tsx').match(/variant="accent"/g) ?? []).length === 1 && /primary: smiUpravit \?/.test(zdroj('components/employer/Attendance.tsx')));
  ok('Docházka: export s dochazka.exportovat, mazání s dochazka.mazat', /smi\('dochazka\.exportovat'\)/.test(zdroj('components/employer/Attendance.tsx')) && /smi\('dochazka\.mazat'\)/.test(zdroj('components/employer/Attendance.tsx')));
  ok('Tým: jediná limetka „Pozvat člena"', (kod('components/TeamManagement.tsx').match(/variant="accent"/g) ?? []).length === 1);
  ok('RoleEditor: přepínač je Switch z components/ui', /<Switch checked=\{on\}/.test(zdroj('components/role/RoleEditor.tsx')) && !/function Prepinac/.test(zdroj('components/role/RoleEditor.tsx')));
}
