// Kolo 81 — seznam členů: dotaz, export do CSV, telefon, duplicity, sloučení a přidání do skupiny z CSV.
// Čisté funkce z lib/clenoveSeznam.ts, plus kontrola zapojení (oprávnění, audit, blokace, potvrzení v rozhraní).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  dotazClenu, pocetFiltru, adresaDotazu, pocetStran, hraniceUrovne, normalizujTelefon, telefonCitelne, bunkaCsv, csvClenu,
  klicEmailu, klicJmena, najdiDuplicity, slouceniHodnot, radkyProSkupinu, sparujSClenyPodniku, csvNenalezenych,
  NA_STRANU, MAX_NA_STRANU, MAX_HROMADNE_AKCE,
} from '../../lib/clenoveSeznam.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- dotaz ----
  eq('dotaz: výchozí hodnoty', dotazClenu({}), { q: '', razeni: 'aktivita', strana: 1, naStranu: NA_STRANU, uroven: '', skupina: null, segment: null, stav: '' });
  const d = dotazClenu({ q: '  Jana ', sort: 'body', strana: '3', naStranu: '100', uroven: 'gold', skupina: '7', segment: 'quiet:60', stav: 'souhlas' });
  ok('dotaz: všechno projde', d.q === 'Jana' && d.razeni === 'body' && d.strana === 3 && d.naStranu === 100 && d.uroven === 'gold' && d.skupina === 7 && d.segment === 'quiet:60' && d.stav === 'souhlas');
  const zly = dotazClenu({ sort: 'DROP TABLE', strana: '-4', naStranu: '99999', uroven: 'diamant', skupina: 'x', segment: 'nesmysl', stav: 'cokoli' });
  ok('dotaz: nesmysly se zahodí a nikdy neprojdou do SQL', zly.razeni === 'aktivita' && zly.strana === 1 && zly.naStranu === MAX_NA_STRANU && zly.uroven === '' && zly.skupina === null && zly.segment === null && zly.stav === '');
  eq('dotaz: kombinace segmentů projde', dotazClenu({ segment: 'mix:and|quiet|tier:gold' }).segment, 'mix:and|quiet|tier:gold');
  eq('dotaz: kombinace s odkazem na skupinu se v členech odmítne', dotazClenu({ segment: 'mix:and|quiet|group:3' }).segment, null);
  eq('dotaz: z URLSearchParams', dotazClenu(new URLSearchParams('q=a&strana=2')).strana, 2);
