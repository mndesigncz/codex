// Kolo 8, balík R8-7 (Managero client › Rezervace, Hodnocení) — čisté výpočty.
//
// Hlídá se to, co se dřív nedalo: host, který nedorazil, vypadal u další rezervace jako
// štamgast (žádný no_show), Minulé byly tiše uříznuté na 100, hodnocení se nedalo filtrovat
// ani na něj odpovědět, připomínka rezervace neexistovala.

import type { Testy } from './_testy.ts';
import {
  RES_STATUS, autoPotvrdit, NEDORAZENI_LIMIT, nedorazilNaRade, NEDORAZIL_PO_MIN, zpravaPripominky,
} from '../../lib/clientSlots.ts';
import { STRANKA as OBJEDNAVKY } from '../../lib/widgety/stranky/vedeni.klient_objednavky.ts';
import {
  vyberRezervace, vyberMesicRezervaci, vyberRezervaceHosta, muzeDo, hlavniKrok, klicPrechodu, nabidkaNedorazil, TON_REZERVACE, souhrnDne, souhrnDneRezervaci,
  varovaniHosta, cisliceTelefonu, HLEDANI_MIN, vyberHodnoceni, filtrujHodnoceni, poctyHodnoceni, jeNevyrizene, FILTRY_HODNOCENI, ODPOVED_MAX,
  type Recenze, type Rezervace,
} from '../../lib/klientPrehled.ts';

const vse = () => true;
const jenUsadit = (k: string) => k === 'rezervace.usadit';

const radek = (x: Partial<Record<string, unknown>> = {}) => ({
  id: 11, date: '2026-10-18', time: '19:00', party: 4, status: 'confirmed', note: null, customer_id: 101, customer_name: 'Jana Dvořáková',
  customer_visits: 9, customer_level: 'bronze', customer_level_label: 'Člen', ...x,
});

