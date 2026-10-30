// Tresty (kolo 10): čistá logika lib/tresty.ts — validace trestu a sazebníku, strop
// krácení prémie, souhrny, opakování, řazení, výběr z odpovědi, texty, oprávnění.
import type { Testy } from './_testy.ts';
import {
  DNI_ZPETNE, MAX_DELKA_TEXTU, cekaSpor, druhProNavrh, druhZKlice, jeNapomenuti, normalizujBody, normalizujKraceni, normalizujText,
  oznameniTrest, oznameniVyjadreni, platnyDen, platnyKlicNavrhu, poradiOpakovani, posunDni, seradTresty, souhrnTrestu, stavTrestu,
  stropKraceni, textNavrhu, trestText, trestyKUzaverce, urlTresty, validujDruh, validujTrest, vyberDataTrestu, vyberNavrhy, type Trest,
} from '../../lib/tresty.ts';
import { KATALOG, SYSTEMOVE_ROLE } from '../../lib/opravneniKatalog.ts';
import { KIOSK_BILA_LISTINA } from '../../lib/opravneni.ts';
import { AUDIT_POPISKY } from '../../lib/auditPopisky.ts';

const t = (p: Partial<Trest>): Trest => ({
  id: 1, userId: 3, userName: 'Eva', userAvatar: null, givenBy: 1, givenByName: 'Martin', day: '2026-10-13', shiftId: null, closingId: null,
  taskId: null, typeId: null, typeTitle: null, text: 'Pozdní příchod', photoUrl: null, points: 10, bonusCut: 0, status: 'plati', source: 'rucne',
  sourceKey: null, seenAt: null, response: null, responseAt: null, disputed: false, disputeHandledAt: null, cancelledBy: null, cancelledByName: null,
  cancelledAt: null, cancelNote: null, createdAt: '2026-10-13T18:00:00.000Z', ...p,
});
const kc = (n: number) => `${n} Kč`;
const DNES = '2026-10-14';

