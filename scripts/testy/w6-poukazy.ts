// W6 — poukazy: šablony vzhledu, uplatnění od určitého účtu, body za nákup, poukaz v aplikaci hosta,
// export pro účetnictví. Čistá logika z lib/poukazy*.ts plus pojistky nad zdrojáky tam, kde pravidlo žije v SQL
// (atomický zábor, žádná jména hostovi, přiřazení jen členovi podniku).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  posudUplatneni, textOdmitnuti, normalizujNastaveniPoukazu, bodyZaNakupPoukazu, MAX_BODU_ZA_NAKUP, MAX_MIN_UTRATA_POUKAZU, DUVOD_TEXT, type PoukazVstup,
} from '../../lib/poukazy.ts';
import { SABLONY, SABLONY_DATA, SABLONY_SEZNAM, sablona, jeSablona, overSablonu, VYCHOZI_SABLONA } from '../../lib/poukazySablony.ts';
import { poukazyKartyHtml } from '../../lib/poukazyTisk.ts';
import { emailPoukazu, emailPripominky } from '../../lib/poukazyEmail.ts';
import { pohybyCsv, mesicniCsv, overRozsahExportu, mesicPohybu, mesicCislem } from '../../lib/poukazyUcetni.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default async function ({ eq, ok }: Testy) {
  const DNES = '2026-10-01';
  const p = (x: Partial<PoukazVstup> = {}): PoukazVstup => ({ value_amount: 1000, balance: 1000, currency: 'CZK', valid_until: '2026-12-31', status: 'active', ...x });

  // ---- Šablony vzhledu ----
  eq('šablony: výchozí je klasik', VYCHOZI_SABLONA, 'klasik');
  ok('šablony: všechny mají pevné barvy (#RRGGBB)', SABLONY.every(id => /^#[0-9A-F]{6}$/i.test(SABLONY_DATA[id].barva) && /^#[0-9A-F]{6}$/i.test(SABLONY_DATA[id].podklad) && /^#[0-9A-F]{6}$/i.test(SABLONY_DATA[id].akcent)));
  ok('šablony: každá má nadpis, název a popis', SABLONY.every(id => SABLONY_DATA[id].nadpis && SABLONY_DATA[id].nazev && SABLONY_DATA[id].popis));
  ok('šablony: názvy v nabídce se neopakují', new Set(SABLONY_SEZNAM.map(s => s.nazev)).size === SABLONY.length);
  eq('šablona: neznámé id = klasik', sablona('smazana').id, 'klasik');
  eq('šablona: prázdné = klasik', sablona(null).id, 'klasik');
  eq('šablona: __proto__ nic nerozbije', sablona('__proto__').id, 'klasik');
  eq('jeSablona: vánoční', jeSablona('vanoce'), true);
  eq('jeSablona: číslo', jeSablona(5), false);
  eq('overSablonu: prázdné = klasik', overSablonu(''), { ok: true, id: 'klasik' });
  eq('overSablonu: platná', overSablonu('svatba'), { ok: true, id: 'svatba' });
  eq('overSablonu: neznámá je chyba, ne tiché klasik', overSablonu('vanoce2').ok, false);

  const karta = (design?: string) => ({ code: 'DP-ABCD-2345', value_amount: 500, currency: 'CZK', valid_until: '2026-12-31', recipient_name: 'Jana', design });
  const html = poukazyKartyHtml([karta('vanoce'), karta('narozeniny')], 'Čajovna', {});
  ok('tisk: vánoční nadpis', html.includes('Vánoční poukaz'));
  ok('tisk: narozeninový nadpis', html.includes('Poukaz k narozeninám'));
  ok('tisk: barva rámečku z šablony', html.includes('border-color:#166534'));
  ok('tisk: bez šablony klasik', poukazyKartyHtml([karta()], 'Čajovna', {}).includes('Dárkový poukaz'));
  ok('tisk: neznámá šablona nepustí cizí styl', !poukazyKartyHtml([karta('red;background:url(x)')], 'Čajovna', {}).includes('url(x)'));
  ok('tisk: kód zůstane v každé šabloně', SABLONY.every(id => poukazyKartyHtml([karta(id)], 'Čajovna', {}).includes('DP-ABCD-2345')));
  const mail = emailPoukazu({ podnik: 'Čajovna', kod: 'DP-ABCD-2345', castka: 500, mena: 'CZK', platnost: '2026-12-31', design: 'podekovani' });
  ok('e-mail: nadpis a barva z šablony', mail.html.includes('Poukaz jako poděkování') && mail.html.includes('#1D4ED8'));
  ok('e-mail: připomínka drží vzhled poukazu', emailPripominky({ podnik: 'Čajovna', kod: 'DP-ABCD-2345', castka: 500, mena: 'CZK', platnost: '2026-12-31', zbyvaDni: 3, design: 'svatba' }).html.includes('#9D174D'));
  ok('e-mail: bez šablony klasik', emailPoukazu({ podnik: 'Čajovna', kod: 'DP-ABCD-2345', castka: 500, mena: 'CZK', platnost: null }).html.includes('Dárkový poukaz'));

  // ---- Uplatnění od určitého účtu ----
  const lim = { min: 0, max: 0, minUtrata: 500 };
  eq('účet: chybí výše účtu', posudUplatneni(p(), 100, DNES, 'CZK', lim, null), { ok: false, duvod: 'utrata_chybi' });
  eq('účet: nečíselný', posudUplatneni(p(), 100, DNES, 'CZK', lim, NaN), { ok: false, duvod: 'utrata_chybi' });
  eq('účet: pod minimem', posudUplatneni(p(), 100, DNES, 'CZK', lim, 499), { ok: false, duvod: 'malo_utraty' });
  eq('účet: přesně minimum projde', posudUplatneni(p(), 100, DNES, 'CZK', lim, 500).ok, true);
  eq('účet: i zbytek poukazu potřebuje účet (útrata je podmínka podniku)', posudUplatneni(p({ balance: 30 }), 30, DNES, 'CZK', lim, 100), { ok: false, duvod: 'malo_utraty' });
  eq('účet: bez podmínky účet nikdo nechce', posudUplatneni(p(), 100, DNES, 'CZK', { min: 0, max: 0, minUtrata: 0 }, null).ok, true);
  eq('účet: starší volající bez minUtrata', posudUplatneni(p(), 100, DNES, 'CZK', { min: 0, max: 0 }).ok, true);
  eq('účet: zrušený poukaz má přednost před účtem', posudUplatneni(p({ status: 'void' }), 100, DNES, 'CZK', lim, null), { ok: false, duvod: 'zruseny' });
  eq('účet: víc než zůstatek má přednost', posudUplatneni(p({ balance: 50 }), 100, DNES, 'CZK', lim, 10), { ok: false, duvod: 'vic_nez_zustatek' });
  ok('účet: věta s číslem a měnou', textOdmitnuti('malo_utraty', lim, 'CZK').includes('500'));
  ok('účet: věta „zadej výši účtu“, když chybí', textOdmitnuti('utrata_chybi', lim, 'CZK').includes('Zadej výši účtu'));
  ok('účet: věta v eurech nemá koruny', !/Kč/.test(textOdmitnuti('malo_utraty', lim, 'EUR')));
  ok('účet: pevné texty existují', !!DUVOD_TEXT.utrata_chybi && !!DUVOD_TEXT.malo_utraty);

  // ---- Nastavení poukazů ----
  eq('nastavení: prázdné = vypnuto', normalizujNastaveniPoukazu('', ''), { ok: true, nastaveni: { minUtrata: 0, bodyZaNakup: 0 } });
  eq('nastavení: čísla jako text', normalizujNastaveniPoukazu('300', '5'), { ok: true, nastaveni: { minUtrata: 300, bodyZaNakup: 5 } });
  eq('nastavení: záporný účet', normalizujNastaveniPoukazu(-1, 0).ok, false);
  eq('nastavení: desetinné body', normalizujNastaveniPoukazu(0, 2.5).ok, false);
  eq('nastavení: nad strop účtu', normalizujNastaveniPoukazu(MAX_MIN_UTRATA_POUKAZU + 1, 0).ok, false);
  eq('nastavení: nad strop bodů', normalizujNastaveniPoukazu(0, MAX_BODU_ZA_NAKUP + 1).ok, false);
  eq('nastavení: text', normalizujNastaveniPoukazu('abc', 0).ok, false);
  eq('nastavení: přesně strop', normalizujNastaveniPoukazu(MAX_MIN_UTRATA_POUKAZU, MAX_BODU_ZA_NAKUP).ok, true);

  // ---- Body za nákup ----
  eq('body za nákup: 1000 × 5 za stovku', bodyZaNakupPoukazu(1000, 5), 50);
  eq('body za nákup: zlomek stovky se zahodí', bodyZaNakupPoukazu(250, 5), 10);
  eq('body za nákup: pod stovkou nic', bodyZaNakupPoukazu(99, 5), 0);
  eq('body za nákup: vypnuto', bodyZaNakupPoukazu(1000, 0), 0);
  eq('body za nákup: záporné nesmysly', bodyZaNakupPoukazu(-500, -5), 0);
  eq('body za nákup: strop sazby', bodyZaNakupPoukazu(100, 5000), MAX_BODU_ZA_NAKUP);

  // ---- Export pro účetnictví ----
  eq('rozsah: platný', overRozsahExportu('2026-01', '2026-10', '2026-10'), { ok: true, od: '2026-01', do: '2026-10' });
  eq('rozsah: bez „do“ je tento měsíc', (overRozsahExportu('2026-01', '', '2026-10') as any).do, '2026-10');
  eq('rozsah: bez „od“', overRozsahExportu('', '2026-10', '2026-10').ok, false);
  eq('rozsah: měsíc 13', overRozsahExportu('2026-13', '2026-10', '2026-10').ok, false);
  eq('rozsah: od po do', overRozsahExportu('2026-10', '2026-01', '2026-10').ok, false);
  eq('rozsah: 36 měsíců ještě jde', overRozsahExportu('2024-01', '2026-12', '2026-12').ok, true);
  eq('rozsah: 37 měsíců ne', overRozsahExportu('2023-12', '2026-12', '2026-12').ok, false);
  eq('měsíc pohybu: pražská půlnoc patří do dalšího měsíce', mesicPohybu('2026-09-30 22:30:00'), '2026-10');
  eq('měsíc pohybu: poledne', mesicPohybu('2026-09-30 10:00:00'), '2026-09');
  eq('měsíc číslem', mesicCislem('2026-03'), '03/2026');
  const csv = pohybyCsv([
    { at: '2026-10-02 09:00:00', kind: 'use', code: 'DP-AAAA-1111', amount: 200, balance_after: 300, currency: 'CZK', by_name: 'Eva', note: '=SUM(A1)' },
    { at: '2026-10-01 08:00:00', kind: 'sale', code: 'DP-AAAA-1111', amount: 500, balance_after: 500, currency: 'CZK', by_name: 'Eva', note: null },
    { at: '2026-10-03 09:00:00', kind: 'refund', code: 'DP-AAAA-1111', amount: 50, balance_after: 350, currency: 'CZK' },
  ]);
  const radky = csv.replace('﻿', '').trim().split('\r\n');
  eq('deník: hlavička a tři řádky', radky.length, 4);
  ok('deník: nejstarší nahoře', radky[1].includes('Prodej') && radky[2].includes('Uplatnění') && radky[3].includes('Vrácení'));
  ok('deník: středník a BOM pro Excel', csv.startsWith('﻿') && radky[0].split(';').length === 10);
  ok('deník: prodej zvyšuje závazek, uplatnění snižuje', radky[1].split(';')[5] === '500' && radky[2].split(';')[5] === '-200' && radky[3].split(';')[5] === '50');
  ok('deník: vzorec v poznámce je chráněný', radky[2].includes("'=SUM(A1)"));
  ok('deník: datum česky', radky[1].startsWith('1. 10. 2026;10/2026;'));
  const souhrn = mesicniCsv([
    { mesic: '2026-09', pocetProdanych: 2, prodano: 1000, uplatneno: 0, vraceno: 0, cistoUplatneno: 0 },
    { mesic: '2026-10', pocetProdanych: 1, prodano: 500, uplatneno: 200, vraceno: 50, cistoUplatneno: 150 },
  ], 'CZK').replace('﻿', '').trim().split('\r\n');
  eq('souhrn: dva měsíce a součet', souhrn.length, 4);
  eq('souhrn: součtový řádek', souhrn[3], 'Celkem;3;1500;200;50;150;CZK');

  // ---- Pojistky nad zdrojáky ----
  const db = zdroj('lib/poukazyHostDb.ts');
  ok('přiřazení: jen člen podniku', db.includes('jmenoClena(teamId, customerId)') && db.includes("Tenhle host není členem podniku."));
  ok('převzetí hostem: jeden UPDATE s podmínkou (nikdo jiný, platný)', /UPDATE client_vouchers SET customer_id = \$\{customerId\}[\s\S]*?customer_id IS NULL OR customer_id = \$\{customerId\}/.test(db));
  ok('odebrání: jen vlastní poukaz', db.includes('WHERE id = ${id} AND customer_id = ${customerId}'));
  ok('body za nákup: atomický zábor před připsáním', /UPDATE client_vouchers SET points_awarded = \$\{body\}[\s\S]*?points_awarded = 0[\s\S]*?award\(/.test(db));
  ok('body za nákup: při chybě se zábor vrátí', db.includes('SET points_awarded = 0'));
  const hostSelect = db.slice(db.indexOf('export async function poukazyHosta'), db.indexOf('// ---- Body za nákup poukazu'));
  ok('host nevidí jména, poznámku ani e-mail', !/recipient_name|buyer_name|note|recipient_email/.test(hostSelect.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  ok('host nevidí zrušené poukazy', hostSelect.includes("v.status <> 'void'"));
  const route = zdroj('app/api/client/admin/vouchers/route.ts');
  ok('správa: majitel a kupující musí být členové', route.includes('jmenoClena(ctx.teamId, h)'));
  ok('správa: dávka se nepřiřazuje jednomu hostovi', route.includes('Dávku poukazů nejde přiřadit jednomu hostovi.'));
  ok('správa: export účetnictví jen pro správce', /export'\) === 'mesice'[\s\S]*?poukazy\.spravovat/.test(route));
  const redeem = zdroj('app/api/client/admin/vouchers/redeem/route.ts');
  ok('uplatnění: výše účtu jde do posudku', redeem.includes('utrata') && redeem.includes('bezBodu'));
  const guest = zdroj('app/api/client/b/[slug]/voucher/route.ts');
  ok('host: přidání poukazu chce přihlášení a hlídá limit pokusů', guest.includes('customer()') && guest.includes('failClosed: true'));
  const me = zdroj('app/api/client/me/route.ts');
  ok('Moje: poukazy hosta se čtou jen podle jeho id', me.includes('poukazyHosta(me.id, today)'));
  const del = zdroj('lib/smazaniUctu.ts');
  ok('smazání účtu: kupující se odpojí od poukazů', del.includes('buyer_customer_id = NULL WHERE buyer_customer_id = $1'));
  const init = zdroj('app/api/init/route.ts');
  ok('init: sloupce poukazů a profilu', ['design TEXT', 'buyer_customer_id INTEGER', 'points_awarded INTEGER', 'voucher_min_bill INTEGER', 'voucher_points_per_100 INTEGER'].every(x => init.includes(x)));
}