export default function ({ eq, ok }: Testy) {
  // ---- stav „Nedorazil" (rezervace-no-show) ----
  eq('no-show: nový stav má popisek a tón', [RES_STATUS.no_show.label, TON_REZERVACE.no_show], ['Nedorazil', 'bad']);
  eq('no-show: z potvrzené jde na no_show, z usazené ne, zpět jen na potvrzeno', [muzeDo('confirmed', 'no_show'), muzeDo('seated', 'no_show'), muzeDo('no_show', 'confirmed'), muzeDo('no_show', 'seated')], [true, false, true, false]);
  eq('no-show: hlavní krok u „Nedorazil" není (ne „Potvrdit")', hlavniKrok('no_show', vse), null);
  eq('no-show: vrácení omylu na potvrzeno chce usadit (práce u dveří), potvrzení požadavku schvalovat', [klicPrechodu('confirmed', 'no_show'), klicPrechodu('confirmed', 'requested'), klicPrechodu('confirmed'), klicPrechodu('no_show')], ['rezervace.usadit', 'rezervace.schvalovat', 'rezervace.schvalovat', 'rezervace.usadit']);
  const r = { stav: 'confirmed' as const, datum: '2026-10-18', cas: '19:00' };
  eq('no-show: před časem rezervace není na řadě, 30 min po něm ano', [nedorazilNaRade(r, '2026-10-18', '18:50'), nedorazilNaRade(r, '2026-10-18', '19:29'), nedorazilNaRade(r, '2026-10-18', '19:30')], [false, false, true]);
  eq('no-show: minulý den vždy, budoucí nikdy, jen potvrzené', [nedorazilNaRade(r, '2026-10-19', '08:00'), nedorazilNaRade(r, '2026-10-17', '23:59'), nedorazilNaRade({ ...r, stav: 'seated' }, '2026-10-19', '08:00')], [true, false, false]);
  eq('no-show: hranice je 30 minut', NEDORAZIL_PO_MIN, 30);
  eq('no-show: tlačítko až na řadě, dřív v „···", bez rezervace.usadit nikde', [nabidkaNedorazil(r, jenUsadit, true), nabidkaNedorazil(r, jenUsadit, false), nabidkaNedorazil(r, () => false, true), nabidkaNedorazil({ ...r, stav: 'done' }, vse, true)], ['tlacitko', 'menu', null, null]);
  const profil = { auto_confirm: true, auto_confirm_max_party: 0 };
  eq('no-show: od dvou nedorazení se host nepotvrdí sám (limit 2)', [NEDORAZENI_LIMIT, autoPotvrdit(profil, 2, 0), autoPotvrdit(profil, 2, 1), autoPotvrdit(profil, 2, 2), autoPotvrdit(profil, 2, 5)], [2, true, true, false, false]);
  ok('no-show: bez třetího argumentu jako dřív', autoPotvrdit(profil, 2));
  const seznam = vyberRezervace({ reservations: [radek({ customer_no_shows: 2, customer_reservations: 9, customer_spend: 4200, guest_confirmed_at: '2026-10-18 06:30:00', staff_notes: ['Alergie na ořechy', 'Rád sedí u okna'], customer_groups: [{ name: 'VIP', color: null }, { name: 'Firemní', color: '#fff' }, { name: 'Štamgasti' }] }), radek({ id: 12, customer_id: null, guest_name: 'Pavel Horák', status: 'no_show' })], tables: [], celkem: 240, pocty: { celkem: 240, nedorazeni: 6 } });
  const [j, p] = seznam.rezervace;
  eq('no-show: řádek nese počet nedorazení, rezervace celkem, útratu a „host potvrdil"', [j.nedorazeni, j.rezervaciCelkem, j.utrata, j.hostPotvrdil, j.hostId], [2, 9, 4200, true, 101]);
  eq('no-show: ručně zapsaný host bez účtu nemá nedorazení ani účet; stav no_show projde', [p.nedorazeni, p.hostId, p.stav, p.rucne], [null, null, 'no_show', true]);
  eq('seznam: celkem a počty pro Minulé', [seznam.celkem, seznam.minule], [240, { celkem: 240, nedorazeni: 6 }]);
  eq('seznam: bez počtů (Nadcházející) je celkem = délka a minule null', [vyberRezervace({ reservations: [radek()], tables: [] }).celkem, vyberRezervace({ reservations: [radek()], tables: [] }).minule], [1, null]);
  eq('souhrn dne widgetu nepočítá nedorazivší', souhrnDne(seznam.rezervace).dnes, 1);
  eq('detail člena: historie hosta', vyberRezervaceHosta({ souhrn: { celkem: 9, nedorazeni: 2, probehlo: 6, posledni: '2026-09-30' } }), { celkem: 9, nedorazeni: 2, probehlo: 6, posledni: '2026-09-30' });
  let spadlo = false;
  try { vyberRezervaceHosta({}); } catch { spadlo = true; }
  ok('detail člena: nečekaný tvar je chyba, ne nuly', spadlo);

  // ---- poznámky a skupiny hosta (rezervace-poznamky-hosta) ----
  eq('poznámky: řádek nese poslední poznámky a skupiny; první poznámka je i „poznámka personálu"', [j.poznamky, j.poznamkaPersonalu, j.skupiny.map(g => g.nazev)], [['Alergie na ořechy', 'Rád sedí u okna'], 'Alergie na ořechy', ['VIP', 'Firemní', 'Štamgasti']]);
  eq('poznámky: staré API jen se staff_note dá jednu poznámku', vyberRezervace({ reservations: [radek({ staff_note: 'Nesnáší mléko' })], tables: [] }).rezervace[0].poznamky, ['Nesnáší mléko']);
  eq('varování: alergie, bez lepku, vegan, laktóza, ořechy → první taková poznámka', [varovaniHosta(['Rád sedí u okna', 'Alergie na ořechy']), varovaniHosta(['bez lepku prosím']), varovaniHosta(['Veganka']), varovaniHosta(['laktózová intolerance'])], ['Alergie na ořechy', 'bez lepku prosím', 'Veganka', 'laktózová intolerance']);
  eq('varování: obyčejná poznámka ne', [varovaniHosta(['Oslava v pátek', 'VIP klient']), varovaniHosta([])], [null, null]);

  // ---- hledání a den (rezervace-hledani-a-den) ----
  eq('hledání: aspoň dva znaky; z telefonu jen číslice', [HLEDANI_MIN, cisliceTelefonu('+420 776 221 004'), cisliceTelefonu('Novák')], [2, '420776221004', '']);
  const den = [
    { stav: 'confirmed', osob: 4, cas: '19:00' }, { stav: 'confirmed', osob: 2, cas: '19:30' }, { stav: 'requested', osob: 6, cas: '18:00' },
    { stav: 'cancelled', osob: 8, cas: '19:15' }, { stav: 'no_show', osob: 3, cas: '12:00' },
  ] as Pick<Rezervace, 'stav' | 'osob' | 'cas'>[];
  eq('den: počet, osoby a špička bez zrušených a nedorazivších', souhrnDneRezervaci(den), { pocet: 3, osob: 12, spicka: '19:00' });
  eq('den: špička až od dvou v jedné hodině', souhrnDneRezervaci(den.slice(0, 1)).spicka, null);
  eq('kalendář: tečky jen pro dny s rezervacemi', vyberMesicRezervaci({ month: '2026-10', days: { '2026-10-18': 12, '2026-10-19': 0, 'x': 3 } }), { '2026-10-18': 12 });
  spadlo = false;
  try { vyberMesicRezervaci({ month: '2026-10' }); } catch { spadlo = true; }
  ok('kalendář: bez `days` je to chyba tvaru', spadlo);

  // ---- připomínka hostovi (rezervace-pripominka-hostovi) ----
  const dnes = zpravaPripominky({ id: 7, datum: '2026-10-18', cas: '18:00:00', osob: 4, podnik: 'Čajovna Pangea', slug: 'cajovna-pangea' }, '2026-10-18');
  eq('připomínka: dnes v 18:00 stůl pro 4, odkaz na stránku podniku s tou rezervací', [dnes.title, dnes.link, dnes.type], ['Dnes v 18:00 stůl pro 4 v Čajovna Pangea', '/client/cajovna-pangea?tab=reserve&rezervace=7', 'info']);
  eq('připomínka: zítřek slovem, jiný den datem, bez adresy podniku na Moje stránka', [zpravaPripominky({ id: 7, datum: '2026-10-19', cas: '18:00', osob: 2, podnik: 'X' }, '2026-10-18').title.slice(0, 5), zpravaPripominky({ id: 7, datum: '2026-10-25', cas: '18:00', osob: 2, podnik: 'X' }, '2026-10-18').title.slice(0, 11), zpravaPripominky({ id: 7, datum: '2026-10-19', cas: '18:00', osob: 2, podnik: 'X' }, '2026-10-18').link], ['Zítra', '25. 10. 202', '/client/me']);
  ok('připomínka: text říká Potvrdit / Zrušit', /Potvrď/.test(dnes.body) && /zruš/.test(dnes.body));

  // ---- objednávky: dnešní rezervace jen jednou (objednavky-dnesni-rezervace-dvakrat) ----
  const vychozi = (OBJEDNAVKY.vychozi?.['typ:vedeni'] ?? []).map(p => p.w);
  eq('objednávky: výchozí rozložení má nástroj (ten dnešní rezervace kreslí) a ne widget Dnešní rezervace', [vychozi.includes('nastroj'), vychozi.includes('klient.dnesni_rezervace')], [true, false]);
  ok('objednávky: widget Dnešní rezervace zůstává v Doporučených', (OBJEDNAVKY.doporucene ?? []).includes('klient.dnesni_rezervace'));

  // ---- hodnocení: filtr a odpověď (hodnoceni-filtr-odpoved) ----
  const h = vyberHodnoceni({ reviews: [
    { id: 1, ref: 'ord:12', rating: 5, note: 'Nejlepší matcha.', created_at: '2026-09-25 17:10:00', customer_name: 'Jana', reply: 'Díky!', replied_by_name: 'Martin', replied_at: '2026-09-26 09:00:00', resolved_at: null },
    { id: 2, ref: 'res:14', rating: 2, note: 'Dlouho jsme čekali.', created_at: '2026-09-24 19:40:00', customer_name: 'Petr' },
    { id: 3, ref: 'ord:9', rating: 4, note: null, created_at: '2026-09-20 12:00:00', customer_name: 'Tereza' },
    { id: 4, ref: 'res:3', rating: 1, note: 'Studené.', created_at: '2026-06-01 12:00:00', customer_name: 'Ota', resolved_at: '2026-06-02 08:00:00' },
  ], count: 61, avg: 4.62, dist: [2, 3, 5, 18, 33] });
  const [v1, v2, v3, v4] = h.posledni;
  eq('hodnocení: odpověď, autor, čas a vyřízeno z API', [v1.odpoved, v1.odpovedel, v1.odpovedenoKdy, v1.vyrizeno, v2.odpoved, v4.vyrizeno], ['Díky!', 'Martin', '2026-09-26 09:00:00', false, null, true]);
  eq('hodnocení: nevyřízené = slabé bez odpovědi a bez „vyřízeno"', [jeNevyrizene(v1), jeNevyrizene(v2), jeNevyrizene(v3), jeNevyrizene(v4)], [false, true, false, false]);
  const denZ = (kdy: string) => kdy.slice(0, 10);
  eq('hodnocení: počty na pilulkách', poctyHodnoceni(h.posledni), { vse: 4, slabe: 2, komentar: 3, nevyrizene: 1 });
  eq('hodnocení: filtr 1–2 ★, s komentářem, nevyřízené', [filtrujHodnoceni(h.posledni, 'slabe', null, denZ).map(x => x.id), filtrujHodnoceni(h.posledni, 'komentar', null, denZ).map(x => x.id), filtrujHodnoceni(h.posledni, 'nevyrizene', null, denZ).map(x => x.id)], [[2, 4], [1, 2, 4], [2]]);
  eq('hodnocení: období ořeže podle dne', filtrujHodnoceni(h.posledni, 'vse', { od: '2026-09-21', do: '2026-09-30' }, denZ).map(x => x.id), [1, 2]);
  eq('hodnocení: čtyři pilulky, odpověď nejvýš 1000 znaků', [FILTRY_HODNOCENI.map(f => f.id), ODPOVED_MAX], [['vse', 'slabe', 'komentar', 'nevyrizene'], 1000]);
  const bezOdpovedi: Recenze = { ...v2, odpoved: null, vyrizeno: false };
  ok('hodnocení: typ Recenze nese odpověď (nic nespadne bez ní)', bezOdpovedi.odpoved === null);
}