export default function ({ eq, ok }: Testy) {
  // ---- čísla a text ----
  eq('text: ořízne a sjednotí konce řádků', normalizujText('  Manko \r\nv kase  '), 'Manko\nv kase');
  eq('text: prázdný null, 501 znaků false', [normalizujText('  '), normalizujText('x'.repeat(MAX_DELKA_TEXTU + 1))], [null, false]);
  eq('body: celé 0–500, jinak false, prázdné null', [normalizujBody('20'), normalizujBody(0), normalizujBody(-5), normalizujBody(501), normalizujBody(2.5), normalizujBody('')], [20, 0, false, false, false, null]);
  eq('krácení: celé 0–5000', [normalizujKraceni(300), normalizujKraceni(5001), normalizujKraceni(null)], [300, false, null]);
  eq('den: dnes ano, zítra ne, 31 dní zpět ano, 32 ne', [platnyDen(DNES, DNES), platnyDen('2026-10-15', DNES), platnyDen(posunDni(DNES, -DNI_ZPETNE), DNES), platnyDen(posunDni(DNES, -DNI_ZPETNE - 1), DNES)], [DNES, null, '2026-09-13', null]);

  // ---- validace trestu ----
  const v = validujTrest({ userId: 3, text: 'Pozdě', day: '2026-10-13', points: '10', closingId: 0, typeId: '2' }, DNES);
  ok('trest: platný, vazby 0 = null, typ číslo', v.ok && v.trest.points === 10 && v.trest.bonusCut === 0 && v.trest.closingId === null && v.trest.typeId === 2 && v.trest.source === 'rucne');
  eq('trest: bez člověka', validujTrest({ text: 'X y' }, DNES), { ok: false, chyba: 'Vyber, koho se trest týká.' });
  eq('trest: bez textu', validujTrest({ userId: 3 }, DNES), { ok: false, chyba: 'Napiš, co se stalo.' });
  ok('trest: den v budoucnu neprojde', !validujTrest({ userId: 3, text: 'Pozdě', day: '2026-10-20' }, DNES).ok);
  ok('trest: záporné body neprojdou', !validujTrest({ userId: 3, text: 'Pozdě', points: -10 }, DNES).ok);
  const zNavrhu = validujTrest({ userId: 3, text: 'Pozdě', sourceKey: 'pozde:55' }, DNES);
  ok('trest z návrhu: zdroj podle klíče, bez bodů napomenutí', zNavrhu.ok && zNavrhu.trest.source === 'pozde' && zNavrhu.trest.sourceKey === 'pozde:55' && zNavrhu.trest.points === 0);
  // Spuštění (balík P): manko trestem není (§ 346b ZP, jen dohoda o odpovědnosti) — klíč manko:<id> neprojde.
  eq('trest z manka: odmítnut větou o dohodě o odpovědnosti', validujTrest({ userId: 3, text: 'Manko', sourceKey: 'manko:55' }, DNES), { ok: false, chyba: 'Manko řeš dohodou o odpovědnosti, ne trestem.' });
  ok('trest: nesmyslný klíč návrhu neprojde', !validujTrest({ userId: 3, text: 'Manko', sourceKey: 'cokoli:1' }, DNES).ok);
  ok('trest: fotka jen z uploadu nebo https', validujTrest({ userId: 3, text: 'Rozbitá sklenice', photoUrl: '/api/upload/abcdef12' }, DNES).ok && !validujTrest({ userId: 3, text: 'Rozbitá sklenice', photoUrl: 'javascript:x' }, DNES).ok);
  eq('klíč návrhu', [platnyKlicNavrhu('pozde:12'), platnyKlicNavrhu('vytka:x'), druhZKlice('vytka:9'), druhZKlice('nic')], [true, false, 'vytka', null]);

  // ---- sazebník ----
  const d = validujDruh({ title: ' Pozdní příchod ', points: 10, bonusCut: 0 });
  ok('sazebník: název oříznutý, krácení 0 = null', d.ok && d.druh.title === 'Pozdní příchod' && d.druh.bonusCut === null && d.druh.active === true);
  eq('sazebník: bez názvu', validujDruh({ points: 5 }), { ok: false, chyba: 'Napiš název prohřešku.' });
  ok('sazebník: 81 znaků neprojde', !validujDruh({ title: 'x'.repeat(81) }).ok);

  // ---- strop krácení ----
  eq('strop: prémie minus už krácené, nikdy záporně', [stropKraceni(1000, 300), stropKraceni(200, 500), stropKraceni(0, 0)], [700, 0, 0]);

  // ---- stavy a souhrny ----
  eq('napomenutí = bez bodů i krácení', [jeNapomenuti({ points: 0, bonusCut: 0 }), jeNapomenuti({ points: 5, bonusCut: 0 })], [true, false]);
  eq('spor: platný, nesouhlas, nevyřízený', [cekaSpor(t({ disputed: true })), cekaSpor(t({ disputed: true, disputeHandledAt: 'x' })), cekaSpor(t({ disputed: true, status: 'zruseno' }))], [true, false, false]);
  eq('chip stavu', [stavTrestu(t({})).text, stavTrestu(t({ seenAt: 'x' })).text, stavTrestu(t({ disputed: true, seenAt: 'x' })).text, stavTrestu(t({ status: 'zruseno' })).text],
    ['Nepotvrzeno', 'Vzato na vědomí', 'Nesouhlasí', 'Zrušeno']);
  const seznam = [
    t({ id: 1, points: 10, seenAt: 'x', day: '2026-10-10' }),
    t({ id: 2, points: 0, bonusCut: 0, day: '2026-10-12' }),
    t({ id: 3, points: 20, bonusCut: 300, disputed: true, seenAt: 'x', day: '2026-10-05' }),
    t({ id: 4, status: 'zruseno', points: 50, day: '2026-10-11' }),
    t({ id: 5, points: 5, day: '2026-09-30' }),
  ];
  eq('souhrn za říjen', souhrnTrestu(seznam, '2026-10'), { pocet: 3, napomenuti: 1, body: 30, kraceni: 300, nepotvrzenych: 1, sporu: 1, zrusenych: 1 });
  eq('řazení: spor, nepotvrzené, ostatní, zrušené na konci', seradTresty(seznam).map(x => x.id), [3, 2, 5, 1, 4]);
  eq('opakování: 3. pozdní příchod v měsíci', poradiOpakovani([t({ id: 1, typeId: 1, day: '2026-10-02' }), t({ id: 2, typeId: 1, day: '2026-10-08' }), t({ id: 3, typeId: 1, day: '2026-09-28' }), t({ id: 4, typeId: 1, day: '2026-10-09', status: 'zruseno' })],
    { userId: 3, typeId: 1, day: '2026-10-13' }), 3);
  eq('opakování: bez položky sazebníku null', poradiOpakovani([], { userId: 3, typeId: null, day: '2026-10-13' }), null);
  eq('tresty k uzávěrce', trestyKUzaverce([t({ id: 1, closingId: 9, day: '2026-10-01' }), t({ id: 2, day: '2026-10-13' }), t({ id: 3, day: '2026-10-13', userId: 8 })], { id: 9, day: '2026-10-13', lide: [3] }).map(x => x.id), [1, 2]);

  // ---- texty ----
  eq('trest text', [trestText({ points: 10, bonusCut: 0 }, kc), trestText({ points: 10, bonusCut: 300 }, kc), trestText({ points: 0, bonusCut: 0 }, kc)], ['−10 b', '−10 b · krácení 300 Kč', 'Napomenutí']);
  eq('text návrhu', [textNavrhu({ druh: 'pozde', minuty: 18, castka: null, poznamka: null }, kc), textNavrhu({ druh: 'manko', minuty: null, castka: 340, poznamka: null }, kc)],
    ['Pozdní příchod o 18 min.', 'Manko v uzávěrce 340 Kč.']);
  const en: Record<string, string> = { 'Pozdní příchod o {minuty} min.': 'Late arrival by {minuty} min.', 'Výtka z hodnocení směny.': 'Reprimand from shift review.' };
  const tEn = (k: string, h?: Record<string, string | number>) => (en[k] ?? k).replace(/\{(\w+)\}/g, (_, x: string) => String(h?.[x] ?? ''));
  eq('text návrhu v jazyce vedení (t)', [textNavrhu({ druh: 'pozde', minuty: 18, castka: null, poznamka: null }, kc, tEn), textNavrhu({ druh: 'vytka', minuty: null, castka: null, poznamka: null }, kc, tEn)],
    ['Late arrival by 18 min.', 'Reprimand from shift review.']);
  const druhy = [{ id: 1, title: 'Pozdní příchod', description: null, points: 10, bonusCut: null, active: true, createdAt: '' }, { id: 2, title: 'Manko v kase', description: null, points: 20, bonusCut: 200, active: true, createdAt: '' }];
  eq('položka sazebníku k návrhu', [druhProNavrh(druhy, 'pozde')?.id, druhProNavrh(druhy, 'manko')?.id, druhProNavrh(druhy, 'vytka')], [1, 2, null]);
  eq('oznámení trestu a napomenutí', [oznameniTrest({ points: 10, bonusCut: 0, text: 'Pozdě' }, kc).title, oznameniTrest({ points: 0, bonusCut: 0, text: 'Pozdě' }, kc).title], ['Trest: −10 b', 'Napomenutí']);
  ok('oznámení vyjádření: nesouhlas je v titulku', oznameniVyjadreni('Eva', true, 'Nebyla jsem tam').title.includes('nesouhlasí'));

  // ---- výběr z odpovědi ----
  const data = vyberDataTrestu({ items: [{ id: '5', userId: 3, day: '2026-10-13T00:00:00', status: 'bla', points: '-10', closingId: null }, { bez: 'id' }], druhy: [{ id: 1, title: 'X', points: '15' }], smi: { udelit: true } });
  eq('výběr: cizí stav = plati, body nikdy záporně, bez id pryč, vazby null', [data.items.length, data.items[0].status, data.items[0].points, data.items[0].closingId, data.druhy[0].points, data.smi.udelit, data.smi.tym], [1, 'plati', 0, null, 15, true, false]);
  eq('výběr návrhů: cizí druh pryč', vyberNavrhy({ navrhy: [{ klic: 'pozde:1', druh: 'pozde', userId: 3, day: '2026-10-13', minuty: 18 }, { klic: 'x:1', druh: 'jine', userId: 3, day: '2026-10-13' }] }).map(n => n.minuty), [18]);
  eq('url: filtry', urlTresty({ scope: 'team', status: 'plati', month: '2026-10', userId: 3 }), '/api/tresty?scope=team&status=plati&month=2026-10&userId=3');

  // ---- oprávnění a audit ----
  const klice = new Set(KATALOG.map(k => k.id));
  ok('katalog zná tresty.*', ['tresty.zobrazit_tym', 'tresty.udelit', 'tresty.sazebnik'].every(k => klice.has(k)));
  ok('udělit a sazebník vyžadují vidět tým', ['tresty.udelit', 'tresty.sazebnik'].every(k => KATALOG.find(x => x.id === k)?.vyzaduje.includes('tresty.zobrazit_tym')));
  const role = (k: string) => new Set(SYSTEMOVE_ROLE.find(r => r.klic === k)?.opravneni ?? []);
  ok('vedení a provozní udělují, účetní jen vidí, barista nic', role('vedeni').has('tresty.udelit') && role('provozni').has('tresty.sazebnik') && role('ucetni').has('tresty.zobrazit_tym') && !role('ucetni').has('tresty.udelit') && !role('barista').has('tresty.zobrazit_tym'));
  ok('tablet tresty nedává', ![...KIOSK_BILA_LISTINA].some(k => k.startsWith('tresty.')));
  ok('audit má popisky tresty.*', ['tresty.udelit', 'tresty.upravit', 'tresty.zrusit', 'tresty.vyjadreni', 'tresty.sazebnik.pridat'].every(k => typeof (AUDIT_POPISKY as Record<string, string>)[k] === 'string'));
}
