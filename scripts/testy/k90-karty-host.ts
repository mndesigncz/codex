// Spuštění (balík C): fyzické kartičky — pojistky nad zdrojáky tam, kde pravidlo žije v SQL nebo
// v pořadí kroků: všechny cesty skenu hledají i podle plastové karty, zablokovaná karta se u kasy
// řekne srozumitelně, smazání účtu kartu odpojí, import převezme čísla starých karet, a drobnosti
// z obchodů (Přidat na plochu v obalu, Wallet přes prohlížeč systému).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { planUzivatele, planPodniku, ZACHAZENI_TABULEK, TYMOVE_TABULKY } from '../../lib/smazaniUctu.ts';
import { rozhodniPripojeni, HLASKA_BLOKOVANA } from '../../lib/kartyFyzicke.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ ok }: Testy) {
  // ---- Schéma a smazání ----
  const init = zdroj('app/api/init/route.ts');
  ok('schéma: client_card_aliases s globálně jedinečným kódem', /CREATE TABLE IF NOT EXISTS client_card_aliases \([\s\S]*?kod TEXT NOT NULL UNIQUE/.test(init));
  ok('schéma: client_card_batches', init.includes('CREATE TABLE IF NOT EXISTS client_card_batches'));
  const db = zdroj('lib/kartyFyzickeDb.ts');
  ok('schéma: lib zakládá tytéž tabulky při studeném startu', db.includes('CREATE TABLE IF NOT EXISTS client_card_aliases') && db.includes('kod TEXT NOT NULL UNIQUE'));
  const plan = planUzivatele({ id: 7, email: 'h@x.cz', role: 'customer', hash: '!', dnes: '2026-10-15' });
  ok('smazání hosta: plastová karta se odpojí a zablokuje (patří podniku)', plan.some(k => /UPDATE client_card_aliases SET customer_id = NULL, stav = 'blokovana'/.test(k.text)));
  ok('smazání podniku: karty i dávky zmizí', TYMOVE_TABULKY.includes('client_card_aliases') && TYMOVE_TABULKY.includes('client_card_batches')
    && planPodniku(3, 1).some(k => k.text.includes('DELETE FROM client_card_aliases')));
  ok('smazání: rozhodnutí pro obě tabulky', ZACHAZENI_TABULEK.client_card_aliases === 'upravit' && ZACHAZENI_TABULEK.client_card_batches === 'ponechat');

  // ---- Sken u kasy ----
  const client = zdroj('lib/client.ts');
  ok('customerByCard hledá i plastovou kartu (najdiKartu)', /export async function customerByCard[\s\S]*?najdiKartu\(/.test(client));
  ok('najdiKartu: kartička z aplikace má přednost, pak karta podle kódu nebo starého čísla v podniku', client.indexOf('FROM client_cards c JOIN users u') < client.indexOf('FROM client_card_aliases a') && client.includes('kodyKHledani(code, teamId)'));
  ok('najdiKartu: zablokovaná a nová karta se vrací jako vlastní stav', client.includes("typ: 'blokovana'") && client.includes("typ: 'nova'"));
  ok('nová kartička z aplikace se nepotká s kódem plastové karty', /ensureCard[\s\S]*?FROM client_card_aliases WHERE kod/.test(client));
  const scan = zdroj('app/api/client/staff/scan/route.ts');
  ok('scan GET i POST hledají přes najdiKartu s podnikem', (scan.match(/najdiKartu\(.*?, u\.team_id\);/g) ?? []).length === 2 && !scan.includes('customerByCard('));
  ok('scan: zablokovaná karta = „Karta je zablokovaná.“ (GET i POST)', (scan.match(/HLASKA_BLOKOVANA, blokovana: true/g) ?? []).length === 2 && HLASKA_BLOKOVANA === 'Karta je zablokovaná.');
  ok('scan: nová karta vrátí novaKarta k přiřazení, v POST se nic nepřipíše', scan.includes('novaKarta: {') && scan.includes('Nejdřív ji přiřaď.'));
  const cs = zdroj('components/client/CardScan.tsx');
  const ck = zdroj('components/client/CteckaKasa.tsx');
  ok('Kartička hosta i Čtečka u kasy ukážou přiřazení nové karty', cs.includes('<KartickaAktivace') && cs.includes('x.novaKarta') && ck.includes('<KartickaAktivace') && ck.includes('d.novaKarta'));
  ok('Kartička hosta i Čtečka zkusí číslo staré karty jako kartu', cs.includes('ciziCislo(text)') && ck.includes('ciziCislo(ocistiVstupCtecky(raw))'));
  const akt = zdroj('app/api/client/cards/aktivace/route.ts');
  ok('aktivace u kasy: oprávnění obsluhy (vernost.karta), host bez aplikace přes stejnou cestu', akt.includes("pozaduj('vernost.karta')") && akt.includes('zalozHostaBezAplikace('));
  ok('aktivace: karta se zabere jen z nové (souběh dvou kas)', /UPDATE client_card_aliases SET customer_id = \$\{customerId\}, stav = 'aktivni'[\s\S]*?AND stav = 'nova' AND customer_id IS NULL/.test(db));
  ok('host bez aplikace: nepoužitelné heslo a bez souhlasu s novinkami (jako import)', /zalozHostaBezAplikace[\s\S]*?bcrypt\.hash\(crypto\.randomBytes/.test(db) && db.includes('novinky: false, bezAplikace'));
  ok('správa: tvorba, blokace, náhrada a tisk chtějí zakaznici.sprava_clenu', ['app/api/client/cards/route.ts', 'app/api/client/cards/[id]/route.ts', 'app/api/client/cards/davky/[id]/tisk/route.ts', 'app/api/client/cards/[id]/tisk/route.ts']
    .every(f => zdroj(f).includes("pozaduj('zakaznici.sprava_clenu')")));
  ok('tisk dávky: jen nepřiřazené karty (žádný dvojník)', /kartyKTisku[\s\S]*?r\.stav === 'nova'/.test(db));

  // ---- Host v aplikaci ----
  const moje = zdroj('app/api/client/cards/moje/route.ts');
  const hlasky = [
    rozhodniPripojeni(null, 1, false), rozhodniPripojeni({ stav: 'blokovana', teamId: 1, customerId: null }, 1, false),
    rozhodniPripojeni({ stav: 'aktivni', teamId: 1, customerId: 2 }, 1, false),
  ].map(r => (r as any).chyba as string);
  ok('připojení: každá hláška hostovi je ve slovníku hostovských rout (moje/route.ts)', hlasky.every(h => moje.includes(`error: '${h}'`))
    && moje.includes("error: 'Kód karty má osm znaků, třeba ABCD-EFGH.'") && moje.includes("error: 'Karta mezitím připadla někomu jinému.'"));
  ok('připojení: hádání kódu brzdí omezení pokusů', moje.includes('hit(klic, 10, 60 * 60)'));
  ok('převzetí: stejné sloučení jako duplicity ve správě členů, bez uvítacích kuponů', /pripojKartu[\s\S]*?INSERT INTO client_memberships \(customer_id, team_id\)[\s\S]*?slucClena\(tid, meId, zId/.test(db));
  ok('Moje: plastové karty pod kartičkou', zdroj('components/client/MyPage.tsx').includes('<KartickyHosta />'));

  // ---- Import z Kartičky ----
  const imp = zdroj('lib/importKartickaDb.ts');
  ok('import: čísla starých karet se uloží jako aktivní karty podniku', imp.includes('prevezmiCislaKaret('));
  ok('import: číslo platí jen v podniku (klíč T<podnik>:<číslo>)', /prevezmiCislaKaret[\s\S]*?klicCiziKarty\(teamId/.test(db));

  // ---- Drobnosti z obchodů ----
  const kn = zdroj('components/client/KartaNastroje.tsx');
  ok('obal: „Přidat na plochu“ se v aplikaci z obchodu neukazuje', /!nainstalovana && !jeObal && <Button/.test(kn) && kn.includes('useObal()'));
  ok('Wallet: přes prohlížeč systému, ne window.location', kn.includes('otevriVeSystemu(') && !kn.includes('window.location'));
  ok('Wallet v obalu: podepsaný odkaz (prohlížeč systému nemá přihlášení)', kn.includes("fetch('/api/client/cards/wallet'") && zdroj('app/api/client/cards/wallet/route.ts').includes('overOdkaz('));
}
