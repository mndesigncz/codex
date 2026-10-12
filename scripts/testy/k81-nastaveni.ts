// Kolo 6 (balík B3) — Nastavení a Tým: skupiny záložek, Centrum oznámení s proklikem,
// pozvánka s rolí a „Poslat znovu". Čistá logika bez databáze a bez prohlížeče.

import type { Testy } from './_testy.ts';
import {
  ZALOZKY_NASTAVENI, SKUPINA_ZALOZKY, SKUPINY_NASTAVENI, otevritSekciRovnou,
} from '../../lib/nastaveniZalozky.ts';
import {
  otevriOznameni, cilOznameni, cistyDruhOznameni, cistyLimitOznameni, ikonaOznameni, LIMIT_OZNAMENI,
} from '../../lib/oznameniOdkaz.ts';
import {
  cilPozvanky, cilZVyberu, sloupcePozvanky, smiZvouciDatRoli, roleZPozvanky, minutDoZnovu, ZNOVU_PO_MIN, type RolePozvanky,
} from '../../lib/pozvanky.ts';

/** Podvržený fetch: zapisuje volání a vrací odpověď s daným `ok`. */
function falesnyFetch(ok: boolean) {
  const volani: { url: string; telo: unknown }[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    volani.push({ url, telo: init?.body ? JSON.parse(String(init.body)) : null });
    return { ok } as Response;
  }) as unknown as typeof fetch;
  return { f, volani };
}

