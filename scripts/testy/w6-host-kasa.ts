// W6 — hostovská strana a kasa: body mimo kasu (objednávky, rezervace), „jak získat body“, storno poslední akce u kasy,
// ručně zadané číslo účtenky. Čistá logika z lib/bodyZdroje.ts, lib/hostPrehled.ts a lib/kasaStorno.ts plus pojistky
// nad zdrojáky tam, kde pravidlo žije v SQL (atomický zábor, pořadí v route, žádné body dvakrát).

import { readFileSync } from 'node:fs';
import QRCode from 'qrcode';
import type { Testy } from './_testy.ts';
import { normalizujZdroje, zdrojeZProfilu, bodyZObjednavky, MAX_BODU_ZA_REZERVACI, VYCHOZI_ZDROJE } from '../../lib/bodyZdroje.ts';
import { pravidlaZisku } from '../../lib/hostPrehled.ts';
import {
  castkaZOtisku, cisloUctenky, klicRucniUctenky, vetaNeniStorna, vetaStorna, STORNO_MINUT, STORNOVATELNE, OPRAVNENI_STORNA,
} from '../../lib/kasaStorno.ts';
import { otiskAkce } from '../../lib/stampsPlan.ts';
import { zabalKartu, rozbalKartu, KARTA_KOD, KARTA_SVG, KLIC_KARTY } from '../../lib/offlineKarta.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const money = (n: number) => `${n} Kč`;

