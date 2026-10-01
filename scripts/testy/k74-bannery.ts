// Kolo 74 — promo bannery a QR kuponu na obsluze.
// Čisté funkce: validace banneru (jen https odkazy), výběr aktivních k datu,
// pořadí po posunu, rozpoznání QR (payload kuponu / kód kuponu / karta / cizí).
// Nad zdrojáky pojistka, že uplatnění kuponu zůstává jedna cesta (redeem).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { validujBanner, vyberAktivni, presunBanner, httpsOdkaz, obrazekBanneru, procNeukazuje } from '../../lib/bannery.ts';
import { rozpoznejQr, kodKuponu, kuponPayload, duvodNeKupon } from '../../lib/kuponQr.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- Odkazy: jen https ----
  eq('https projde', httpsOdkaz('https://example.com/akce?x=1'), 'https://example.com/akce?x=1');
  eq('javascript: ne', httpsOdkaz('javascript:alert(1)'), null);
  eq('data: ne', httpsOdkaz('data:text/html,<script>alert(1)</script>'), null);
  eq('http: ne', httpsOdkaz('http://example.com'), null);
  eq('bez hostitele ne', httpsOdkaz('https://'), null);
  eq('hostitel bez tečky ne', httpsOdkaz('https://localhost'), null);
  eq('přihlašovací údaje ne', httpsOdkaz('https://a:b@example.com'), null);
  eq('mezera ne', httpsOdkaz('https://exa mple.com'), null);
  eq('JaVaScRiPt: ne', httpsOdkaz('JaVaScRiPt:alert(1)'), null);
  eq('obrázek z galerie', obrazekBanneru('/api/client/img/42'), '/api/client/img/42');
  eq('obrázek https', obrazekBanneru('https://cdn.example.com/a.jpg'), 'https://cdn.example.com/a.jpg');
  eq('obrázek data: ne', obrazekBanneru('data:image/png;base64,AAAA'), null);
  eq('cizí cesta ne', obrazekBanneru('/api/upload/5'), null);

  // ---- Validace ----
  const v1 = validujBanner({ title: '  Degustace  ', text: 'Pátek 18:00' });
  ok('základ projde', v1.ok);
  if (v1.ok) {
    eq('nadpis oříznut', v1.hodnoty.title, 'Degustace');
    eq('výchozí bez odkazu', v1.hodnoty.link_kind, 'none');
    eq('výchozí aktivní', v1.hodnoty.active, true);
  }
  eq('bez nadpisu', validujBanner({ title: '   ' }).ok, false);
  eq('nadpis max 80', (validujBanner({ title: 'x'.repeat(200) }) as any).hodnoty.title.length, 80);
  eq('text max 300', (validujBanner({ title: 'a', text: 'y'.repeat(900) }) as any).hodnoty.text.length, 300);
  eq('url bez https', validujBanner({ title: 'a', link_kind: 'url', link_ref: 'javascript:alert(1)' }).ok, false);
  eq('url https', validujBanner({ title: 'a', link_kind: 'url', link_ref: 'https://example.com' }).ok, true);
  eq('neznámý druh', validujBanner({ title: 'a', link_kind: 'iframe' }).ok, false);
  eq('akce bez čísla', validujBanner({ title: 'a', link_kind: 'event', link_ref: '' }).ok, false);
  eq('akce s číslem', (validujBanner({ title: 'a', link_kind: 'event', link_ref: '7' }) as any).hodnoty.link_ref, '7');
  eq('menu bez cíle', (validujBanner({ title: 'a', link_kind: 'menu', link_ref: 'cokoli' }) as any).hodnoty.link_ref, null);
  eq('špatný obrázek', validujBanner({ title: 'a', image_url: 'data:image/png;base64,AA' }).ok, false);
  eq('datum špatný tvar', validujBanner({ title: 'a', valid_since: '1.10.2026' }).ok, false);
  eq('datum neexistuje', validujBanner({ title: 'a', valid_until: '2026-02-31' }).ok, false);
  eq('konec před začátkem', validujBanner({ title: 'a', valid_since: '2026-10-05', valid_until: '2026-10-01' }).ok, false);
  eq('prázdné datum = bez omezení', (validujBanner({ title: 'a', valid_since: '', valid_until: '' }) as any).hodnoty.valid_until, null);

  // ---- Výběr aktivních ----
  const DNES = '2026-10-01';
  const b = (id: number, x: any = {}) => ({ id, active: true, position: id, valid_since: null, valid_until: null, ...x });
  eq('vypnuté pryč', vyberAktivni([b(1), b(2, { active: false })], DNES).map(r => r.id), [1]);
  eq('ještě nezačalo', vyberAktivni([b(1, { valid_since: '2026-10-02' })], DNES).map(r => r.id), []);
  eq('začíná dnes', vyberAktivni([b(1, { valid_since: DNES })], DNES).map(r => r.id), [1]);
  eq('končí dnes', vyberAktivni([b(1, { valid_until: DNES })], DNES).map(r => r.id), [1]);
  eq('skončilo včera', vyberAktivni([b(1, { valid_until: '2026-09-30' })], DNES).map(r => r.id), []);
  eq('podle pozice', vyberAktivni([b(1, { position: 5 }), b(2, { position: 1 }), b(3, { position: 3 })], DNES).map(r => r.id), [2, 3, 1]);
  eq('stejná pozice podle id', vyberAktivni([b(9, { position: 0 }), b(4, { position: 0 })], DNES).map(r => r.id), [4, 9]);
  eq('max pět', vyberAktivni([1, 2, 3, 4, 5, 6, 7].map(i => b(i)), DNES).map(r => r.id), [1, 2, 3, 4, 5]);
  eq('datum z databáze s časem', vyberAktivni([b(1, { valid_until: '2026-10-01T00:00:00.000Z' })], DNES).length, 1);
  eq('stav vypnutý', procNeukazuje(b(1, { active: false }), DNES), 'vypnutý');
  eq('stav začne', procNeukazuje(b(1, { valid_since: '2026-10-03' }), DNES), 'začne 2026-10-03');
  eq('stav skončila', procNeukazuje(b(1, { valid_until: '2026-09-01' }), DNES), 'platnost skončila');
  eq('stav vidí se', procNeukazuje(b(1), DNES), null);

  // ---- Pořadí ----
  eq('posun dolů', presunBanner([1, 2, 3], 1, 1), [2, 1, 3]);
  eq('posun nahoru', presunBanner([1, 2, 3], 3, -1), [1, 3, 2]);
  eq('nahoru na kraji', presunBanner([1, 2, 3], 1, -1), [1, 2, 3]);
  eq('dolů na kraji', presunBanner([1, 2, 3], 3, 1), [1, 2, 3]);
  eq('neznámé id', presunBanner([1, 2], 9, 1), [1, 2]);

  // ---- QR kuponu ----
  eq('payload kuponu', rozpoznejQr('managero:coupon:ABC-DEF'), { typ: 'kupon', kod: 'ABC-DEF' });
  eq('payload malými', rozpoznejQr('MANAGERO:COUPON:abc-def'), { typ: 'kupon', kod: 'ABC-DEF' });
  eq('payload bez pomlčky a s mezerami', rozpoznejQr('  managero:coupon:abcdef \n'), { typ: 'kupon', kod: 'ABC-DEF' });
  eq('holý kód kuponu', rozpoznejQr('abc-def'), { typ: 'kupon', kod: 'ABC-DEF' });
  eq('holý kód bez pomlčky', rozpoznejQr('ABCDEF'), { typ: 'kupon', kod: 'ABC-DEF' });
  eq('karta hosta', rozpoznejQr('ABCD-EFGH'), { typ: 'karta', kod: 'ABCDEFGH' });
  eq('prázdný', rozpoznejQr('   '), { typ: 'prazdny' });
  eq('cizí URL', rozpoznejQr('https://example.com/abcdef'), { typ: 'cizi' });
  eq('cizí wifi', rozpoznejQr('WIFI:S:kavarna;T:WPA;P:heslo;;'), { typ: 'cizi' });
  eq('poškozený payload', rozpoznejQr('managero:coupon:AB'), { typ: 'cizi' });
  eq('payload s příměsí', rozpoznejQr('managero:coupon:ABC-DEF;DROP TABLE'), { typ: 'cizi' });
  eq('payload s karetním kódem', rozpoznejQr('managero:coupon:ABCDEFGH'), { typ: 'cizi' });
  eq('jiný managero payload', rozpoznejQr('managero:card:ABCDEFGH'), { typ: 'cizi' });
  eq('příliš dlouhé', rozpoznejQr('A'.repeat(500)), { typ: 'cizi' });
  eq('kodKuponu z payloadu i z ruky shodně', kodKuponu('managero:coupon:ab3-k7m'), kodKuponu('AB3 K7M'));
  eq('kodKuponu karta = null', kodKuponu('ABCD1234'), null);
  eq('kuponPayload', kuponPayload('abc-def'), 'managero:coupon:ABC-DEF');
  eq('payload a zpět', kodKuponu(kuponPayload('xyz789')), 'XYZ-789');
  ok('věta pro kartu', duvodNeKupon('ABCD1234').includes('kartička'));
  ok('věta pro cizí QR', duvodNeKupon('https://x.cz').includes('není QR kupon'));
  ok('věta pro krátký kód', duvodNeKupon('AB').includes('šest znaků'));
  ok('věta pro prázdný', duvodNeKupon('').includes('Zadej kód'));

  // ---- Pojistky nad zdrojáky ----
  const redeem = zdroj('app/api/client/admin/redeem/route.ts');
  ok('redeem normalizuje přes kodKuponu', redeem.includes('kodKuponu('));
  ok('redeem má náhled bez uplatnění', redeem.includes('b.preview === true'));
  const scan = zdroj('components/client/CardScan.tsx');
  ok('skener uplatňuje jen přes redeem', (scan.match(/\/api\/client\/admin\/redeem/g) ?? []).length >= 2 && !scan.includes('/api/client/admin/coupons'));
  ok('skener rozpoznává QR sdílenou funkcí', scan.includes('rozpoznejQr'));
  const admin = zdroj('app/api/client/admin/banners/route.ts');
  ok('správa bannerů hlídá oprávnění', admin.includes("pozaduj(OPR)") && admin.includes("'klient.vzhled'"));
  ok('správa bannerů validuje na serveru', admin.includes('validujBanner('));
  ok('veřejné API vrací bannery', zdroj('app/api/client/b/[slug]/route.ts').includes('aktivniBannery('));
}
