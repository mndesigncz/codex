// Spuštění (balík C): fyzické kartičky — čistá pravidla (lib/kartyFyzicke.ts), tiskový arch
// (lib/kartyFyzickeTisk.ts) a podepsaný odkaz do peněženky (lib/kartyWalletOdkaz.ts).

import type { Testy } from './_testy.ts';
import {
  ABECEDA, kodZBajtu, managerovyKod, ciziCislo, klicCiziKarty, kodyKHledani, zobrazitelnyKod, vypadaJakoKarta, overPocet,
  nazevDavky, emailBezAplikace, jeBezAplikace, overNovehoHosta, dotazHledani, maskaTelefonu, maskaEmailu,
  rozhodniAktivaci, rozhodniBlokaci, rozhodniNahradu, rozhodniPripojeni, HLASKA_BLOKOVANA, POCET_MIN, POCET_MAX,
} from '../../lib/kartyFyzicke.ts';
import { htmlArchuKaret, naStrany, poziceKarty, znackyStrany, pocetKaret, A4, KARTA, OKRAJ_X, OKRAJ_Y, NA_STRANU } from '../../lib/kartyFyzickeTisk.ts';
import { podepisOdkaz, overOdkaz, PLATNOST_ODKAZU_S } from '../../lib/kartyWalletOdkaz.ts';
import { rozpoznejQr } from '../../lib/kuponQr.ts';

