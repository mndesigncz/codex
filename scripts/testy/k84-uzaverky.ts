// Kolo 8, balík R8-5 (Uzávěrky, receptury a poznámky) — jednotkové testy čisté logiky.
//
// Výplata z kasy s výběrem člověka (lib/closing): pohyb „payout" nese userId, ostatní druhy ne;
// rozpis uzávěrky po lidech (vyplatyZKasyUzaverky) je to, z čeho Výplaty (GET /api/payroll)
// odečítají „už vyplaceno z kasy" — uzávěrka bez rozpisu patří autorovi jako v R8-1.

import type { Testy } from './_testy.ts';
import { normalizeMovements, normalizePhotos, vyplatyZKasyUzaverky, vyplatyICizim, sumMovements, MAX_FOTEK_UZAVERKY } from '../../lib/closing.ts';
import {
  cekajiciNavrhy, dopadNaPorci, jeBezeZmeny, marzeProcenta, mnozstviText, mujPosledniNavrh, normalizujSuroviny, odkazNaNavodZEditoru, popisRozdilu,
  recepturZmenenychZaDni, rezimEditoru, rozdilVerzi, vyberHistorii, vyberNavrhy, type NavrhReceptury,
} from '../../lib/recepturyVerze.ts';
import { KATALOG, SYSTEMOVE_ROLE } from '../../lib/opravneniKatalog.ts';
import { AUDIT_POPISKY } from '../../lib/auditPopisky.ts';
import { ZACHAZENI_TABULEK, TYMOVE_TABULKY } from '../../lib/smazaniUctu.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import {
  TYPY_POZNAMEK, OPRAVNENI_SPRAVY_POZNAMEK, jeTypPoznamky, kategorieOznameni, kusyTextu, najdiZminky, navrhyZminek, odkazNaPoznamku,
  urlPoctu, vlozZminku, vyberPocty, vyberPoznamky,
} from '../../lib/poznamky.ts';

