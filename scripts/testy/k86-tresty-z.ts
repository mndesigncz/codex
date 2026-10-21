// Tresty (kolo 10 — balík Z): klientská logika components/tresty/logika.ts, katalog
// a stránky widgetu moje-smeny.tresty, rozpad bodů „Tresty" v lib/odmenyPrehled.ts.
import type { Testy } from './_testy.ts';
import {
  ARG_TRESTY, akceTrestu, filtrujTresty, nepotvrzene, poctyFiltru, poradiVMesici, sloucTrest, trestKOtevreni, trestyMesice, validujVyjadreni,
} from '../../components/tresty/logika.ts';
import { odkudBody, vyberOdmeny } from '../../lib/odmenyPrehled.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { stranka } from '../../lib/widgety/stranky/index.ts';
import type { Trest } from '../../lib/tresty.ts';

const tr = (p: Partial<Trest>): Trest => ({
  id: 1, userId: 3, userName: 'Eva', userAvatar: null, givenBy: 1, givenByName: 'Martin', day: '2026-10-10', shiftId: null, closingId: null,
  taskId: null, typeId: null, typeTitle: null, text: 'Pozdní příchod', photoUrl: null, points: 10, bonusCut: 0, status: 'plati', source: 'rucne',
  sourceKey: null, seenAt: '2026-10-10T19:00:00.000Z', response: null, responseAt: null, disputed: false, disputeHandledAt: null, cancelledBy: null,
  cancelledByName: null, cancelledAt: null, cancelNote: null, createdAt: '2026-10-10T18:00:00.000Z', ...p,
});

