// Kolo 81 — automatizace zpráv: uvítací série, po první návštěvě, po dokončení karty, narozeninový kupon a „Chybíš nám“.
// Čisté funkce z lib/automatizace.ts (texty, ověření, časování) a kontrola zapojení do událostí, cronu a rozhraní.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  DEFINICE, DRUHY_AUTOMATIZACE, vychoziKonfigurace, overKonfiguraci, vyplnSablonu, zpravaAutomatizace, kratkeJmeno, rozdilDniPraha,
  jeKrokUvitaniNaRade, jePoZapnuti, maDnesNarozeniny, refUvitani, refKarta, refNarozeniny, refPrvniNavsteva, shrnutiPravidla, jeDruhAutomatizace,
  MAX_KROKU_UVITANI, OKNO_UVITANI_DNI, MAX_NADPIS, MAX_TEXT,
} from '../../lib/automatizace.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- katalog pravidel ----
  eq('pravidla: pět, v pořadí obrazovky', DRUHY_AUTOMATIZACE, ['uvitani', 'prvni_navsteva', 'dokoncena_karta', 'narozeniny_kupon', 'chybis_nam']);
  ok('pravidla: každé má název, kdy se pošle a popis', DEFINICE.every(d => d.nazev && d.kdy && d.popis));
  ok('pravidla: výchozí texty mají nadpis a jdou uložit zapnuté', DRUHY_AUTOMATIZACE.every(d => overKonfiguraci(d, vychoziKonfigurace(d), true).ok));
  ok('pravidla: neznámý druh se pozná', jeDruhAutomatizace('chybis_nam') && !jeDruhAutomatizace('spam'));

  // ---- šablona ----
  eq('jméno: křestní z celého', kratkeJmeno('Jana Nováková'), 'Jana');
  eq('jméno: prázdné dostane neutrální oslovení', kratkeJmeno('  '), 'hoste');
  eq('šablona: jméno a podnik', vyplnSablonu('Ahoj {jmeno}, vítej v {podnik}', { jmeno: 'Jana Nováková', podnik: 'Čajovna' }), 'Ahoj Jana, vítej v Čajovna');
  eq('šablona: dny se skloňují', [vyplnSablonu('{dny}', { dny: 1 }), vyplnSablonu('{dny}', { dny: 3 }), vyplnSablonu('{dny}', { dny: 30 })], ['1 den', '3 dny', '30 dní']);
  eq('šablona: body se skloňují a nula zmizí', [vyplnSablonu('{body}', { body: 1 }), vyplnSablonu('{body}', { body: 50 }), vyplnSablonu('[{body}]', { body: 0 })], ['1 bod', '50 bodů', '[]']);
  eq('šablona: neznámá značka zůstane vidět (překlep je v náhledu poznat)', vyplnSablonu('{neco}', {}), '{neco}');
  const chybis = { title: 'Chybíš nám, {jmeno}', body: 'Už je to {dny}.', kuponId: null, dny: 30, body_bodu: 50 };
  eq('zpráva: dárkové body se přidají samy, když je text nemá', zpravaAutomatizace('chybis_nam', chybis, { jmeno: 'Jana', dny: 30, body: 50 }), { title: 'Chybíš nám, Jana', body: 'Už je to 30 dní. Na kartičce na tebe čeká 50 bodů navíc.' });
  eq('zpráva: s {body} v textu se věta nepřidává podruhé', zpravaAutomatizace('chybis_nam', { ...chybis, body: 'Čeká tě {body}.' }, { jmeno: 'Jana', body: 50 })?.body, 'Čeká tě 50 bodů.');
  eq('zpráva: bez bodů nic nepřibude', zpravaAutomatizace('chybis_nam', chybis, { jmeno: 'Jana', dny: 30, body: 0 })?.body, 'Už je to 30 dní.');
  eq('zpráva: bez nadpisu žádná zpráva', zpravaAutomatizace('prvni_navsteva', { title: '  ', body: 'x' }, {}), null);
  const serie = { kroky: [{ dny: 0, title: 'Vítej', body: 'a', kuponId: null }, { dny: 3, title: 'Tři dny', body: 'b', kuponId: null }] };
  eq('zpráva: krok uvítací série', zpravaAutomatizace('uvitani', serie, { jmeno: 'Jana' }, 1)?.title, 'Tři dny');
  eq('zpráva: neexistující krok', zpravaAutomatizace('uvitani', serie, {}, 5), null);
  ok('zpráva: nadpis a text se ořežou na limit', (() => { const z = zpravaAutomatizace('prvni_navsteva', { title: 'x'.repeat(200), body: 'y'.repeat(600) }, {}); return !!z && z.title.length === MAX_NADPIS && z.body.length === MAX_TEXT; })());

  // ---- ověření nastavení ----
  eq('ověření: zapnuté pravidlo bez nadpisu je chyba', overKonfiguraci('prvni_navsteva', { title: '', body: 'x' }, true), { ok: false, error: 'Zpráva potřebuje nadpis.' });
  ok('ověření: vypnuté pravidlo se uloží i rozepsané', overKonfiguraci('prvni_navsteva', { title: '', body: 'rozepsáno' }, false).ok);
  const prazdnaSerie = overKonfiguraci('uvitani', { kroky: [] }, true);
  ok('ověření: zapnutá série bez zprávy je chyba', !prazdnaSerie.ok);
  const dvaStejne = overKonfiguraci('uvitani', { kroky: [{ dny: 2, title: 'a' }, { dny: 2, title: 'b' }] }, true);
  ok('ověření: dvě zprávy série ve stejný den nejdou', !dvaStejne.ok && dvaStejne.error.includes('stejný den'));
  const razena = overKonfiguraci('uvitani', { kroky: [{ dny: 7, title: 'B' }, { dny: 0, title: 'A' }] }, true);
  eq('ověření: kroky se seřadí podle dnů', razena.ok ? razena.cfg.kroky.map((k: any) => k.dny) : null, [0, 7]);
  const moc = overKonfiguraci('uvitani', { kroky: [0, 1, 2, 3, 4].map(i => ({ dny: i, title: `k${i}` })) }, true);
  eq('ověření: víc než tři zprávy se ořežou', moc.ok ? moc.cfg.kroky.length : null, MAX_KROKU_UVITANI);
  const dny = overKonfiguraci('uvitani', { kroky: [{ dny: 999, title: 'x' }] }, true);
  eq('ověření: dny se zastropují', dny.ok ? dny.cfg.kroky[0].dny : null, 60);
  const ch = overKonfiguraci('chybis_nam', { title: 'x', dny: 9999, body_bodu: -5, kuponId: '7' }, true);
  eq('ověření: Chybíš nám — dny 1 až 365, body nezáporné, kupon číslo', ch.ok ? [ch.cfg.dny, ch.cfg.body_bodu, ch.cfg.kuponId] : null, [365, 0, 7]);
  const nar = overKonfiguraci('narozeniny_kupon', { title: 'x', body_bodu: 5000 }, true);
  eq('ověření: narozeninové body nejvýš 1000', nar.ok ? nar.cfg.body_bodu : null, 1000);
  ok('ověření: neplatný kupon se změní na „bez kuponu“', (() => { const r = overKonfiguraci('prvni_navsteva', { title: 'x', kuponId: 'abc' }, true); return r.ok && r.cfg.kuponId === null; })());

  // ---- časování ----
  const ted = new Date('2026-10-05T10:00:00Z');
  eq('dny: stejný pražský den je 0', rozdilDniPraha('2026-10-05T05:00:00Z', ted), 0);
  eq('dny: půlnoc podle Prahy, ne UTC (23:30 UTC je v Praze už další den)', rozdilDniPraha('2026-10-04T23:30:00Z', ted), 0);
  eq('dny: před třemi dny', rozdilDniPraha('2026-10-02 10:00:00', ted), 3);
  eq('dny: nečitelný čas je null', rozdilDniPraha('nesmysl', ted), null);
  const zapnuto = '2026-09-30 08:00:00';
  ok('uvítání: krok po třech dnech je na řadě třetí den', jeKrokUvitaniNaRade('2026-10-02 10:00:00', 3, ted, zapnuto));
  ok('uvítání: o den dřív ještě není', !jeKrokUvitaniNaRade('2026-10-03 10:00:00', 3, ted, zapnuto));
  ok('uvítání: zmeškaný cron se doběhne v okně', jeKrokUvitaniNaRade('2026-09-30 10:00:00', 3, ted, zapnuto) === (5 <= 3 + OKNO_UVITANI_DNI));
  ok('uvítání: po okně se už nic nepošle (ne zpráva o měsíc později)', !jeKrokUvitaniNaRade('2026-09-01 10:00:00', 3, ted, '2026-08-01 00:00:00'));
  ok('uvítání: člen, který přišel před zapnutím série, nic nedostane', !jeKrokUvitaniNaRade('2026-09-29 10:00:00', 3, new Date('2026-10-02T10:00:00Z'), zapnuto));
  ok('uvítání: hned (0 dní) v den přidání', jeKrokUvitaniNaRade('2026-10-05 08:00:00', 0, ted, zapnuto));
  ok('po zapnutí: starší událost se nepřipomíná', !jePoZapnuti('2026-09-01 10:00:00', zapnuto) && jePoZapnuti('2026-10-01 10:00:00', zapnuto) && jePoZapnuti('2026-10-01 10:00:00', null));
  ok('narozeniny: dnes', maDnesNarozeniny('1990-10-05', '2026-10-05') && !maDnesNarozeniny('1990-10-06', '2026-10-05'));
  ok('narozeniny: 29. 2. se v nepřestupném roce slaví 28. 2.', maDnesNarozeniny('2000-02-29', '2026-02-28') && !maDnesNarozeniny('2000-02-29', '2026-03-01') && maDnesNarozeniny('2000-02-29', '2028-02-29') && !maDnesNarozeniny('2000-02-29', '2028-02-28'));
  ok('narozeniny: bez data nebo s nesmyslem nikdy', !maDnesNarozeniny(null, '2026-10-05') && !maDnesNarozeniny('brzy', '2026-10-05'));
  eq('klíče deníku: jedna zpráva na jeden důvod', [refUvitani(3), refPrvniNavsteva(), refKarta(4, 2), refNarozeniny(2026)], ['krok:3', 'prvni', 'karta:4:2', 'bday:2026']);
  eq('shrnutí: vypnuto / zapnuto / počet zpráv / dny', [shrnutiPravidla('prvni_navsteva', {}, false), shrnutiPravidla('prvni_navsteva', {}, true), shrnutiPravidla('uvitani', serie, true), shrnutiPravidla('chybis_nam', { dny: 30 }, true)], ['Vypnuto', 'Zapnuto', 'Zapnuto: 2 zprávy', 'Zapnuto: po 30 dnech bez návštěvy']);

  // ---- zapojení do událostí, cronu a rozhraní ----
  const client = precti('lib/client.ts');
  ok('událost: vstup do klubu spouští uvítací sérii (jen u nového člena)', client.includes("automatizaceUdalost('uvitani', teamId, customerId, 'krok:0')") && client.indexOf("automatizaceUdalost('uvitani'") > client.indexOf('if (!existing)'));
  ok('událost: první návštěva se pozná z počtu návštěv po razítku', client.includes('RETURNING stamps, visits') && client.includes("Number(m?.visits) === 1"));
  ok('událost: dokončená karta (staré počítadlo i kampaně)', client.includes("automatizaceUdalost('dokoncena_karta'") && precti('lib/stamps.ts').includes("automatizaceUdalost('dokoncena_karta'"));
  ok('narozeniny: vlastní oznámení se neposílá dvakrát, když je zapnutý narozeninový kupon', client.includes('vlastniZprava'));
  const db = precti('lib/automatizaceDb.ts');
  ok('deník: zpráva se zapíše před odesláním (unikát podnik+druh+člen+důvod)', db.includes('ON CONFLICT (team_id, kind, customer_id, ref) DO NOTHING RETURNING id'));
  ok('odeslání: kupon dostane člen vždy, zpráva jen se souhlasem', db.includes('pripisKuponClenum') && db.includes('procNedostanePush(prijemce) === null') && db.includes('procNedostaneEmail(prijemce) === null'));
  ok('odeslání: blokovaný člen nic nedostane', db.includes('m.blocked === true') && db.includes('AND m.blocked = FALSE'));
  ok('cron: denní průchod doběhne uvítání po dnech, narozeniny a první návštěvu', db.includes('spustAutomatizaceCron') && ['uvitani', 'narozeniny_kupon', 'prvni_navsteva'].every(x => db.includes(`druh === '${x}'`)));
  const init = precti('app/api/init/route.ts');
  ok('cron: init ho volá hned za „Chybíš nám“', init.indexOf('spustAutomatizaceCron()') > init.indexOf('odesliChybisNam()'));
  const react = precti('lib/reaktivace.ts');
  ok('Chybíš nám: zapisuje do deníku automatizací, nabízí kupon a vlastní text, blokovaní vynechaní', react.includes("zapisDoLogu(teamId, 'chybis_nam'") && react.includes('kuponId') && react.includes('m.blocked = FALSE'));
  const route = precti('app/api/client/admin/automatizace/route.ts');
  ok('API: vše za oprávněním zpráv, zkouška sobě a uložení', (route.match(/pozaduj\('zakaznici\.zpravy'\)/g) ?? []).length >= 3 && route.includes("b.akce !== 'test'"));
  ok('API: dny a body „Chybíš nám“ jen s právem na pravidla věrnosti', db.includes('muzePravidla') && route.includes("has('vernost.pravidla')"));
  ok('API: jména členů v deníku jen s právem vidět členy', route.includes("has('zakaznici.zobrazit')"));
  const ui = precti('components/client/loyalty/Automatizace.tsx');
  ok('rozhraní: každé pravidlo má vypínač, náhled, zkoušku a deník', ['SwitchRow', 'ZpravyNahled', 'Poslat zkoušku sobě', 'Co odešlo'].every(x => ui.includes(x)));
  ok('rozhraní: uvítací série má až tři zprávy s dny', ui.includes('MAX_KROKU_UVITANI') && ui.includes('Za kolik dní po přidání'));
  const admin = precti('components/client/ClientAdmin.tsx');
  ok('rozhraní: Automatizace jsou část Zákazníků za oprávněním zpráv', admin.includes("id: 'automations', label: 'Automatizace', klic: 'zakaznici.zpravy'"));
  ok('schéma: tabulky automatizací jsou v init i v mazání účtu a podniku', init.includes('CREATE TABLE IF NOT EXISTS client_automatizace_log') && precti('lib/smazaniUctu.ts').includes("client_automatizace_log: 'smazat'") && precti('lib/smazaniUctu.ts').includes("'client_automatizace'"));
}
