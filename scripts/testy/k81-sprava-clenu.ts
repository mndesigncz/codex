// Kolo 81 — správa členů: telefon, duplicity, sloučení, blokace a přidání do skupiny z CSV.
// Čisté funkce z lib/clenoveSeznam.ts, plus kontrola zapojení (oprávnění, audit, blokace, potvrzení v rozhraní).
// Filtry, export a hromadné akce seznamu testuje k81-clenove.ts.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  normalizujTelefon, telefonCitelne, klicEmailu, klicJmena, najdiDuplicity, popisSlouceni, radkyProSkupinu, sparujSClenyPodniku, csvNenalezenych,
} from '../../lib/clenoveSeznam.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- telefon ----
  eq('telefon: devět číslic je české číslo', normalizujTelefon('777 123 456'), '+420777123456');
  eq('telefon: s předvolbou a mezerami', normalizujTelefon('+420 777-123-456'), '+420777123456');
  eq('telefon: 00 místo plus', normalizujTelefon('00420777123456'), '+420777123456');
  eq('telefon: slovenské číslo zůstane', normalizujTelefon('+421 905 123 456'), '+421905123456');
  eq('telefon: příliš krátký je null', normalizujTelefon('12345'), null);
  eq('telefon: prázdný je null', normalizujTelefon(''), null);
  eq('telefon: pro čtení', telefonCitelne('+420777123456'), '+420 777 123 456');
  eq('telefon: cizí číslo se pro čtení nemění', telefonCitelne('+421905123456'), '+421905123456');

  // ---- duplicity ----
  eq('e-mail: plus štítek se ignoruje', klicEmailu('Jan.Novak+kavarna@example.cz'), 'jan.novak@example.cz');
  eq('e-mail: u Gmailu na tečkách nezáleží', klicEmailu('jan.novak@gmail.com'), klicEmailu('jannovak@gmail.com'));
  eq('e-mail: googlemail je gmail', klicEmailu('a@googlemail.com'), 'a@gmail.com');
  eq('e-mail: nesmysl je null', klicEmailu('neni-email'), null);
  eq('jméno: pořadí slov a diakritika nevadí', klicJmena('Novák Jan'), klicJmena('jan novak'));
  eq('jméno: jedno slovo nestačí', klicJmena('Jana'), null);
  const lide = [
    { id: 1, name: 'Jana Nováková', email: 'jana@example.cz', phone: '777 123 456' },
    { id: 2, name: 'J. N.', email: 'jana2@example.cz', phone: '+420777123456' },
    { id: 3, name: 'Petr Svoboda', email: 'Petr.Svoboda+cafe@gmail.com', phone: null },
    { id: 4, name: 'Svoboda Petr', email: 'petrsvoboda@gmail.com', phone: null },
    { id: 5, name: 'Eva Dvořáková', email: 'eva@example.cz', phone: '602 111 222' },
    { id: 6, name: 'Eva Dvořáková', email: 'jina@example.cz', phone: '603 333 444' },
    { id: 7, name: 'Karel Osamělý', email: 'karel@example.cz', phone: null },
  ];
  const dup = najdiDuplicity(lide);
  eq('duplicity: tři skupiny, nejsilnější důvod první', dup.map(s => [s.duvod, s.ids]), [['telefon', [1, 2]], ['email', [3, 4]], ['jmeno', [5, 6]]]);
  ok('duplicity: osamělý člen nikde není', !dup.some(s => s.ids.includes(7)));
  eq('duplicity: nikdo bez shody nic nevrátí', najdiDuplicity([lide[0], lide[4], lide[6]]), []);
  const retez = najdiDuplicity([{ id: 1, name: 'A B', phone: '777111222' }, { id: 2, name: 'C D', phone: '777111222', email: 'x@y.cz' }, { id: 3, name: 'E F', email: 'X@y.cz' }]);
  eq('duplicity: překryv přes společného člena je jedna skupina', retez.map(s => s.ids), [[1, 2, 3]]);

  // ---- sloučení ----
  eq('sloučení: věta pro potvrzení sečte body a návštěvy', popisSlouceni({ points: 100, visits: 5 }, { points: 50, visits: 3 }), 'Body 100 + 50, návštěvy 5 + 3');

  // ---- přidání do skupiny z CSV ----
  const csv = 'E-mail;Telefon;Jméno\njana@example.cz;;Jana Nováková\n;602 111 222;\n;;Petr Svoboda\nneplatny;;\nnezname@x.cz;;';
  const r = radkyProSkupinu(csv);
  eq('csv do skupiny: hlavička se pozná, řádek bez použitelného údaje se přeskočí', [r.radky.length, r.prazdne], [4, [5]]);
  eq('csv do skupiny: čísla řádků počítají hlavičku', r.radky.map(x => x.radek), [2, 3, 4, 6]);
  const bez = radkyProSkupinu('jana@example.cz\n+420 602 111 222\nPetr Svoboda');
  eq('seznam bez hlavičky: e-mail, telefon, jméno', bez.radky.map(x => [x.email, x.telefon, x.jmeno]), [['jana@example.cz', null, null], [null, '+420602111222', null], [null, null, 'Petr Svoboda']]);
  const clenove = [
    { id: 1, name: 'Jana Nováková', email: 'jana@example.cz', phone: null },
    { id: 5, name: 'Eva Dvořáková', email: 'eva@example.cz', phone: '602 111 222' },
    { id: 8, name: 'Petr Svoboda', email: 'petr@example.cz', phone: null },
    { id: 9, name: 'Petr Svoboda', email: 'petr2@example.cz', phone: null },
  ];
  const sp = sparujSClenyPodniku(r.radky, clenove);
  eq('párování: e-mail a telefon najdou člena', sp.nalezeno.map(n => [n.id, n.podle]), [[1, 'email'], [5, 'telefon']]);
  eq('párování: dvě stejná jména jsou nejednoznačná, neznámý e-mail nebyl nalezen', sp.nenalezeno.map(n => n.radek), [4, 6]);
  ok('párování: důvod nejednoznačnosti se řekne', sp.nenalezeno[0].duvod.includes('víc členů'));
  ok('párování: důvod u neznámého člena', sp.nenalezeno[1].duvod === 'Není členem podniku.');
  eq('párování: stejný člen dvakrát se přidá jednou', sparujSClenyPodniku([{ radek: 1, email: 'jana@example.cz', telefon: null, jmeno: null }, { radek: 2, email: 'jana@example.cz', telefon: null, jmeno: null }], clenove).nalezeno.length, 1);
  ok('csv nenalezených: hlavička a řádky', csvNenalezenych(sp.nenalezeno).split('\r\n').filter(Boolean).length === 3);

  // ---- zapojení: oprávnění, audit, blokace, potvrzení ----
  const cust = precti('app/api/client/admin/customers/route.ts');
  ok('členové: blokace a mazání jen s oprávněním správy členů', (cust.match(/pozaduj\('zakaznici\.sprava_clenu'\)/g) ?? []).length >= 2);
  ok('členové: duplicity vidí a slučuje jen správce členů, e-mail a telefon jen s oprávněním ke kontaktům', cust.includes("params.get('duplicity') === '1'") && cust.includes("has('zakaznici.sprava_clenu')") && cust.includes('email: kontakty ? r.email : null'));
  ok('členové: blokace jde do historie změn', cust.includes("'client.clen.blokace'"));
  const slucit = precti('app/api/client/admin/customers/sloucit/route.ts');
  ok('sloučení: jen s oprávněním správy členů', slucit.includes("'zakaznici.sprava_clenu'"));
  const db = precti('lib/clenoveDb.ts');
  ok('sloučení: duplicitu si přivlastní atomicky (DELETE … RETURNING)', db.includes('DELETE FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ${duplicitaId} RETURNING *'));
  ok('sloučení: zapisuje do historie změn a přesouvá poznámky', db.includes("'client.clen.slouceni'") && db.includes("'client.clen.smazan'") && db.includes('UPDATE client_member_notes SET customer_id = ${hlavniId}'));
  ok('odebrání člena: smaže i poznámky, deník automatizací a skupiny', /DELETE FROM client_member_notes WHERE team_id = \$\{teamId\} AND customer_id = \$\{customerId\}/.test(db) && db.includes('DELETE FROM client_automatizace_log WHERE team_id = ${teamId} AND customer_id = ${customerId}') && db.includes('DELETE FROM client_group_members WHERE team_id = ${teamId} AND customer_id = ${customerId}'));
  const client = precti('lib/client.ts');
  ok('blokace: blokovaný člen body nesbírá (award i razítka)', client.includes('export async function jeClenBlokovan') && (client.match(/jeClenBlokovan\(teamId, customerId\)/g) ?? []).length >= 2);
  ok('blokace: razítka v kampaních taky', precti('lib/stamps.ts').includes('jeClenBlokovan(c.team_id, customerId)'));
  ok('blokace: u kasy obsluha dostane důvod', precti('app/api/client/staff/scan/route.ts').includes('je ve věrnostním programu zablokovaný'));
  ok('blokace: host nevybere kupon ani promo kód', precti('app/api/client/b/[slug]/promo/route.ts').includes('jeClenBlokovan(teamId, me.id)') && precti('app/api/client/b/[slug]/coupons/[id]/claim/route.ts').includes('jeClenBlokovan(teamId, me.id)'));
  ok('blokace: bonus bodů hromadně blokovanému nejde', precti('app/api/client/admin/customers/bulk/route.ts').includes('AND blocked = FALSE'));
  const ui = precti('components/client/loyalty/ClenSprava.tsx');
  ok('rozhraní: blokace a odebrání člena se potvrzují', ui.includes('<Potvrdit') && ui.includes('Odebrat z klubu') && ui.includes('Zablokovat'));
  const detail = precti('components/client/loyalty/ClenoveDetail.tsx');
  ok('rozhraní: správa a celá historie jsou v detailu člena, správa jen s oprávněním', detail.includes("smi('zakaznici.sprava_clenu') && <SpravaClena") && detail.includes('<HistorieClena'));
  ok('rozhraní: duplicity otevírá seznam členů jen správci', precti('components/client/loyalty/ClenoveSprava.tsx').includes("smiSpravu && <Button size=\"sm\" variant=\"secondary\" icon=\"users\" onClick={() => setDuplicity(true)}>Duplicity"));
  const kat = precti('lib/opravneniKatalog.ts');
  ok('oprávnění: správa členů je v katalogu a ve vedení', kat.includes('"id": "zakaznici.sprava_clenu"') && kat.includes('"zakaznici.sprava_clenu",\n   "zakaznici.zobrazit"'));
  const role = precti('scripts/sondy/fixtury/roles.json');
  ok('oprávnění: je ve fixtuře rolí u vedení i u vlastníka, vždy jednou', (role.match(/zakaznici\.sprava_clenu/g) ?? []).length === 2 && (role.match(/"zakaznici\.sprava_clenu",?\s*\n\s*"zakaznici\.zobrazit"/g) ?? []).length === 2);
  const init = precti('app/api/init/route.ts');
  ok('schéma: blokace člena a archiv skupiny jsou v init', ['blocked BOOLEAN', 'blocked_at TIMESTAMP'].every(x => init.includes(`client_memberships ADD COLUMN IF NOT EXISTS ${x}`)) && init.includes('client_groups ADD COLUMN IF NOT EXISTS archived BOOLEAN'));
  const imp = precti('app/api/client/admin/groups/import/route.ts');
  ok('import skupiny: jen s kontakty, bez zakládání členů, dynamická a archivovaná skupina se odmítne', imp.includes("has('zakaznici.kontakty')") && imp.includes('normalizujPravidla(g.rules)') && imp.includes('g.archived') && !/INSERT INTO client_memberships/.test(imp));
  const grp = precti('app/api/client/admin/groups/route.ts');
  ok('skupiny: archiv jde přes PATCH, zapisuje do historie změn', grp.includes("typeof b.archived === 'boolean'") && grp.includes('přesunuta do archivu'));
  const sk = precti('components/client/loyalty/ClenoveSkupiny.tsx');
  ok('skupiny: archiv a přidání z CSV jsou v rozhraní skupin', sk.includes('archivuj(g, !g.archived)') && sk.includes('<SkupinyImport'));
}
