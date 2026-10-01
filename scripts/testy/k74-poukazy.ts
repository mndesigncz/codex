// Kolo 74 — dárkové poukazy (lib/poukazy.ts).
//
// Hlídá, co by stálo peníze: kód bez zaměnitelných znaků a s kontrolním znakem, opis „dp-abcd 1234“,
// stav k datu (propadlý den po poslední platnosti), uplatnění víc než zůstatek, zrušený, vyčerpaný,
// záporné a desetinné částky, jiná měna, vrácení nad původní hodnotu a export CSV bez vzorců z Excelu.

import type { Testy } from './_testy.ts';
import {
  ABECEDA, generujKod, kontrolniZnak, normalizujKod, kodOk, overKod, formatujPriPsani, celaCastka, stavPoukazu, posudUplatneni, posudVraceni,
  jeDatum, zustatekZHistorie, csvPole, poukazyCsv, hodnotyDavky, MAX_HODNOTA, type PoukazVstup,
} from '../../lib/poukazy.ts';
import { poukazyKartyHtml, datumCesky } from '../../lib/poukazyTisk.ts';

export default function ({ eq, ok }: Testy) {
  // ---- kód ----
  ok('abeceda má 32 znaků bez 0, 1, I, O', ABECEDA.length === 32 && !/[01IO]/.test(ABECEDA));
  // Pevná „náhoda“: bajty 0..6 → znaky A..H a kontrolní znak dopočtený.
  const pevny = generujKod(n => Uint8Array.from({ length: n }, (_, i) => i));
  eq('kód ve tvaru DP-XXXX-XXXX z pevné náhody', pevny.slice(0, 8), 'DP-ABCD-');
  ok('kód z pevné náhody má platný kontrolní znak', kodOk(pevny));
  const mnoho = new Set<string>();
  let vsechnyOk = true;
  for (let i = 0; i < 2000; i++) {
    const k = generujKod();
    mnoho.add(k);
    if (!/^DP-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/.test(k) || !kodOk(k)) vsechnyOk = false;
  }
  ok('2000 vygenerovaných kódů: tvar, abeceda a kontrolní znak sedí', vsechnyOk);
  ok('2000 vygenerovaných kódů je unikátních', mnoho.size === 2000);
  eq('kontrolní znak z neplatného znaku je prázdný', kontrolniZnak('ABCD0EF'), '');

  // ---- normalizace a kontrola ----
  eq('opis s malými písmeny a mezerou', normalizujKod('dp-abcd 2345'), 'DP-ABCD-2345');
  eq('opis bez pomlček a bez prefixu', normalizujKod('abcd2345'), 'DP-ABCD-2345');
  eq('opis bez oddělovačů s prefixem', normalizujKod('DPABCD2345'), 'DP-ABCD-2345');
  eq('opis s tečkami a tabulátorem', normalizujKod(' dp.abcd\t2345 '), 'DP-ABCD-2345');
  eq('zaměnitelný znak 0 se odmítne', normalizujKod('DP-ABC0-2345'), null);
  eq('zaměnitelný znak O se odmítne', normalizujKod('DP-ABCO-2345'), null);
  eq('moc krátký kód', normalizujKod('DP-ABCD-234'), null);
  eq('moc dlouhý kód', normalizujKod('DP-ABCD-23456'), null);
  eq('prázdný vstup a null', [normalizujKod(''), normalizujKod(null), normalizujKod(undefined)], [null, null, null]);
  const dobry = generujKod();
  eq('platný kód projde overKod i po opisu malými písmeny', overKod(dobry.toLowerCase().replace(/-/g, ' ')), dobry);
  // Jedna změněná číslice ve sledovaném kódu: kontrolní znak to musí chytit (zkoušíme všechny pozice a záměny).
  let prosly = 0, zkouseno = 0;
  const c = dobry.replace(/-/g, '').slice(2);
  for (let pos = 0; pos < 7; pos++) {
    for (const z of ABECEDA) {
      if (z === c[pos]) continue;
      const zmenen = c.slice(0, pos) + z + c.slice(pos + 1);
      zkouseno++;
      if (kodOk(normalizujKod(zmenen))) prosly++;
    }
  }
  ok(`překlep v jednom znaku (${zkouseno} variant) kontrolní znak vždy chytí`, prosly === 0);
  eq('formát při psaní: začátek', formatujPriPsani('ab'), 'AB');
  eq('formát při psaní: pět znaků', formatujPriPsani('abcde'), 'ABCD-E');
  eq('formát při psaní: vložený celý kód s předponou', formatujPriPsani('dp-abcd-2345'), 'ABCD-2345');
  eq('formát při psaní: předpona psaná po jednom znaku nezmizí', formatujPriPsani('dp'), 'DP');
  eq('formát při psaní: přebytek se ořízne', formatujPriPsani('abcd2345xx'), 'ABCD-2345');

  // ---- částky ----
  eq('celá částka z čísla i textu', [celaCastka(150), celaCastka('150'), celaCastka(' 150 ')], [150, 150, 150]);
  eq('desetinná, záporná, text a NaN neprojdou', [celaCastka(1.5), celaCastka(-1), celaCastka('1,5'), celaCastka('abc'), celaCastka(NaN), celaCastka(Infinity), celaCastka(null)], [null, null, null, null, null, null, null]);
  eq('nad maximum neprojde, maximum ano', [celaCastka(MAX_HODNOTA + 1), celaCastka(MAX_HODNOTA)], [null, MAX_HODNOTA]);
  eq('exponenciální zápis neprojde', celaCastka('1e3'), null);

  // ---- stav k datu ----
  const p = (o: Partial<PoukazVstup> = {}): PoukazVstup => ({ value_amount: 1000, balance: 1000, currency: 'CZK', valid_until: null, status: 'active', ...o });
  eq('bez data je platný', stavPoukazu(p(), '2026-10-01'), 'active');
  eq('v den poslední platnosti ještě platí', stavPoukazu(p({ valid_until: '2026-10-01' }), '2026-10-01'), 'active');
  eq('den po poslední platnosti je propadlý', stavPoukazu(p({ valid_until: '2026-10-01' }), '2026-10-02'), 'expired');
  eq('nulový zůstatek je vyčerpaný', stavPoukazu(p({ balance: 0 }), '2026-10-01'), 'used');
  eq('vyčerpaný a propadlý je vyčerpaný', stavPoukazu(p({ balance: 0, valid_until: '2020-01-01' }), '2026-10-01'), 'used');
  eq('zrušený má přednost před vším', stavPoukazu(p({ status: 'void', balance: 0, valid_until: '2020-01-01' }), '2026-10-01'), 'void');

  // ---- uplatnění ----
  const dnes = '2026-10-01';
  eq('uplatnění části', posudUplatneni(p(), 300, dnes), { ok: true, novyZustatek: 700, castka: 300 });
  eq('uplatnění celého zůstatku', posudUplatneni(p({ balance: 250 }), 250, dnes), { ok: true, novyZustatek: 0, castka: 250 });
  eq('uplatnění o korunu víc než zůstatek', posudUplatneni(p({ balance: 250 }), 251, dnes), { ok: false, duvod: 'vic_nez_zustatek' });
  eq('nulová částka', posudUplatneni(p(), 0, dnes), { ok: false, duvod: 'nulova' });
  eq('záporná částka (nesmí zvyšovat zůstatek)', posudUplatneni(p(), -100, dnes), { ok: false, duvod: 'zaporna' });
  eq('desetinná částka', posudUplatneni(p(), 10.5, dnes), { ok: false, duvod: 'necela' });
  eq('částka jako text se odmítne (posudek čeká číslo)', posudUplatneni(p(), '100', dnes), { ok: false, duvod: 'necela' });
  eq('NaN', posudUplatneni(p(), NaN, dnes), { ok: false, duvod: 'necela' });
  eq('propadlý', posudUplatneni(p({ valid_until: '2026-09-30' }), 100, dnes), { ok: false, duvod: 'propadly' });
  eq('zrušený', posudUplatneni(p({ status: 'void', balance: 0 }), 100, dnes), { ok: false, duvod: 'zruseny' });
  eq('vyčerpaný', posudUplatneni(p({ balance: 0, status: 'used' }), 100, dnes), { ok: false, duvod: 'vycerpany' });
  eq('neexistující poukaz', posudUplatneni(null, 100, dnes), { ok: false, duvod: 'nenalezen' });
  eq('jiná měna než poukaz', posudUplatneni(p({ currency: 'CZK' }), 100, dnes, 'EUR'), { ok: false, duvod: 'mena' });
  eq('stejná měna bez ohledu na velikost písmen', posudUplatneni(p({ currency: 'eur' }), 100, dnes, 'EUR').ok, true);
  // Dvojí uplatnění: po prvním uplatnění celého zůstatku druhé neprojde.
  const prvni = posudUplatneni(p({ balance: 500 }), 500, dnes);
  ok('dvojí uplatnění celého zůstatku: první projde', prvni.ok);
  eq('dvojí uplatnění: druhé je vyčerpaný poukaz', posudUplatneni(p({ balance: prvni.ok ? prvni.novyZustatek : -1 }), 500, dnes), { ok: false, duvod: 'vycerpany' });

  // ---- vrácení ----
  eq('vrácení části uplatněného', posudVraceni(p({ balance: 700 }), 300), { ok: true, novyZustatek: 1000, castka: 300 });
  eq('vrácení do vyčerpaného poukazu ho oživí', posudVraceni(p({ balance: 0, status: 'used' }), 400), { ok: true, novyZustatek: 400, castka: 400 });
  eq('vrácení víc, než bylo uplatněno', posudVraceni(p({ balance: 700 }), 301), { ok: false, duvod: 'vic_nez_hodnota' });
  eq('vrácení do zrušeného', posudVraceni(p({ status: 'void', balance: 0 }), 100), { ok: false, duvod: 'zruseny' });
  eq('vrácení záporné částky', posudVraceni(p({ balance: 700 }), -1), { ok: false, duvod: 'zaporna' });
  eq('vrácení do propadlého poukazu je dovoleno (oprava omylu)', posudVraceni(p({ balance: 700, valid_until: '2020-01-01' }), 100).ok, true);

  // ---- historie ----
  eq('zůstatek z historie: uplatnění, vrácení, zrušení', zustatekZHistorie(1000, [
    { kind: 'use', amount: 300 }, { kind: 'refund', amount: 100 }, { kind: 'use', amount: 200 }, { kind: 'void', amount: 600 },
  ]), 0);

  // ---- datum ----
  eq('skutečné a neexistující datum', [jeDatum('2026-02-28'), jeDatum('2026-02-30'), jeDatum('2026-13-01'), jeDatum('1.2.2026'), jeDatum(null)], [true, false, false, false, false]);

  // ---- dávka ----
  eq('jedna hodnota pro všechny kusy', hodnotyDavky(500, 3), [500, 500, 500]);
  eq('seznam hodnot po kusech', hodnotyDavky([100, 200], 2), [100, 200]);
  eq('seznam s jiným počtem než kusů', hodnotyDavky([100, 200], 3), null);
  eq('nula a záporná hodnota v dávce', [hodnotyDavky(0, 2), hodnotyDavky([100, -5], 2)], [null, null]);
  eq('více než sto kusů', hodnotyDavky(100, 101), null);
  eq('sto kusů ještě ano', hodnotyDavky(100, 100)?.length, 100);

  // ---- CSV ----
  eq('CSV pole: středník a uvozovky', csvPole('a;b "c"'), '"a;b ""c"""');
  eq('CSV pole: vzorec z Excelu se zneškodní', csvPole('=HYPERLINK("x")'), `"'=HYPERLINK(""x"")"`);
  eq('CSV pole: znaménko mínus na začátku', csvPole('-5'), "'-5");
  const csv = poukazyCsv([
    { code: 'DP-ABCD-2345', value_amount: 1000, balance: 300, currency: 'CZK', valid_until: '2026-12-31', status: 'active', recipient_name: 'Jana; Nováková', created_at: '2026-10-01T10:00:00' },
    { code: 'DP-ZZZZ-2222', value_amount: 500, balance: 0, currency: 'CZK', valid_until: null, status: 'used' },
  ], dnes);
  const radky = csv.replace('﻿', '').trim().split('\r\n');
  eq('CSV: hlavička a dva řádky', radky.length, 3);
  eq('CSV: první řádek s uvozovkami u středníku', radky[1], 'DP-ABCD-2345;Platný;1000;300;CZK;2026-12-31;"Jana; Nováková";;;2026-10-01');
  ok('CSV: začíná BOM kvůli češtině v Excelu', csv.startsWith('﻿'));
  eq('CSV: vyčerpaný poukaz má stav Vyčerpaný', radky[2].split(';')[1], 'Vyčerpaný');

  // ---- tisk karty ----
  eq('datum na kartě česky', datumCesky('2026-12-05'), '5. 12. 2026');
  const html = poukazyKartyHtml([
    { code: 'DP-ABCD-2345', value_amount: 1500, currency: 'CZK', valid_until: '2026-12-31', recipient_name: 'Jana <b>Nováková</b>' },
    { code: 'DP-ZZZZ-2222', value_amount: 20, currency: 'EUR', valid_until: null },
  ], 'Čajovna <script>', { 'DP-ABCD-2345': '<svg id="qr1"></svg>' });
  ok('karta: název podniku a kód jsou na kartě', html.includes('DP-ABCD-2345') && html.includes('Čajovna &lt;script&gt;'));
  ok('karta: jméno obdarovaného se escapuje (žádné vložené HTML)', html.includes('Jana &lt;b&gt;Nováková&lt;/b&gt;') && !html.includes('<b>Nov'));
  ok('karta: QR kód z dodaného SVG je vložen', html.includes('<svg id="qr1"></svg>'));
  ok('karta: hodnota v měně poukazu', /1\s?500\s?Kč/.test(html.replace(/\u00a0/g, ' ')) && html.includes('€'));
  ok('karta: platnost a „bez omezení“', html.includes('Platí do 31. 12. 2026') && html.includes('Bez omezení platnosti'));
  eq('karta: dvě karty = dvě sekce', (html.match(/<section class="poukaz">/g) ?? []).length, 2);
}
