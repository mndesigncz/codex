// Kolo 6, balík B4 — tablet za barem: čistá logika z lib/kioskPrehled.ts.
//
// Hlídá se to, co se na tabletu rozbilo nebo matlo: odchod člověka s PINem bez
// číselníku (klient PIN při odchodu neposílal, server ho chtěl), výběr osoby
// mezi dvanácti lidmi bez pořádku, „Kdo teď pracuje" bez plánu, pozdní příchod
// bez slova a záložky, na které role tabletu nemá (403 až po klepnutí).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  ZALOZKY_TABLETU, viditelneZalozky, zalozkaPoOmezeni, type ZalozkaTabletu,
  PRAH_HLEDANI_ROSTERU, rozdelRoster, hledejVRosteru,
  PRAH_POZDE_MIN, zpozdeniPrichodu, minutPoPlanu,
  pocetUkoluTabletu, pocetPostupuTabletu,
} from '../../lib/kioskPrehled.ts';
import { KIOSK_BILA_LISTINA, jeOpravneni } from '../../lib/opravneni.ts';
import { vyberUkoly } from '../../lib/ukolyPrehled.ts';
import type { PostupApi, PrubehApi } from '../../lib/postupyPrehled.ts';

const H = 3600_000;
const MIN = 60_000;
const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Zdroj bez komentářů — komentář u needPin o „PIN only required to clock in" mluvil záměrně. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(l => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(l)).join('\n');

