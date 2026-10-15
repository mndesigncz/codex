// Spuštění, balík G — souhlas s novinkami po podnicích (GDPR čl. 7, zák. 480/2004 § 7):
// platný stav z řádků, které se jen doplňují, změny z profilu, filtry příjemců rozesílky,
// odhlašovací odkaz po podnicích a označení obchodního sdělení v e-mailu.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  aktualniSouhlasy, souhlasPodniku, maNejakySouhlas, radkyZmeny, zmenaZTela, odesilatelSdeleni, zneniNovinek, jeTypSouhlasu,
  TYPY_SOUHLASU, KANALY_SOUHLASU,
} from '../../lib/consents.ts';
import { procNedostaneEmail, procNedostanePush, dosahZpravy } from '../../lib/zpravyKanaly.ts';
import { tokenOdhlaseni, overTokenOdhlaseni, overTokenOdhlaseniPodniku, odkazOdhlaseni, sestavEmailZpravy } from '../../lib/zpravyEmail.ts';
import { ZACHAZENI_TABULEK, TYMOVE_TABULKY } from '../../lib/smazaniUctu.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- platný stav ----
  eq('typy souhlasu podle zadání', [...TYPY_SOUHLASU], ['novinky_email', 'novinky_push', 'podminky', 'zasady']);
  ok('kanály: převod, členství, profil, odkaz v e-mailu', ['prevod', 'clenstvi', 'profil', 'odkaz_email'].every(k => (KANALY_SOUHLASU as readonly string[]).includes(k)));
  ok('typ souhlasu: jen známé hodnoty', jeTypSouhlasu('novinky_push') && !jeTypSouhlasu('novinky') && !jeTypSouhlasu(null));
  const radky = [
    { id: 1, team_id: 5, typ: 'novinky_push', stav: 'udelen' },
    { id: 2, team_id: 5, typ: 'novinky_email', stav: 'udelen' },
    { id: 7, team_id: 5, typ: 'novinky_email', stav: 'odvolan' },
    { id: 3, team_id: 9, typ: 'novinky_push', stav: 'udelen' },
    { id: 4, team_id: null, typ: 'podminky', stav: 'udelen' },
  ];
  // Pořadí řádků z databáze nesmí rozhodovat: rozhoduje id (poslední zápis).
  const akt = aktualniSouhlasy([...radky].reverse());
  eq('podnik 5: oznámení ano, e-mail odvolaný pozdějším řádkem', souhlasPodniku(akt, 5), { push: true, email: false });
  eq('podnik 9: jen oznámení', souhlasPodniku(akt, 9), { push: true, email: false });
  eq('podnik bez řádku: výchozí NE', souhlasPodniku(akt, 42), { push: false, email: false });
  ok('aspoň jeden souhlas s novinkami', maNejakySouhlas(akt));
  ok('souhlas s podmínkami není souhlas s novinkami', !maNejakySouhlas(aktualniSouhlasy([{ id: 1, team_id: null, typ: 'podminky', stav: 'udelen' }])));

  // ---- změny z profilu ----
  eq('zapnout novinky: jeden řádek', radkyZmeny({ teamId: 5, typ: 'novinky_push', stav: 'udelen' }, { push: false, email: false }), [{ teamId: 5, typ: 'novinky_push', stav: 'udelen' }]);
  eq('vypnout novinky odvolá i e-mail', radkyZmeny({ teamId: 5, typ: 'novinky_push', stav: 'odvolan' }, { push: true, email: true }),
    [{ teamId: 5, typ: 'novinky_push', stav: 'odvolan' }, { teamId: 5, typ: 'novinky_email', stav: 'odvolan' }]);
  eq('zapnout e-mail (i při vstupu do členství) zapne i oznámení', radkyZmeny({ teamId: 5, typ: 'novinky_email', stav: 'udelen' }, { push: false, email: false }),
    [{ teamId: 5, typ: 'novinky_push', stav: 'udelen' }, { teamId: 5, typ: 'novinky_email', stav: 'udelen' }]);
  eq('opakované klepnutí nic nepřidá', radkyZmeny({ teamId: 5, typ: 'novinky_push', stav: 'udelen' }, { push: true, email: false }), []);
  eq('tělo změny: platné', zmenaZTela({ teamId: 3, typ: 'novinky_email', stav: false }), { teamId: 3, typ: 'novinky_email', stav: 'odvolan' });
  ok('tělo změny: nesmysl odmítne', [zmenaZTela({ teamId: 0, typ: 'novinky_push', stav: true }), zmenaZTela({ teamId: 3, typ: 'podminky', stav: true }), zmenaZTela({ teamId: 3, typ: 'novinky_push', stav: 'ano' }), zmenaZTela(null)].every(x => x === null));
  ok('znění souhlasu jmenuje podnik a kanál', /Kavárna U Mostu/.test(zneniNovinek('Kavárna U Mostu', 'novinky_email')) && /e-mailem/.test(zneniNovinek('X', 'novinky_email')) && /oznámením/.test(zneniNovinek('X', 'novinky_push')));

  // ---- filtry příjemců ----
  const clen = (x: object) => ({ id: 1, email: 'eva@priklad.cz', blocked: false, prefs: { novinky: true }, ...x });
  eq('souhlas podniku rozhoduje i proti globálnímu ANO', [procNedostanePush(clen({ souhlas: { push: false, email: false } })), procNedostaneEmail(clen({ souhlas: { push: false, email: false } }))], ['bez_souhlasu', 'bez_souhlasu']);
  eq('souhlas podniku rozhoduje i proti globálnímu NE', [procNedostanePush(clen({ prefs: null, souhlas: { push: true, email: true } })), procNedostaneEmail(clen({ prefs: null, souhlas: { push: true, email: true } }))], [null, null]);
  eq('oznámení ano, e-mail ne', [procNedostanePush(clen({ souhlas: { push: true, email: false } })), procNedostaneEmail(clen({ souhlas: { push: true, email: false } }))], [null, 'email_vypnuty']);
  eq('bez řádku v tabulce (před převodem): globální souhlas jako dřív', [procNedostaneEmail(clen({})), procNedostaneEmail(clen({ prefs: { novinky: true, novinkyEmail: false } })), procNedostanePush(clen({ prefs: null }))], [null, 'email_vypnuty', 'bez_souhlasu']);
  ok('blokovaný nedostane nic ani se souhlasem', procNedostanePush(clen({ blocked: true, souhlas: { push: true, email: true } })) === 'blokovany');
  const d = dosahZpravy([clen({ id: 1, souhlas: { push: true, email: true } }), clen({ id: 2, souhlas: { push: false, email: false } }), clen({ id: 3, souhlas: { push: true, email: false } })], 'push+email');
  eq('dosah počítá souhlas podniku', [d.push, d.email, d.bezSouhlasu, d.emailVypnuty], [2, 1, 1, 1]);

  // ---- odhlašovací odkaz po podnicích ----
  const t = tokenOdhlaseni(18, 5);
  ok('token s podnikem: tvar <id>-<podnik>.<podpis>', /^18-5\.[0-9a-f]{24}$/.test(t));
  eq('token s podnikem: ověření vrátí uživatele i podnik', overTokenOdhlaseniPodniku(t), { userId: 18, teamId: 5 });
  eq('starý token bez podniku platí dál (všechny podniky)', overTokenOdhlaseniPodniku(tokenOdhlaseni(18)), { userId: 18, teamId: null });
  ok('podnik v tokenu nejde přepsat', overTokenOdhlaseniPodniku(t.replace('18-5.', '18-6.')) === null && overTokenOdhlaseni(t.replace('18-5.', '18.')) === null);
  eq('overTokenOdhlaseni vrací uživatele u obou tvarů', [overTokenOdhlaseni(t), overTokenOdhlaseni(tokenOdhlaseni(18))], [18, 18]);
  ok('odkaz nese podnik', odkazOdhlaseni('https://x.cz/', 18, 5).api === `https://x.cz/api/client/odhlasit?t=${encodeURIComponent(t)}`);

  // ---- obchodní sdělení ----
  eq('odesílatel: jméno a IČO, jen když je platné', [odesilatelSdeleni('Kavárna', '12345678'), odesilatelSdeleni('Kavárna', '123'), odesilatelSdeleni('Kavárna', null), odesilatelSdeleni('  ', null)],
    ['Kavárna, IČO 12345678', 'Kavárna', 'Kavárna', 'Podnik']);
  const mail = sestavEmailZpravy({ podnik: 'Kavárna <U Mostu>', ico: '12345678', title: 'Nová sezóna', odhlasitStranka: 'https://x.cz/client/odhlasit?t=1' });
  ok('e-mail novinek: označení „Obchodní sdělení“', /Obchodní sdělení/.test(mail.html));
  ok('e-mail novinek: odesílatel podnik s IČO a escapovaný', /Odesílatel: Kavárna &lt;U Mostu&gt;, IČO 12345678/.test(mail.html));
  const en = sestavEmailZpravy({ podnik: 'Café', title: 'Hi', odhlasitStranka: 'x', jazyk: 'en' });
  ok('e-mail novinek v jazyce člena', /Commercial communication/.test(en.html) && /Sender: Café/.test(en.html));

  // ---- napojení ----
  const kanaly = cti('lib/clenoveDb.ts');
  ok('příjemci rozesílky nesou souhlas podniku', /souhlasyPrijemcu\(teamId/.test(kanaly) && /souhlas: souhlasy\?\.get/.test(kanaly));
  const bc = cti('lib/broadcasts.ts');
  ok('oznámení rozesílky jen se souhlasem podniku', /procNedostanePush\(x\) === null/.test(bc) && /notifyUsers\(pushIds/.test(bc));
  ok('e-mail rozesílky: IČO a odkaz po podnicích', /ico: kontext\.ico/.test(bc) && /odkazOdhlaseni\(odkazovyZaklad\(\), p\.id, Number\(row\.team_id\)\)/.test(bc));
  ok('vstup do členství: novinky jen s výslovným true', /b\?\.novinky === true/.test(cti('app/api/client/b/[slug]/join/route.ts')));
  ok('stránka podniku: zaškrtávátko „Chci novinky od …“ výchozí NE', /useState\(false\)/.test(cti('components/client/BusinessPage.tsx')) && /Chci novinky od \{podnik\}/.test(cti('components/client/BusinessPage.tsx')));
  const db = cti('lib/consentsDb.ts');
  ok('tabulka se jen doplňuje (žádný UPDATE ani DELETE nad consents)', !/UPDATE consents|DELETE FROM consents/.test(db));
  ok('převod: kanál „prevod“ a jen pro ty, kdo o novinkách ještě nic nemají', /'prevod'/.test(db) && /NOT EXISTS \(SELECT 1 FROM consents c WHERE c\.user_id = u\.id AND c\.typ IN \('novinky_push', 'novinky_email'\)\)/.test(db));
  ok('init: tabulka consents a převod', /CREATE TABLE IF NOT EXISTS consents/.test(cti('app/api/init/route.ts')) && /prevodSouhlasu\(\)/.test(cti('app/api/init/route.ts')));
  ok('smazání účtu: rozhodnutí pro consents, se smazáním podniku zmizí', ZACHAZENI_TABULEK.consents === 'ponechat' && TYMOVE_TABULKY.includes('consents'));
  ok('odhlášení odkazem zapisuje řádek „odkaz_email“', /odvolejEmaily\(tok\.userId, tok\.teamId\)/.test(cti('app/api/client/odhlasit/route.ts')) && /'odkaz_email'/.test(db));
}
