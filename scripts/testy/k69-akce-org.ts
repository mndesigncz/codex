// Kolo 69 — dvě díry, které balíky nechaly otevřené: detail akce (EventsView)
// a chybějící uzávěrky v přehledu organizace (nález N9).
//
// N9: přehled Všech podniků musí počítat „chybí uzávěrka" stejně jako
// Uzávěrky — jen do včerejška, dnešek zvlášť, a „dnes ještě chybí" ukázat
// až po zavírací době. Výpočet je čistý (lib/uzaverkyOrganizace.ts), takže
// se tu testuje přímo; nad zdrojáky jsou pojistky, že route ho opravdu
// používá a aktivní podnik bere z databáze, ne z tokenu nebo těla.
//
// Detail akce: pojistky nad zdrojákem, že se nevrátilo ruční okno
// (modal-overlay), alert() ani ručně barvené pilulky lidí. Chování (dialog,
// Escape, Toast) hlídá sonda scripts/sondy/k69-b8.mjs.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { chybejiciUzaverkyPodniku, poZaviraciDobe, zavreneDny, dnesJesteChybi, type DenSeSmenou } from '../../lib/uzaverkyOrganizace.ts';
import { souhrn } from '../../lib/prehledOrganizace.ts';
import { vyberPrehled, potrebujePozornost } from '../../lib/financeWidgety.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Kód bez komentářů — komentáře popisují, co se opravilo („dřív alert()"), a pojistky by chytaly je. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(r)).join('\n');

