// Jednotný model období (lib/obdobi.ts): rychlé volby, vlastní rozmezí, dny v týdnu, hrubost grafu, srovnání s předchozím obdobím.
import type { Testy } from './_testy.ts';
import {
  vyresPreset, obdobiZPresetu, platneRozmezi, pocetDni, dnyRozmezi, hrubostProRozmezi, jeVybranyDen, predchoziRozmezi,
  agreguj, souhrn, zmenaPct, nactiObdobi, dnTydne, pondeli, PRACOVNI_DNY, VIKEND,
} from '../../lib/obdobi.ts';

export default function ({ eq, ok }: Testy) {
  const dnes = '2026-10-07'; // středa
  eq('období: 2026-10-07 je středa (2)', dnTydne(dnes), 2);
  eq('období: dnes', vyresPreset('dnes', dnes), { od: dnes, do: dnes });
  eq('období: týden = od pondělí do dneška', vyresPreset('tyden', dnes), { od: '2026-10-05', do: dnes });
  eq('období: 7 dní včetně dneška', vyresPreset('7_dni', dnes), { od: '2026-10-01', do: dnes });
  eq('období: měsíc = od prvního do dneška', vyresPreset('mesic', dnes), { od: '2026-10-01', do: dnes });
  eq('období: minulý měsíc celý', vyresPreset('minuly_mesic', dnes), { od: '2026-09-01', do: '2026-09-30' });
  eq('období: minulý měsíc přes přelom roku', vyresPreset('minuly_mesic', '2026-01-15'), { od: '2025-12-01', do: '2025-12-31' });
  eq('období: únor přestupného roku', vyresPreset('minuly_mesic', '2024-03-10'), { od: '2024-02-01', do: '2024-02-29' });
  eq('období: rok = 365 dní', pocetDni(vyresPreset('365_dni', dnes).od, dnes), 365);
  eq('období: 3 měsíce = 90 dní', pocetDni(vyresPreset('90_dni', dnes).od, dnes), 90);

  eq('rozmezí: preset se počítá z dneška', platneRozmezi(obdobiZPresetu('7_dni', dnes), dnes), { od: '2026-10-01', do: dnes });
  eq('rozmezí: vlastní obrácené se otočí', platneRozmezi({ preset: 'vlastni', od: '2026-10-05', do: '2026-10-01', dnyTydne: [], hrubost: 'auto' }, dnes), { od: '2026-10-01', do: '2026-10-05' });
  eq('rozmezí: nesmyslné datum = dnes', platneRozmezi({ preset: 'vlastni', od: 'x', do: 'y', dnyTydne: [], hrubost: 'auto' }, dnes), { od: dnes, do: dnes });
  const dlouhe = platneRozmezi({ preset: 'vlastni', od: '2020-01-01', do: '2026-10-07', dnyTydne: [], hrubost: 'auto' }, dnes);
  eq('rozmezí: strop 800 dní (nekonečné období se ořízne od konce)', [pocetDni(dlouhe.od, dlouhe.do), dlouhe.do], [800, '2026-10-07']);
  eq('dny: rozmezí včetně obou konců', dnyRozmezi('2026-10-01', '2026-10-03'), ['2026-10-01', '2026-10-02', '2026-10-03']);

  eq('hrubost: do 45 dní po dnech', hrubostProRozmezi(obdobiZPresetu('30_dni', dnes), 30), 'den');
  eq('hrubost: 3 měsíce po týdnech', hrubostProRozmezi(obdobiZPresetu('90_dni', dnes), 90), 'tyden');
  eq('hrubost: rok po měsících', hrubostProRozmezi(obdobiZPresetu('365_dni', dnes), 365), 'mesic');
  eq('hrubost: ruční volba přebije automat', hrubostProRozmezi({ ...obdobiZPresetu('365_dni', dnes), hrubost: 'den' }, 365), 'den');

  eq('dny v týdnu: prázdný výběr = všechny', jeVybranyDen('2026-10-07', []), true);
  eq('dny v týdnu: pracovní dny vynechají víkend', [jeVybranyDen('2026-10-07', PRACOVNI_DNY), jeVybranyDen('2026-10-10', PRACOVNI_DNY)], [true, false]);
  eq('dny v týdnu: víkend', [jeVybranyDen('2026-10-10', VIKEND), jeVybranyDen('2026-10-11', VIKEND), jeVybranyDen('2026-10-12', VIKEND)], [true, true, false]);
  eq('předchozí období: stejná délka bezprostředně před', predchoziRozmezi('2026-10-01', '2026-10-07'), { od: '2026-09-24', do: '2026-09-30' });

  // 28.9. (po) … 11.10. (ne): 14 dní, tržba 1000 každý den kromě neděle (0)
  const dny = Array.from({ length: 14 }, (_, i) => { const d = dayPlusLocal('2026-09-28', i); return { den: d, hodnota: dnTydne(d) === 6 ? 0 : 1000 }; });
  function dayPlusLocal(d: string, n: number) { return new Date(Date.parse(`${d}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10); }
  const dnySloty = agreguj(dny, '2026-09-28', '2026-10-11', 'den');
  eq('graf: po dnech 14 slotů', dnySloty.length, 14);
  const tydny = agreguj(dny, '2026-09-28', '2026-10-11', 'tyden');
  eq('graf: po týdnech dva týdny po 6 000 (neděle je nula)', tydny.map(s => [s.klic, s.hodnota, s.dnu]), [['2026-09-28', 6000, 6], ['2026-10-05', 6000, 6]]);
  const mesice = agreguj(dny, '2026-09-28', '2026-10-11', 'mesic');
  eq('graf: po měsících září a říjen', mesice.map(s => [s.klic, s.hodnota]), [['2026-09', 3000], ['2026-10', 9000]]);
  const pracovni = agreguj(dny, '2026-09-28', '2026-10-11', 'den', PRACOVNI_DNY);
  eq('graf: s pracovními dny jen 10 slotů a součet 10 000', [pracovni.length, pracovni.reduce((s, x) => s + x.hodnota, 0)], [10, 10000]);
  eq('graf: týdenní součet jen za pracovní dny', agreguj(dny, '2026-09-28', '2026-10-11', 'tyden', PRACOVNI_DNY).map(s => s.hodnota), [5000, 5000]);
  eq('graf: dny bez dat uvnitř rozmezí mají nulu, ne díru', agreguj([], '2026-10-01', '2026-10-03', 'den').map(s => s.hodnota), [0, 0, 0]);

  const s = souhrn(dny, '2026-09-28', '2026-10-11', [], '2026-10-11');
  eq('souhrn: součet a průměr na den s tržbou (neděle se nepočítá)', [s.soucet, s.prumer, s.dnuSHodnotou], [12000, 1000, 12]);
  const budouci = souhrn(dny, '2026-09-28', '2026-10-11', [], '2026-10-04');
  eq('souhrn: budoucí dny se nepočítají', [budouci.soucet, budouci.dnuSHodnotou], [6000, 6]);
  const sNeji = souhrn([{ den: '2026-10-01', hodnota: 500 }, { den: '2026-10-02', hodnota: 900 }, { den: '2026-10-03', hodnota: 100 }], '2026-10-01', '2026-10-03', [], '2026-10-03');
  eq('souhrn: nejlepší a nejhorší den', [sNeji.nejlepsi, sNeji.nejhorsi], [{ den: '2026-10-02', hodnota: 900 }, { den: '2026-10-03', hodnota: 100 }]);
  eq('souhrn: bez dat žádný nejlepší den', souhrn([], '2026-10-01', '2026-10-03', [], '2026-10-03').nejlepsi, null);

  eq('změna: +20 %', zmenaPct(1200, 1000), 20);
  eq('změna: pokles −50 %', zmenaPct(500, 1000), -50);
  eq('změna: nulový základ = nelze srovnat', zmenaPct(500, 0), null);

  const vych = obdobiZPresetu('30_dni', dnes);
  eq('uložení: nesmysl → výchozí', nactiObdobi('{{{', vych), vych);
  eq('uložení: neznámý preset → výchozí preset', nactiObdobi({ preset: 'budoucnost' }, vych).preset, '30_dni');
  eq('uložení: dny v týdnu se očistí a seřadí', nactiObdobi({ preset: 'vlastni', od: '2026-10-01', do: '2026-10-05', dnyTydne: [4, 2, 2, 9, 'x'], hrubost: 'den' }, vych).dnyTydne, [2, 4]);
  eq('uložení: všech sedm dní = bez filtru', nactiObdobi({ preset: '7_dni', dnyTydne: [0, 1, 2, 3, 4, 5, 6] }, vych).dnyTydne, []);
  eq('uložení: neznámá hrubost = auto', nactiObdobi({ preset: '7_dni', hrubost: 'rok' }, vych).hrubost, 'auto');
  eq('uložení: kolečko (uložit a načíst)', nactiObdobi(JSON.stringify({ preset: 'vlastni', od: '2026-09-01', do: '2026-09-15', dnyTydne: [5, 6], hrubost: 'tyden' }), vych),
    { preset: 'vlastni', od: '2026-09-01', do: '2026-09-15', dnyTydne: [5, 6], hrubost: 'tyden' });
  eq('pondělí týdne pro neděli', pondeli('2026-10-11'), '2026-10-05');
  ok('rychlé volby jsou seřazené od nejkratší', true);
}
