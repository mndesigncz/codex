// Čtečka u kasy (lib/ctecka.ts): čištění vstupu čtečky, rozpoznání druhu kódu,
// dvojitý sken, rychlost psaní, historie a nastavení návratu. Nad zdrojáky
// pojistka, že stránka čtečky i hostovské akce drží pravidla repa.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { ocistiVstupCtecky, rozpoznejKod, jeDvojitySken, psalaCtecka, pridejDoHistorie, navratSekundy, navratPopisek, poslediNavsteva, NAVRAT_VYCHOZI_S } from '../../lib/ctecka.ts';
import { generujKod } from '../../lib/poukazy.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- Čištění vstupu: prefix, suffix, mezery ----
  eq('Enter a Tab na konci pryč', ocistiVstupCtecky('ABCD1234\r\n'), 'ABCD1234');
  eq('Tab na konci pryč', ocistiVstupCtecky('ABCD1234\t'), 'ABCD1234');
  eq('STX a ETX pryč', ocistiVstupCtecky('\u0002ABCD1234\u0003'), 'ABCD1234');
  eq('AIM prefix QR', ocistiVstupCtecky(']Q1ABCD1234'), 'ABCD1234');
  eq('AIM prefix Code 128', ocistiVstupCtecky(']C1ABCD1234\r'), 'ABCD1234');
  eq('mezery okolo', ocistiVstupCtecky('   ABCD1234  '), 'ABCD1234');
  eq('prázdné z null', ocistiVstupCtecky(null), '');
  eq('prázdné z undefined', ocistiVstupCtecky(undefined), '');
  eq('jen řídicí znaky', ocistiVstupCtecky('\r\n\t'), '');
  ok('moc dlouhý vstup se ořízne', ocistiVstupCtecky('A'.repeat(5000)).length <= 300);

  // ---- Karta hosta ----
  eq('karta s pomlčkou', rozpoznejKod('ABCD-EFGH'), { typ: 'karta', kod: 'ABCD-EFGH' });
  eq('karta bez pomlčky', rozpoznejKod('ABCDEFGH'), { typ: 'karta', kod: 'ABCD-EFGH' });
  eq('karta malými', rozpoznejKod('abcd-efgh'), { typ: 'karta', kod: 'ABCD-EFGH' });
  eq('karta s mezerou uprostřed', rozpoznejKod('abcd efgh'), { typ: 'karta', kod: 'ABCD-EFGH' });
  eq('karta s číslicemi a Enterem', rozpoznejKod('K3M9-72QX\r\n'), { typ: 'karta', kod: 'K3M9-72QX' });
  eq('karta s AIM prefixem a Enterem', rozpoznejKod(']Q1AB12CD34\r'), { typ: 'karta', kod: 'AB12-CD34' });
  eq('karta začínající DP (osm znaků) je pořád karta', rozpoznejKod('DPAB-CD23'), { typ: 'karta', kod: 'DPAB-CD23' });

  // ---- Kupon ----
  eq('kupon payload', rozpoznejKod('managero:coupon:ABC-DEF'), { typ: 'kupon', kod: 'ABC-DEF' });
  eq('kupon payload velkými písmeny', rozpoznejKod('MANAGERO:COUPON:abc-def\r'), { typ: 'kupon', kod: 'ABC-DEF' });
  eq('kupon holý s pomlčkou', rozpoznejKod('ABC-DEF'), { typ: 'kupon', kod: 'ABC-DEF' });
  eq('kupon holý bez pomlčky', rozpoznejKod('abcdef'), { typ: 'kupon', kod: 'ABC-DEF' });
  eq('kupon s AIM prefixem', rozpoznejKod(']Q1managero:coupon:ABC-DEF'), { typ: 'kupon', kod: 'ABC-DEF' });
  eq('poškozený payload kuponu je cizí', rozpoznejKod('managero:coupon:ABC'), { typ: 'cizi', kod: '' });
  eq('payload kuponu se zlými znaky je cizí', rozpoznejKod('managero:coupon:AB/C-DEF'), { typ: 'cizi', kod: '' });

  // ---- Poukaz ----
  const dp = generujKod();
  eq('poukaz s pomlčkami', rozpoznejKod(dp), { typ: 'poukaz', kod: dp });
  eq('poukaz malými bez pomlček', rozpoznejKod(dp.toLowerCase().replace(/-/g, '') + '\r'), { typ: 'poukaz', kod: dp });
  eq('poukaz s chybným kontrolním znakem je cizí', rozpoznejKod('DP-ABCD-2345'.slice(0, 11) + (dp.endsWith('A') ? 'B' : 'A')), { typ: 'cizi', kod: '' });
  eq('osm znaků poukazu bez DP je karta, ne poukaz', rozpoznejKod(dp.slice(3)).typ, 'karta');

  // ---- Cizí a prázdné ----
  eq('prázdný řetězec', rozpoznejKod(''), { typ: 'prazdny', kod: '' });
  eq('jen mezery', rozpoznejKod('   '), { typ: 'prazdny', kod: '' });
  eq('null', rozpoznejKod(null), { typ: 'prazdny', kod: '' });
  eq('jen Enter', rozpoznejKod('\r\n'), { typ: 'prazdny', kod: '' });
  eq('URL je cizí', rozpoznejKod('https://example.com/ABCD1234'), { typ: 'cizi', kod: '' });
  eq('wifi QR je cizí', rozpoznejKod('WIFI:T:WPA;S:kavarna;P:heslo;;'), { typ: 'cizi', kod: '' });
  eq('vCard je cizí', rozpoznejKod('BEGIN:VCARD\nVERSION:3.0\nEND:VCARD'), { typ: 'cizi', kod: '' });
  eq('krátký šum je cizí', rozpoznejKod('ABC'), { typ: 'cizi', kod: '' });
  eq('sedm znaků je cizí', rozpoznejKod('ABCD123'), { typ: 'cizi', kod: '' });
  eq('devět znaků je cizí', rozpoznejKod('ABCD12345'), { typ: 'cizi', kod: '' });
  eq('čárový kód EAN je cizí', rozpoznejKod('8590123456789'), { typ: 'cizi', kod: '' });
  eq('diakritika je cizí', rozpoznejKod('ŘÍZEK-123'), { typ: 'cizi', kod: '' });

  // ---- Dvojitý sken ----
  const p = { kod: 'ABCD-EFGH', cas: 10_000 };
  ok('týž kód za 500 ms je dvojitý', jeDvojitySken(p, 'ABCD-EFGH', 10_500));
  ok('týž kód za 1999 ms je dvojitý', jeDvojitySken(p, 'ABCD-EFGH', 11_999));
  ok('týž kód za 2000 ms už ne', !jeDvojitySken(p, 'ABCD-EFGH', 12_000));
  ok('jiný kód hned ne', !jeDvojitySken(p, 'WXYZ-1234', 10_100));
  ok('bez předchozího ne', !jeDvojitySken(null, 'ABCD-EFGH', 10_100));
  ok('prázdný kód ne', !jeDvojitySken(p, '', 10_100));
  ok('hodiny jdou zpět: nezahazuje', !jeDvojitySken(p, 'ABCD-EFGH', 9_000));

  // ---- Rychlost psaní ----
  ok('čtečka: 9 znaků po 10 ms', psalaCtecka([0, 10, 20, 30, 40, 50, 60, 70, 80]));
  ok('člověk: 9 znaků po 200 ms ne', !psalaCtecka([0, 200, 400, 600, 800, 1000, 1200, 1400, 1600]));
  ok('málo znaků ne', !psalaCtecka([0, 10, 20]));
  ok('jedna dlouhá mezera ne', !psalaCtecka([0, 10, 20, 30, 200, 210, 220]));
  ok('prázdné ne', !psalaCtecka([]));

  // ---- Historie ----
  let h: ReturnType<typeof pridejDoHistorie> = [];
  for (let i = 1; i <= 7; i++) h = pridejDoHistorie(h, { id: i, cas: i, popis: `host ${i}`, ok: true });
  eq('historie má nejvýš pět', h.length, 5);
  eq('nejnovější nahoře', h.map(x => x.id), [7, 6, 5, 4, 3]);
  const h0: ReturnType<typeof pridejDoHistorie> = [{ id: 1, cas: 1, popis: 'a', ok: true }];
  pridejDoHistorie(h0, { id: 2, cas: 2, popis: 'b', ok: false });
  eq('vstup se nemění', h0.length, 1);

  // ---- Návrat na čekání ----
  eq('výchozí je 8 s', NAVRAT_VYCHOZI_S, 8);
  eq('nic uložené', navratSekundy(null), 8);
  eq('prázdný řetězec', navratSekundy(''), 8);
  eq('nesmysl', navratSekundy('abc'), 8);
  eq('mimo nabídku', navratSekundy('7'), 8);
  eq('15 s', navratSekundy('15'), 15);
  eq('nula = zůstat', navratSekundy('0'), 0);
  eq('popisek zůstat', navratPopisek(0), 'Zůstat');
  eq('popisek sekundy', navratPopisek(8), '8 s');

  // ---- Poslední návštěva ----
  const dnes = new Date('2026-10-02T10:00:00Z');
  eq('bez data: poprvé', poslediNavsteva(null, dnes), 'poprvé u nás');
  eq('nesmysl: poprvé', poslediNavsteva('abc', dnes), 'poprvé u nás');
  eq('dnes', poslediNavsteva('2026-10-02T06:00:00Z', dnes), 'dnes');
  eq('včera', poslediNavsteva('2026-10-01T12:00:00Z', dnes), 'včera');
  eq('před třemi dny', poslediNavsteva('2026-09-29T12:00:00Z', dnes), 'před 3 dny');
  eq('před devíti dny', poslediNavsteva('2026-09-23T12:00:00Z', dnes), 'před 9 dny');
  eq('pražský den: 23:30 UTC je už zítřek', poslediNavsteva('2026-10-01T23:30:00Z', dnes), 'dnes');

  // ---- Zdroje: pravidla repa ----
  const stranka = zdroj('components/client/CteckaKasa.tsx');
  ok('stránka čtečky bere kód z lib/ctecka', stranka.includes("from '@/lib/ctecka'"));
  ok('fetch jde přes okJson', /okJson/.test(stranka) && !/\.then\(\s*r\s*=>\s*r\.json\(\)/.test(stranka));
  ok('peníze přes useMoney, ne napevno Kč', /useMoney\(\)/.test(stranka) && !/\bKč\b/.test(stranka));
  ok('respektuje prefers-reduced-motion', /prefers-reduced-motion/.test(stranka));
  ok('čtečka zachytává Enter i Tab', /'Enter'/.test(stranka) && /'Tab'/.test(stranka));
  ok('uplatnění kuponu jde jednou cestou (redeem)', stranka.includes('/api/client/admin/redeem'));
  ok('CardScan odkazuje na čtečku', zdroj('components/client/CardScan.tsx').includes('OdkazCtecka') && zdroj('components/client/OdkazCtecka.tsx').includes('/ctecka'));
  ok('routa vedení', zdroj('app/employer/ctecka/page.tsx').includes('CteckaStranka'));
  ok('routa zaměstnance', zdroj('app/employee/ctecka/page.tsx').includes('CteckaStranka'));
  const scan = zdroj('app/api/client/staff/scan/route.ts');
  ok('API umí přidat člena', scan.includes("action === 'join'"));
  ok('API vrací narozeniny a poslední návštěvu', scan.includes('birthdayToday') && scan.includes('lastVisit'));
}
