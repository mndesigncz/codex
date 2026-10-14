// Úkoly za body (kolo 11 — balík Z): klientská logika components/navic/logika.ts (akce podle stavu,
// odznak, malá karta, obsazenost, povinná fotka), katalog widgetu ukoly.za_body a výchozí rozložení.
import type { Testy } from './_testy.ts';
import {
  ARG_ZA_BODY, akceUkolu, chybiPovinnaFotka, krestni, obsazeneNabidky, ostatni, pocetKVzeti, souhrnZaBody, urlUkolyZaBody, volnaMista,
} from '../../components/navic/logika.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { stranka } from '../../lib/widgety/stranky/index.ts';
import type { NabidkaNavic, StavUkoluNavic, UkolNavic } from '../../lib/navic.ts';

const n = (p: Partial<NabidkaNavic>): NabidkaNavic => ({
  id: 1, title: 'Vytřít sklad', description: null, points: 20, bonusCzk: null, autoApprove: false, active: true, validFrom: null, validTo: null,
  maxPerDay: 1, recurrence: 'denne', recDays: [], recInterval: null, capacity: 1, requirePhoto: false, targetUsers: [], createdAt: '', ...p,
});
const u = (stav: StavUkoluNavic, p: Partial<NabidkaNavic> = {}, o: Partial<UkolNavic> = {}): UkolNavic => ({
  nabidka: n(p), termin: '2026-10-14', obsazeno: 0, stav, mojeZapisy: 0, workId: null, kdo: [], ...o,
});

export default function ({ eq, ok }: Testy) {
  // ---- adresy a argument ----
  eq('url: vlastní úkoly za body', urlUkolyZaBody(), '/api/navic/ukoly');
  eq('url: tablet za vybraného', urlUkolyZaBody(16), '/api/navic/ukoly?actingAs=16');
  eq('arg z oznámení: za-body (smlouva s push odkazem /employee/shifts?view=tasks&arg=za-body)', ARG_ZA_BODY, 'za-body');

  // ---- akce podle stavu ----
  eq('akce: s kapacitou volný → Beru si', akceUkolu(u('volne')), ['vzit']);
  eq('akce: bez kapacity volný → rovnou Hotovo', akceUkolu(u('volne', { capacity: null })), ['hotovo']);
  eq('akce: vzatý → Hotovo a Vrátit', akceUkolu(u('vzato')), ['hotovo', 'vratit']);
  eq('akce: neprošlo → jde znovu (Beru si)', akceUkolu(u('odmitnuto')), ['vzit']);
  eq('akce: čeká, uznáno, obsazeno → nic', [akceUkolu(u('ceka')), akceUkolu(u('uznano')), akceUkolu(u('plno'))], [[], [], []]);
  eq('akce: tablet po odchodu — nic se nebere, jen Hotovo (i u vzatého)', [akceUkolu(u('volne'), true), akceUkolu(u('vzato'), true), akceUkolu(u('plno'), true)], [['hotovo'], ['hotovo'], []]);

  // ---- odznak a malá karta ----
  const ukoly = [u('volne', { id: 1, points: 20 }), u('odmitnuto', { id: 2, points: 15 }), u('vzato', { id: 3, points: 50 }), u('plno', { id: 4, points: 30 }), u('uznano', { id: 5, points: 10 })];
  eq('odznak: k vzetí jsou volné a „zkus znovu" (ne vzaté, plné ani hotové)', pocetKVzeti(ukoly), 2);
  const s = souhrnZaBody(ukoly);
  eq('malá karta: 2 úkoly · až +35 b, první volný je ten za 20 b', [s.kVzeti, s.body, s.prvni?.nabidka.id], [2, 35, 1]);
  eq('malá karta: nic k vzetí → 0 a bez prvního', [souhrnZaBody([u('uznano')]).kVzeti, souhrnZaBody([]).prvni], [0, null]);

  // ---- obsazenost a kdo ----
  eq('místa: kapacita 2, obsazeno 1 → 1 z 2 volné', volnaMista(u('volne', { capacity: 2 }, { obsazeno: 1 })), { volno: 1, z: 2 });
  eq('místa: bez kapacity nic', volnaMista(u('volne', { capacity: null })), null);
  eq('místa: nikdy záporná', volnaMista(u('plno', { capacity: 1 }, { obsazeno: 3 })), { volno: 0, z: 1 });
  const kdo = u('volne', { capacity: 3 }, { kdo: [{ userId: 4, name: 'Eva Svobodová', stav: 'vzato' }, { userId: 16, name: 'Já', stav: 'vzato' }, { userId: 5, name: 'Jakub Horák', stav: 'hotovo' }] });
  eq('kdo: bez mě — kdo bere a kdo už udělal', ostatni(kdo, 16), { berou: ['Eva Svobodová'], hotovo: ['Jakub Horák'] });
  eq('kdo: křestní jméno do chipu', [krestni('Eva Svobodová'), krestni('  Jakub  '), krestni('Martin')], ['Eva', 'Jakub', 'Martin']);
  eq('okno: plné úkoly jdou do pilulek jako „Obsazeno"', [...obsazeneNabidky(ukoly)], [4]);

  // ---- povinná fotka ----
  ok('fotka: povinná a chybí → neodeslat', chybiPovinnaFotka(n({ requirePhoto: true }), null));
  ok('fotka: povinná a je → odeslat', !chybiPovinnaFotka(n({ requirePhoto: true }), '/api/upload/abcdef12'));
  ok('fotka: nepovinná nebo bez úkolu → odeslat', !chybiPovinnaFotka(n({}), null) && !chybiPovinnaFotka(null, null));

  // ---- katalog a rozložení ----
  const w = widget('ukoly.za_body');
  ok('katalog: ukoly.za_body je hotový, S/M/L, výchozí M', !!w && w.stav === 'hotovo' && w.velikosti.join() === 'S,M,L' && w.vychoziVelikost === 'M');
  eq('katalog: přidáno 2026-10-14 (doplní se do uložených rozložení)', w?.pridano, '2026-10-14');
  eq('katalog: zaměstnanec, vedení (vidí své) a tablet', [...(w?.rozhrani ?? [])].sort(), ['kiosk', 'vedeni', 'zamestnanec']);
  eq('katalog: brána navic.zapsat (jako GET /api/navic/ukoly pro vlastní úkoly)', w?.opravneni.nektere, ['navic.zapsat']);
  const domu = stranka('zamestnanec.domu')!.vychozi['typ:zamestnanec']!;
  const iZaBody = domu.findIndex(p => p.w === 'ukoly.za_body');
  const iSmena = domu.findIndex(p => p.w === 'moje.nejblizsi_smena');
  ok('Domů: Úkoly za body (M) ve výchozím rozložení hned za Nejbližší směnou, před Navíc', iZaBody === iSmena + 1 && domu[iZaBody].s === 'M' && iZaBody < domu.findIndex(p => p.w === 'moje-smeny.navic'));
  ok('Domů: Úkoly za body nad Úkoly na dnes (vidět bez posouvání)', iZaBody < domu.findIndex(p => p.w === 'ukoly.dnes'));
  const smena = stranka('kiosk.smena')!.vychozi['typ:kiosk']!;
  ok('Tablet: Úkoly za body ve výchozí Směně', smena.some(p => p.w === 'ukoly.za_body'));
  ok('Úkoly zaměstnance: widget jen v doporučených (sekce je v nástroji)', stranka('zamestnanec.ukoly')!.doporucene.includes('ukoly.za_body') && !stranka('zamestnanec.ukoly')!.vychozi['typ:zamestnanec']!.some(p => p.w === 'ukoly.za_body'));
}