export default function ({ eq, ok }: Testy) {
  // 2026-09-27 je neděle (klíč 6), 2026-09-26 sobota (klíč 5).
  const DNES = '2026-09-27';
  const den = (date: string, x: Partial<DenSeSmenou> = {}): DenSeSmenou => ({ date, auto_created: false, uzavreno: false, ...x });
  const nic = new Set<string>();

  // ---- Chybějící do včerejška, dnešek zvlášť ----
  eq('N9: dnešek bez uzávěrky se do chybějících NEpočítá, jde zvlášť',
    chybejiciUzaverkyPodniku([den(DNES)], DNES, nic), { chybi: 0, dnesChybi: true });
  eq('N9: včerejšek bez uzávěrky chybí',
    chybejiciUzaverkyPodniku([den('2026-09-26')], DNES, nic), { chybi: 1, dnesChybi: false });
  eq('N9: dnešek s uzávěrkou nechybí ani zvlášť',
    chybejiciUzaverkyPodniku([den(DNES, { uzavreno: true })], DNES, nic), { chybi: 0, dnesChybi: false });
  eq('N9: den se počítá jednou, i když přijde dvěma řádky (plánovaná i automatická směna)',
    chybejiciUzaverkyPodniku([den('2026-09-20'), den('2026-09-20', { auto_created: true })], DNES, nic).chybi, 1);
  eq('N9: den je uzavřený, když aspoň jeden jeho řádek říká uzavřeno',
    chybejiciUzaverkyPodniku([den('2026-09-20'), den('2026-09-20', { auto_created: true, uzavreno: true })], DNES, nic).chybi, 0);
  eq('N9: automatická směna v zavřený den se vynechá (smenaBezUzaverky)',
    chybejiciUzaverkyPodniku([den('2026-09-20', { auto_created: true })], DNES, new Set(['6'])).chybi, 0);
  eq('N9: plánovaná směna v zavřený den se NEvynechá — někdo tam opravdu pracoval',
    chybejiciUzaverkyPodniku([den('2026-09-20')], DNES, new Set(['6'])).chybi, 1);
  eq('N9: budoucí směna se nepočítá nikam',
    chybejiciUzaverkyPodniku([den('2026-09-28')], DNES, nic), { chybi: 0, dnesChybi: false });
  eq('N9: datum s časem z databáze se ořízne na den',
    chybejiciUzaverkyPodniku([den(`${DNES}T00:00:00.000Z`)], DNES, nic).dnesChybi, true);

  // ---- Zavřené dny z otevírací doby ----
  eq('zavřené dny: jen ty s closed: true', [...zavreneDny({ 0: { open: '08:00', close: '18:00' }, 6: { closed: true } })], ['6']);
  eq('zavřené dny: nečitelná otevírací doba = nic', zavreneDny(null).size, 0);

  // ---- Po zavírací době ----
  const OH = { 6: { open: '10:00', close: '22:00' } };
  eq('zavírací doba: před zavřením ne', poZaviraciDobe(OH, DNES, '21:59'), false);
  eq('zavírací doba: v zavírací čas ano', poZaviraciDobe(OH, DNES, '22:00'), true);
  eq('zavírací doba: po zavření ano', poZaviraciDobe(OH, DNES, '23:30'), true);
  eq('zavírací doba: provoz přes půlnoc dnes neskončí (zavírá 02:00)', poZaviraciDobe({ 6: { open: '18:00', close: '02:00' } }, DNES, '23:59'), false);
  eq('zavírací doba: zavřený den = ne', poZaviraciDobe({ 6: { closed: true } }, DNES, '23:00'), false);
  eq('zavírací doba: bez otevírací doby = ne (nehádá se)', poZaviraciDobe(null, DNES, '23:00'), false);
  eq('zavírací doba: jiný den v týdnu se nepoužije', poZaviraciDobe({ 5: { open: '10:00', close: '12:00' } }, DNES, '23:00'), false);

  // ---- UI: „dnes ještě chybí" jen po zavírací době ----
  eq('UI: dnešek bez uzávěrky před zavřením se neukáže', dnesJesteChybi({ missingToday: true, todayAfterClose: false }), false);
  eq('UI: dnešek bez uzávěrky po zavření se ukáže', dnesJesteChybi({ missingToday: true, todayAfterClose: true }), true);
  eq('UI: starší odpověď bez polí nic neukáže', dnesJesteChybi({}), false);

  // ---- Souhrn a výběr dat ----
  const r = (o: Record<string, unknown>) => ({
    teamId: 1, name: 'A', currency: 'CZK', revenue: 0, wages: 0, closings: 0, missingClosings: 0,
    pendingApproval: 0, members: 0, onShiftNow: 0, stockAlerts: 0, ...o,
  });
  const s = souhrn([
    r({ missingClosings: 2, missingToday: true, todayAfterClose: true }),
    r({ teamId: 2, missingToday: true, todayAfterClose: false }),
  ]);
  eq('souhrn: dnešek se do chybějících nepřičte', s.missingClosings, 2);
  eq('souhrn: „dnes ještě chybí" jen u podniků po zavírací době', s.missingTodayAfterClose, 1);
  const p = vyberPrehled({
    available: true, month: '2026-09', organization: { name: 'Řetězec' },
    teams: [
      { teamId: 1, name: 'Vinohrady', missingClosings: 0, missingToday: true, todayAfterClose: true },
      { teamId: 2, name: 'Karlín', missingClosings: 0, missingToday: true },
      { teamId: 3, name: 'Smíchov', missingClosings: 0, missingToday: 'ano', todayAfterClose: 1 },
    ],
    total: { missingClosings: 0, missingTodayAfterClose: 1 },
  });
  eq('výběr: dnešek a zavírací doba projdou jen jako skutečné true',
    p.podniky.map(x => [x.missingToday, x.todayAfterClose]), [[true, true], [true, false], [false, false]]);
  eq('výběr: souhrn nese počet podniků po zavírací době', p.celkem?.missingTodayAfterClose, 1);
  eq('pozornost: dnešek po zavření ano, před zavřením ne', p.podniky.map(potrebujePozornost), [true, false, false]);

  // ---- Route: používá sdílený výpočet a aktivní podnik z databáze ----
  const route = kod('app/api/organization/overview/route.ts');
  ok('route: chybějící počítá lib/uzaverkyOrganizace (ne vlastní SQL s „< dnes")', route.includes('chybejiciUzaverkyPodniku(') && route.includes('poZaviraciDobe('));
  ok('route: vrací dnešek zvlášť (missingToday, todayAfterClose)', route.includes('radek.missingToday =') && route.includes('radek.todayAfterClose ='));
  ok('route: oprávnění a aktivní podnik přes pozaduj', route.includes("pozaduj('organizace.prehled')"));
  ok('route: aktivní podnik nikdy z tokenu ani těla (žádná session, req.json ani teamId z URL)',
    !/getServerSession|getToken|req\.json\(|searchParams\.get\(['"]team/.test(route));
  ok('pozaduj: aktivní podnik čte z users.team_id podle meId',
    /SELECT team_id FROM users WHERE id = \$\{meId\}/.test(zdroj('lib/opravneniDb.ts')));

  // ---- Detail akce: sdílené okno, Chip/PersonChip, Toast ----
  const akce = kod('components/employer/EventsView.tsx');
  ok('akce: žádné ruční okno (modal-overlay)', !akce.includes('modal-overlay'));
  ok('akce: žádný alert/confirm/prompt', !/\b(alert|confirm|prompt)\(/.test(akce));
  ok('akce: detail je <Modal>', /<Modal[\s\S]*?title=\{titulek\}/.test(akce));
  ok('akce: lidé jsou PersonChip, stav Chip', akce.includes('<PersonChip') && akce.includes('<Chip'));
  ok('akce: hlášky přes Toast', akce.includes('<Toast'));
  ok('akce: „Oznámit týmu" hlásí přes oznam (Toast), ne alert', /oznam\((?:t\()?'Tým dostal notifikaci o akci\.'\)?\)/.test(akce));
}
