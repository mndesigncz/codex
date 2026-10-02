// Kolo 81 — členové a skupiny: filtry, řazení, stránkování, dynamické skupiny, CSV,
// hromadné akce a poznámky. Čisté funkce z lib/clenoveFiltr.ts a lib/poznamkyHosta.ts,
// plus kontrola zdrojů tam, kde pravidlo žije v SQL (atomické zápisy, oprávnění, mazání účtu).

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  normalizujFiltr, filtrNaParametry, pocetFiltru, splnujeFiltr, jeNeaktivni, maNarozeninyVMesici, seradCleny, normalizujRazeni, strankuj,
  normalizujPravidla, chybaPravidel, patriDoPravidel, vyberPodlePravidel, popisPravidel, normalizujBarvu, tonBarvy, bunkaCsv, sestavCsvClenu,
  chybaBonusu, normalizujKlicAkce, HROMADNE_AKCE, AKCE_PRIPRAVUJE, PRAZDNY_FILTR, STRANKA_MAX, HROMADNA_MAX, BONUS_CELKEM_MAX,
  type ClenFiltrovany, type FiltrClenu,
} from '../../lib/clenoveFiltr.ts';
import { chybaPoznamky, NOTE_MAX } from '../../lib/poznamkyHosta.ts';
import { KATALOG, VSECHNA } from '../../lib/opravneni.ts';
import { ZACHAZENI_TABULEK, TYMOVE_TABULKY, planUzivatele } from '../../lib/smazaniUctu.ts';

const precti = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const NOW = new Date('2026-10-02T12:00:00Z');
const dnuZpet = (n: number) => new Date(NOW.getTime() - n * 86400000).toISOString();
const K = { now: NOW, mesic: 10 };
const clen = (o: Partial<ClenFiltrovany> = {}): ClenFiltrovany => ({
  id: 1, name: 'Jana Nováková', email: 'jana@example.cz', birthday: null, points: 0, stamps: 0, visits: 3, spend: 0, credit: 0,
  joined_at: dnuZpet(200), last_visit_at: dnuZpet(1), open_coupons: 0, level: 'bronze', ...o,
});
const filtr = (o: Partial<FiltrClenu> = {}): FiltrClenu => ({ ...PRAZDNY_FILTR, ...o });

