// Navíc (kolo 9, N1 — balík Z): klientská logika components/navic/logika.ts, katalog a stránky
// widgetu moje-smeny.navic, rozpad bodů „Navíc" v lib/odmenyPrehled.ts.
import type { Testy } from './_testy.ts';
import { odmenaKratce, pocetNavicKeSmene, popisekNabidky, predvyplnitText, premieZaNavic, sloucZapis, urlNavicMine } from '../../components/navic/logika.ts';
import { dnyHodnoceni, odkudBody, vyberOdmeny } from '../../lib/odmenyPrehled.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { stranka } from '../../lib/widgety/stranky/index.ts';
import type { Navic } from '../../lib/navic.ts';

const z = (p: Partial<Navic>): Navic => ({
  id: 1, userId: 3, userName: 'Eva', userAvatar: null, reportedBy: null, reportedByName: null, day: '2026-10-13', shiftId: null, closingId: null,
  taskId: null, offerId: null, offerTitle: null, text: 'Vytřela sklad', photoUrl: null, pointsProposed: null, status: 'ceka', points: null, bonusCzk: null,
  decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: null, createdAt: '2026-10-13T18:00:00.000Z', ...p,
});
const kc = (n: number) => `${n} Kč`;

export default function ({ eq, ok }: Testy) {
  // ---- adresy ----
  eq('url: vlastní bez filtru', urlNavicMine(), '/api/navic');
  eq('url: tablet za vybraného', urlNavicMine(16), '/api/navic?actingAs=16');
  eq('url: minulý měsíc (a za vybraného)', [urlNavicMine(null, '2026-09'), urlNavicMine(16, '2026-09')], ['/api/navic?month=2026-09', '/api/navic?month=2026-09&actingAs=16']);

  // ---- sloučení zápisu ----
  const seznam = [z({ id: 1 }), z({ id: 2, text: 'Umytá výloha' })];
  eq('sloučení: nový zápis jde na začátek', sloucZapis(seznam, z({ id: 3 })).map(x => x.id), [3, 1, 2]);
  eq('sloučení: změněný zápis se nahradí na místě', sloucZapis(seznam, z({ id: 2, status: 'uznano', points: 15 })).map(x => `${x.id}:${x.status}`), ['1:ceka', '2:uznano']);

  // ---- počet ke směně ----
  const zapisy = [z({ id: 1, shiftId: 701, day: '2026-10-10' }), z({ id: 2, shiftId: null, day: '2026-10-12' }), z({ id: 3, shiftId: 702, day: '2026-10-12', status: 'odmitnuto' }), z({ id: 4, shiftId: null, day: '2026-10-12', status: 'uznano', points: 5 })];
  eq('ke směně: podle shiftId', pocetNavicKeSmene(zapisy, { id: 701, date: '2026-10-10' }), 1);
  eq('ke směně: bez shiftId podle dne; odmítnutý se nepočítá', pocetNavicKeSmene(zapisy, { id: 702, date: '2026-10-12' }), 2);
  eq('ke směně: cizí den nic', pocetNavicKeSmene(zapisy, { id: 703, date: '2026-10-13' }), 0);
  eq('ke směně: směna bez id (pořadové číslo 0) se bere jen podle dne', pocetNavicKeSmene(zapisy, { id: 0, date: '2026-10-12' }), 2);

  // ---- popisky ----
  eq('popisek nabídky: název · body · prémie v měně podniku', popisekNabidky({ title: 'Vytřít sklad', points: 20, bonusCzk: 300 }, kc), 'Vytřít sklad · 20 b · 300 Kč');
  eq('popisek nabídky: bez bodů a prémie jen název', popisekNabidky({ title: 'Zaskočit', points: 0, bonusCzk: null }, kc), 'Zaskočit');
  eq('odměna krátce', [odmenaKratce({ points: 15, bonusCzk: null }, kc), odmenaKratce({ points: null, bonusCzk: 200 }, kc), odmenaKratce({ points: 0, bonusCzk: null }, kc)], ['+15 b', '200 Kč', '']);
  eq('předvyplnit text: prázdné ano, cizí text ne, název jiné položky ano', [
    predvyplnitText('  ', [{ title: 'A' }]), predvyplnitText('Vyřešil reklamaci', [{ title: 'A' }]), predvyplnitText('A', [{ title: 'A' }, { title: 'B' }]),
  ], [true, false, true]);

  // ---- prémie za navíc v Mém výdělku ----
  eq('prémie za navíc: jen source navic a jen kladné', premieZaNavic([
    { source: 'navic', amount: 300 }, { source: 'navic', amount: '200' }, { source: 'manual', amount: 500 }, { source: 'navic', amount: -50 }, { source: 'reward', amount: 100 },
  ]), { pocet: 2, castka: 500 });

  // ---- rozpad bodů: řádek Navíc jen když server posílá navicPoints ----
  const odpoved = { levels: [], points: { task: 5, procedure: 10, closing: 15 }, me: { points: 0, breakdown: { tasks: 1, procedures: 0, closings: 0, awards: 35, awardCount: 2 } } };
  const bezNavic = odkudBody(vyberOdmeny(odpoved).ja!.rozpad, vyberOdmeny(odpoved).sazebnik);
  ok('odkud body: bez navicPoints není řádek Navíc (starší server, body jsou v Pochvalách)', !bezNavic.some(r => r.klic === 'navic'));
  const sNavic = vyberOdmeny({ ...odpoved, me: { ...odpoved.me, breakdown: { ...odpoved.me.breakdown, navicPoints: 20, navicCount: 1 } } });
  const radky = odkudBody(sNavic.ja!.rozpad, sNavic.sazebnik);
  const navic = radky.find(r => r.klic === 'navic');
  eq('odkud body: řádek Navíc s body, počtem a ikonou sparkle, před „U položek"', [navic?.body, navic?.pocet, navic?.ikona, radky.findIndex(r => r.klic === 'navic') < radky.findIndex(r => r.klic === 'polozky')], [20, 1, 'sparkle', true]);
  const dny = dnyHodnoceni({ reviews: [], items: [
    { work_date: '2026-10-13', kind: 'award', refId: 9, label: 'Navíc: Vytřela sklad', points: 20 },
    { work_date: '2026-10-13', kind: 'award', refId: 8, label: 'Díky za pomoc', points: 5 },
  ] });
  eq('zpětná vazba: pochvala s důvodem „Navíc: …" je druh navic, ostatní zůstávají award', dny[0].polozky.map(p => p.druh), ['navic', 'award']);

  // ---- katalog a stránky ----
  const w = widget('moje-smeny.navic');
  ok('katalog: widget moje-smeny.navic je hotový, S/M/L, výchozí M, pro zaměstnance i vedení', !!w && w.stav === 'hotovo' && w.velikosti.join('') === 'SML' && w.vychoziVelikost === 'M' && w.rozhrani.includes('zamestnanec') && w.rozhrani.includes('vedeni'));
  ok('katalog: brána navic.zapsat nebo navic.zobrazit_tym, akce zapsat jen s navic.zapsat', !!w && w.opravneni.nektere.includes('navic.zapsat') && w.opravneni.nektere.includes('navic.zobrazit_tym') && w.opravneni.pole?.['akce:zapsat'] === 'navic.zapsat');
  ok('katalog: rychlý filtr obdobi (tento / minulý měsíc)', !!w && w.rychlyFiltr === 'obdobi' && (w.nastaveni ?? []).some(n => n.klic === 'obdobi' && n.typ === 'vyber' && n.moznosti.map(m => m.id).join(',') === 'tento,minuly'));
  const domu = stranka('zamestnanec.domu')!.vychozi['typ:zamestnanec'] ?? [];
  const iDomu = domu.findIndex(x => x.w === 'moje-smeny.navic');
  // Kolo 11: mezi směnou a Navíc jsou Úkoly za body (obojí věc konce směny, úkoly za body první).
  eq('Domů: Navíc hned za Úkoly za body, ty hned za Nejbližší směnou (M)', [iDomu > 1 && domu[iDomu - 1].w, iDomu > 1 && domu[iDomu - 2].w, domu[iDomu]?.s], ['ukoly.za_body', 'moje.nejblizsi_smena', 'M']);
  const odmeny = stranka('zamestnanec.odmeny')!.vychozi['typ:zamestnanec'] ?? [];
  eq('Odměny: Navíc jako velká sekce za nástrojem', [odmeny.find(x => x.w === 'moje-smeny.navic')?.s, odmeny.findIndex(x => x.w === 'moje-smeny.navic') > odmeny.findIndex(x => x.w === 'nastroj')], ['L', true]);
  ok('Moje směny: Navíc mezi doporučenými', stranka('zamestnanec.moje_smeny')!.doporucene.includes('moje-smeny.navic'));
}
