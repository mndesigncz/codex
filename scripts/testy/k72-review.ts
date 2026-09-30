// Kolo 72, review oprav auditu: hromadná úprava skladu, odpis prodejů na celé
// kusy, čeština v historii změn, cena vlastní položky výjezdu a texty serveru
// v měně podniku.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { hromadneCislo } from '../../lib/inventura.ts';
import { consumeContent, odepsatProdej } from '../../lib/packaging.ts';
import { popisPoliNastaveni, detailAkce } from '../../lib/auditPopisky.ts';
import { normalizeEventMenu } from '../../lib/events.ts';

const koren = new URL('../../', import.meta.url);
const zdroj = (cesta: string) => readFileSync(new URL(cesta, koren), 'utf8');
function* soubory(dir: string): Generator<string> {
  for (const n of readdirSync(new URL(dir + '/', koren))) {
    const rel = `${dir}/${n}`;
    if (statSync(new URL(rel, koren)).isDirectory()) yield* soubory(rel);
    else if (/\.ts$/.test(n)) yield rel;
  }
}

export default function ({ eq, ok }: Testy) {
  // ---- hromadná úprava: nečíslo nesmí skončit jako nula ----
  eq('hromadně: null (z NaN v JSONu) je „nezadáno", ne nula', hromadneCislo(null), { ok: true, hodnota: null });
  eq('hromadně: prázdný řetězec je nezadáno', hromadneCislo(''), { ok: true, hodnota: null });
  eq('hromadně: „abc" je chyba', hromadneCislo('abc').ok, false);
  eq('hromadně: „5 ks" je chyba', hromadneCislo('5 ks').ok, false);
  eq('hromadně: NaN a záporné číslo jsou chyba', [hromadneCislo(NaN).ok, hromadneCislo(-1).ok], [false, false]);
  eq('hromadně: česká čárka', hromadneCislo('0,5'), { ok: true, hodnota: 0.5 });
  eq('hromadně: skutečná nula zůstane nulou', hromadneCislo(0), { ok: true, hodnota: 0 });

  // ---- odpis prodeje: INTEGER sloupec nesmí dostat desetinu ----
  eq('odpis: bez balení a s desetinným sloupcem zůstane 9,65', odepsatProdej(10, 0, 0, 0.35).qty, 9.65);
  eq('odpis: bez balení a s INTEGER sloupcem celé číslo', Number.isInteger(odepsatProdej(10, 0, 0, 0.35, true).qty), true);
  eq('odpis: celé kusy se nikdy nedostanou pod nulu', odepsatProdej(1, 0, 0, 5, true).qty, 0);
  eq('odpis: načaté balení dál drží tři desetinná místa i při celých kusech', odepsatProdej(2, 0.7, 1, 0.02, true), { qty: 2, open: 0.68 });
  eq('odpis: consumeContent s celými kusy', consumeContent({ quantity: 10, packageSize: null, openAmount: null }, 0.25, { celeKusy: true }).quantity, 10);
  eq('odpis: consumeContent bez příznaku jako dřív', consumeContent({ quantity: 10, packageSize: null, openAmount: null }, 0.25).quantity, 9.8);

  // Prodeje po produktech jsou v téže transakci jako značky účtenek; zápis po
  // transakci s tichým catch nechával při pádu tržby natrvalo chybět.
  const sync = zdroj('lib/posSync.ts');
  const iTrans = sync.indexOf('sql.transaction(writes)');
  ok('posSync: pos_sales i pos_unmapped se zapisují před transakcí', iTrans > 0
    && sync.indexOf('INSERT INTO pos_sales') > 0 && sync.indexOf('INSERT INTO pos_sales') < iTrans
    && sync.indexOf('INSERT INTO pos_unmapped') > 0 && sync.indexOf('INSERT INTO pos_unmapped') < iTrans);
  ok('posSync: po transakci už žádný zápis do pos_sales', !sync.slice(iTrans).includes('INSERT INTO pos_sales'));

  // ---- historie změn: nový (český) zápis se při čtení nesmí ztratit ----
  const zapsano = popisPoliNastaveni(['name', 'currency']);
  eq('audit: round-trip zápis → čtení zachová text', detailAkce('team.settings', zapsano), 'název, měna');
  eq('audit: smíšený zápis (český + starý klíč)', detailAkce('team.settings', 'název, payDailyCash'), 'název, denní výplata v hotovosti');
  eq('audit: neznámý token se dál nezobrazí syrově', detailAkce('team.settings', 'nesmysl'), null);

  // ---- vlastní položka výjezdu: haléře v menu akce ----
  eq('akce: cena 3,50 € se nezaokrouhlí na 4', normalizeEventMenu([{ name: 'Káva', price: '3,50' }])[0].price, 3.5);
  eq('akce: číselná cena s tečkou', normalizeEventMenu([{ name: 'Káva', price: 4.5 }])[0].price, 4.5);
  eq('akce: prázdná cena je „bez ceny"', normalizeEventMenu([{ name: 'Voda', price: '' }])[0].price, null);
  eq('akce: nesmysl je 0, ne NaN', normalizeEventMenu([{ name: 'Voda', price: 'abc' }])[0].price, 0);

  // ---- žádný server nepíše koruny natvrdo (mimo data a komentáře) ----
  const smi = new Set(['app/api/init/route.ts', 'app/api/client/b/[slug]/route.ts', 'app/api/closings/route.ts']);
  const viniky = [...soubory('app/api')].filter(f => !smi.has(f))
    .filter(f => zdroj(f).split('\n').some(r => !/^\s*(\/\/|\*|\/\*)/.test(r) && /Kč/.test(r)));
  eq('měna: žádný soubor v app/api nepíše „Kč" natvrdo', viniky, []);
}