export default function ({ eq, ok }: Testy) {
  // ---- Kód karty ----
  const kod = kodZBajtu([0, 1, 2, 3, 4, 5, 6, 31]);
  eq('kód: osm znaků z abecedy bez zaměnitelných, zapsaný ABCD-EFGH', kod, 'ABCD-EFG9');
  ok('kód: abeceda nemá I, O, 0, 1', !/[IO01]/.test(ABECEDA) && ABECEDA.length === 32);
  ok('kód z karty přečte stávající čtečka jako kartičku hosta (rozpoznejQr)', rozpoznejQr(kod).typ === 'karta');
  eq('kód Managera: malá písmena, mezery a bez pomlčky', managerovyKod(' abcd efgh '), 'ABCD-EFGH');
  eq('kód Managera: jiná délka není kód', [managerovyKod('ABCDEFG'), managerovyKod('ABCDEFGHJ')], [null, null]);

  // ---- Stará čísla z Kartičky ----
  eq('staré číslo: mezery a pomlčky pryč, velká písmena', ciziCislo(' 12-34 5a '), '12345A');
  eq('staré číslo: krátké, dlouhé nebo s cizími znaky není číslo', [ciziCislo('12'), ciziCislo('1'.repeat(41)), ciziCislo('12/34'), ciziCislo('čárka')], [null, null, null, null]);
  eq('staré číslo platí jen v podniku, který ho převzal', klicCiziKarty(7, '1001'), 'T7:1001');
  eq('hledání: kód Managera bez podniku', kodyKHledani('abcd-efgh', null), ['ABCD-EFGH']);
  eq('hledání: osmimístné staré číslo dá obě možnosti', kodyKHledani('12345678', 5), ['1234-5678', 'T5:12345678']);
  eq('hledání: krátké staré číslo jen v podniku', kodyKHledani('1001', 5), ['T5:1001']);
  eq('hledání: bez podniku se staré číslo nehledá (host v aplikaci)', kodyKHledani('1001', 0), []);
  eq('zobrazení: klíč podniku se lidem neukazuje', [zobrazitelnyKod('T12:1001'), zobrazitelnyKod('ABCD-EFGH')], ['1001', 'ABCD-EFGH']);
  ok('vypadá jako karta: kód i staré číslo ano, URL ne', vypadaJakoKarta('ABCD-EFGH') && vypadaJakoKarta('1001') && !vypadaJakoKarta('https://x.cz'));

  // ---- Dávka ----
  eq('dávka: hranice 10 a 500', [POCET_MIN, POCET_MAX], [10, 500]);
  ok('dávka: 10 i 500 projde', overPocet(10).ok && overPocet(500).ok);
  ok('dávka: 9, 501, 12.5 a text ne', !overPocet(9).ok && !overPocet(501).ok && !overPocet(12.5).ok && !overPocet('abc').ok);
  eq('dávka: název se ořízne, prázdný = bez názvu', [nazevDavky('  Léto   2026 '), nazevDavky('   ')], ['Léto 2026', null]);

  // ---- Host bez aplikace ----
  const em = emailBezAplikace('A1b2-C3');
  eq('host bez aplikace: technický e-mail v doméně .invalid', em, 'bez-aplikace-a1b2c3@managero.invalid');
  ok('host bez aplikace se pozná, běžný e-mail ani smazaný účet ne', jeBezAplikace(em) && !jeBezAplikace('jana@seznam.cz') && !jeBezAplikace('smazan-5@managero.invalid'));
  const h = overNovehoHosta({ jmeno: '  Jana   Nováková ', telefon: '+420 777 123 456', email: ' Jana@Seznam.CZ ' });
  eq('nový host: jméno, telefon jen číslice, e-mail malými', h, { ok: true, host: { jmeno: 'Jana Nováková', telefon: '+420777123456', email: 'jana@seznam.cz' } });
  eq('nový host: telefon a e-mail jsou nepovinné', overNovehoHosta({ jmeno: 'Petr' }), { ok: true, host: { jmeno: 'Petr', telefon: null, email: null } });
  ok('nový host: bez jména ne', !overNovehoHosta({ jmeno: ' P ' }).ok);
  ok('nový host: telefon s písmeny ne, krátký ne', !overNovehoHosta({ jmeno: 'Petr', telefon: '777abc' }).ok && !overNovehoHosta({ jmeno: 'Petr', telefon: '12345' }).ok);
  ok('nový host: technický e-mail zadat nejde', !overNovehoHosta({ jmeno: 'Petr', email: 'x@managero.invalid' }).ok);

  // ---- Hledání u kasy ----
  eq('hledání: telefon se hledá podle číslic', dotazHledani('777 123 456'), { text: '777 123 456', cislice: '777123456', email: false });
  eq('hledání: jméno nemá číslice', dotazHledani('Jana'), { text: 'Jana', cislice: '', email: false });
  eq('hledání: jeden znak nestačí', dotazHledani('J'), null);
  eq('kontakt obsluze zakrytý', [maskaTelefonu('+420777123456'), maskaEmailu('jana@seznam.cz'), maskaEmailu(em)], ['••• 456', 'j•••@seznam.cz', null]);

  // ---- Rozhodnutí ----
  const nova = { stav: 'nova' as const, teamId: 5, customerId: null };
  const aktivni = { stav: 'aktivni' as const, teamId: 5, customerId: 9 };
  const blok = { stav: 'blokovana' as const, teamId: 5, customerId: null };
  ok('aktivace: nová karta vlastního podniku ano', rozhodniAktivaci(nova, 5).ok);
  eq('aktivace: zablokovaná řekne srozumitelně proč', rozhodniAktivaci(blok, 5), { ok: false, status: 410, chyba: HLASKA_BLOKOVANA });
  eq('aktivace: karta jiného podniku ne', (rozhodniAktivaci(nova, 6) as any).status, 403);
  eq('aktivace: už přiřazená ne', (rozhodniAktivaci(aktivni, 5) as any).status, 409);
  ok('blokace: nová i aktivní ano, zablokovaná ne, cizí ne', rozhodniBlokaci(nova, 5).ok && rozhodniBlokaci(aktivni, 5).ok && !rozhodniBlokaci(blok, 5).ok && !rozhodniBlokaci(aktivni, 6).ok);
  ok('náhrada: aktivní karta za novou z krabice', rozhodniNahradu(aktivni, nova, 5).ok);
  ok('náhrada: bez kódu nová karta k vytištění', rozhodniNahradu(aktivni, undefined, 5).ok);
  ok('náhrada: nepřiřazenou kartu nahradit nejde (stačí blokace)', !rozhodniNahradu(nova, undefined, 5).ok);
  ok('náhrada: nová karta nesmí být cizí, přiřazená ani zablokovaná', !rozhodniNahradu(aktivni, { ...nova, teamId: 6 }, 5).ok && !rozhodniNahradu(aktivni, aktivni, 5).ok && !rozhodniNahradu(aktivni, blok, 5).ok);
  ok('náhrada: neznámý kód nové karty', !rozhodniNahradu(aktivni, null, 5).ok);
  eq('připojení v aplikaci: nová karta se přiřadí', rozhodniPripojeni(nova, 9, false), { akce: 'aktivovat' });
  eq('připojení: vlastní karta', rozhodniPripojeni(aktivni, 9, false), { akce: 'uz_tvoje' });
  eq('připojení: karta hosta bez aplikace se převezme', rozhodniPripojeni(aktivni, 4, true), { akce: 'prevzit', zId: 9 });
  eq('připojení: karta jiného člověka s aplikací nikdy', (rozhodniPripojeni(aktivni, 4, false) as any).status, 409);
  eq('připojení: zablokovaná', (rozhodniPripojeni(blok, 4, false) as any).chyba, HLASKA_BLOKOVANA);
  eq('připojení: neznámá', (rozhodniPripojeni(null, 4, false) as any).status, 404);

  // ---- Tiskový arch ----
  eq('arch: A4, karta 85 × 55, deset na stranu', [A4.w, A4.h, KARTA.w, KARTA.h, NA_STRANU], [210, 297, 85, 55, 10]);
  eq('arch: mřížka je vystředěná', [OKRAJ_X, OKRAJ_Y], [20, 11]);
  eq('arch: druhá karta vpravo, třetí pod první', [poziceKarty(1), poziceKarty(2)], [{ x: 105, y: 11 }, { x: 20, y: 66 }]);
  eq('arch: 23 karet = tři strany (10, 10, 3)', naStrany(Array.from({ length: 23 }, (_, i) => i)).map(s => s.length), [10, 10, 3]);
  const z = znackyStrany(10);
  eq('arch: plná strana má 3 × 2 svislé a 6 × 2 vodorovných značek', z.length, 3 * 2 + 6 * 2);
  ok('arch: značky leží v okrajích, ne přes kartu', z.every(m => (m.x1 === m.x2 ? (m.y2 <= OKRAJ_Y || m.y1 >= OKRAJ_Y + 5 * KARTA.h) : (m.x2 <= OKRAJ_X || m.x1 >= OKRAJ_X + 2 * KARTA.w))));
  ok('arch: značky nevyjedou z papíru', z.every(m => Math.min(m.x1, m.x2, m.y1, m.y2) >= 0 && Math.max(m.x1, m.x2) <= A4.w && Math.max(m.y1, m.y2) <= A4.h));
  eq('arch: strana s jednou kartou má značky jen kolem ní', znackyStrany(1).length, 2 * 2 + 2 * 2);
  const html = htmlArchuKaret({ karty: [{ kod: 'ABCD-EFGH', svg: '<svg></svg>' }, { kod: 'R&D1-2345', svg: '<svg></svg>' }], podnik: 'Kavárna <U Lípy>', popis: 'Dávka 1', titulek: 'Karty' });
  ok('arch: @page bez okrajů a A4 (tisk ve skutečné velikosti)', html.includes('@page { size: A4; margin: 0; }'));
  ok('arch: rozměry karty v milimetrech', html.includes('width: 85mm; height: 55mm'));
  ok('arch: podnik i kód se escapují', html.includes('Kavárna &lt;U Lípy&gt;') && html.includes('R&amp;D1-2345') && !html.includes('<U Lípy>'));
  ok('arch: lišta s návodem se netiskne', html.includes('.lista { display: none !important; }') && html.includes('skutečné velikosti (100 %)'));
  ok('arch: papír nese podnik, dávku a stranu', html.includes('Dávka 1 · strana 1/1'));
  eq('arch: počet karet česky', [pocetKaret(1), pocetKaret(3), pocetKaret(50)], ['1 karta', '3 karty', '50 karet']);

  // ---- Odkaz do peněženky ----
  const T = 'tajne-0123456789';
  const t0 = 1_800_000_000;
  const odkaz = podepisOdkaz({ customerId: 42, slug: 'kavarna', druh: 'apple' }, T, t0);
  eq('wallet: podepsaný odkaz se ověří', overOdkaz(odkaz, T, t0 + 5), { u: 42, s: 'kavarna', d: 'apple', e: t0 + PLATNOST_ODKAZU_S });
  eq('wallet: po deseti minutách neplatí', overOdkaz(odkaz, T, t0 + PLATNOST_ODKAZU_S + 1), null);
  eq('wallet: jiné tajemství neprojde', overOdkaz(odkaz, 'jine', t0), null);
  const [data, sig] = odkaz.split('.');
  const podvrh = Buffer.from(JSON.stringify({ u: 1, s: 'kavarna', d: 'apple', e: t0 + 600 })).toString('base64url');
  eq('wallet: přepsaný obsah s původním podpisem neprojde', overOdkaz(`${podvrh}.${sig}`, T, t0), null);
  eq('wallet: nesmysl a prázdné tajemství neprojdou', [overOdkaz('abc', T, t0), overOdkaz(`${data}.${sig}`, '', t0), overOdkaz(null, T, t0)], [null, null, null]);
}
