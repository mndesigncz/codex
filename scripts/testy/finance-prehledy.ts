// Přehledy tržby v čase (lib/financeWidgety.ts): týdny s průměrem a změnou, dny v týdnu, kalendář po týdnech.
import type { Testy } from './_testy.ts';
import { tydnyTrzeb, dnyVTydnu, kalendarTrzeb, pondeliTydne, poradiDneVTydnu } from '../../lib/financeWidgety.ts';

export default function ({ eq, ok }: Testy) {
  // 2026-09-28 je pondělí, 2026-10-05 pondělí. Týden 1: po–ne 28.9.–4.10., týden 2: 5.10. (dnes, úterý 6.10.)
  eq('přehledy: 2026-09-28 je pondělí (0), 2026-10-04 neděle (6)', [poradiDneVTydnu('2026-09-28'), poradiDneVTydnu('2026-10-04')], [0, 6]);
  eq('přehledy: pondělí týdne pro neděli 4. 10.', pondeliTydne('2026-10-04'), '2026-09-28');
  const dny = [
    ['2026-09-28', 10000], ['2026-09-29', 12000], ['2026-09-30', 0], ['2026-10-01', 14000], ['2026-10-02', 16000], ['2026-10-03', 20000], ['2026-10-04', 18000],
    ['2026-10-05', 15000], ['2026-10-06', 21000], ['2026-10-07', 0],
  ].map(([den, trzba]) => ({ den: den as string, trzba: trzba as number }));
  const dnes = '2026-10-06';

  const t = tydnyTrzeb(dny, dnes);
  eq('týdny: dva týdny, nejnovější první', t.map(x => `${x.od}..${x.do}`), ['2026-10-05..2026-10-06', '2026-09-28..2026-10-04']);
  eq('týdny: součet a dny s tržbou (nula = zavřeno se nepočítá)', t.map(x => [x.soucet, x.dnu]), [[36000, 2], [90000, 6]]);
  eq('týdny: průměr na den s tržbou', t.map(x => x.prumer), [18000, 15000]);
  eq('týdny: změna průměru proti předchozímu týdnu (+20 %), první týden bez srovnání', t.map(x => x.zmena), [20, null]);
  eq('týdny: dny po dnešku se nepočítají (7. 10.)', t.some(x => x.do > dnes), false);
  eq('týdny: bez dat nic', tydnyTrzeb([], dnes), []);

  const d = dnyVTydnu(dny, dnes);
  eq('dny v týdnu: vždy sedm řádků, pondělí první', d.map(x => x.poradi), [0, 1, 2, 3, 4, 5, 6]);
  eq('dny v týdnu: pondělí průměr z 10 000 a 15 000', d[0].prumer, 12500);
  eq('dny v týdnu: středa bez tržby = 0 a bez dnů', [d[2].prumer, d[2].dnu], [0, 0]);
  eq('dny v týdnu: nejsilnější je sobota (20 000)', d.filter(x => x.nejsilnejsi).map(x => x.poradi), [5]);
  eq('dny v týdnu: bez dat žádný „nejsilnější"', dnyVTydnu([], dnes).some(x => x.nejsilnejsi), false);

  const k = kalendarTrzeb(dny, dnes);
  eq('kalendář: dva týdnové řádky po sedmi', k.map(r => r.length), [7, 7]);
  eq('kalendář: první řádek začíná pondělím 28. 9.', k[0][0].den, '2026-09-28');
  eq('kalendář: buňky za koncem období jsou prázdné (po 7. 10. do neděle)', k[1].slice(3).every(b => b.den === null), true);
  eq('kalendář: budoucí den (7. 10.) je „budouci" bez intenzity', [k[1][2].budouci, k[1][2].intenzita], [true, 0]);
  eq('kalendář: dnešek je označený', k[1][1].dnes, true);
  // nejsilnější den období je dnešek (21 000), podle něj se měří podíl
  eq('kalendář: intenzita = podíl na nejsilnějším dni (21 000)', [k[1][1].intenzita, k[0][5].intenzita.toFixed(3), k[0][0].intenzita.toFixed(3)], [1, (20000 / 21000).toFixed(3), (10000 / 21000).toFixed(3)]);
  eq('kalendář: bez dat prázdný', kalendarTrzeb([], dnes), []);
  ok('kalendář: den mimo období zarovnání nemá tržbu', k[0].every(b => b.den !== null) && k[1][6].trzba === null);
}
