// Kolo 81 — zprávy členům: e-mailový kanál, souhlas, dosah, odhlášení z e-mailů, příloha kuponu a promo kódu,
// zkouška sobě, úprava naplánované zprávy a metrika „přišli do 7 dní“ jen z návštěv.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  procNedostaneEmail, procNedostanePush, dosahZpravy, vetaDosahu, tokenOdhlaseni, overTokenOdhlaseni, odkazOdhlaseni,
  sestavEmailZpravy, predmetZpravy, telesoSKodem, jeKanal, posilaPush, posilaEmail, KANALY_ZPRAVY,
} from '../../lib/zpravyEmail.ts';
import { czCount } from '../../lib/czech.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const clen = (o: any = {}) => ({ id: 1, email: 'jana@example.cz', blocked: false, prefs: { novinky: true }, ...o });

export default function ({ eq, ok }: Testy) {
  // ---- kdo smí dostat e-mail a oznámení ----
  eq('e-mail: se souhlasem a adresou dostane', procNedostaneEmail(clen()), null);
  eq('e-mail: bez souhlasu nedostane (importovaný kontakt není souhlas)', procNedostaneEmail(clen({ prefs: null })), 'bez_souhlasu');
  eq('e-mail: souhlas false nestačí', procNedostaneEmail(clen({ prefs: { novinky: false } })), 'bez_souhlasu');
  eq('e-mail: souhlas jako text „true“ se nepočítá', procNedostaneEmail(clen({ prefs: { novinky: 'true' } })), 'bez_souhlasu');
  eq('e-mail: odhlášený z e-mailů nedostane', procNedostaneEmail(clen({ prefs: { novinky: true, novinkyEmail: false } })), 'email_vypnuty');
  eq('e-mail: bez adresy nedostane', procNedostaneEmail(clen({ email: '' })), 'bez_emailu');
  eq('e-mail: rozbitá adresa nedostane', procNedostaneEmail(clen({ email: 'neni-email' })), 'bez_emailu');
  eq('e-mail: blokovaný nedostane nikdy', procNedostaneEmail(clen({ blocked: true })), 'blokovany');
  eq('oznámení: se souhlasem dostane i bez e-mailu', procNedostanePush(clen({ email: null })), null);
  eq('oznámení: odhlášení z e-mailů oznámení nevypíná', procNedostanePush(clen({ prefs: { novinky: true, novinkyEmail: false } })), null);
  eq('oznámení: blokovaný nedostane', procNedostanePush(clen({ blocked: true })), 'blokovany');

  // ---- dosah ----
  const lide = [
    clen({ id: 1 }),
    clen({ id: 2, prefs: { novinky: true, novinkyEmail: false } }),
    clen({ id: 3, email: null }),
    clen({ id: 4, prefs: null }),
    clen({ id: 5, blocked: true }),
  ];
  eq('dosah: oznámení (počty bez e-mailu a s vypnutým e-mailem se hlásí i tak)', dosahZpravy(lide, 'push'), { publikum: 4, push: 3, email: 0, nikdo: 1, bezSouhlasu: 1, bezEmailu: 1, emailVypnuty: 1, blokovanych: 1 });
  eq('dosah: e-mail', dosahZpravy(lide, 'email'), { publikum: 4, push: 0, email: 1, nikdo: 3, bezSouhlasu: 1, bezEmailu: 1, emailVypnuty: 1, blokovanych: 1 });
  const oba = dosahZpravy(lide, 'push+email');
  eq('dosah: obojí — kdo má jen jedno, dostane jedno', [oba.push, oba.email, oba.nikdo], [3, 1, 1]);
  const veta = vetaDosahu(oba, 'push+email', n => czCount(n, { one: 'člen', few: 'členové', many: 'členů' }));
  ok('dosah: věta říká oznámení, e-mail i nesouhlasící', veta.includes('oznámení dostane 3 členové') && veta.includes('e-mail dostane 1 člen') && veta.includes('nesouhlasí'));
  eq('dosah: prázdné publikum má vlastní větu', vetaDosahu(dosahZpravy([], 'push'), 'push', n => String(n)), 'V tomhle výběru teď nikdo není.');
  ok('kanály: tři a každý má popis', KANALY_ZPRAVY.length === 3 && KANALY_ZPRAVY.every(k => k.popis.length > 10));
  ok('kanály: platné jen známé', jeKanal('push') && jeKanal('email') && jeKanal('push+email') && !jeKanal('sms') && !jeKanal(undefined));
  ok('kanály: push a e-mail se rozlišují', posilaPush('push') && !posilaEmail('push') && posilaEmail('email') && !posilaPush('email') && posilaPush('push+email') && posilaEmail('push+email'));

  // ---- odhlášení z e-mailů ----
  const t = tokenOdhlaseni(42);
  ok('odhlášení: token nese id a podpis', /^42\.[0-9a-f]{24}$/.test(t));
  eq('odhlášení: platný token se ověří', overTokenOdhlaseni(t), 42);
  eq('odhlášení: cizí id s cizím podpisem neprojde', overTokenOdhlaseni(`43.${t.split('.')[1]}`), null);
  eq('odhlášení: upravený podpis neprojde', overTokenOdhlaseni(`42.${'0'.repeat(24)}`), null);
  eq('odhlášení: nesmysl neprojde', [overTokenOdhlaseni(''), overTokenOdhlaseni('42'), overTokenOdhlaseni('x.y'), overTokenOdhlaseni(null)], [null, null, null, null]);
  const o = odkazOdhlaseni('https://app.example/', 42);
  ok('odhlášení: odkazy míří na stránku a na API s tokenem', o.stranka === `https://app.example/client/odhlasit?t=${encodeURIComponent(t)}` && o.api.startsWith('https://app.example/api/client/odhlasit?t='));

  // ---- e-mail ----
  const m = sestavEmailZpravy({ podnik: 'Čajovna <Dobrá>', title: 'Nový čaj & sleva', body: 'Řádek 1\nŘádek <b>2</b>', odkaz: 'https://app.example/client/cajovna', kuponNazev: 'Čaj zdarma', promoKod: 'JARO25', odhlasitStranka: o.stranka });
  ok('e-mail: předmět je nadpis zprávy', m.subject === 'Nový čaj & sleva');
  ok('e-mail: hodnoty se escapují (žádné cizí HTML)', !m.html.includes('<Dobrá>') && !m.html.includes('<b>2</b>') && m.html.includes('&lt;Dobrá&gt;') && m.html.includes('Nový čaj &amp; sleva'));
  ok('e-mail: odřádkování zůstává', m.html.includes('Řádek 1<br>'));
  ok('e-mail: odkaz na odhlášení je v patičce', m.html.includes(o.stranka.replace(/&/g, '&amp;')) && m.html.includes('Odhlásit se z e-mailů'));
  ok('e-mail: kupon i promo kód jsou vidět', m.html.includes('Čaj zdarma') && m.html.includes('Promo kód: JARO25'));
  ok('e-mail: tlačítko vede na cíl zprávy', m.html.includes('href="https://app.example/client/cajovna"'));
  const nemecky = sestavEmailZpravy({ podnik: 'Teehaus', title: 'Neu', odhlasitStranka: o.stranka, jazyk: 'de' });
  ok('e-mail: patička v jazyce člena', nemecky.html.includes('Von E-Mails abmelden') && nemecky.html.includes('Club Teehaus'));
  ok('e-mail: bez odkazu a kuponu se tlačítko ani rámeček nekreslí', !nemecky.html.includes('Öffnen') && !nemecky.html.includes('Promo'));
  eq('e-mail: zkušební předmět má značku', predmetZpravy('Ahoj', true), '[Zkouška] Ahoj');
  eq('e-mail: prázdný nadpis dostane náhradu', predmetZpravy('  '), 'Zpráva od podniku');
  eq('push: kód se přidá na konec textu', telesoSKodem('Slevy tento týden.', 'JARO25'), 'Slevy tento týden. Kód: JARO25');
  eq('push: bez textu zůstane jen kód', telesoSKodem('', 'JARO25'), 'Kód: JARO25');
  eq('push: bez kódu se text nemění', telesoSKodem('Ahoj', null), 'Ahoj');
  ok('push: text s kódem se vejde do 300 znaků', (telesoSKodem('x'.repeat(300), 'JARO25') ?? '').length === 300);

  // ---- zapojení ----
  const email = precti('lib/email.ts');
  ok('e-mail: rozesílka jde přes lib/email a posílá hlavičky List-Unsubscribe', email.includes('sendNovinkyEmail') && email.includes('List-Unsubscribe-Post'));
  const bc = precti('lib/broadcasts.ts');
  ok('rozesílka: e-mail dostane jen člen se souhlasem (stejné pravidlo pro náhled i odeslání)', bc.includes('procNedostaneEmail(p) === null') && bc.includes('dosahZpravy'));
  ok('rozesílka: fronta e-mailů se přivlastňuje posunem kurzoru (žádný e-mail dvakrát)', bc.includes('email_pos = LEAST(email_total, email_pos + ${DAVKA_EMAILU})') && bc.includes('WHERE id = ${row.id} AND email_pos = ${pos}'));
  ok('rozesílka: kupon se připíše celému publiku, promo kód jde do textu', bc.includes('pripisKuponClenum(teamId, Number(row.coupon_id), ids)') && bc.includes('telesoSKodem'));
  ok('rozesílka: denní limit pět zpráv zůstává', bc.includes('MAX_ZPRAV_ZA_DEN = 5') && bc.includes('hit(`client-broadcast:${teamId}`, MAX_ZPRAV_ZA_DEN, 24 * 3600)'));
  ok('rozesílka: zkouška sobě limit nespotřebuje a nezapisuje do historie', (() => { const z = bc.slice(bc.indexOf('export async function posliZkousku'), bc.indexOf('export async function upravNaplanovanou')); return !z.includes('hit(') && !z.includes('INSERT INTO client_broadcasts'); })());
  ok('rozesílka: úprava naplánované zprávy jen dokud neodešla (podmínka v samotném UPDATE)', bc.includes("WHERE id = ${id} AND team_id = ${teamId} AND status = 'scheduled' RETURNING *"));
  const route = precti('app/api/client/admin/broadcast/route.ts');
  ok('API zpráv: zkouška, úprava a zrušení jsou za oprávněním zpráv', (route.match(/pozaduj\('zakaznici\.zpravy'\)/g) ?? []).length >= 4 && route.includes("b.akce === 'test'") && route.includes('export async function PATCH'));
  ok('metrika „přišli do 7 dní“ počítá jen návštěvy (kind = visit), ne body za pozvání ani ruční úpravy', route.includes("l.kind = 'visit'") && !route.includes("l.kind <> 'reactivation'"));
  ok('metrika: počítá jen příjemce té zprávy', route.includes('jsonb_array_elements_text(b.prijemci)'));
  const odh = precti('app/api/client/odhlasit/route.ts');
  ok('odhlášení: GET nic nemění, změnu dělá POST', odh.includes('export async function POST') && !/export async function GET[\s\S]*?UPDATE users[\s\S]*?export async function POST/.test(odh));
  ok('odhlášení: neplatný token se odmítne před dotazem', odh.includes('overTokenOdhlaseni') && odh.includes('400'));
  ok('odhlášení: stránka je mimo vyhledávače', precti('lib/web.ts').includes("'/client/odhlasit'"));
  const me = precti('app/api/client/me/route.ts');
  ok('preference hosta: e-maily jdou vypnout zvlášť (novinkyEmail)', me.includes('novinkyEmail') && precti('components/client/UcetHosta.tsx').includes('E-maily od podniků'));
  const ui = precti('components/client/loyalty/Zpravy.tsx');
  ok('rozhraní zpráv: kanál, kombinace segmentů, kupon, promo kód, zkouška, úprava', ['KANALY_ZPRAVY', 'KombinaceVyber', 'Přiložit kupon', 'Přiložit promo kód', 'Poslat zkoušku sobě', 'Upravit'].every(x => ui.includes(x)));
  ok('rozhraní zpráv: náhled pohledem hosta', ui.includes('NahledZpravy') && ui.includes('Jak to uvidí host'));
  ok('rozhraní zpráv: odeslání se potvrzuje a říká dosah', ui.includes('Poslat zprávu?') && ui.includes('vetaDosahu'));
  const init = precti('app/api/init/route.ts');
  ok('schéma: sloupce zpráv jsou v init', ['channels TEXT', 'coupon_id INTEGER', 'promo_code TEXT', 'audience_ids JSONB', 'prijemci JSONB', 'email_total INTEGER', 'email_pos INTEGER'].every(x => init.includes(`client_broadcasts ADD COLUMN IF NOT EXISTS ${x}`)));
  ok('rozhraní: prohlížeč nebere server (žádný import lib/zpravyEmail, který táhne Node a Resend)', ['Zpravy', 'HromadneAkce', 'Clenove', 'Skupiny', 'Automatizace', 'NahledZpravy', 'ClenDetail'].every(f => !/from '@\/lib\/(zpravyEmail|email|broadcasts|clenoveDb|automatizaceDb)'/.test(precti(`components/client/loyalty/${f}.tsx`))));
  const i18n = precti('lib/i18n/email.ts');
  ok('e-mail: patička a odhlášení mají všechny jazyky', ['novinkyPaticka', 'novinkyOdhlasit', 'novinkyKupon', 'novinkyPromo', 'novinkyOtevrit'].every(k => i18n.includes(`${k}: {`)));
}