export default function ({ eq, ok }: Testy) {
  // ---- záložky podle role tabletu ----
  const zalozky: readonly ZalozkaTabletu[] = ZALOZKY_TABLETU;
  const klice = zalozky.flatMap(z => (z.klic ? [z.klic] : []));
  ok('záložky: každý klíč je známé oprávnění a je na bílé listině tabletu', klice.every(k => jeOpravneni(k) && KIOSK_BILA_LISTINA.has(k)));
  ok('záložky: Směna klíč nemá (tam se píchá), ostatní ano', zalozky.filter(z => !z.klic).map(z => z.id).join() === 'shift' && klice.length === zalozky.length - 1);
  eq('záložky: Sklad má sklad.zobrazit, Uzávěrka uzaverky.vytvorit', zalozky.filter(z => z.id === 'inventory' || z.id === 'closing').map(z => z.klic), ['sklad.zobrazit', 'uzaverky.vytvorit']);
  const bezSkladu = viditelneZalozky(ZALOZKY_TABLETU, k => k !== 'sklad.zobrazit');
  eq('záložky: role bez sklad.zobrazit nemá Sklad, pořadí ostatních drží', bezSkladu.map(z => z.id), ['shift', 'tasks', 'procedures', 'orders', 'closing', 'guides']);
  eq('záložky: před načtením oprávnění (smi = ano) jsou všechny', viditelneZalozky(ZALOZKY_TABLETU, () => true).length, ZALOZKY_TABLETU.length);
  eq('záložky: role jen s dochazka.tablet má jen Směnu', viditelneZalozky(ZALOZKY_TABLETU, () => false).map(z => z.id), ['shift']);
  eq('záložky: aktivní Sklad po odebrání klíče → Směna', zalozkaPoOmezeni('inventory', bezSkladu), 'shift');
  eq('záložky: aktivní Úkoly zůstanou', zalozkaPoOmezeni('tasks', bezSkladu), 'tasks');

  // ---- výběr osoby: Dnes na rozpisu / Ostatní ----
  const m = (id: number, name: string, shiftStart: string | null = null) => ({ id, name, shiftStart });
  const lide = [m(1, 'Zuzana Vedoucí'), m(2, 'Eva Testová', '12:00:00'), m(3, 'Jakub Horák', '09:00:00'), m(4, 'Adam Brigádník'), m(5, 'Anna Ranní', '09:00:00'), m(6, 'Čeněk Pozdní', '14:30:00')];
  const r = rozdelRoster(lide);
  eq('výběr: na rozpisu podle začátku směny, při shodě podle jména', r.naRozpisu.map(x => x.name), ['Anna Ranní', 'Jakub Horák', 'Eva Testová', 'Čeněk Pozdní']);
  eq('výběr: ostatní abecedně česky — vedení bez směny až tady', r.ostatni.map(x => x.name), ['Adam Brigádník', 'Zuzana Vedoucí']);
  eq('výběr: nikdo nemá rozpis → skupina rozpisu prázdná (nadpisy se nekreslí)', rozdelRoster([m(1, 'B'), m(2, 'A')]).naRozpisu.length, 0);
  eq('výběr: české řazení (Č za C, ne za Z)', rozdelRoster([m(1, 'Čeněk'), m(2, 'David'), m(3, 'Cyril')]).ostatni.map(x => x.name), ['Cyril', 'Čeněk', 'David']);
  eq('hledání: bez diakritiky a velikosti písmen', hledejVRosteru(lide, 'horak').map(x => x.id), [3]);
  eq('hledání: prázdný dotaz vrátí všechny', hledejVRosteru(lide, '  ').length, lide.length);
  eq('hledání: nic nenalezeno = prázdný seznam (EmptyState „Nikdo takový")', hledejVRosteru(lide, 'xyz').length, 0);
  eq('hledání: pole od devíti lidí', PRAH_HLEDANI_ROSTERU, 9);

  // ---- pozdní a brzký příchod ----
  // 26. 9. 2026, směna od 8:00 pražského času (6:00 UTC).
  const dnes = '2026-09-26';
  const zacatek = Date.parse('2026-09-26T06:00:00Z');
  eq('příchod: práh zpoždění 10 min jako server', PRAH_POZDE_MIN, 10);
  eq('příchod: 10 min po začátku ještě není pozdě', zpozdeniPrichodu(dnes, '08:00:00', zacatek + 10 * MIN), null);
  eq('příchod: 12 min po začátku → „o 12 min později"', zpozdeniPrichodu(dnes, '08:00:00', zacatek + 12 * MIN), { druh: 'pozde', min: 12 });
  eq('příchod: 25 min před → „začíná za 25 min"', zpozdeniPrichodu(dnes, '08:00', zacatek - 25 * MIN), { druh: 'brzy', min: 25 });
  eq('příchod: 3 h před ještě ano', zpozdeniPrichodu(dnes, '08:00', zacatek - 3 * H), { druh: 'brzy', min: 180 });
  eq('příchod: 3 h a minuta před → nic', zpozdeniPrichodu(dnes, '08:00', zacatek - 3 * H - MIN), null);
  eq('příchod: přesně na začátek → nic', zpozdeniPrichodu(dnes, '08:00', zacatek), null);
  eq('příchod: 12 h po začátku ještě pozdě (hranice)', zpozdeniPrichodu(dnes, '08:00', zacatek + 12 * H), { druh: 'pozde', min: 720 });
  eq('příchod: 13 h po začátku → nic (to už není dnešní směna)', zpozdeniPrichodu(dnes, '08:00', zacatek + 13 * H), null);
  // Noční směna od 22:00: ve 0:30 patří k včerejšímu začátku, ne k dnešnímu večeru.
  const pulnoc = Date.parse('2026-09-25T22:30:00Z'); // 0:30 26. 9. v Praze
  eq('příchod: přes půlnoc — 0:30 proti 22:00 včera = 150 min pozdě', zpozdeniPrichodu(dnes, '22:00:00', pulnoc), { druh: 'pozde', min: 150 });
  eq('příchod: bez rozpisu nic', zpozdeniPrichodu(dnes, null, zacatek), null);
  eq('příchod: dokud prohlížeč neví „teď" (0), nic', zpozdeniPrichodu(dnes, '08:00', 0), null);

  // ---- po plánu ----
  const konec16 = Date.parse('2026-09-26T14:00:00Z'); // 16:00 v Praze
  eq('po plánu: 16:35 u směny do 16:00 → 35', minutPoPlanu(dnes, '08:00:00', '16:00:00', konec16 + 35 * MIN), 35);
  eq('po plánu: před koncem nic', minutPoPlanu(dnes, '08:00', '16:00', konec16 - MIN), null);
  eq('po plánu: bez rozpisu nic', minutPoPlanu(dnes, null, null, konec16 + H), null);
  // Směna 20:00–02:00: konec patří zítřku (konecSmeny), ve 23:00 není po plánu.
  eq('po plánu: noční směna přes půlnoc ve 23:00 ještě běží', minutPoPlanu(dnes, '20:00', '02:00', Date.parse('2026-09-26T21:00:00Z')), null);
  eq('po plánu: noční směna ve 2:30 druhého dne → 30', minutPoPlanu(dnes, '20:00', '02:00', Date.parse('2026-09-27T00:30:00Z')), 30);

  // ---- počty do odznaků ----
  const u = (id: number, dueDate: string | null, status = 'pending') => ({ id, title: `Úkol ${id}`, dueDate, status });
  const ukoly = vyberUkoly([u(1, '2026-09-20'), u(2, '2026-09-26'), u(3, '2026-09-26', 'done'), u(4, '2026-09-30'), u(5, null), u(6, '2026-09-25', 'done')]);
  eq('odznak Úkoly: po termínu + dnešní nesplněné (bez termínu a budoucí ne)', pocetUkoluTabletu(ukoly, dnes), 2);
  const postupy: PostupApi[] = [
    { id: 1, name: 'Zavírání', requireBeforeClosing: true },
    { id: 2, name: 'Otevírání', requireBeforeClosing: true },
    { id: 3, name: 'Čištění kávovaru', requireBeforeClosing: false },
    { id: 4, name: 'Návrh', requireBeforeClosing: true, approved: false },
  ];
  const behy: PrubehApi[] = [{ id: 10, procedure_id: 2, status: 'completed', user_name: 'Eva' }, { id: 11, procedure_id: 1, status: 'running' }];
  eq('odznak Postupy: povinné dnes nehotové (dokončený a návrh ne, běžící ano)', pocetPostupuTabletu(postupy, behy), 1);
  eq('odznak Postupy: bez povinných 0', pocetPostupuTabletu([postupy[2]], []), 0);

  // ---- PIN i při odchodu (zdroj) ----
  const brana = kod('components/kiosk/KioskShiftGate.tsx');
  ok('PunchDialog: PIN se chce podle hasPin, ne jen při příchodu', /const needPin = member\.hasPin;/.test(brana) && !/hasPin && !on/.test(brana));
  ok('PunchDialog: rozlišený hint „Zadej PIN pro odchod" / „pro příchod"', brana.includes("t('Zadej PIN pro odchod')") && brana.includes("t('Zadej PIN pro příchod')"));
  ok('Nastavení tabletu: text o PINu mluví i o odchodu', zdroj('components/KioskSettings.tsx').includes('při příchodu i odchodu'));
  const app = kod('components/kiosk/KioskApp.tsx');
  ok('KioskApp: záložky z lib/kioskPrehled a filtr podle useSmi', app.includes('viditelneZalozky(TABS, smi)') && app.includes('viditelne.map('));
  ok('KioskApp: odznaky jen se splněným klíčem (jinak 403)', app.includes("smi('ukoly.zobrazit_tym') ? '/api/tasks' : null") && app.includes("smi('postupy.zobrazit') ? URL_POSTUPY : null"));
}