eq('dotaz: starý parametr limit (widget) je velikost stránky, nejvýš 500', [dotazClenu({ limit: '5' }).naStranu, dotazClenu({ limit: '9999' }).naStranu], [5, 500]);
  eq('filtry: počet zapnutých', pocetFiltru(dotazClenu({ uroven: 'silver', stav: 'blokovani' })), 2);
  eq('adresa: výchozí dotaz je holá adresa', adresaDotazu(dotazClenu({})), '/api/client/admin/customers');
  eq('adresa: filtry a export', adresaDotazu(dotazClenu({ q: 'ja na', uroven: 'gold' }), { format: 'csv' }), '/api/client/admin/customers?q=ja+na&uroven=gold&format=csv');
  eq('stran: 0 členů = jedna strana', pocetStran(0, 50), 1);
  eq('stran: 101 členů po 50 jsou tři', pocetStran(101, 50), 3);
  eq('úroveň: bronzová je pod stříbrnou', hraniceUrovne('bronze', { silver: 10, gold: 25, platinum: 0 }), { od: 0, do: 10 });
  eq('úroveň: zlatá bez platiny nemá strop', hraniceUrovne('gold', { silver: 10, gold: 25, platinum: 0 }), { od: 25, do: null });
  eq('úroveň: zlatá s platinou končí u platiny', hraniceUrovne('gold', { silver: 10, gold: 25, platinum: 60 }), { od: 25, do: 60 });
  eq('úroveň: platina, která není zapnutá, nemá nikoho', hraniceUrovne('platinum', { silver: 10, gold: 25, platinum: 0 }), null);

  // ---- telefon ----
  eq('telefon: devět číslic je české číslo', normalizujTelefon('777 123 456'), '+420777123456');
  eq('telefon: s předvolbou a mezerami', normalizujTelefon('+420 777-123-456'), '+420777123456');
  eq('telefon: 00 místo plus', normalizujTelefon('00420777123456'), '+420777123456');
  eq('telefon: slovenské číslo zůstane', normalizujTelefon('+421 905 123 456'), '+421905123456');
  eq('telefon: příliš krátký je null', normalizujTelefon('12345'), null);
  eq('telefon: prázdný je null', normalizujTelefon(''), null);
  eq('telefon: pro čtení', telefonCitelne('+420777123456'), '+420 777 123 456');
  eq('telefon: cizí číslo se pro čtení nemění', telefonCitelne('+421905123456'), '+421905123456');

  // ---- CSV ----
  eq('csv: obyčejný text', bunkaCsv('Jana'), 'Jana');
  eq('csv: středník se uzavře', bunkaCsv('a;b'), '"a;b"');
  eq('csv: uvozovky se zdvojí', bunkaCsv('říká "ahoj"'), '"říká ""ahoj"""');
  eq('csv: vzorec dostane apostrof (Excel ho nespustí)', bunkaCsv('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  eq('csv: plus, minus a zavináč na začátku textu taky', [bunkaCsv('+420'), bunkaCsv('-5 b.'), bunkaCsv('@jana')], ["'+420", "'-5 b.", "'@jana"]);
  eq('csv: číslo zůstane číslem i záporné', bunkaCsv(-5), '-5');
  const radek = { id: 1, name: 'Jana "Kuba" Nováková', email: 'jana@example.cz', phone: '+420777123456', points: 120, stamps: 3, visits: 8, spend: 4200, level_label: 'Zlatý', joined_at: '2026-01-05', last_visit_at: '2026-09-30', blocked: false, note: '=1+1', novinky: true };
  const den = (v: unknown) => String(v ?? '');
  const sKontakty = csvClenu([radek], { kontakty: true, denCesky: den });
  const bezKontaktu = csvClenu([radek], { kontakty: false, denCesky: den });
  ok('csv: začíná BOM kvůli Excelu', sKontakty.charCodeAt(0) === 0xfeff);
  ok('csv: hlavička s kontakty', sKontakty.split('\r\n')[0].includes('E-mail') && sKontakty.split('\r\n')[0].includes('Telefon'));
  ok('csv: bez oprávnění ke kontaktům v souboru e-mail ani telefon nejsou', !bezKontaktu.includes('jana@example.cz') && !bezKontaktu.includes('777') && !bezKontaktu.split('\r\n')[0].includes('E-mail'));
  ok('csv: poznámka se vzorcem je neutralizovaná', sKontakty.includes("'=1+1"));
  ok('csv: konce řádků CRLF a jeden řádek na člena', sKontakty.split('\r\n').filter(Boolean).length === 2);
  ok('csv: telefon čitelně', sKontakty.includes('+420 777 123 456'));

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
  const h = { points: 100, stamps: 2, visits: 5, spend: 1000, credit: 10, joined_at: '2026-03-01 10:00:00', last_visit_at: '2026-09-01 10:00:00', note: 'Alergie na ořechy' };
  const dn = { points: 50, stamps: 1, visits: 3, spend: 500, credit: 0, joined_at: '2026-01-15 10:00:00', last_visit_at: '2026-09-20 10:00:00', note: 'Alergie na ořechy' };
  const sl = slouceniHodnot(h, dn);
  eq('sloučení: čísla se sečtou', [sl.points, sl.stamps, sl.visits, sl.spend, sl.credit], [150, 3, 8, 1500, 10]);
  eq('sloučení: člen od je dřívější, naposledy pozdější', [sl.joined_at, sl.last_visit_at], ['2026-01-15 10:00:00', '2026-09-20 10:00:00']);
  eq('sloučení: stejná poznámka se neopakuje', sl.note, 'Alergie na ořechy');
  eq('sloučení: různé poznámky se spojí', slouceniHodnot({ ...h, note: 'A' }, { ...dn, note: 'B' }).note, 'A | B');
  eq('sloučení: bez poznámek je null', slouceniHodnot({ ...h, note: null }, { ...dn, note: '' }).note, null);
  eq('sloučení: chybějící návštěva se bere z druhého', slouceniHodnot({ ...h, last_visit_at: null }, dn).last_visit_at, '2026-09-20 10:00:00');

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
  ok('členové: úpravy a mazání jen s oprávněním správy členů', (cust.match(/pozaduj\('zakaznici\.sprava_clenu'\)/g) ?? []).length >= 2);
  ok('členové: e-mail a telefon jen s oprávněním ke kontaktům (i při hledání)', cust.includes("has('zakaznici.kontakty')") && cust.includes('${kontakty} AND'));
  ok('členové: export a blokace jdou do historie změn', cust.includes("'client.clen.export'") && cust.includes("'client.clen.blokace'") && cust.includes("'client.clen.poznamka'"));
  ok('členové: stránkování a řazení jsou v SQL, ne v prohlížeči', cust.includes('LIMIT ${limit} OFFSET'));
  const hromadne = precti('app/api/client/admin/customers/hromadne/route.ts');
  ok('hromadné akce: každá akce má svoje oprávnění', ['zakaznici.skupiny', 'vernost.upravit_body', 'kupony.spravovat', 'zakaznici.zpravy'].every(x => hromadne.includes(`'${x}'`)));
  ok('hromadné akce: cizí členové se zahodí', hromadne.includes('platniClenove'));
  const slucit = precti('app/api/client/admin/customers/sloucit/route.ts');
  ok('sloučení: jen s oprávněním správy členů', slucit.includes("'zakaznici.sprava_clenu'"));
  const db = precti('lib/clenoveDb.ts');
  ok('sloučení: duplicitu si přivlastní atomicky (DELETE … RETURNING)', db.includes('DELETE FROM client_memberships WHERE team_id = ${teamId} AND customer_id = ${duplicitaId} RETURNING *'));
  ok('sloučení: zapisuje do historie změn', db.includes("'client.clen.slouceni'") && db.includes("'client.clen.smazan'"));
  const client = precti('lib/client.ts');
  ok('blokace: blokovaný člen body nesbírá (award i razítka)', client.includes('jeClenBlokovan(teamId, customerId)') && (client.match(/jeClenBlokovan/g) ?? []).length >= 3);
  ok('blokace: u kasy obsluha dostane důvod', precti('app/api/client/staff/scan/route.ts').includes('je ve věrnostním programu zablokovaný'));
  ok('blokace: host nevybere kupon ani promo kód', precti('app/api/client/b/[slug]/coupons/[id]/claim/route.ts').includes('m.blocked === true') && precti('app/api/client/b/[slug]/promo/route.ts').includes('jeZablokovan'));
  const ui = precti('components/client/loyalty/ClenDetail.tsx');
  ok('rozhraní: blokace a odebrání člena se potvrzují', ui.includes('<Potvrdit') && ui.includes('Odebrat z klubu') && ui.includes('Zablokovat'));
  const kat = precti('lib/opravneniKatalog.ts');
  ok('oprávnění: správa členů je v katalogu a ve vedení', kat.includes('"id": "zakaznici.sprava_clenu"') && kat.includes('"zakaznici.sprava_clenu",\n   "zakaznici.zobrazit"'));
  ok('oprávnění: je ve fixtuře rolí', precti('scripts/sondy/fixtury/roles.json').includes('zakaznici.sprava_clenu'));
  eq('dávky: server bere najednou víc než klient posílá', MAX_HROMADNE_AKCE <= 2000, true);
  const init = precti('app/api/init/route.ts');
  ok('schéma: blokace a poznámka člena jsou v init', ['blocked BOOLEAN', 'blocked_at TIMESTAMP', 'note TEXT'].every(x => init.includes(`client_memberships ADD COLUMN IF NOT EXISTS ${x}`)));
}