export default async function ({ eq, ok }: Testy) {
  // ---- Body mimo kasu: nastavení ----
  eq('zdroje: výchozí = objednávky ano, rezervace ne', VYCHOZI_ZDROJE, { objednavky: true, zaRezervaci: 0 });
  eq('zdroje: prázdné pole rezervací = 0', normalizujZdroje({ orders: true, perReservation: '' }), { ok: true, zdroje: { objednavky: true, zaRezervaci: 0 } });
  eq('zdroje: vypnuté objednávky a 10 bodů', normalizujZdroje({ orders: false, perReservation: '10' }), { ok: true, zdroje: { objednavky: false, zaRezervaci: 10 } });
  eq('zdroje: číslo jako číslo', (normalizujZdroje({ orders: true, perReservation: 25 }) as any).zdroje.zaRezervaci, 25);
  eq('zdroje: přepínač musí být pravda/nepravda', normalizujZdroje({ orders: 'ano', perReservation: 0 }).ok, false);
  eq('zdroje: chybějící přepínač', normalizujZdroje({ perReservation: 0 }).ok, false);
  eq('zdroje: záporné body', normalizujZdroje({ orders: true, perReservation: -1 }).ok, false);
  eq('zdroje: desetinné body', normalizujZdroje({ orders: true, perReservation: 1.5 }).ok, false);
  eq('zdroje: text místo bodů', normalizujZdroje({ orders: true, perReservation: 'deset' }).ok, false);
  eq('zdroje: nad strop', normalizujZdroje({ orders: true, perReservation: MAX_BODU_ZA_REZERVACI + 1 }).ok, false);
  eq('zdroje: přesně strop', normalizujZdroje({ orders: true, perReservation: MAX_BODU_ZA_REZERVACI }).ok, true);
  eq('zdroje z profilu: starý řádek bez sloupců', zdrojeZProfilu({}), { objednavky: true, zaRezervaci: 0 });
  eq('zdroje z profilu: null', zdrojeZProfilu(null), { objednavky: true, zaRezervaci: 0 });
  eq('zdroje z profilu: vypnuto', zdrojeZProfilu({ points_orders: false, points_per_reservation: 5 }), { objednavky: false, zaRezervaci: 5 });
  eq('zdroje z profilu: nesmysl v číslu', zdrojeZProfilu({ points_per_reservation: 'x' }).zaRezervaci, 0);
  eq('body z objednávky: zapnuto', bodyZObjednavky({ objednavky: true }, 12), 12);
  eq('body z objednávky: vypnuto = nic', bodyZObjednavky({ objednavky: false }, 12), 0);
  eq('body z objednávky: záporné nesmysly', bodyZObjednavky({ objednavky: true }, -4), 0);

  // ---- Jak získat body (host) ----
  const zaklad = { pointsPer100: 10, cashbackPct: 0, pointsExpireDays: 0, birthdayPoints: 0, referralPoints: 0, campaigns: [], maUrovneSeSlevou: false };
  eq('pravidla: bez nových polí se nic nepřidá (zpětná kompatibilita)', pravidlaZisku(zaklad).map(r => r.druh), ['body_za_utratu']);
  eq('pravidla: vypnuté objednávky host ví', pravidlaZisku({ ...zaklad, pointsOrders: false }).map(r => r.druh), ['body_za_utratu', 'bez_objednavek']);
  eq('pravidla: vypnuté objednávky bez bodů za útratu se nezmiňují', pravidlaZisku({ ...zaklad, pointsPer100: 0, pointsOrders: false }).map(r => r.druh), []);
  eq('pravidla: rezervace', pravidlaZisku({ ...zaklad, pointsPerReservation: 20 }), [{ druh: 'body_za_utratu', body: 10 }, { druh: 'rezervace', body: 20 }]);
  eq('pravidla: poukaz', pravidlaZisku({ ...zaklad, voucherPointsPer100: 5 }).slice(-1), [{ druh: 'poukaz', body: 5 }]);
  eq('pravidla: nuly a záporné se nezmiňují', pravidlaZisku({ ...zaklad, pointsPerReservation: 0, voucherPointsPer100: -3 }).map(r => r.druh), ['body_za_utratu']);

  // ---- Storno poslední akce ----
  eq('storno: lhůta je 15 minut', STORNO_MINUT, 15);
  eq('storno: jde body a kredit, ne razítko ani účtenka', [...STORNOVATELNE], ['points', 'credit']);
  eq('storno: oprávnění odpovídá akci', OPRAVNENI_STORNA, { points: 'vernost.body_z_castky', credit: 'vernost.platba_kreditem' });
  eq('částka z otisku akce (shoduje se s otiskAkce)', castkaZOtisku(otiskAkce('points', { amount: 1250 })), 1250);
  eq('částka z otisku: bez částky', castkaZOtisku(otiskAkce('stamp', {})), 0);
  eq('částka z otisku: nesmysl', castkaZOtisku('points|abc||'), 0);
  eq('částka z otisku: záporná', castkaZOtisku('points|-5||'), 0);
  eq('částka z otisku: null', castkaZOtisku(null), 0);
  ok('věta: žádná akce zmiňuje lhůtu', vetaNeniStorna('zadna').includes('15'));
  ok('věta: razítko odkazuje na detail člena', vetaNeniStorna('jina_akce', 'stamp').includes('detailu člena'));
  ok('věta: účtenka se vrátit nedá', vetaNeniStorna('jina_akce', 'bill').includes('nedá'));
  ok('věta: nic k vrácení', vetaNeniStorna('nic_k_vraceni').includes('není co vracet'));
  eq('výsledek: body vráceny celé', vetaStorna('Jana', { bodyVraceno: 12, bodyPuvodne: 12, kreditVraceno: 0, kreditPuvodne: 0, utrata: 0 }, money), 'Jana: storno poslední akce, −12 bodů.');
  ok('výsledek: host už body utratil', vetaStorna('Jana', { bodyVraceno: 5, bodyPuvodne: 12, kreditVraceno: 0, kreditPuvodne: 0, utrata: 0 }, money).includes('vráceno 5 z 12 bodů (zbytek host už utratil)'));
  ok('výsledek: kredit z platby se vrací hostovi', vetaStorna('Jana', { bodyVraceno: 0, bodyPuvodne: 0, kreditVraceno: 100, kreditPuvodne: -100, utrata: 0 }, money).includes('kredit vrácen: +100 Kč'));
  ok('výsledek: cashback se odebírá', vetaStorna('Jana', { bodyVraceno: 10, bodyPuvodne: 10, kreditVraceno: 5, kreditPuvodne: 5, utrata: 500 }, money).includes('kredit −5 Kč') && vetaStorna('Jana', { bodyVraceno: 10, bodyPuvodne: 10, kreditVraceno: 5, kreditPuvodne: 5, utrata: 500 }, money).includes('útrata snížena o 500 Kč'));

  // ---- Číslo účtenky bez pokladny ----
  eq('účtenka: prázdná je nepovinná', cisloUctenky(''), { ok: true, cislo: null });
  eq('účtenka: velká písmena a očištění', cisloUctenky(' 2026/0412a '), { ok: true, cislo: '2026/0412A' });
  eq('účtenka: mezera uvnitř se odmítne', cisloUctenky('12 34').ok, false);
  eq('účtenka: uvozovka se odmítne', cisloUctenky('12"34').ok, false);
  eq('účtenka: příliš dlouhá', cisloUctenky('1'.repeat(41)).ok, false);
  eq('účtenka: čtyřicet znaků ještě jde', cisloUctenky('1'.repeat(40)).ok, true);
  eq('účtenka: klíč strážce má předponu (nesrazí se s účtem z pokladny)', klicRucniUctenky('0412'), 'manual:0412');

  // ---- Pojistky nad zdrojáky ----
  const scan = zdroj('app/api/client/staff/scan/route.ts');
  ok('kasa: storno se vyřizuje dřív než otisk akce (jinak by storno stornovalo samo sebe)', scan.indexOf("action === 'undo'") > 0 && scan.indexOf("action === 'undo'") < scan.indexOf('zaberAkci(u.team_id'));
  ok('kasa: storno se vyřizuje před přidáním hosta mezi členy', scan.indexOf("action === 'undo'") < scan.indexOf('await join(c.id, u.team_id);'));
  ok('kasa: strážce ručně zadané účtenky je jeden příkaz s ON CONFLICT', /INSERT INTO client_bill_awards \(team_id, bill_id, customer_id, staff_id\)[\s\S]*?ON CONFLICT \(team_id, bill_id\) DO NOTHING/.test(scan));
  ok('kasa: strážce se při chybě uvolní', scan.includes('uvolniUctenku()'));
  ok('kasa: tvar čísla se ověří dřív než se spotřebuje akce', scan.indexOf('cisloUctenky(b.receipt)') < scan.indexOf('zaberAkci(u.team_id'));
  const db = zdroj('lib/kasaStornoDb.ts');
  ok('storno: atomický zábor (UPDATE ... undone_at IS NULL RETURNING)', /UPDATE client_scan_actions SET undone_at = NOW\(\)[\s\S]*?undone_at IS NULL RETURNING id/.test(db));
  ok('storno: při chybě se zábor uvolní', db.includes('SET undone_at = NULL'));
  ok('storno: vrací se podle deníku věrnosti (ref scan:<id>), ne přepočtem', db.includes('ref = ${ref}') && db.includes('`scan:${id}`'));
  ok('storno: kontroluje oprávnění podle akce', db.includes('OPRAVNENI_STORNA[akce]'));
  ok('storno: jen čerstvá a nevrácená akce', db.includes('undone_at IS NULL') && db.includes('STORNO_MINUT'));
  const orders = zdroj('lib/clientOrders.ts');
  ok('objednávky: body respektují nastavení', orders.includes('bodyZObjednavky(zdrojeZProfilu(profile)'));
  const res = zdroj('app/api/client/admin/reservations/route.ts');
  ok('rezervace: body se připisují po uzavření a selhání nezastaví uzavření', res.includes('pripisBodyZaRezervaci') && /try \{ bodyRezervace = await pripisBodyZaRezervaci/.test(res));
  const rdb = zdroj('lib/bodyZdrojeDb.ts');
  ok('rezervace: atomický zábor před připsáním (jednou za rezervaci)', /UPDATE client_reservations SET points_awarded = \$\{body\}[\s\S]*?points_awarded = 0[\s\S]*?award\(/.test(rdb));
  ok('rezervace: při chybě se zábor vrátí', rdb.includes('SET points_awarded = 0'));
  const zr = zdroj('app/api/client/admin/body-zdroje/route.ts');
  ok('nastavení: měnit smí jen správce pravidel a jen v plánu Max', zr.includes("pozaduj('vernost.pravidla')") && zr.includes('teamIsMax'));
  const init = zdroj('app/api/init/route.ts');
  ok('init: sloupce bodů mimo kasu a storna', ['points_orders BOOLEAN', 'points_per_reservation INTEGER', 'client_reservations ADD COLUMN IF NOT EXISTS points_awarded', 'client_scan_actions ADD COLUMN IF NOT EXISTS undone_at'].every(x => init.includes(x)));
  const audit = zdroj('lib/auditPopisky.ts');
  ok('historie změn: popisky nových akcí', ['klient.body.zdroje', 'klient.poukaz.prirazen', 'klient.poukaz.prevzat', 'klient.poukaz.odebran', 'klient.poukaz.nastaveni'].every(k => audit.includes(`'${k}'`)));

  // ---- Offline kartička hosta ----
  const svgQr = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21 21" shape-rendering="crispEdges"><path fill="#00000000" d="M0 0h21v21H0z"/><path stroke="#16181A" d="M0 0.5h7m1 0h1"/></svg>';
  const svgRect = '<svg viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg" fill="#16181A"><rect x="0" y="0" width="1" height="1"/><rect x="1" y="0" width="1" height="1"/></svg>';
  const t = zabalKartu({ code: 'abcd-2345', name: 'Jana', svg: svgQr }, new Date('2026-10-02T10:00:00Z'));
  ok('offline karta: platná kartička se zabalí', !!t && JSON.parse(t!).code === 'ABCD-2345' && JSON.parse(t!).at === '2026-10-02T10:00:00.000Z');
  // Opravdový QR z /api/client/card (končí novým řádkem, má jen path): kontrola ho nesmí zahodit.
  const skutecne = await QRCode.toString('ABCD2345', { type: 'svg', margin: 0, errorCorrectionLevel: 'M', color: { dark: '#16181A', light: '#00000000' } });
  ok('offline karta: opravdové SVG z knihovny qrcode projde', !!zabalKartu({ code: 'ABCD2345', name: 'Jana', svg: skutecne }) && !!rozbalKartu(zabalKartu({ code: 'ABCD2345', svg: skutecne })));
  eq('offline karta: zabalené se dá rozbalit', rozbalKartu(t)?.name, 'Jana');
  ok('offline karta: SVG z fixtury (rect) projde', !!zabalKartu({ code: 'ABCD2345', svg: svgRect }));
  eq('offline karta: skript v SVG neprojde', zabalKartu({ code: 'ABCD2345', svg: '<svg><script>alert(1)</script></svg>' }), null);
  eq('offline karta: událost v prvku neprojde', zabalKartu({ code: 'ABCD2345', svg: '<svg><rect onload="x()"/></svg>' }), null);
  eq('offline karta: foreignObject neprojde', zabalKartu({ code: 'ABCD2345', svg: '<svg><foreignObject/></svg>' }), null);
  eq('offline karta: obrázek v SVG neprojde', zabalKartu({ code: 'ABCD2345', svg: '<svg><image href="x"/></svg>' }), null);
  eq('offline karta: špatný kód', zabalKartu({ code: '<b>x</b>', svg: svgQr }), null);
  eq('offline karta: krátký kód', zabalKartu({ code: 'AB12', svg: svgQr }), null);
  eq('offline karta: bez QR', zabalKartu({ code: 'ABCD2345' }), null);
  eq('offline karta: obří SVG', zabalKartu({ code: 'ABCD2345', svg: '<svg>' + '<rect/>'.repeat(30000) + '</svg>' }), null);
  eq('offline karta: podvržené úložiště (skript)', rozbalKartu(JSON.stringify({ code: 'ABCD2345', svg: '<svg><script>x</script></svg>' })), null);
  eq('offline karta: poškozený JSON', rozbalKartu('{"code":'), null);
  eq('offline karta: prázdné úložiště', rozbalKartu(null), null);
  eq('offline karta: jméno se ořízne', rozbalKartu(JSON.stringify({ code: 'ABCD2345', name: 'x'.repeat(200), svg: svgQr }))?.name.length, 80);
  ok('offline karta: kód z knihovny', KARTA_KOD.test('ABCD-2345') && !KARTA_KOD.test('abcd'));
  const html = zdroj('public/offline.html');
  ok('offline stránka čte tentýž klíč a má tutéž kontrolu kódu i SVG jako lib/offlineKarta.ts',
    html.includes(`'${KLIC_KARTY}'`) && html.includes(KARTA_KOD.source) && html.includes(KARTA_SVG.source));
  ok('offline stránka vkládá kód přes textContent, ne HTML', html.includes("getElementById('host-karta-kod').textContent") && !/host-karta-kod'\)\.innerHTML/.test(html));
  ok('odhlášení smaže uloženou kartičku', zdroj('lib/odhlaseni.ts').includes('smazUlozenouKartu()'));
  ok('Moje ukládá kartičku do telefonu', zdroj('components/client/MyPage.tsx').includes('ulozKartu(k)'));
}
