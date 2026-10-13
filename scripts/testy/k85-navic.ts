// Navíc (kolo 9, N1): čistá logika lib/navic.ts — validace zápisu a nabídky, přechody
// stavů, souhrny, výběr z odpovědi, texty oznámení.
import type { Testy } from './_testy.ts';
import {
  DNI_ZPETNE, MAX_DELKA_TEXTU, limitNabidkyVycerpan, nabidkaPlatna, normalizujBody, normalizujPremii, normalizujText, odmenaText,
  oznameniNovyZapis, oznameniRozhodnuti, platnyDen, posunDni, prechodDovolen, seradNavic, souhrnNavic, stavNavic, urlNavic, uznaniPlatne,
  validujNabidku, validujZapis, vyberDataNavic, zapisyKUzaverce, type Navic,
} from '../../lib/navic.ts';
import { KATALOG, SYSTEMOVE_ROLE } from '../../lib/opravneniKatalog.ts';
import { KIOSK_BILA_LISTINA } from '../../lib/opravneni.ts';
import { OBLASTI_AUDITU, AUDIT_POPISKY } from '../../lib/auditPopisky.ts';

const z = (p: Partial<Navic>): Navic => ({
  id: 1, userId: 3, userName: 'Eva', userAvatar: null, reportedBy: null, reportedByName: null, day: '2026-10-13', shiftId: null, closingId: null,
  taskId: null, offerId: null, offerTitle: null, text: 'Vytřela sklad', photoUrl: null, pointsProposed: null, status: 'ceka', points: null, bonusCzk: null,
  decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: null, createdAt: '2026-10-13T18:00:00.000Z', ...p,
});
const kc = (n: number) => `${n} Kč`;

