// Kolo 8, balík R8-3 — Rozvrh, tým a odměny.
//
// Tým: hodiny a výdělek u každého člena za zvolené období (lib/tymHodiny.ts) — stejná
// pravidla jako Souhrn hodin (zapomenutý odchod se nepočítá, běžící příchod do „teď"),
// mzda jen se sazbou a jen když ji divák smí vidět, řazení podle jména / hodin / výdělku
// a kolik dní si od serveru vyžádat (strop 180). Ve zdroji: nástroj Týmu čte
// /api/attendance jen s dochazka.zobrazit a stránka Tým doporučuje Souhrn hodin.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { dniKNacteni, hodinyClenu, seradCleny, soucetHodinClenu } from '../../lib/tymHodiny.ts';
import { pragueMomentOf } from '../../lib/pragueTime.ts';
import { STRANKA as TYM } from '../../lib/widgety/stranky/vedeni.tym.ts';
import type { ZaznamDochazky } from '../../lib/dochazkaPrehled.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const p = (den: string, hm: string) => pragueMomentOf(den, hm)!.toISOString();
const H = 3_600_000;

export default function ({ eq, ok }: Testy) {
  // ---- hodiny po lidech ----
  const z = (id: number, kdo: number, od: string, doCasu: string | null): ZaznamDochazky =>
    ({ id, employeeId: kdo, employeeName: `Člověk ${kdo}`, clockIn: od, clockOut: doCasu, source: 'kiosk' });
  const ted = pragueMomentOf('2026-10-13', '15:00')!.getTime();
  const zaznamy = [
    z(1, 16, p('2026-10-01', '08:00'), p('2026-10-01', '16:00')),   // 8 h
    z(2, 16, p('2026-10-05', '08:00'), p('2026-10-05', '12:30')),   // 4 h 30
    z(3, 17, p('2026-10-05', '12:00'), p('2026-10-05', '20:00')),   // 8 h
    z(4, 17, p('2026-10-10', '09:00'), null),                       // zapomenutý odchod (> 16 h) — nepočítá se
    z(5, 18, p('2026-10-13', '13:00'), null),                       // běží 2 h
    z(6, 16, p('2026-09-28', '08:00'), p('2026-09-28', '16:00')),   // mimo rozmezí
  ];
  const roster = [{ id: 16, name: 'Eva', hourlyRate: 150 }, { id: 17, name: 'Jakub', hourlyRate: 0 }, { id: 18, name: 'Tereza', hourlyRate: 200 }];
  const h = hodinyClenu(zaznamy, roster, '2026-10-01', '2026-10-13', ted, true);
  eq('hodiny: Eva 12 h 30 min ze dvou směn v rozmezí, mzda 12,5 × 150', h.get('16'), { ms: 12.5 * H, pocet: 2, mzda: 1875, bezi: false });
  eq('hodiny: Jakub 8 h, zapomenutý odchod se nepočítá, bez sazby mzda null', h.get('17'), { ms: 8 * H, pocet: 2, mzda: null, bezi: false });
  eq('hodiny: Tereza běží 2 h do „teď", mzda 2 × 200', h.get('18'), { ms: 2 * H, pocet: 1, mzda: 400, bezi: true });
  ok('hodiny: září mimo rozmezí (Eva má jen dvě směny)', h.get('16')!.pocet === 2);
  const bezMzdy = hodinyClenu(zaznamy, roster, '2026-10-01', '2026-10-13', ted, false);
  eq('hodiny: bez finance.mzdy je mzda null i se sazbou v rosteru', [bezMzdy.get('16')!.mzda, bezMzdy.get('18')!.mzda], [null, null]);
  eq('hodiny: prázdné rozmezí = nikdo', hodinyClenu(zaznamy, roster, '2026-11-01', '2026-11-30', ted, true).size, 0);

  // ---- součet ----
  eq('součet: hodiny všech, mzdy jen se sazbou, bez sazby 1 (Jakub)', soucetHodinClenu(h), { ms: 22.5 * H, mzda: 2275, bezSazby: 1 });

  // ---- řazení ----
  const lide = [
    { id: 15, name: 'Martin' }, { id: 16, name: 'Eva' }, { id: 17, name: 'Jakub' }, { id: 18, name: 'Tereza' }, { id: 19, name: 'Adam' },
  ];
  eq('řazení: jméno česky', seradCleny(lide, h, 'jmeno').map(m => m.name), ['Adam', 'Eva', 'Jakub', 'Martin', 'Tereza']);
  eq('řazení: hodiny — nejvíc nahoře, bez záznamu dole v abecedě', seradCleny(lide, h, 'hodiny').map(m => m.name), ['Eva', 'Jakub', 'Tereza', 'Adam', 'Martin']);
  eq('řazení: výdělek — bez sazby (Jakub) až za lidmi s mzdou, bez záznamu dole', seradCleny(lide, h, 'vydelek').map(m => m.name), ['Eva', 'Tereza', 'Jakub', 'Adam', 'Martin']);
  eq('řazení: bez docházky vždy jméno', seradCleny(lide, null, 'hodiny').map(m => m.name), ['Adam', 'Eva', 'Jakub', 'Martin', 'Tereza']);

  // ---- kolik dní načíst ----
  eq('dní k načtení: tento měsíc 1.–13. = 13', dniKNacteni('2026-10-01', '2026-10-13'), 13);
  eq('dní k načtení: minulý měsíc od 1. 9. do 13. 10. = 43', dniKNacteni('2026-09-01', '2026-10-13'), 43);
  eq('dní k načtení: strop 180 (server víc nevrací)', dniKNacteni('2025-01-01', '2026-10-13'), 180);
  eq('dní k načtení: nesmysl → 30, dnešek → 1', [dniKNacteni('x', '2026-10-13'), dniKNacteni('2026-10-13', '2026-10-13')], [30, 1]);

  // ---- ve zdroji ----
  const tym = zdroj('components/TeamManagement.tsx');
  ok('Tým: docházku čte jen s dochazka.zobrazit (URL null bez oprávnění)', /useDataWidgetu<DataDochazky>\(smiHodiny \? `\/api\/attendance\?days=\$\{dniKNacteni\(/.test(tym));
  ok('Tým: období volí ObdobiLista s měsícem, minulým měsícem a 30 dny', /<ObdobiLista value=\{obdobi\}/.test(tym) && /'30_dni', 'mesic', 'minuly_mesic'/.test(tym));
  ok('Tým: řazení Jméno / Hodiny / Výdělek (výdělek jen s finance.mzdy)', /id: 'hodiny' as const/.test(tym) && /smiVidetSazby \? \[\{ id: 'vydelek' as const/.test(tym));
  ok('Tým: odkaz „Rozpad v Docházce" jen na pohled, kam divák smí', /nav\.smiPohled\('attendance'\)/.test(tym) && /t\('Rozpad v Docházce'\)/.test(tym));
  ok('Tým: stránka doporučuje Souhrn hodin', TYM.doporucene.includes('dochazka.souhrn_hodin'));
}
