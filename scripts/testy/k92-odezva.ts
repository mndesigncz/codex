// Kolo 92 (ověření): živá odezva u kasy — sloučení událostí, které čtečka zapíše za sebou.
//  • razítko (earn) a razítka navíc (ruční úprava, manual) jedné karty = jedna událost „+2" se stavem
//    karty po všech zápisech, i když přijdou ve dvou dotazech po sobě;
//  • uplatnění odměny zůstává vedle, stejné id se nepřidá dvakrát, pořadí podle času;
//  • server bere do odezvy i ruční razítka (kind manual) — dřív je vynechal a host je neviděl.
// Tok obou obrazovek nad jedním podvrženým serverem hlídá sonda k92-ctecka-host.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { slucUdalosti, type UdalostOdezvy } from '../../lib/klient/slouceniOdezvy.ts';

const z = { teamId: 1 };
type U = UdalostOdezvy;

export default function ({ eq, ok }: Testy) {
  const prvni = slucUdalosti<U>([], [{ id: 'S1', typ: 'razitko' as const, at: '2026-10-21T10:00:00.000Z', ...z, delta: 1, karta: { id: 1, razitka: 6, cil: 8 } }]);
  eq('odezva: první dotaz = jedno razítko', prvni.map(u => [u.id, u.delta]), [['S1', 1]]);
  const druhy = slucUdalosti<U>(prvni, [
    { id: 'S2', typ: 'razitko' as const, at: '2026-10-21T10:00:03.000Z', ...z, delta: 1, karta: { id: 1, razitka: 7, cil: 8 } },
    { id: 'U5', typ: 'uplatneno' as const, at: '2026-10-21T10:00:03.500Z', ...z, delta: 0 },
    { id: 'S1', typ: 'razitko' as const, at: '2026-10-21T10:00:00.000Z', ...z, delta: 1, karta: { id: 1, razitka: 6, cil: 8 } },
  ]);
  eq('odezva: razítko + razítko navíc = jedna událost +2, uplatnění vedle', druhy.map(u => [u.id, u.typ, u.delta]), [['S1', 'razitko', 2], ['U5', 'uplatneno', 0]]);
  eq('odezva: stav karty z poslední události (7 / 8)', druhy[0].karta, { id: 1, razitka: 7, cil: 8 });
  const jinaKarta = slucUdalosti<U>(druhy, [{ id: 'S9', typ: 'razitko' as const, at: '2026-10-21T10:00:04.000Z', ...z, delta: 1, karta: { id: 2, razitka: 1, cil: 5 } }]);
  eq('odezva: razítko jiné kampaně je zvlášť', jinaKarta.filter(u => u.typ === 'razitko').map(u => [u.id, u.delta]), [['S1', 2], ['S9', 1]]);
  ok('odezva: vstup se nemění (host drží předchozí list ve stavu)', prvni[0].delta === 1);

  const sql = readFileSync(new URL('../../lib/klient/odezva.ts', import.meta.url), 'utf8');
  ok('odezva: server čte razítka earn i manual (razítka navíc ze čtečky)', /e\.kind IN \('earn', 'manual'\)/.test(sql));
  const kasa = readFileSync(new URL('../../components/client/host/UKasy.tsx', import.meta.url), 'utf8');
  ok('odezva: U kasy se ptá dál i po prvním načtení a slučuje', /slucUdalosti\(pred \?\? \[\], nove\)/.test(kasa) && !/if \(udalosti\) return;/.test(kasa));
}