export default function ({ eq, ok }: Testy) {
  // ---- pohyby: komu se vyplácelo ----
  const pohyby = normalizeMovements([
    { kind: 'payout', amount: 1200, userId: 7, userName: ' Petr Novák ' },
    { kind: 'payout', amount: '800', note: 'záloha' },
    { kind: 'expense', amount: 150, userId: 7, userName: 'Petr', note: 'mléko' },
    { kind: 'payout', amount: 0, userId: 9 },
    { kind: 'payout', amount: 500, userId: 'x', userName: '' },
  ]);
  eq('normalizeMovements: userId a jméno jen u výplaty, nula se zahodí, nečíselné id pryč',
    pohyby,
    [
      { kind: 'payout', amount: 1200, note: undefined, userId: 7, userName: 'Petr Novák' },
      { kind: 'payout', amount: 800, note: 'záloha' },
      { kind: 'expense', amount: 150, note: 'mléko' },
      { kind: 'payout', amount: 500, note: undefined },
    ]);
  eq('normalizeMovements: jméno nejvýš 80 znaků', normalizeMovements([{ kind: 'payout', amount: 1, userId: 1, userName: 'a'.repeat(100) }])[0].userName?.length, 80);
  eq('sumMovements: výplaty se sčítají bez ohledu na příjemce', sumMovements(pohyby, 'payout'), 2500);

  // ---- rozpis po lidech ----
  eq('vyplaty: bez pohybů patří self_payout autorovi', vyplatyZKasyUzaverky({ created_by: 16, self_payout: 900, movements: [] }), [{ userId: 16, castka: 900 }]);
  eq('vyplaty: nula bez pohybů = nic', vyplatyZKasyUzaverky({ created_by: 16, self_payout: 0 }), []);
  eq('vyplaty: pohyby rozepíšou po lidech, bez userId autor, stejný člověk se sečte',
    vyplatyZKasyUzaverky({ created_by: 16, self_payout: 2500, movements: pohyby }),
    [{ userId: 7, castka: 1200, jmeno: 'Petr Novák' }, { userId: 16, castka: 1300, jmeno: undefined }]);
  eq('vyplaty: s pohyby se self_payout nebere (součet je v pohybech)',
    vyplatyZKasyUzaverky({ created_by: 16, self_payout: 99999, movements: [{ kind: 'payout', amount: 300, userId: 7 }] }), [{ userId: 7, castka: 300, jmeno: undefined }]);
  ok('vyplatyICizim: jen autor → ne', !vyplatyICizim({ created_by: 16, self_payout: 500, movements: [{ kind: 'payout', amount: 500, userId: 16 }] }));
  ok('vyplatyICizim: kolega → ano', vyplatyICizim({ created_by: 16, self_payout: 500, movements: [{ kind: 'payout', amount: 500, userId: 7 }] }));
  // Výplatní listina (R8-1) sčítá po `user_id`, ne po autorovi: 1 200 Petrovi, 1 300 Evě.
  const listina = new Map<number, number>();
  for (const v of vyplatyZKasyUzaverky({ created_by: 16, self_payout: 2500, movements: pohyby })) listina.set(v.userId, (listina.get(v.userId) ?? 0) + v.castka);
  eq('listina: Petr 1 200, Eva 1 300, dohromady self_payout', [listina.get(7), listina.get(16), [...listina.values()].reduce((a, b) => a + b, 0)], [1200, 1300, 2500]);

  // ---- odkaz na návod z editoru receptury (oprava-odkaz-navodu-z-receptury) ----
  eq('návod z receptury: zaměstnanec zůstane v /employee', odkazNaNavodZEditoru('zamestnanec.receptury', 12), '/employee/shifts?view=guides&guide=12');
  eq('návod z receptury: vedení /employer', odkazNaNavodZEditoru('vedeni.receptury', 12), '/employer/overview?view=guides&guide=12');

  // ---- historie receptury: rozdíl verzí ----
  const kava = { itemId: 2, itemName: 'Káva zrnková', amount: 0.018, unit: 'kg' };
  const mleko = { itemId: 1, itemName: 'Mléko', amount: 0.2, unit: 'l' };
  const sirup = { itemId: 5, itemName: 'Sirup', amount: 0.015, unit: 'l' };
  const stara = [kava, mleko];
  const nova = [{ ...kava, amount: 0.022 }, sirup];
  const r = rozdilVerzi(stara, nova);
  eq('rozdíl: změněno množství, přidáno, odebráno', [r.zmeneno.map(z => [z.itemName, z.pred, z.po]), r.pridano.map(p => p.itemName), r.odebrano.map(o => o.itemName)],
    [[['Káva zrnková', 0.018, 0.022]], ['Sirup'], ['Mléko']]);
  ok('rozdíl: stejné snímky = beze změny', jeBezeZmeny(rozdilVerzi(stara, [mleko, kava])));
  eq('množství čitelně: 0,018 kg → 18 g, 0,2 l → 2 dl, 2 ks', [mnozstviText(0.018, 'kg'), mnozstviText(0.2, 'l'), mnozstviText(2, 'ks'), mnozstviText(1.5, 'kg')], ['18 g', '2 dl', '2 ks', '1,5 kg']);
  eq('popis rozdílu do auditu: „Káva 18 g → 22 g · + Sirup 15 ml · − Mléko"', popisRozdilu(r), 'Káva zrnková 18 g → 22 g · + Sirup 15 ml · − Mléko');
  eq('popis prázdného rozdílu', popisRozdilu(rozdilVerzi(stara, stara)), 'beze změny');
  eq('dopad na porci a marže', [dopadNaPorci(12.5, 15.7), dopadNaPorci(null, 3), marzeProcenta(75, 15.7), marzeProcenta(0, 1), marzeProcenta(75, null)], [3.2, null, 79, null, null]);
  eq('normalizujSuroviny: strop bere prvních N řádků vstupu', normalizujSuroviny([{ itemId: 1, amount: 0 }, { itemId: 3, amount: 0.5 }], 1), []);
  eq('normalizujSuroviny: platné řádky', normalizujSuroviny([{ itemId: 1, amount: 0 }, { itemId: 'x', amount: 1 }, { itemId: 3, amount: '0.5', itemName: 'Cukr', unit: 'kg' }]), [{ itemId: 3, itemName: 'Cukr', amount: 0.5, unit: 'kg' }]);
  const ted = Date.parse('2026-10-13T12:00:00Z');
  const verze = vyberHistorii({ versions: [
    { id: 3, productId: 'p1', changedAt: '2026-10-12T10:00:00Z', ingredients: nova, costPerPortion: '15.7', changedBy: { id: 7, name: 'Petra' } },
    { id: 2, productId: 'p2', changedAt: '2026-10-11T10:00:00Z' },
    { id: 1, productId: 'p1', changedAt: '2026-10-01T10:00:00Z', ingredients: stara },
    { id: 0, productId: 'p3', changedAt: 'nesmysl' },
  ] });
  eq('vyberHistorii: tvar a čísla', [verze.length, verze[0].costPerPortion, verze[0].changedBy?.name, verze[1].ingredients.length, verze[1].costPerPortion], [4, 15.7, 'Petra', 0, null]);
  eq('změněno za 7 dní: p1 a p2 (p1 z 1. 10. už ne, nečitelný čas ne)', recepturZmenenychZaDni(verze, ted), 2);
  let spadlo = false;
  try { vyberHistorii([]); } catch { spadlo = true; }
  ok('vyberHistorii: pole místo objektu je chyba tvaru, ne prázdno', spadlo);

  // ---- návrhy úprav ----
  const navrhy: NavrhReceptury[] = vyberNavrhy({ proposals: [
    { id: 1, productId: 'p1', status: 'ceka', createdAt: '2026-10-12T10:00:00Z', muj: true, ingredients: nova, puvodni: stara, reason: 'sladší sirup' },
    { id: 2, productId: 'p1', status: 'vraceno', createdAt: '2026-10-10T10:00:00Z', muj: true, reviewNote: 'moc kávy', reviewer: { id: 15, name: 'Martin' } },
    { id: 3, productId: 'p2', status: 'ceka', createdAt: '2026-10-11T10:00:00Z', muj: false },
    { id: 4, productId: 'p2', status: 'blbost', createdAt: '2026-10-09T10:00:00Z' },
  ] });
  eq('vyberNavrhy: neznámý stav = čeká, jména a poznámka', [navrhy.length, navrhy[3].status, navrhy[1].reviewer?.name, navrhy[1].reviewNote], [4, 'ceka', 'Martin', 'moc kávy']);
  eq('čekající návrhy od nejstaršího', cekajiciNavrhy(navrhy).map(n => n.id), [4, 3, 1]);
  eq('můj poslední návrh k p1 je ten čekající, k p2 žádný', [mujPosledniNavrh(navrhy, 'p1')?.id, mujPosledniNavrh(navrhy, 'p2')], [1, null]);
  eq('režim editoru podle oprávnění', [
    rezimEditoru(k => k === 'receptury.upravit'), rezimEditoru(k => k === 'receptury.navrhnout'), rezimEditoru(() => false), rezimEditoru(() => true),
  ], ['upravit', 'navrhnout', 'cist', 'upravit']);

  // ---- katalog, role, audit, smazání účtu ----
  const klic = KATALOG.find(o => o.id === 'receptury.navrhnout');
  ok('oprávnění receptury.navrhnout je v katalogu a vyžaduje zobrazit', !!klic && klic.vyzaduje.includes('receptury.zobrazit'));
  for (const role of ['barista', 'kuchar', 'vedeni', 'provozni']) {
    ok(`role ${role} má receptury.navrhnout (kdo smí upravovat, smí i navrhnout)`, !!SYSTEMOVE_ROLE.find(r => r.klic === role)?.opravneni.includes('receptury.navrhnout'));
  }
  ok('tablet receptury nenavrhuje', !SYSTEMOVE_ROLE.find(r => r.klic === 'kiosk')?.opravneni.includes('receptury.navrhnout'));
  eq('widget Pokrytí recepturou: schválení s receptury.upravit, návrh s receptury.navrhnout',
    [widget('receptury.pokryti')?.opravneni.pole?.['akce:schvalit_navrh'], widget('receptury.pokryti')?.opravneni.pole?.['akce:navrhnout']], ['receptury.upravit', 'receptury.navrhnout']);
  for (const a of ['pos.recipe.navrh', 'pos.recipe.schvaleno', 'pos.recipe.vraceno']) ok(`audit ${a} má popisek`, typeof AUDIT_POPISKY[a] === 'string');
  for (const tb of ['pos_recipe_versions', 'pos_recipe_proposals']) {
    ok(`${tb}: rozhodnutí při smazání účtu a mazání s podnikem`, ZACHAZENI_TABULEK[tb] === 'ponechat' && TYMOVE_TABULKY.includes(tb));
  }

  // ---- poznámky: typy navíc, zmínky, připnutí, počty ----
  ok('typy poznámek: uzávěrka, akce a položka menu', ['closing', 'event', 'menu_item'].every(jeTypPoznamky) && TYPY_POZNAMEK.length === 9);
  eq('správa poznámek u nových typů', [OPRAVNENI_SPRAVY_POZNAMEK.closing, OPRAVNENI_SPRAVY_POZNAMEK.event, OPRAVNENI_SPRAVY_POZNAMEK.menu_item], ['uzaverky.mazat', 'akce.upravit', 'menu.upravit']);
  const lide = [{ id: 1, name: 'Petra Nováková' }, { id: 2, name: 'Petr Král' }, { id: 3, name: 'Eva Testová' }, { id: 4, name: 'Eva Malá' }];
  eq('zmínky: celé jméno, křestní jen když je jediné, bez diakritiky, ne „@Petrák"',
    najdiZminky('Ahoj @petra, @Petr Král a @eva – @Petrák to neřeší; @Eva Malá ano', lide), [1, 2, 4]);
  eq('zmínky: bez duplicit, v pořadí výskytu', najdiZminky('@Petr Král, pak @Petra Nováková, zase @petr král', lide), [2, 1]);
  eq('zmínky: nic', najdiZminky('bez zavináče', lide), []);
  eq('našeptávač: „@pe" nabídne Petru i Petra, „@ev" obě Evy, „@x" nic, mimo @ nic', [
    navrhyZminek('ahoj @pe', 8, lide)?.lide.map(l => l.id), navrhyZminek('@ev', 3, lide)?.lide.map(l => l.id), navrhyZminek('@x', 2, lide), navrhyZminek('ahoj', 4, lide), navrhyZminek('mail@pe', 7, lide),
  ], [[1, 2], [3, 4], null, null, null]);
  eq('našeptávač: dotaz s mezerou (příjmení) a konec řádku ho ukončí', [navrhyZminek('@eva t', 6, lide)?.lide.map(l => l.id), navrhyZminek('@eva\nnovy', 8, lide)], [[3], null]);
  eq('vložení zmínky nahradí rozepsané a posune kurzor', vlozZminku('ahoj @pe a dál', 5, 8, 'Petra Nováková'), { text: 'ahoj @Petra Nováková  a dál', kurzor: 21 });
  eq('kusy textu: zmínka se zvýrazní, zbytek ne', kusyTextu('Díky @Petra Nováková!', lide).map(k => [k.text, k.zminka]), [['Díky ', false], ['@Petra Nováková', true], ['!', false]]);
  const pz = vyberPoznamky([
    { id: 3, text: 'c', createdAt: '2026-10-03T00:00:00Z', autor: { id: 1, name: 'P' }, pripnuta: true },
    { id: 2, text: 'b', createdAt: '2026-10-02T00:00:00Z', autor: { id: 1, name: 'P' }, pripnuta: 'ano', zminky: ['3', 'x'] },
  ]);
  eq('vyberPoznamky: pořadí serveru (připnutá první), připnutí jen true, zmínky jako čísla', [pz.map(p => [p.id, p.pripnuta]), pz[1].zminky], [[[3, true], [2, false]], [3]]);
  eq('počty: adresa a výběr (nula se vynechá, jiný tvar je chyba)', [urlPoctu('task'), vyberPocty({ pocty: { '5': { n: 3, nove: true }, '6': { n: 0 } } })], ['/api/notes/pocty?typ=task', { '5': { n: 3, nove: true } }]);
  let spadloPocty = false; try { vyberPocty([]); } catch { spadloPocty = true; }
  ok('počty: pole je chyba tvaru', spadloPocty);
  eq('odkaz z oznámení: podle typu a rozhraní', [odkazNaPoznamku('closing', '5', 'vedeni'), odkazNaPoznamku('closing', '5', 'zamestnanec'), odkazNaPoznamku('guide', '12', 'zamestnanec'), odkazNaPoznamku('menu_item', '3', 'zamestnanec')],
    ['/employer/overview?view=reports', '/employee/shifts?view=closing', '/employee/shifts?view=guides&guide=12', '/employee/shifts?view=home']);
  eq('kategorie oznámení: úkol, uzávěrka, jinak obecná', [kategorieOznameni('task'), kategorieOznameni('closing'), kategorieOznameni('recipe')], ['task', 'closing', 'general']);
  ok('entity_note_reads: osobní stav čtení se maže s účtem i s podnikem', ZACHAZENI_TABULEK.entity_note_reads === 'smazat' && TYMOVE_TABULKY.includes('entity_note_reads'));

  // ---- fotky dokladů k uzávěrce ----
  eq('normalizePhotos: jen adresy /api/upload/<id>, neznámý druh = terminál, duplicita pryč, poznámka oříznutá',
    normalizePhotos([
      { url: '/api/upload/abc', druh: 'zreport', note: ' Z 12 ' }, { url: 'https://evil/x.png', druh: 'terminal' }, { url: '/api/upload/abc', druh: 'vydaj' },
      { url: '/api/upload/def', druh: 'cokoli' }, { url: '/api/upload/ghi', druh: 'vydaj', note: 'a'.repeat(200) }, 'nesmysl', null,
    ]),
    [{ url: '/api/upload/abc', druh: 'zreport', note: 'Z 12' }, { url: '/api/upload/def', druh: 'terminal' }, { url: '/api/upload/ghi', druh: 'vydaj', note: 'a'.repeat(160) }]);
  eq('normalizePhotos: strop a ne-pole', [normalizePhotos(Array.from({ length: 10 }, (_, i) => ({ url: `/api/upload/f${i}`, druh: 'vydaj' }))).length, normalizePhotos('x'), normalizePhotos(null)], [MAX_FOTEK_UZAVERKY, [], []]);
}
