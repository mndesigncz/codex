// Kolo 6 (balík B3) — Nastavení a Tým: skupiny záložek, Centrum oznámení s proklikem,
// pozvánka s rolí a „Poslat znovu". Čistá logika bez databáze a bez prohlížeče.

import type { Testy } from './_testy.ts';
import {
  ZALOZKY_NASTAVENI, SKUPINA_ZALOZKY, SKUPINY_NASTAVENI, otevritSekciRovnou,
} from '../../lib/nastaveniZalozky.ts';
import {
  otevriOznameni, cilOznameni, cistyDruhOznameni, cistyLimitOznameni, ikonaOznameni, LIMIT_OZNAMENI,
} from '../../lib/oznameniOdkaz.ts';

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
}
