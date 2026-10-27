// Hodnocení směny jako celku (Martin: „u všeho hodnotit i kritizovat přímo směnu, vždy").
//
// Čistá logika lib/hodnoceniSmeny.ts: skupiny směn dne z rozvrhu, vstup okna (osádka, body −100…100,
// štítky, fotka), náhled zpětné změny bodů, pohled člena (jen jeho body) a napojení na Zpětnou vazbu
// (lib/odmenyPrehled: den s kritikou je výtka, nepotvrzené je nové, body se nepočítají dvakrát).
// Plus hlídky ve zdrojácích: body nejsou peníze, oprávnění, tablet, smazání účtu, vstupní místa.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import {
  KLIC_DEN, dalsiStavStitku, jeCoUlozit, jeKlic, klicSmeny, normalizujVstup, odkazHodnoceni, popisSmeny, proClena,
  skupinySmen, soucetZmen, stejneVsem, tonHodnoceni, vychoziSkupina, zmenyBodu,
} from '../../lib/hodnoceniSmeny.ts';
import { bodyDne, dnyHodnoceni, vyberSmenyClena } from '../../lib/odmenyPrehled.ts';
import { ZACHAZENI_TABULEK, TYMOVE_TABULKY } from '../../lib/smazaniUctu.ts';
import { AUDIT_POPISKY } from '../../lib/auditPopisky.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');