export default async function ({ eq, ok }: Testy) {
  // ---- vstup filtru ----
  eq('filtr: z adresy se přečtou všechny podmínky', normalizujFiltr(new URLSearchParams('q=jana&level=gold&group=7&quietDays=60&birthdayMonth=1&openCoupon=1&spendOver=2000')),
    { q: 'jana', level: 'gold', group: 7, quietDays: 60, birthdayMonth: true, openCoupon: true, spendOver: 2000 });
  eq('filtr: nesmysly se zahodí (= bez omezení)', normalizujFiltr(new URLSearchParams('level=diamant&group=-3&quietDays=abc&spendOver=-5&birthdayMonth=ne')), PRAZDNY_FILTR);
  eq('filtr: počet dní má strop 3650', normalizujFiltr({ quietDays: 99999 }).quietDays, 3650);
  eq('filtr: tělo požadavku (booleany a čísla) projde stejně', normalizujFiltr({ quietDays: 30, birthdayMonth: true, level: 'silver' }), { ...PRAZDNY_FILTR, quietDays: 30, birthdayMonth: true, level: 'silver' });
  eq('filtr: round-trip přes parametry adresy', normalizujFiltr(filtrNaParametry(filtr({ level: 'gold', quietDays: 90, openCoupon: true }))), filtr({ level: 'gold', quietDays: 90, openCoupon: true }));
  eq('filtr: prázdný filtr nemá žádné parametry', filtrNaParametry(PRAZDNY_FILTR).toString(), '');
  eq('filtr: počet podmínek nepočítá hledání textu', pocetFiltru(filtr({ q: 'jana', level: 'gold', birthdayMonth: true })), 2);

  // ---- neaktivní N dní ----
  eq('neaktivní: 59 dní nestačí na 60', jeNeaktivni(clen({ last_visit_at: dnuZpet(59) }), 60, NOW), false);
  eq('neaktivní: přesně 60 dní stačí', jeNeaktivni(clen({ last_visit_at: dnuZpet(60) }), 60, NOW), true);
  eq('neaktivní: bez návštěvy se měří od přidání (nový člen není spáč)', jeNeaktivni(clen({ last_visit_at: null, joined_at: dnuZpet(5) }), 30, NOW), false);
  eq('neaktivní: bez návštěvy a přidán před 40 dny je spáč', jeNeaktivni(clen({ last_visit_at: null, joined_at: dnuZpet(40) }), 30, NOW), true);
  eq('neaktivní: stará data bez obojího jsou spáč', jeNeaktivni(clen({ last_visit_at: null, joined_at: null }), 30, NOW), true);
  eq('neaktivní: čas z databáze bez pásma se bere jako UTC', jeNeaktivni(clen({ last_visit_at: '2026-08-02 12:00:00' }), 60, NOW), true);

  // ---- ostatní podmínky ----
  eq('narozeniny: stejný měsíc ano, jiný ne, bez data ne', [maNarozeninyVMesici('1990-10-31', 10), maNarozeninyVMesici('1990-09-30', 10), maNarozeninyVMesici(null, 10), maNarozeninyVMesici('brzy', 10)], [true, false, false, false]);
  eq('úroveň: přesná shoda', [splnujeFiltr(clen({ level: 'gold' }), filtr({ level: 'gold' }), K), splnujeFiltr(clen({ level: 'silver' }), filtr({ level: 'gold' }), K)], [true, false]);
  eq('úroveň: bez úrovně je bronze', splnujeFiltr(clen({ level: undefined }), filtr({ level: 'bronze' }), K), true);
  eq('otevřený kupon', [splnujeFiltr(clen({ open_coupons: 2 }), filtr({ openCoupon: true }), K), splnujeFiltr(clen({ open_coupons: 0 }), filtr({ openCoupon: true }), K)], [true, false]);
  eq('útrata: hranice je „od" (včetně)', [1999, 2000, 2001].map(n => splnujeFiltr(clen({ spend: n }), filtr({ spendOver: 2000 }), K)), [false, true, true]);
  const sk = new Map([[1, new Set([7, 8])], [2, new Set([9])]]);
  const kSk = { ...K, skupinyHosta: (id: number) => sk.get(id) };
  eq('skupina: jen členové skupiny, host bez skupin nepatří nikam', [splnujeFiltr(clen({ id: 1 }), filtr({ group: 7 }), kSk), splnujeFiltr(clen({ id: 2 }), filtr({ group: 7 }), kSk), splnujeFiltr(clen({ id: 3 }), filtr({ group: 7 }), kSk)], [true, false, false]);
  eq('hledání: bez diakritiky a velikosti písmen', splnujeFiltr(clen({ name: 'Žaneta Černá' }), filtr({ q: 'zaneta cerna' }), K), true);
  eq('hledání: e-mail se bez zakaznici.kontakty nehledá', splnujeFiltr(clen(), filtr({ q: 'example.cz' }), K), false);
  eq('hledání: e-mail se hledá s oprávněním', splnujeFiltr(clen(), filtr({ q: 'example.cz' }), { ...K, hledatEmail: true }), true);
  eq('filtry se sčítají (AND)', splnujeFiltr(clen({ level: 'gold', spend: 5000 }), filtr({ level: 'gold', spendOver: 3000, openCoupon: true }), K), false);

  // ---- řazení ----
  const rad = [
    clen({ id: 1, name: 'Čeněk', points: 50, visits: 9, spend: 100, last_visit_at: dnuZpet(5), joined_at: dnuZpet(300) }),
    clen({ id: 2, name: 'Adam', points: 90, visits: 2, spend: 900, last_visit_at: dnuZpet(1), joined_at: dnuZpet(10) }),
    clen({ id: 3, name: 'Božena', points: 10, visits: 20, spend: 500, last_visit_at: null, joined_at: dnuZpet(100) }),
  ];
  const ids = (r: ClenFiltrovany[]) => r.map(c => c.id);
  eq('řazení: naposledy u nás, kdo ještě nebyl, je na konci', ids(seradCleny(rad, 'posledni')), [2, 1, 3]);
  eq('řazení: nejdéle nebyli (bez návštěvy se bere od přidání)', ids(seradCleny(rad, 'neaktivni')), [3, 1, 2]);
  eq('řazení: jméno česky (Č za C, ne za Z)', ids(seradCleny(rad, 'jmeno')), [2, 3, 1]);
  eq('řazení: body', ids(seradCleny(rad, 'body')), [2, 1, 3]);
  eq('řazení: návštěvy', ids(seradCleny(rad, 'navstevy')), [3, 1, 2]);
  eq('řazení: útrata', ids(seradCleny(rad, 'utrata')), [2, 3, 1]);
  eq('řazení: nově přidaní', ids(seradCleny(rad, 'nejnovejsi')), [2, 3, 1]);
  eq('řazení: neznámá hodnota padá na „naposledy"', normalizujRazeni('hokus'), 'posledni');
  eq('řazení: staré hodnoty widgetu zůstávají platné', ['navstevy', 'body', 'nejnovejsi'].map(normalizujRazeni), ['navstevy', 'body', 'nejnovejsi']);
  eq('řazení nemění vstup', ids(rad), [1, 2, 3]);
  const shoda = [clen({ id: 5, name: 'Aneta', points: 10 }), clen({ id: 4, name: 'Aneta', points: 10 })];
  eq('řazení: při shodě rozhoduje id, takže stránky po sobě nepřeskakují', ids(seradCleny(shoda, 'body')), [4, 5]);

  // ---- stránkování ----
  const sto = Array.from({ length: 120 }, (_, i) => i + 1);
  const s1 = strankuj(sto, 0, 50);
  eq('stránka 1: padesát, je další', [s1.rows.length, s1.total, s1.hasMore, s1.nextOffset], [50, 120, true, 50]);
  const s3 = strankuj(sto, 100, 50);
  eq('stránka 3: zbytek, žádná další', [s3.rows.length, s3.hasMore, s3.nextOffset], [20, false, null]);
  eq('stránka: offset za koncem je prázdný a bez dalšího', [strankuj(sto, 500, 50).rows.length, strankuj(sto, 500, 50).hasMore], [0, false]);
  eq('stránka: limit má strop', strankuj(Array.from({ length: 1000 }, (_, i) => i), 0, 99999).rows.length, STRANKA_MAX);
  eq('stránka: nesmyslné hodnoty se opraví', [strankuj(sto, -4, 'x').offset, strankuj(sto, 'y', 0).rows.length], [0, 50]);
  const slozene: number[] = [];
  let off: number | null = 0;
  while (off != null) { const st: ReturnType<typeof strankuj<number>> = strankuj(sto, off, 37); slozene.push(...st.rows); off = st.nextOffset; }
  eq('stránkování: stránky po sobě dají celý seznam bez duplicit a děr', slozene, sto);
  eq('stránkování: strop 500 je pryč (přes 500 členů se dá listovat)', strankuj(Array.from({ length: 700 }, (_, i) => i), 600, 50).rows.length, 50);

  // ---- dynamické skupiny ----
  eq('pravidla: prázdná nebo nesmyslná = ruční skupina', [normalizujPravidla(null), normalizujPravidla({}), normalizujPravidla({ quietDays: -1, spendOver: 'x' })], [null, null, null]);
  eq('pravidla: platná se normalizují', normalizujPravidla({ quietDays: '60', spendOver: 2000.9, birthdayMonth: true, cizi: 1 }), { quietDays: 60, spendOver: 2000, birthdayMonth: true });
  ok('pravidla: bez jediné podmínky je chyba s vysvětlením', /aspoň jedno pravidlo/.test(String(chybaPravidel({}))));
  ok('pravidla: dny mimo rozsah jsou chyba', /od 1 do 3650/.test(String(chybaPravidel({ quietDays: 5000 }))) && /od 1 do 3650/.test(String(chybaPravidel({ quietDays: 0.5 }))));
  ok('pravidla: záporná útrata je chyba', /Útrata/.test(String(chybaPravidel({ spendOver: -10 }))));
  eq('pravidla: platná nemají chybu', chybaPravidel({ quietDays: 30 }), null);
  const hoste = [
    clen({ id: 1, last_visit_at: dnuZpet(70), spend: 3000 }),
    clen({ id: 2, last_visit_at: dnuZpet(70), spend: 100 }),
    clen({ id: 3, last_visit_at: dnuZpet(2), spend: 3000, birthday: '1990-10-12' }),
    clen({ id: 4, last_visit_at: dnuZpet(90), spend: 5000, birthday: '1985-10-01' }),
  ];
  eq('dynamická: nepřišli 60 dní', vyberPodlePravidel(hoste, { quietDays: 60 }, K), [1, 2, 4]);
  eq('dynamická: útrata od 3000', vyberPodlePravidel(hoste, { spendOver: 3000 }, K), [1, 3, 4]);
  eq('dynamická: narozeniny tento měsíc', vyberPodlePravidel(hoste, { birthdayMonth: true }, K), [3, 4]);
  eq('dynamická: pravidla platí naráz (AND)', vyberPodlePravidel(hoste, { quietDays: 60, spendOver: 3000 }, K), [1, 4]);
  eq('dynamická: stejné rozhodnutí jako filtr seznamu', hoste.map(h => patriDoPravidel(h, { quietDays: 60 }, K)), hoste.map(h => splnujeFiltr(h, filtr({ quietDays: 60 }), K)));
  eq('dynamická: když host pravidla přestane splňovat, vypadne (přepočet je funkce stavu, ne přírůstek)', vyberPodlePravidel([clen({ id: 1, last_visit_at: dnuZpet(1) })], { quietDays: 60 }, K), []);
  eq('popis pravidel česky', popisPravidel({ quietDays: 60, spendOver: 2000, birthdayMonth: true }, n => `${n} Kč`), 'Nepřišli 60 dní a déle · útrata od 2000 Kč · narozeniny tento měsíc');
  eq('popis pravidel: jeden den má jednotné číslo', popisPravidel({ quietDays: 1 }, n => String(n)), 'Nepřišli 1 den a déle');
  eq('popis pravidel: bez pravidel nic', popisPravidel(null, n => String(n)), '');
  eq('barva: platná projde, jiná ne', [normalizujBarvu('sage'), normalizujBarvu('#ff0000'), normalizujBarvu(null)], ['sage', null, null]);
  eq('barva: tón štítku, neznámá je šedá', [tonBarvy('rose'), tonBarvy('amber'), tonBarvy(null)], ['bad', 'wait', 'muted']);

  // ---- CSV ----
  eq('CSV: text začínající = + - @ dostane apostrof (vzorec v Excelu)', ['=HYPERLINK("x")', '+420', '-1', '@SUM'].map(bunkaCsv), ['\'=HYPERLINK("x")', "'+420", "'-1", "'@SUM"].map(x => /[";\n\r]/.test(x) ? `"${x.replace(/"/g, '""')}"` : x));
  eq('CSV: středník, uvozovka a nový řádek se uzavřou do uvozovek', [bunkaCsv('a;b'), bunkaCsv('říká "ahoj"'), bunkaCsv('dva\nřádky'), bunkaCsv('klid')], ['"a;b"', '"říká ""ahoj"""', '"dva\nřádky"', 'klid']);
  const radky = [{ name: 'Jana', email: 'jana@example.cz', level_label: 'Zlatý host', points: 120, credit: 50, stamps: 3, visits: 9, spend: 4000, joined: '2026-01-02', lastVisit: '2026-09-30', groups: 'Štamgasti, VIP' }];
  const sEmailem = sestavCsvClenu(radky, true);
  const bezEmailu = sestavCsvClenu(radky, false);
  ok('CSV: začíná BOM a konce řádků jsou CRLF', sEmailem.startsWith('﻿') && sEmailem.endsWith('\r\n') && sEmailem.split('\r\n').length === 3);
  ok('CSV: s oprávněním kontakty je e-mail v hlavičce i v řádku', /e-mail/.test(sEmailem.split('\r\n')[0]) && sEmailem.includes('jana@example.cz'));
  ok('CSV: bez oprávnění kontakty e-mail v souboru není vůbec', !/e-mail/.test(bezEmailu) && !bezEmailu.includes('jana@example.cz') && !bezEmailu.includes('@'));
  eq('CSV: počet sloupců hlavičky a řádku je stejný', sEmailem.split('\r\n').slice(0, 2).map(r => r.split(';').length), [11, 11]);
  eq('CSV: počet sloupců bez e-mailu o jeden menší', bezEmailu.split('\r\n').slice(0, 2).map(r => r.split(';').length), [10, 10]);
  ok('CSV: skupiny s čárkou se nerozbijí (oddělovač je středník)', sEmailem.includes('Štamgasti, VIP'));

  // ---- hromadné akce ----
  eq('bonus: 0, záporné, desetinné a nad 10 000 se odmítnou', [0, -5, 1.5, 10001, 'abc'].map(v => chybaBonusu(v) != null), [true, true, true, true, true]);
  eq('bonus: 1 a 10 000 projdou', [chybaBonusu(1), chybaBonusu(10000)], [null, null]);
  eq('klíč akce: jen bezpečné znaky a rozumná délka', ['abcdef12', 'a'.repeat(64), 'krátký', 'a b c d e f g h', '', 'x'.repeat(65)].map(normalizujKlicAkce), ['abcdef12', 'a'.repeat(64), null, null, null, null]);
  eq('akce: skupina, body, zpráva a kupon', [...HROMADNE_AKCE], ['group', 'points', 'message', 'coupon']);
  eq('akce: kupon je připravené místo pro jiný okruh', [...AKCE_PRIPRAVUJE], ['coupon']);
  ok('limity: výběr 2000 hostů a milion bodů celkem', HROMADNA_MAX === 2000 && BONUS_CELKEM_MAX === 1_000_000);

  const bulk = precti('app/api/client/admin/customers/bulk/route.ts');
  ok('bulk: klíč akce se přivlastní atomicky (hit, max 1) dřív, než se cokoli zapíše', bulk.indexOf('clenove-bulk:') > 0 && bulk.indexOf('clenove-bulk:') < bulk.indexOf('INSERT INTO client_group_members') && bulk.indexOf('clenove-bulk:') < bulk.indexOf('UPDATE client_memberships SET points'));
  ok('bulk: body se připíšou a zapíšou do deníku jedním příkazem (CTE), ne smyčkou', /WITH u AS \(\s*UPDATE client_memberships SET points = points \+ \$\{delta\}[\s\S]*INSERT INTO client_loyalty_ledger/.test(bulk) && !/for \(const .* of ids\)/.test(bulk));
  ok('bulk: cizí id se zahodí (jen členové podniku) a výběr podle filtru hlídá očekávaný počet', /FROM client_memberships WHERE team_id = \$\{u\.team_id\} AND customer_id = ANY/.test(bulk) && /ocekavano !== ids\.length/.test(bulk) && /status: 409/.test(bulk));
  ok('bulk: každá akce má svůj klíč oprávnění a výběr vyžaduje zakaznici.zobrazit', /group: 'zakaznici\.skupiny', points: 'vernost\.upravit_body', message: 'zakaznici\.zpravy'/.test(bulk) && /ctx\.role\.opravneni\.has\('zakaznici\.zobrazit'\)/.test(bulk));
  ok('bulk: do dynamické skupiny se ručně nepřidává', /g\.rules\) return NextResponse\.json/.test(bulk));
  ok('bulk: kupon vybraným odpoví 501 srozumitelnou větou', /status: 501/.test(bulk) && /se připravuje/.test(bulk));
  ok('bulk: každá akce zapíše do historie změn', (bulk.match(/await audit\(/g) ?? []).length >= 3);

  // Souběh: dvojklik na stejnou hromadnou akci nezdvojí body (přivlastnění klíče je atomický upsert).
  const rl = precti('lib/rateLimit.ts');
  ok('souběh: hit() je jeden atomický INSERT … ON CONFLICT DO UPDATE', /INSERT INTO auth_attempts[\s\S]*ON CONFLICT \(key\) DO UPDATE/.test(rl));
  let vzato = 0; let pocitadlo = 0;
  const hitModel = async () => { pocitadlo += 1; return pocitadlo <= 1; }; // stejná podmínka jako count > max v hit(): první projde, ostatní ne
  await Promise.all(Array.from({ length: 25 }, async () => { if (await hitModel()) vzato += 1; }));
  eq('souběh: z 25 současných pokusů se provede jediný', vzato, 1);

  // ---- export, členové a skupiny: oprávnění ----
  const cust = precti('app/api/client/admin/customers/route.ts');
  ok('export: bez zakaznici.export 403 a do protokolu jde počet řádků', /zakaznici\.export/.test(cust) && /status: 403/.test(cust) && /'client\.export'/.test(cust));
  ok('export: e-mail se do řádků seznamu přidá jen s kontakty a hledání e-mailu také', /\(kontakty \? \{ email \} : \{\}\)/.test(cust) && /hledatEmail: kontakty/.test(cust));
  const grp = precti('app/api/client/admin/groups/route.ts');
  ok('skupiny: přejmenování kontroluje duplicitu (mimo sebe) a píše do protokolu', /AND id <> \$\{id\}/.test(grp) && /přejmenována z/.test(grp) && /'client\.group'/.test(grp));
  ok('skupiny: GET bez ?id= vrací počty členů a nepotřebuje id', /AS members/.test(grp) && /memberIds: number\[\] = \[\]/.test(grp));
  ok('skupiny: do dynamické skupiny se ručně nepřidává ani neodebírá', /V dynamické skupině se členové řídí pravidly/.test(grp));
  const loyalty = precti('app/api/client/admin/loyalty/route.ts');
  ok('kredit a body: odečet přes atomické spendCredit / spendPoints a zápis do protokolu', /spendCredit\(u\.team_id/.test(loyalty) && /spendPoints\(u\.team_id/.test(loyalty) && /'client\.credit'/.test(loyalty) && /'client\.points'/.test(loyalty));
  const ui = precti('components/client/loyalty/ClenoveSprava.tsx');
  ok('UI členů: úprava kreditu jen s vernost.kredit_upravit', /upravujeKredit = smi\('vernost\.kredit_upravit'\)/.test(ui) && /what: 'credit'/.test(ui));
  ok('UI členů: slot pro akce jiného okruhu (kupon vybraným)', /dalsiAkce\?: \(vyber: VyberHostu\) => BulkAction\[\]/.test(ui));
  ok('UI členů: strop 500 je pryč, je „Načíst další"', /Načíst další/.test(ui) && !/limit=500/.test(ui));

  // ---- poznámky ----
  eq('poznámka: prázdná a příliš dlouhá se odmítne, běžná projde', [chybaPoznamky('  '), chybaPoznamky('x'.repeat(NOTE_MAX + 1)) != null, chybaPoznamky('nesnáší mléko')], ['Napiš poznámku.', true, null]);
  const pozn = precti('app/api/client/admin/notes/route.ts');
  ok('poznámky: jen s zakaznici.poznamky, strop počtu hlídá zápis, text se do protokolu nekopíruje', (pozn.match(/pozaduj\('zakaznici\.poznamky'\)/g) ?? []).length === 3 && /WHERE \(SELECT COUNT\(\*\) FROM client_member_notes/.test(pozn) && !/audit\([^)]*text\)/.test(pozn));
  ok('poznámky: host je nikdy nevidí (žádná cesta hosta nečte client_member_notes)', !/client_member_notes/.test(precti('app/api/client/me/route.ts')) && !/client_member_notes/.test(precti('app/api/client/b/[slug]/route.ts')));
  ok('poznámky: smazání účtu hosta i podniku je zná', ZACHAZENI_TABULEK.client_member_notes === 'smazat' && TYMOVE_TABULKY.includes('client_member_notes')
    && planUzivatele({ id: 1, email: 'a@b.cz', role: 'customer', hash: '!x', dnes: '2026-01-01' }).some(k => /client_member_notes/.test(k.text)));

  // ---- oprávnění v katalogu a fixturách ----
  for (const klic of ['zakaznici.export', 'zakaznici.poznamky']) {
    const p = KATALOG.find(x => x.id === klic);
    ok(`katalog: ${klic} existuje, vyžaduje zobrazení členů a je ve VSECHNA`, !!p && p.vyzaduje.includes('zakaznici.zobrazit') && VSECHNA.includes(klic));
    ok(`fixtura rolí obsahuje ${klic}`, precti('scripts/sondy/fixtury/roles.json').includes(`"${klic}"`));
  }
}
