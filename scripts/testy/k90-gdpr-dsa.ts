// Spuštění, balík G — DSA: oznámení nezákonného obsahu od kohokoli (čl. 16), odůvodnění omezení
// (čl. 17), kontaktní místo (čl. 11/12).
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  platneOznameni, cistyOdkaz, slugZOdkazu, opisOznameni, nazevKategorieDsa, KATEGORIE_DSA, DRUH_WEB,
  emailNovehoOznameni, emailPotvrzeniOznameni, emailRozhodnutiOznameni, oduvodneni,
} from '../../lib/dsa.ts';
import { jePravniStranka, rozhodniObal } from '../../lib/obal.ts';
import { dokument } from '../../lib/pravni/texty.ts';
import { firma } from '../../lib/firma.ts';

const cti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  const zaklad = { url: 'https://www.managero.app/client/u-mostu', popis: 'Fotka v nabídce', kategorie: 'podvod', zduvodneni: 'Nabízí zboží, které neexistuje, a bere zálohy.', jmeno: 'Jan', email: 'Jan@Priklad.cz', prohlaseni: true };
  const v = platneOznameni(zaklad);
  ok('platné oznámení projde, e-mail malými písmeny', v.ok && v.v.email === 'jan@priklad.cz' && v.v.url === 'https://www.managero.app/client/u-mostu');
  const chyba = (x: object) => { const r = platneOznameni({ ...zaklad, ...x }); return r.ok ? null : r.pole; };
  eq('povinná pole', [chyba({ popis: '' }), chyba({ kategorie: 'xx' }), chyba({ zduvodneni: 'krátké' }), chyba({ jmeno: '' }), chyba({ email: '' }), chyba({ email: 'neni-email' }), chyba({ prohlaseni: 'ano' }), chyba({ url: 'javascript:alert(1)' })],
    ['popis', 'kategorie', 'zduvodneni', 'jmeno', 'email', 'email', 'prohlaseni', 'url']);
  ok('ohrožení dětí: jméno a e-mail nepovinné (čl. 16 odst. 2 písm. c)', platneOznameni({ ...zaklad, kategorie: 'deti', jmeno: '', email: '' }).ok);
  ok('odkaz nepovinný', platneOznameni({ ...zaklad, url: '' }).ok);
  eq('odkaz: jen http(s)', [cistyOdkaz('https://a.cz/x'), cistyOdkaz(''), cistyOdkaz('ftp://a.cz'), cistyOdkaz('nesmysl')], ['https://a.cz/x', null, undefined, undefined]);
  eq('podnik z odkazu na jeho stránku', [slugZOdkazu('https://www.managero.app/client/u-mostu?tab=menu'), slugZOdkazu('https://www.managero.app/client/me'), slugZOdkazu('https://jinde.cz/x'), slugZOdkazu(null)], ['u-mostu', null, null, null]);
  ok('opis bez kontaktu oznamovatele', !/Jan|priklad/.test(opisOznameni({ url: zaklad.url, popis: zaklad.popis })));
  ok('kategorie mají názvy a „jiné“ je záchrana', KATEGORIE_DSA.length >= 8 && nazevKategorieDsa('nesmysl') === 'Jiný nezákonný obsah');

  // ---- e-maily ----
  const nove = emailNovehoOznameni({ id: 7, kategorie: 'podvod', podnik: 'U <Mostu>', odkaz: 'https://x.cz/admin/nahlaseni' });
  ok('provozovateli: bez textu a kontaktu, escapované', !/Jan|zálohy/.test(nove.html) && /U &lt;Mostu&gt;/.test(nove.html) && /#7/.test(nove.subject));
  ok('oznamovateli potvrzení s číslem (čl. 16 odst. 4)', /#12/.test(emailPotvrzeniOznameni({ id: 12, kategorie: 'jine', kontakt: 'podpora@x.cz' }).html));
  const roz = emailRozhodnutiOznameni({ id: 12, stav: 'dismissed', kontakt: 'podpora@x.cz' });
  ok('rozhodnutí: co, že rozhodl člověk a jak se ohradit (čl. 16 odst. 5, čl. 20)', /Zůstává dostupný/.test(roz.html) && /člověk, ne automat/.test(roz.html) && /6 měsíců/.test(roz.html));
  const o = oduvodneni({ druh: 'odstraneni_zpravy', duvod: 'Urážlivé nebo nenávistné', podnik: 'U Mostu', kdo: 'podnik', poznamka: 'Opakovaně.', kontakt: 'podpora@x.cz' });
  ok('odůvodnění (čl. 17): co, proč, základ, kdo a náprava', /zpráva v chatu byla odstraněna/.test(o.html) && /Důvod: Urážlivé/.test(o.html) && /Podmínky užívání/.test(o.html) && /vedení podniku U Mostu/.test(o.html) && /Nesouhlasíš/.test(o.html) && /Upřesnění: Opakovaně/.test(o.html));
  ok('odůvodnění blokace člena', /zablokoval/.test(oduvodneni({ druh: 'blokace_clena', duvod: 'x', podnik: 'U Mostu', kdo: 'podnik', kontakt: 'a@b.cz' }).body));

  // ---- veřejná stránka a napojení ----
  ok('/nahlasit je veřejná stránka (i v obalu)', jePravniStranka('/nahlasit') && rozhodniObal({ obal: 'client', pathname: '/nahlasit' }).akce === 'pustit');
  ok('API /api/nahlasit projde z aplikace hosta', rozhodniObal({ obal: 'client', pathname: '/api/nahlasit' }).akce === 'pustit');
  const api = cti('app/api/nahlasit/route.ts');
  ok('API: kontrola, omezení podle IP, uložení, eskalace a potvrzení', /platneOznameni/.test(api) && /hit\(`dsa-oznameni:/.test(api) && /ulozOznameniWeb/.test(api) && /eskalujOznameniWeb/.test(api) && /potvrdOznamovateli/.test(api));
  const db = cti('lib/dsaDb.ts');
  ok('uložení do content_reports se zdrojem web', new RegExp(`'web'`).test(db) && /INSERT INTO content_reports/.test(db) && DRUH_WEB === 'web');
  ok('eskalace přes adresu moderace (lib/moderace)', /kontaktModerace\(process\.env\)/.test(db));
  ok('vyřízení vedením i správcem pošle odůvodnění / rozhodnutí', /poVyrizeniNahlaseni\(reportId, novyStav, 'podnik'/.test(cti('app/api/reports/[id]/route.ts')) && /poVyrizeniNahlaseni\(reportId, stav, 'provozovatel'/.test(cti('app/api/admin/nahlaseni/[id]/route.ts')));
  ok('blokace člena pošle odůvodnění', /oznamOduvodneni\(id, \{ druh: 'blokace_clena'/.test(cti('app/api/client/admin/customers/route.ts')));
  ok('init: oznámení bez účtu a kontakt oznamovatele', /ALTER COLUMN reporter_id DROP NOT NULL/.test(cti('app/api/init/route.ts')) && /reporter_email/.test(cti('app/api/init/route.ts')));
  ok('smazání účtu vymaže i kontakt oznamovatele', /reporter_name = NULL, reporter_email = NULL/.test(cti('lib/smazaniUctu.ts')));
  const p = dokument('podpora', 'cs', firma({}));
  ok('podpora: kontaktní místo DSA a odkaz na /nahlasit', p.sekce.some(s => s.p?.some(x => /Kontaktní místo podle Aktu o digitálních službách/.test(x))) && p.sekce.some(s => s.p?.some(x => /\/nahlasit/.test(x))));
  ok('podpora anglicky taky', dokument('podpora', 'en', firma({})).sekce.some(s => s.p?.some(x => /Digital Services Act/.test(x))));
  const form = cti('app/nahlasit/Formular.tsx');
  ok('formulář: prohlášení, e-mail s inputMode, kontrola jako server', /dsa-prohlaseni/.test(form) && /inputMode="email"/.test(form) && /platneOznameni\(telo\)/.test(form));
}