export default function ({ eq, ok }: Testy) {
  // ---- klíč a skupiny směn ----
  eq('klíč: začátek a konec směny; bez času celý den', [klicSmeny('07:00:00', '15:00'), klicSmeny(null, '15:00'), klicSmeny('7:00', '15:00')], ['07:00-15:00', KLIC_DEN, KLIC_DEN]);
  eq('klíč: platný jen den nebo HH:MM-HH:MM', [jeKlic('den'), jeKlic('07:00-15:00'), jeKlic('07:00-25:00'), jeKlic("x'; DROP"), jeKlic(5)], [true, true, false, false, false]);
  const rozvrh = [
    { employeeId: 2, jmeno: 'Petr Malý', od: '07:00', do: '15:00', nazev: 'Ranní' },
    { employeeId: 1, jmeno: 'Anna Nová', od: '07:00:00', do: '15:00:00', nazev: null },
    { employeeId: 3, jmeno: 'Eva Bílá', od: '14:00', do: '22:00', nazev: 'Odpolední' },
  ];
  const sk = skupinySmen(rozvrh);
  eq('skupiny: stejný začátek a konec = jedna směna (osádka), podle začátku, celý den na konci',
    sk.map(s => [s.klic, s.nazev, s.lide.map(l => l.jmeno)]),
    [['07:00-15:00', 'Ranní', ['Anna Nová', 'Petr Malý']], ['14:00-22:00', 'Odpolední', ['Eva Bílá']], [KLIC_DEN, null, ['Anna Nová', 'Eva Bílá', 'Petr Malý']]]);
  eq('skupiny: jediná směna dne = bez „Celý den" (dvě volby by byly totéž)', skupinySmen([rozvrh[0], rozvrh[1]]).map(s => s.klic), ['07:00-15:00']);
  eq('skupiny: den bez rozvrhu = jen „Celý den" (hodnotit jde vždycky)', skupinySmen([]).map(s => [s.klic, s.lide.length]), [[KLIC_DEN, 0]]);
  eq('výchozí směna: požadovaná > ta s člověkem > první', [vychoziSkupina(sk, { klic: '14:00-22:00' }), vychoziSkupina(sk, { clovek: 3 }), vychoziSkupina(sk, { klic: 'nic', clovek: 99 })], ['14:00-22:00', '14:00-22:00', '07:00-15:00']);
  eq('popis směny: název a čas, celý den null', [popisSmeny(sk[0]), popisSmeny({ nazev: null, od: '07:00', do: '15:00' }), popisSmeny(sk[2])], ['Ranní 07:00–15:00', '07:00–15:00', null]);

  // ---- vstup okna ----
  const v = normalizujVstup({
    den: '2026-10-20', klic: '07:00-15:00', nazev: 'Ranní', hvezdy: 9, dobre: '  Rychlá obsluha ', kritika: 'Nepořádek u baru',
    stitky: { cistota: 'minus', rychlost: 'plus', neznamy: 'plus', tym: 'jo' }, kNaprave: true, foto: 'javascript:alert(1)',
    osadka: [1, 2, '2', -4, 'x'],
    body: [{ id: 1, body: 250 }, { id: 2, body: -15 }, { id: 9, body: 5 }, { id: 1, body: 3 }, { id: 2, body: 0 }],
  });
  ok('vstup: platný', v.ok);
  if (v.ok) {
    eq('vstup: hvězdy 0–5, texty oříznuté, čas z klíče', [v.v.hvezdy, v.v.dobre, v.v.od, v.v.do], [5, 'Rychlá obsluha', '07:00', '15:00']);
    eq('vstup: jen známé štítky se stavem plus/minus', v.v.stitky, { cistota: 'minus', rychlost: 'plus' });
    eq('vstup: fotka jen nahraná do aplikace (/api/upload/…), jinak nic', v.v.foto, null);
    eq('vstup: osádka bez duplicit a nesmyslů', v.v.osadka, [1, 2]);
    eq('vstup: body −100…100, jen lidé z osádky, každý jednou (i záporné)', v.v.body.map(b => [b.id, b.body]), [[1, 100], [2, -15]]);
  }
  eq('vstup: fotka z /api/upload projde', normalizujVstup({ den: '2026-10-20', foto: '/api/upload/ab_12', osadka: [] }).ok && (normalizujVstup({ den: '2026-10-20', foto: '/api/upload/ab_12' }) as any).v.foto, '/api/upload/ab_12');
  eq('vstup: bez dne chyba', normalizujVstup({ klic: KLIC_DEN, hvezdy: 3 }).ok, false);
  eq('vstup: prázdné hodnocení se neuloží (osádka by dostala oznámení o ničem)', normalizujVstup({ den: '2026-10-20', klic: 'den', osadka: [1] }).ok, false);
  eq('vstup: neplatný klíč = celý den', (normalizujVstup({ den: '2026-10-20', klic: '1; DROP', kritika: 'x' }) as any).v.klic, KLIC_DEN);
  eq('co uložit: samotná kritika, samotný štítek nebo samotné body stačí',
    [jeCoUlozit({ hvezdy: 0, dobre: null, kritika: 'x', stitky: {}, kNaprave: false, foto: null, body: [] }),
     jeCoUlozit({ hvezdy: 0, dobre: null, kritika: null, stitky: { kasa: 'minus' }, kNaprave: false, foto: null, body: [] }),
     jeCoUlozit({ hvezdy: 0, dobre: null, kritika: null, stitky: {}, kNaprave: false, foto: null, body: [{ id: 1, body: -3, poznamka: null }] })], [true, true, true]);

  // ---- štítky, tón ----
  eq('štítek: nic → dobře → k nápravě → nic', [dalsiStavStitku(undefined), dalsiStavStitku('plus'), dalsiStavStitku('minus')], ['plus', 'minus', undefined]);
  eq('tón: pochvala / kritika / obojí',
    [tonHodnoceni({ hvezdy: 5, dobre: 'super', kritika: null, stitky: {}, kNaprave: false }),
     tonHodnoceni({ hvezdy: 2, dobre: null, kritika: null, stitky: {}, kNaprave: false }),
     tonHodnoceni({ hvezdy: 4, dobre: null, kritika: 'bar', stitky: { cistota: 'minus' }, kNaprave: false })], ['pochvala', 'kritika', 'smisene']);

  // ---- body: stejně všem, náhled zpětné změny ----
  eq('stejně všem: každý z osádky stejně, poznámky zůstanou, ořez', stejneVsem([1, 2], 500, [{ id: 2, body: 1, poznamka: 'p' }]), [{ id: 1, body: 100, poznamka: null }, { id: 2, body: 100, poznamka: 'p' }]);
  const z = zmenyBodu([{ id: 1, body: 5 }, { id: 2, body: 0 }, { id: 3, body: 4 }], [{ id: 1, body: 2 }, { id: 2, body: -3 }, { id: 4, body: 1 }]);
  eq('náhled: kdo o kolik (vypadlý z rozpisu přijde o body, beze změny se neukáže)', z, [{ id: 1, pred: 5, po: 2 }, { id: 2, pred: 0, po: -3 }, { id: 3, pred: 4, po: 0 }, { id: 4, pred: 0, po: 1 }]);
  eq('náhled: součet změn', soucetZmen(z), -3 - 3 - 4 + 1);
  eq('náhled: stejné body = žádná změna', zmenyBodu([{ id: 1, body: 5 }], [{ id: 1, body: 5 }]), []);

  // ---- pohled člena ----
  const radek = { id: 7, den: '2026-10-20', klic: '07:00-15:00', nazev: 'Ranní', od: '07:00', do: '15:00', hvezdy: 2, dobre: null, kritika: 'Bar', stitky: { cistota: 'minus', x: 'plus' },
    kNaprave: true, foto: null, osadka: [1, 2], videli: [2], body: [{ id: 1, body: -5, poznamka: 'Pozdě' }, { id: 2, body: 3, poznamka: null }] };
  const anna = proClena(radek, 1);
  eq('člen: vidí kritiku a JEN svoje body a poznámku (body kolegů ne)', anna && [anna.kritika, anna.mojeBody, anna.mojePoznamka, anna.videno, anna.lidi, 'body' in anna], ['Bar', -5, 'Pozdě', false, 2, false]);
  eq('člen: kdo na směně nebyl, hodnocení nedostane', proClena(radek, 3), null);
  eq('člen: štítky jen známé', anna?.stitky, { cistota: 'minus' });

  // ---- Zpětná vazba a Hodnocení mých směn (lib/odmenyPrehled) ----
  const raw = {
    reviews: [{ work_date: '2026-10-19', rating: 4, points: 8, autoPoints: 0, note: null, flagged: false, seen_at: '2026-10-19', scope: 'individual' }],
    items: [{ work_date: '2026-10-20', kind: 'smena', refId: 7, label: 'Hodnocení směny — Ranní', points: -5, note: 'Pozdě', flagged: false }],
    smeny: [{ ...anna, den: '2026-10-20' }],
  };
  const dny = dnyHodnoceni(raw);
  eq('dny: hodnocení celé směny je u svého dne; kritika k nápravě = výtka, nepotvrzené = nové', [dny[0].den, dny[0].smeny?.length, dny[0].vytka, dny[0].videno, dny[0].hvezdy], ['2026-10-20', 1, true, false, 2]);
  eq('dny: body ze směny se počítají jednou (položka smena), ne znovu z hodnocení', bodyDne(dny[0]), -5);
  eq('dny: den bez hodnocení celé směny pole smeny nemá (tvar dřívějších dnů beze změny)', 'smeny' in dny[1], false);
  eq('člen: parser /api/rewards → smeny, nejnovější první', vyberSmenyClena({ smeny: [{ ...anna, den: '2026-10-18', id: 1 }, { ...anna, den: '2026-10-20', id: 2 }, { den: null }] }).map(s => s.id), [2, 1]);

  // ---- odkaz z oznámení ----
  eq('odkaz: otevře okno na dni (a směně)', [odkazHodnoceni('2026-10-20'), odkazHodnoceni('2026-10-20', '07:00-15:00')],
    ['/employer/overview?hodnotitSmenu=2026-10-20', '/employer/overview?hodnotitSmenu=2026-10-20&smena=07%3A00-15%3A00']);

  // ---- hlídky ve zdrojácích ----
  const api = zdroj('app/api/hodnoceni-smeny/route.ts');
  ok('API: čtení s hodnoceni.zobrazit, zápis a mazání s hodnoceni.hodnotit, tablet nikdy',
    api.includes("pozaduj('hodnoceni.zobrazit')") && (api.match(/pozaduj\('hodnoceni\.hodnotit'\)/g) ?? []).length === 3 && (api.match(/typ === 'kiosk'/g) ?? []).length >= 5);
  ok('API: osádka jen z členů podniku (jeClenem) a audit uložení i smazání', api.includes('jeClenem(id, c.teamId)') && api.includes("'smena.hodnoceni'") && api.includes("'smena.hodnoceni_smazat'"));
  ok('audit: popisky akcí hodnocení směny', !!AUDIT_POPISKY['smena.hodnoceni'] && !!AUDIT_POPISKY['smena.hodnoceni_smazat'] && !!AUDIT_POPISKY['smena.hodnoceni_pravidlo']);
  const db = zdroj('lib/hodnoceniSmenyDb.ts');
  ok('body nejsou peníze: zápis jen do bodů (shift_review_items kind smena, ruční), nikdy do mezd', db.includes("'smena'") && db.includes('rucne') && !/wage_adjustments|penalties/.test(db.replace(/\/\/.*$/gm, '')));
  ok('okno: žádné peněžní pole, věta „Body nejsou peníze"', !/useMoney|money\(/.test(zdroj('components/hodnoceni-smeny/HodnoceniSmenyOkno.tsx')) && zdroj('components/hodnoceni-smeny/HodnoceniSmenyOkno.tsx').includes('Body nejsou peníze'));
  ok('pravidlo připomínky je vypnuté výchozí', zdroj('app/api/init/route.ts').includes('smena_hodnoceni_pripominat BOOLEAN DEFAULT FALSE'));
  eq('smazání účtu: tabulka zná zacházení i smazání podniku', [ZACHAZENI_TABULEK.smeny_hodnoceni, TYMOVE_TABULKY.includes('smeny_hodnoceni')], ['ponechat', true]);
  const vstupy: [string, string][] = [
    ['components/employer/DenDetail.tsx', 'detail dne'], ['components/widgety/oblasti/rozvrh.tsx', 'Dnešní směny'],
    ['components/employer/ClosingDetail.tsx', 'uzávěrka'], ['components/employer/ShiftReviewCalendar.tsx', 'kalendář hodnocení'],
    ['components/employer/ShiftReviewModal.tsx', 'okno hodnocení člověka'], ['components/employer/Attendance.tsx', 'docházka'],
    ['components/widgety/oblasti/dochazka.tsx', 'Dnes v podniku'], ['components/ukoly/UkolDetail.tsx', 'úkol'],
    ['components/procedures/DetailPrubehu.tsx', 'průběh postupu'], ['components/scheduling/ScheduleBuilder.tsx', 'okno dne v rozvrhu'],
  ];
  for (const [soubor, misto] of vstupy) ok(`vstupní místo „Ohodnotit směnu": ${misto}`, zdroj(soubor).includes('<TlacitkoHodnotitSmenu'));
  ok('odkaz z oznámení: hostitel na ploše', zdroj('components/widgety/PlochaWidgetu.tsx').includes('<HodnoceniSmenyHost'));
}