export default function ({ eq, ok }: Testy) {
  eq('argument z oznámení', ARG_TRESTY, 'tresty');

  // ---- co widget v měsíci ukáže ----
  const seznam = [
    tr({ id: 1, day: '2026-10-12' }),
    tr({ id: 2, day: '2026-10-05', status: 'zruseno', cancelNote: 'Omyl' }),
    tr({ id: 3, day: '2026-09-29', seenAt: null }),                       // nepotvrzený z minulého měsíce
    tr({ id: 4, day: '2026-09-20' }),                                     // potvrzený z minulého měsíce
    tr({ id: 5, day: '2026-10-08', disputed: true, response: 'Nebyla jsem tam.' }),
    tr({ id: 6, day: '2026-10-11', seenAt: null }),
  ];
  eq('měsíc: tresty měsíce + nepotvrzený odjinud; sporné, nepotvrzené (nejnovější), potvrzené, zrušené na konci',
    trestyMesice(seznam, '2026-10').map(x => x.id), [5, 6, 3, 1, 2]);
  eq('měsíc minulý: jen jeho tresty a nepotvrzený', trestyMesice(seznam, '2026-09').map(x => x.id), [6, 3, 4]);
  eq('nepotvrzené: nejnovější první, zrušený se nepočítá', nepotvrzene([...seznam, tr({ id: 7, seenAt: null, status: 'zruseno' })]).map(x => x.id), [6, 3]);
  eq('nepotvrzené: stejný den rozhodne čas udělení', nepotvrzene([tr({ id: 8, seenAt: null, createdAt: '2026-10-10T08:00:00Z' }), tr({ id: 9, seenAt: null, createdAt: '2026-10-10T20:00:00Z' })]).map(x => x.id), [9, 8]);

  // ---- filtr velkého widgetu ----
  eq('filtr: vše / platné / zrušené', [filtrujTresty(seznam, 'vse').length, filtrujTresty(seznam, 'plati').map(x => x.id), filtrujTresty(seznam, 'zruseno').map(x => x.id)], [6, [1, 3, 4, 5, 6], [2]]);
  eq('počty filtru', poctyFiltru(seznam), { vse: 6, plati: 5, zruseno: 1 });

  // ---- který trest otevřít z oznámení ----
  eq('z oznámení: nejnovější nepotvrzený', trestKOtevreni(seznam)?.id, 6);
  const potvrzene = [tr({ id: 1, createdAt: '2026-10-01T10:00:00Z' }), tr({ id: 2, status: 'zruseno', createdAt: '2026-09-01T10:00:00Z', cancelledAt: '2026-10-12T09:00:00Z' }), tr({ id: 3, createdAt: '2026-10-05T10:00:00Z' })];
  eq('z oznámení: bez nepotvrzeného ten, se kterým se naposled něco stalo (zrušení)', trestKOtevreni(potvrzene)?.id, 2);
  eq('z oznámení: prázdný seznam nic', trestKOtevreni([]), null);

  // ---- sloučení po změně ----
  eq('sloučení: změněný trest na místě, nový na začátek', [
    sloucTrest(seznam.slice(0, 2), tr({ id: 2, status: 'plati' })).map(x => `${x.id}:${x.status}`),
    sloucTrest(seznam.slice(0, 2), tr({ id: 9 })).map(x => x.id),
  ], [['1:plati', '2:plati'], [9, 1, 2]]);

  // ---- vyjádření ----
  eq('vyjádření: prázdné a jen mezery', [validujVyjadreni(''), validujVyjadreni('   ')], [{ ok: false, chyba: 'Napiš své vyjádření.' }, { ok: false, chyba: 'Napiš své vyjádření.' }]);
  eq('vyjádření: jeden znak a přes 500 znaků', [validujVyjadreni('x').ok, validujVyjadreni('a'.repeat(501)).ok], [false, false]);
  eq('vyjádření: hláška délky stejná jako server', validujVyjadreni('x'), { ok: false, chyba: 'Vyjádření je moc dlouhé (nejvýš 500 znaků) nebo moc krátké.' });
  eq('vyjádření: oříznuté, jednotné konce řádků', validujVyjadreni('  Nebyla jsem tam.\r\nMěla jsem volno.  '), { ok: true, text: 'Nebyla jsem tam.\nMěla jsem volno.' });

  // ---- akce ----
  eq('akce: nepotvrzený platný = potvrdit i vyjádřit; potvrzený jen vyjádřit; zrušený nic', [
    akceTrestu({ status: 'plati', seenAt: null }), akceTrestu({ status: 'plati', seenAt: 'x' }), akceTrestu({ status: 'zruseno', seenAt: null }),
  ], [{ potvrdit: true, vyjadrit: true }, { potvrdit: false, vyjadrit: true }, { potvrdit: false, vyjadrit: false }]);

  // ---- „3. v tomto měsíci" ----
  const pozde = [
    tr({ id: 11, typeId: 1, day: '2026-10-02' }),
    tr({ id: 12, typeId: 1, day: '2026-10-06', status: 'zruseno' }),
    tr({ id: 13, typeId: 1, day: '2026-10-09' }),
    tr({ id: 14, typeId: 1, day: '2026-10-14' }),
    tr({ id: 15, typeId: 2, day: '2026-10-09' }),
    tr({ id: 16, typeId: 1, day: '2026-09-30' }),
    tr({ id: 17, typeId: 1, day: '2026-10-02', userId: 4 }),
  ];
  eq('pořadí: počítá jen dřívější platné téhož druhu, člověka a měsíce', pozde.slice(0, 4).map(x => poradiVMesici(pozde, x)), [1, null, 2, 3]);
  eq('pořadí: jiný druh, jiný měsíc, bez položky sazebníku', [poradiVMesici(pozde, pozde[4]), poradiVMesici(pozde, pozde[5]), poradiVMesici(pozde, tr({ id: 18 }))], [1, 1, null]);
  eq('pořadí: stejný den rozhodne čas udělení', poradiVMesici([tr({ id: 21, typeId: 1, createdAt: '2026-10-10T08:00:00Z' }), tr({ id: 22, typeId: 1, createdAt: '2026-10-10T09:00:00Z' })], tr({ id: 22, typeId: 1, createdAt: '2026-10-10T09:00:00Z' })), 2);

  // ---- rozpad bodů: řádek Tresty se zápornými body ----
  const odpoved = { levels: [], points: { task: 5, procedure: 10, closing: 15 }, me: { points: 0, breakdown: { tasks: 1, procedures: 0, closings: 0, awards: 0, awardCount: 0 } } };
  ok('odkud body: bez trestů není řádek Tresty', !odkudBody(vyberOdmeny(odpoved).ja!.rozpad, vyberOdmeny(odpoved).sazebnik).some(r => r.klic === 'tresty'));
  const sTresty = vyberOdmeny({ ...odpoved, me: { ...odpoved.me, breakdown: { ...odpoved.me.breakdown, trestPoints: -25, trestCount: 2 } } });
  const radek = odkudBody(sTresty.ja!.rozpad, sTresty.sazebnik).find(r => r.klic === 'tresty');
  eq('odkud body: řádek Tresty −25 bodů, 2 tresty, ikona warning', [radek?.body, radek?.pocet, radek?.ikona], [-25, 2, 'warning']);

  // ---- katalog a stránky ----
  const w = widget('moje-smeny.tresty');
  ok('katalog: moje-smeny.tresty je hotový, S/M/L, výchozí M, pro zaměstnance i vedení, bez oprávnění (vlastní data)', !!w && w.stav === 'hotovo' && w.velikosti.join('') === 'SML'
    && w.vychoziVelikost === 'M' && w.rozhrani.includes('zamestnanec') && w.rozhrani.includes('vedeni') && w.opravneni.vse.length === 0 && w.opravneni.nektere.length === 0);
  ok('katalog: ikona warning, rychlý filtr obdobi (tento / minulý)', !!w && w.ikona === 'warning' && w.rychlyFiltr === 'obdobi'
    && (w.nastaveni ?? []).some(n => n.klic === 'obdobi' && n.typ === 'vyber' && n.moznosti.map(m => m.id).join(',') === 'tento,minuly'));
  const domu = stranka('zamestnanec.domu')!;
  // Audit 2026-10 (Z01): nahoře píchačky a dnešní směna (dřív tresty úplně nahoře), Moje tresty jako malá karta za Navíc.
  const vychoziDomu = domu.vychozi['typ:zamestnanec'] ?? [];
  eq('Domů: nahoře píchačky a směna, Moje tresty malá karta hned za Navíc', [vychoziDomu[0]?.w, vychoziDomu[1]?.w,
    vychoziDomu.find(x => x.w === 'moje-smeny.tresty')?.s, vychoziDomu.findIndex(x => x.w === 'moje-smeny.tresty') === vychoziDomu.findIndex(x => x.w === 'moje-smeny.navic') + 1],
    ['dochazka.moje_pichacky', 'moje.nejblizsi_smena', 'S', true]);
  const odmeny = stranka('zamestnanec.odmeny')!;
  const vychoziOdmeny = odmeny.vychozi['typ:zamestnanec'] ?? [];
  eq('Odměny: Moje tresty jako velká sekce za Navíc', [vychoziOdmeny.find(x => x.w === 'moje-smeny.tresty')?.s,
    vychoziOdmeny.findIndex(x => x.w === 'moje-smeny.tresty') === vychoziOdmeny.findIndex(x => x.w === 'moje-smeny.navic') + 1], ['L', true]);
  ok('Domů i Odměny: Moje tresty mezi doporučenými', domu.doporucene.includes('moje-smeny.tresty') && odmeny.doporucene.includes('moje-smeny.tresty'));
}