export default function ({ eq, ok }: Testy) {
  // ---- text a čísla ----
  eq('text: ořízne, sjednotí konce řádků a smaže mezery před nimi', normalizujText('  Vytřela \r\nsklad  '), 'Vytřela\nsklad');
  eq('text: prázdný = null', normalizujText('   '), null);
  eq('text: jeden znak = false (moc krátké)', normalizujText('a'), false);
  eq('text: 501 znaků = false', normalizujText('x'.repeat(MAX_DELKA_TEXTU + 1)), false);
  eq('body: 20 projde', normalizujBody(20), 20);
  eq('body: prázdné = null', normalizujBody(''), null);
  eq('body: záporné, desetinné a 501 = false', [normalizujBody(-1), normalizujBody(2.5), normalizujBody(501)], [false, false, false]);
  eq('prémie: 300 projde, 5001 ne', [normalizujPremii(300), normalizujPremii(5001)], [300, false]);
  // ---- den ----
  eq('den: dnes projde', platnyDen('2026-10-13', '2026-10-13', false), '2026-10-13');
  eq('den: zítra neprojde ani vedení', platnyDen('2026-10-14', '2026-10-13', true), null);
  eq('den: zaměstnanec 14 dní zpětně ano, 15 ne', [platnyDen(posunDni('2026-10-13', -DNI_ZPETNE), '2026-10-13', false), platnyDen(posunDni('2026-10-13', -DNI_ZPETNE - 1), '2026-10-13', false)], [posunDni('2026-10-13', -14), null]);
  eq('den: vedení i rok zpětně', platnyDen('2025-10-13', '2026-10-13', true), '2025-10-13');
  eq('posunDni přes měsíc', posunDni('2026-10-01', -1), '2026-09-30');
  // ---- zápis ----
  const v = validujZapis({ text: 'Vytřela sklad', day: '2026-10-13', shiftId: '12', offerId: 2, photoUrl: '/api/upload/abc123' }, '2026-10-13', false);
  ok('zápis: platný projde', v.ok);
  if (v.ok) eq('zápis: vazby jako čísla, fotka zachována', [v.zapis.shiftId, v.zapis.offerId, v.zapis.closingId, v.zapis.photoUrl], [12, 2, null, '/api/upload/abc123']);
  const v2 = validujZapis({ text: '' }, '2026-10-13', false);
  ok('zápis: bez textu neprojde s hláškou', !v2.ok && v2.chyba.includes('Napiš'));
  const v3 = validujZapis({ text: 'Něco', photoUrl: 'javascript:alert(1)' }, '2026-10-13', false);
  ok('zápis: fotka jen z /api/upload nebo https', !v3.ok);
  const v4 = validujZapis({ text: 'Něco' }, '2026-10-13', false);
  if (v4.ok) eq('zápis: bez dne = dnes', v4.zapis.day, '2026-10-13');
  // ---- nabídka ----
  const n = validujNabidku({ title: ' Vytřít sklad ', points: '20', bonusCzk: 0, autoApprove: true, maxPerDay: 1 });
  ok('nabídka: platná projde', n.ok);
  if (n.ok) eq('nabídka: název oříznutý, body číslo, prémie 0 = null', [n.nabidka.title, n.nabidka.points, n.nabidka.bonusCzk, n.nabidka.autoApprove, n.nabidka.maxPerDay], ['Vytřít sklad', 20, null, true, 1]);
  ok('nabídka: bez názvu neprojde', !validujNabidku({ points: 5 }).ok);
  ok('nabídka: od > do neprojde', !validujNabidku({ title: 'X', validFrom: '2026-10-20', validTo: '2026-10-10' }).ok);
  ok('nabídka: limit 0 neprojde', !validujNabidku({ title: 'X', maxPerDay: 0 }).ok);
  eq('nabídka platná: aktivní bez intervalu', nabidkaPlatna({ active: true, validFrom: null, validTo: null }, '2026-10-13'), true);
  eq('nabídka platná: prošlá do', nabidkaPlatna({ active: true, validFrom: null, validTo: '2026-10-12' }, '2026-10-13'), false);
  eq('nabídka platná: vypnutá', nabidkaPlatna({ active: false, validFrom: null, validTo: null }, '2026-10-13'), false);
  eq('limit za den: 1× už zapsáno (čeká) = vyčerpáno; odmítnuté se nepočítá', [
    limitNabidkyVycerpan({ id: 1, maxPerDay: 1 }, [{ offerId: 1, status: 'ceka' }]),
    limitNabidkyVycerpan({ id: 1, maxPerDay: 1 }, [{ offerId: 1, status: 'odmitnuto' }]),
    limitNabidkyVycerpan({ id: 1, maxPerDay: null }, [{ offerId: 1, status: 'uznano' }, { offerId: 1, status: 'uznano' }]),
  ], [true, false, false]);
  // ---- stavy ----
  eq('přechod: ceka → uznano / odmitnuto ano, zpět na ceka ne, stejný ne', [prechodDovolen('ceka', 'uznano'), prechodDovolen('ceka', 'odmitnuto'), prechodDovolen('uznano', 'ceka'), prechodDovolen('uznano', 'uznano'), prechodDovolen('uznano', 'odmitnuto'), prechodDovolen('odmitnuto', 'uznano')], [true, true, false, false, true, true]);
  eq('uznání: 0 bodů výslovně = platné, nic = neplatné', [uznaniPlatne(0, null), uznaniPlatne(null, 200), uznaniPlatne(null, null)], [true, true, false]);
  eq('stav chipu', [stavNavic('ceka').tone, stavNavic('uznano').tone, stavNavic('odmitnuto').tone], ['wait', 'ok', 'bad']);
  eq('odměna text', [odmenaText({ points: 20, bonusCzk: null }, kc), odmenaText({ points: 20, bonusCzk: 200 }, kc), odmenaText({ points: 0, bonusCzk: null }, kc)], ['+20 b', '+20 b · 200 Kč', 'bez odměny']);
  // ---- souhrny a řazení ----
  const seznam = [z({ id: 1, status: 'ceka', createdAt: '2026-10-13T10:00:00Z' }), z({ id: 2, status: 'uznano', points: 20, bonusCzk: 100, day: '2026-10-10', createdAt: '2026-10-10T10:00:00Z' }),
    z({ id: 3, status: 'odmitnuto', day: '2026-09-30', createdAt: '2026-09-30T10:00:00Z' }), z({ id: 4, status: 'ceka', createdAt: '2026-10-12T10:00:00Z' }), z({ id: 5, status: 'uznano', points: 5, day: '2026-10-01', createdAt: '2026-10-01T10:00:00Z' })];
  eq('souhrn za říjen', souhrnNavic(seznam, '2026-10'), { ceka: 2, uznano: 2, odmitnuto: 0, body: 25, premie: 100 });
  eq('souhrn za vše', souhrnNavic(seznam).odmitnuto, 1);
  eq('řazení: čekající nejstarší první, pak rozhodnuté od nejnovějšího', seradNavic(seznam).map(x => x.id), [4, 1, 2, 5, 3]);
  eq('zápisy k uzávěrce: svázané i ze dne osádky', zapisyKUzaverce([z({ id: 1, closingId: 9, day: '2026-10-01' }), z({ id: 2, day: '2026-10-13', userId: 3 }), z({ id: 3, day: '2026-10-13', userId: 8 }), z({ id: 4, day: '2026-10-13', userId: 3, closingId: 7 })], { id: 9, day: '2026-10-13', lide: [3] }).map(x => x.id), [1, 2]);
  // ---- výběr z odpovědi ----
  const data = vyberDataNavic({ items: [{ id: '5', userId: 3, day: '2026-10-13T00:00:00', status: 'bla', points: '20' }, { bez: 'id' }], nabidka: [{ id: 1, title: 'X', points: '15', autoApprove: 'ne' }], smi: { uznat: true } });
  eq('výběr: cizí stav = ceka, body číslo, den oříznutý, bez id vynecháno', [data.items.length, data.items[0].status, data.items[0].points, data.items[0].day], [1, 'ceka', 20, '2026-10-13']);
  eq('výběr: nabídka a smi', [data.nabidka[0].points, data.nabidka[0].autoApprove, data.smi.uznat, data.smi.zapsat, data.smi.tym], [15, false, true, true, false]);
  eq('url: filtry', urlNavic({ scope: 'team', status: 'ceka', mesic: '2026-10' }), '/api/navic?scope=team&status=ceka&month=2026-10');
  eq('url: bez filtru', urlNavic(), '/api/navic');
  // ---- oznámení ----
  eq('oznámení nový zápis', oznameniNovyZapis('Eva', 'Vytřela sklad'), { title: 'Eva zapsal(a) navíc', body: 'Vytřela sklad' });
  ok('oznámení rozhodnutí: uznáno nese odměnu, odmítnuto důvod', oznameniRozhodnuti(z({ status: 'uznano', points: 20 }), kc).title.includes('+20 b') && oznameniRozhodnuti(z({ status: 'odmitnuto', decisionNote: 'Patří k úkolu' }), kc).body.includes('Patří k úkolu'));
  // ---- katalog oprávnění, role, audit ----
  const klice = ['navic.zapsat', 'navic.zobrazit_tym', 'navic.uznat', 'navic.nabidka'];
  ok('katalog má všechny čtyři klíče navic.*', klice.every(k => KATALOG.some(o => o.id === k)));
  ok('uznat a nabídka vyžadují zobrazit_tym', ['navic.uznat', 'navic.nabidka'].every(k => KATALOG.find(o => o.id === k)!.vyzaduje.includes('navic.zobrazit_tym')));
  const role = (k: string) => new Set(SYSTEMOVE_ROLE.find(r => r.klic === k)!.opravneni);
  ok('vedení a provozní mají vše, barista jen zapsat, tablet jen zapsat (a je na bílé listině)',
    klice.every(k => role('vedeni').has(k) && role('provozni').has(k)) && role('barista').has('navic.zapsat') && !role('barista').has('navic.uznat')
    && role('kiosk').has('navic.zapsat') && KIOSK_BILA_LISTINA.has('navic.zapsat'));
  ok('audit: popisky navic.* a oblast odměny', ['navic.zapis', 'navic.uznano', 'navic.odmitnuto', 'navic.nabidka.pridat'].every(k => k in AUDIT_POPISKY) && OBLASTI_AUDITU.navic === 'odmeny');
}