export default async function ({ eq, ok }: Testy) {
  // ---- 1) skupiny záložek: každá sekce má skupinu ----
  ok('skupiny: každá záložka má skupinu Osobní nebo Podnik', ZALOZKY_NASTAVENI.every(z => SKUPINY_NASTAVENI.includes(SKUPINA_ZALOZKY[z])));
  eq('skupiny: osobní jsou účet, jazyk, vzhled, notifikace, zabezpečení, data a zkratky',
    ZALOZKY_NASTAVENI.filter(z => SKUPINA_ZALOZKY[z] === 'osobni'), ['account', 'jazyk', 'app', 'notifications', 'security', 'privacy', 'zkratky']);
  ok('skupiny: profil podniku, role, stránky, pokladna, předplatné a historie patří podniku',
    (['podnik', 'roles', 'stranky', 'pos', 'billing', 'audit', 'nahlaseni'] as const).every(z => SKUPINA_ZALOZKY[z] === 'podnik'));
  eq('skupiny: pořadí Osobní, Podnik', SKUPINY_NASTAVENI, ['osobni', 'podnik']);
  // Telefon: Nastavení otevře seznam sekcí; rovnou sekci jen na výslovné přání (?tab=, banner).
  eq('telefon: bez záložky a s výchozím Účtem seznam sekcí', [otevritSekciRovnou(undefined), otevritSekciRovnou('account')], [false, false]);
  eq('telefon: ?tab=notifications a ?tab=roles otevřou sekci', [otevritSekciRovnou('notifications'), otevritSekciRovnou('roles')], [true, true]);
  eq('telefon: nesmysl v ?tab= neotevře nic', otevritSekciRovnou('xx'), false);

  // ---- 2) Centrum oznámení: proklik ----
  eq('odkaz: cesta v aplikaci vede na cíl', cilOznameni({ id: 1, link: '/employer/overview?view=reports' }), '/employer/overview?view=reports');
  eq('odkaz: „/" a prázdný odkaz nikam', [cilOznameni({ id: 1, link: '/' }), cilOznameni({ id: 1, link: '' }), cilOznameni({ id: 1, link: null })], [null, null, null]);
  eq('odkaz: javascript: a //cizi.cz se neotevřou', [cilOznameni({ id: 1, link: 'javascript:alert(1)' }), cilOznameni({ id: 1, link: '//cizi.cz' })], [null, null]);
  {
    const { f, volani } = falesnyFetch(true);
    const precteno: number[] = []; const kam: string[] = [];
    const v = await otevriOznameni({ id: 7, link: '/employee/shifts?view=tasks', is_read: false }, n => precteno.push(n.id), { fetch: f, jdi: u => kam.push(u) });
    ok('otevřít: nepřečtené označí přes PATCH { id } a jde na cíl', v && volani.length === 1 && JSON.stringify(volani[0].telo) === '{"id":7}' && precteno[0] === 7 && kam[0] === '/employee/shifts?view=tasks');
  }
  {
    const { f } = falesnyFetch(true);
    const precteno: number[] = []; const kam: string[] = [];
    await otevriOznameni({ id: 8, link: '/', is_read: false }, n => precteno.push(n.id), { fetch: f, jdi: u => kam.push(u) });
    ok('otevřít: oznámení s odkazem „/" označí přečtené a nenaviguje', precteno[0] === 8 && kam.length === 0);
  }
  {
    const { f } = falesnyFetch(false);
    const precteno: number[] = []; const kam: string[] = [];
    const v = await otevriOznameni({ id: 9, link: '/employer/overview?view=chat', is_read: false }, n => precteno.push(n.id), { fetch: f, jdi: u => kam.push(u) });
    ok('otevřít: odmítnutý zápis neoznačí přečtené, na cíl se jde stejně', !v && precteno.length === 0 && kam[0] === '/employer/overview?view=chat');
  }
  {
    const { f, volani } = falesnyFetch(true);
    await otevriOznameni({ id: 10, link: '/x', is_read: true }, () => {}, { fetch: f, jdi: () => {} });
    eq('otevřít: už přečtené se znovu nezapisuje', volani.length, 0);
  }
  eq('API: limit výchozí 30, strop 100, nesmysl = výchozí', [cistyLimitOznameni(null), cistyLimitOznameni('500'), cistyLimitOznameni('-3'), cistyLimitOznameni('50')], [LIMIT_OZNAMENI.vychozi, 100, 30, 50]);
  eq('API: druh jen ve tvaru notifications.type', [cistyDruhOznameni('shift'), cistyDruhOznameni("x' OR 1=1"), cistyDruhOznameni('')], ['shift', null, null]);
  eq('ikona: známý druh má svou, neznámý zvonek', [ikonaOznameni('shift'), ikonaOznameni('warning'), ikonaOznameni('nevim')], ['calendar', 'warning', 'bell']);

  // ---- 3) pozvánka s rolí a Poslat znovu ----
  eq('pozvánka: řádek → slib role', [
    cilPozvanky({ role: 'employee', role_id: null }), cilPozvanky({ role: 'employer' }), cilPozvanky({ role: 'kuchar' }),
    cilPozvanky({ role: 'employee', role_id: 12 }), cilPozvanky({ role: 'kiosk' }), cilPozvanky({ role: 'nesmysl' }), cilPozvanky({}),
  ], [
    { druh: 'vychozi' }, { druh: 'system', klic: 'vedeni' }, { druh: 'system', klic: 'kuchar' },
    { druh: 'vlastni', id: 12 }, { druh: 'vychozi' }, { druh: 'vychozi' }, { druh: 'vychozi' },
  ]);
  eq('pozvánka: vlastní role se zapíše do role_id, role zůstane employee (starší kód pustí jen do výchozí)',
    sloupcePozvanky({ druh: 'vlastni', id: 12 }), { role: 'employee', role_id: 12 });
  eq('pozvánka: přednastavená role jako klíč v role', sloupcePozvanky({ druh: 'system', klic: 'kuchar' }), { role: 'kuchar', role_id: null });
  ok('pozvánka: zápis a čtení jsou opak', [{ druh: 'vychozi' }, { druh: 'system', klic: 'provozni' }, { druh: 'vlastni', id: 3 }]
    .every(c => JSON.stringify(cilPozvanky(sloupcePozvanky(c as any))) === JSON.stringify(c)));
  eq('pozvánka: výběr z formuláře (roleId má přednost, starý tvar employer = Vedení)', [
    cilZVyberu({ roleId: 7, roleKlic: 'kuchar' }), cilZVyberu({ roleKlic: 'kuchar' }), cilZVyberu({ role: 'employer' }), cilZVyberu({}),
  ], [{ druh: 'vlastni', id: 7 }, { druh: 'system', klic: 'kuchar' }, { druh: 'system', klic: 'vedeni' }, { druh: 'vychozi' }]);

  const vychozi: RolePozvanky = { klic: 'barista', roleId: null, typ: 'zamestnanec', nazev: 'Barista', opravneni: ['ukoly.zobrazit'] };
  const sefKuchar: RolePozvanky = { klic: null, roleId: 12, typ: 'vedeni', nazev: 'Šéfkuchař', opravneni: ['tym.pozvat', 'tym.role_prirazovat', 'finance.mzdy'] };
  const zvouci = { jeVlastnik: false, opravneni: new Set(['tym.pozvat', 'tym.role_prirazovat', 'ukoly.zobrazit']) };
  eq('přijetí: vlastní role s oprávněním nad zvoucím → výchozí role podniku', roleZPozvanky(sefKuchar, zvouci, vychozi).nazev, 'Barista');
  eq('přijetí: vlastní role, kterou zvoucí smí dát, projde', roleZPozvanky({ ...sefKuchar, opravneni: ['tym.pozvat', 'ukoly.zobrazit'] }, zvouci, vychozi).roleId, 12);
  eq('přijetí: zvoucí už bez tym.role_prirazovat → výchozí role', roleZPozvanky({ ...sefKuchar, opravneni: ['ukoly.zobrazit'] }, { jeVlastnik: false, opravneni: ['tym.pozvat', 'ukoly.zobrazit'] }, vychozi).nazev, 'Barista');
  eq('přijetí: zvoucí už v podniku není → výchozí role', roleZPozvanky(sefKuchar, null, vychozi).nazev, 'Barista');
  eq('přijetí: smazaná role → výchozí role', roleZPozvanky(null, zvouci, vychozi).nazev, 'Barista');
  ok('přijetí: vlastník smí dát cokoli, jen tablet ne', smiZvouciDatRoli({ jeVlastnik: true, opravneni: [] }, sefKuchar, [])
    && !smiZvouciDatRoli({ jeVlastnik: true, opravneni: ['tym.pozvat', 'tym.role_prirazovat'] }, { ...sefKuchar, typ: 'kiosk' }));

  const ted = Date.parse('2026-10-12T10:00:00Z');
  eq('znovu: limit je 10 minut', ZNOVU_PO_MIN, 10);
  eq('znovu: před 3 min → za 7 min', minutDoZnovu(new Date(ted - 3 * 60_000), ted), 7);
  eq('znovu: před 9,5 min → za 1 min (zaokrouhlí nahoru)', minutDoZnovu(new Date(ted - 9.5 * 60_000), ted), 1);
  eq('znovu: po 10 min a bez času odeslání jde hned', [minutDoZnovu(new Date(ted - 10 * 60_000), ted), minutDoZnovu(null, ted)], [0, 0]);
}
