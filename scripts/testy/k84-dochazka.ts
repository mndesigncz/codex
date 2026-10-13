// Kolo 8, balík R8-2 (Záznamy docházky a tablet) — jednotkové testy čisté logiky z lib/geoPichani.ts,
// lib/dochazkaZaznamy.ts a lib/kioskOffline.ts, plus kontroly DDL, popisků auditu a toho, že API a UI
// opravdu používají, co tu je (zámek období v PATCH/DELETE, breakAfter v GET, pauza z tabletu, fronta).
//
// Hlídá se hlavně to, na čem stály nálezy: dva záznamy kolem pauzy jsou jeden řádek a hodiny se tím nemění;
// pásy filtru nesou správné počty a druhý klik ruší; „k ověření" zachytí pozdní příchod, poznámku i píchnutí
// mimo podnik; poloha mimo okruh záznam neblokuje; fronta tabletu nepošle stejný kus dvakrát a server odmítne
// starší než den; hláška zámku jmenuje měsíc.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { distanceM, normalizujPravidlaPichani, overPolohu, parsePoloha, pravidloUcinne, vzdalenostText, VYCHOZI_PRAVIDLA_PICHANI } from '../../lib/geoPichani.ts';
import {
  BEZ_POZICE, csvPauzaMin, csvPoloha, denZaznamuPraha, filtrujRadky, hlaskaZamku, kOvereni, mesicZamku, pasLidi, pasPozic, poziceZRosteru, prepniHodnotu,
  priznakyRadku, radkyZaznamu, souhrnRadku, zamekDne, type ZaznamSeStavem,
} from '../../lib/dochazkaZaznamy.ts';
import { MAX_FRONTA, duvodProcNeOffline, overPolozkuSync, poSynchronizaci, pridejDoFronty, rosterSFrontou, zastaraleVeFronte, type PolozkaFronty } from '../../lib/kioskOffline.ts';
import { odchylkyZaznamu, type PlanZaznamu } from '../../lib/dochazkaPrehled.ts';
import { pragueMomentOf } from '../../lib/pragueTime.ts';
import { AUDIT_POPISKY } from '../../lib/auditPopisky.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const p = (den: string, hm: string) => pragueMomentOf(den, hm)!.toISOString();
const H = 3600_000;
const MIN = 60_000;

export default function ({ eq, ok }: Testy) {
  // ---- poloha ----
  ok('geo: Staroměstské nám. → Václavské nám. je zhruba 700 m', Math.abs(distanceM(50.0875, 14.4213, 50.0817, 14.4278) - 780) < 120);
  eq('geo: stejný bod = 0 m', distanceM(50.1, 14.4, 50.1, 14.4), 0);
  eq('geo: pravidla bez vstupu jsou výchozí (vypnuto, 200 m, bez bodu)', normalizujPravidlaPichani(null), VYCHOZI_PRAVIDLA_PICHANI);
  eq('geo: cizí poloměr padne na 200, souřadnice se zaokrouhlí na 6 míst', normalizujPravidlaPichani({ zapnuto: true, lat: '50.08751234567', lng: 14.4213, polomerM: 300 }), { zapnuto: true, lat: 50.087512, lng: 14.4213, polomerM: 200 });
  eq('geo: nesmyslná šířka = bez bodu', normalizujPravidlaPichani({ zapnuto: true, lat: 123, lng: 14, polomerM: 500 }), { zapnuto: true, lat: null, lng: null, polomerM: 500 });
  eq('geo: zapnuté bez bodu není účinné', [pravidloUcinne({ zapnuto: true, lat: null, lng: null, polomerM: 100 }), pravidloUcinne({ zapnuto: true, lat: 50, lng: 14, polomerM: 100 }), pravidloUcinne({ zapnuto: false, lat: 50, lng: 14, polomerM: 100 })], [false, true, false]);
  eq('geo: poloha z těla — nečitelná null, bez přesnosti 9999', [parsePoloha({ lat: 'x' }), parsePoloha(null), parsePoloha({ lat: 50, lng: 14 })], [null, null, { lat: 50, lng: 14, accuracy: 9999 }]);
  const podnik = { zapnuto: true, lat: 50.0875, lng: 14.4213, polomerM: 100 as const };
  eq('geo: vypnuté pravidlo → null (neukládá se nic)', overPolohu({ ...podnik, zapnuto: false }, { lat: 50, lng: 14, accuracy: 10 }), null);
  eq('geo: zapnuté a poloha nepřišla → missing', overPolohu(podnik, null), { status: 'missing', vzdalenostM: null });
  const u = overPolohu(podnik, { lat: 50.0878, lng: 14.4213, accuracy: 10 })!;
  ok('geo: 33 m od podniku s poloměrem 100 = ok', u.status === 'ok' && u.vzdalenostM! > 20 && u.vzdalenostM! < 50);
  const d = overPolohu(podnik, { lat: 50.0985, lng: 14.4213, accuracy: 10 })!;
  ok('geo: 1,2 km od podniku = far se vzdáleností', d.status === 'far' && d.vzdalenostM! > 1100 && d.vzdalenostM! < 1300);
  // 135 m s přesností 40 → rezerva 40 (ok); 155 m s přesností 500 → rezerva nejvýš 50 (far); 145 m s přesností 60 → rezerva 50 (ok).
  eq('geo: rezerva na přesnost GPS nejvýš 50 m',
    [overPolohu(podnik, { lat: 50.088714, lng: 14.4213, accuracy: 40 })!.status, overPolohu(podnik, { lat: 50.088894, lng: 14.4213, accuracy: 500 })!.status, overPolohu(podnik, { lat: 50.088804, lng: 14.4213, accuracy: 60 })!.status],
    ['ok', 'far', 'ok']);
  eq('geo: vzdálenost slovy — 40 m, 1,2 km (cs), 1.2 km (en), 12 km', [vzdalenostText(40, 'cs-CZ'), vzdalenostText(1234, 'cs-CZ'), vzdalenostText(1234, 'en-GB'), vzdalenostText(12_345, 'cs-CZ')], ['40 m', '1,2 km', '1.2 km', '12 km']);

  // ---- řádky se spojenou pauzou ----
  const D = '2026-10-12';
  const ted = pragueMomentOf('2026-10-13', '12:00')!.getTime();
  const z = (id: number, od: string, doD: string | null, x: Partial<ZaznamSeStavem> = {}): ZaznamSeStavem => ({ id, employeeId: 16, employeeName: 'Eva Testová', clockIn: od, clockOut: doD, source: 'kiosk', ...x });
  const A = z(1, p(D, '09:02'), p(D, '12:00'));
  const B = z(2, p(D, '12:30'), p(D, '17:31'), { source: 'break', breakAfter: 1 });
  const C = z(3, p(D, '18:00'), p(D, '18:00'), { source: 'break', breakAfter: 2 });
  const jiny = z(4, p(D, '08:00'), p(D, '16:00'), { employeeId: 15, employeeName: 'Martin' });
  const r1 = radkyZaznamu([B, A, jiny], ted);
  eq('řádky: A + B (breakAfter) = jeden řádek 9:02–17:31 s pauzou 30 min, Martin zvlášť', r1.map(r => [r.hlavni.id, r.casti.map(c => c.id), r.pauzaMs / MIN, r.naPauze]), [[1, [1, 2], 30, false], [4, [4], 0, false]]);
  eq('řádky: odpracováno se pauzou nemění (2:58 + 5:01 = 7:59)', r1[0].delka / MIN, 2 * 60 + 58 + 5 * 60 + 1);
  eq('řádky: konec řádku je odchod poslední části', [r1[0].clockIn, r1[0].clockOut], [A.clockIn, B.clockOut]);
  const r2 = radkyZaznamu([C, B, A], ted);
  eq('řádky: dvě pauzy za den se řetězí (A → B → C otevřená) — řádek na pauze od 18:00', [r2.length, r2[0].casti.map(c => c.id), r2[0].naPauze, r2[0].pauzaOd, r2[0].clockOut], [1, [1, 2, 3], true, C.clockIn, null]);
  const Bbez = { ...B, breakAfter: null };
  eq('řádky: bez breakAfter (starší API) se vezme nejbližší předchozí odchod téhož člověka', radkyZaznamu([Bbez, A, jiny], ted).map(r => r.casti.map(c => c.id)), [[1, 2], [4]]);
  eq('řádky: záznam po pauze bez předchůdce v období stojí sám', radkyZaznamu([B], ted).map(r => [r.hlavni.id, r.casti.length, r.pauzaMs]), [[2, 1, 0]]);
  const bezi = z(5, p('2026-10-13', '08:00'), null);
  eq('řádky: běžící záznam má druh bezi a délku do teď', [radkyZaznamu([bezi], ted)[0].druh, radkyZaznamu([bezi], ted)[0].delka / H], ['bezi', 4]);

  // ---- příznaky, k ověření ----
  const plany = new Map<string, PlanZaznamu>([['1', { pozdeMin: 12, drivMin: null, planMs: 8 * H, rozdilMin: -1 }]]);
  const pr1 = priznakyRadku(r1[0], plany, ted);
  eq('příznaky: pozdě z plánu první části, pauza, nic k ověření kromě pozdě', [pr1.pozdeMin, pr1.pauza, pr1.poznamka, pr1.mimoPodnik, kOvereni(pr1)], [12, true, false, false, true]);
  const eFar = z(6, p(D, '10:00'), p(D, '14:00'), { source: 'self', geoStatus: 'far', geoDistanceM: 1234 });
  const eOk = z(7, p(D, '10:00'), p(D, '14:00'), { source: 'self', geoStatus: 'ok', geoDistanceM: 40 });
  const far = radkyZaznamu([eFar], ted)[0];
  const okG = radkyZaznamu([eOk], ted)[0];
  eq('příznaky: mimo podnik je k ověření, u podniku ne', [kOvereni(priznakyRadku(far, new Map(), ted)), priznakyRadku(far, new Map(), ted).mimoPodnik, kOvereni(priznakyRadku(okG, new Map(), ted)), priznakyRadku(okG, new Map(), ted).uPodniku], [true, true, false, true]);
  const ePozn = z(8, p(D, '10:00'), p(D, '14:00'), { note: 'tablet nešel' });
  const pozn = radkyZaznamu([ePozn], ted)[0];
  const poznUpr = radkyZaznamu([z(9, p(D, '10:00'), p(D, '14:00'), { note: 'doplněno', updatedBy: 15, updatedByName: 'Martin' })], ted)[0];
  eq('příznaky: poznámka ze samoobsluhy je k ověření, po ruční úpravě ne', [kOvereni(priznakyRadku(pozn, new Map(), ted)), kOvereni(priznakyRadku(poznUpr, new Map(), ted)), priznakyRadku(poznUpr, new Map(), ted).upraveno], [true, false, true]);
  const stara = radkyZaznamu([z(10, p('2026-10-11', '09:00'), p('2026-10-11', '12:00')), z(11, p('2026-10-11', '12:00'), p('2026-10-11', '12:00'), { source: 'break', breakAfter: 10 })], ted)[0];
  eq('příznaky: pauza bez konce (víc než 12 h) je k ověření', [priznakyRadku(stara, new Map(), ted).pauzaBezKonce, kOvereni(priznakyRadku(stara, new Map(), ted))], [true, true]);
  const offl = radkyZaznamu([z(12, p(D, '10:00'), p(D, '14:00'), { offline: true })], ted)[0];
  eq('příznaky: offline se jen označí, k ověření není', [priznakyRadku(offl, new Map(), ted).offline, kOvereni(priznakyRadku(offl, new Map(), ted))], [true, false]);

  // ---- pásy a filtr ----
  const vse = radkyZaznamu([B, A, jiny, eFar, eOk, ePozn], ted);
  const roster = [{ id: 16, name: 'Eva Testová', avatar: '👩', jobTitle: 'Barista' }, { id: 15, name: 'Martin Nemeškal', avatar: '🧑', jobTitle: null }];
  eq('pás lidí: počty směn, nejvíc nahoře', pasLidi(vse, roster).map(l => [l.id, l.nazev, l.pocet]), [['16', 'Eva Testová', 4], ['15', 'Martin', 1]]);
  const pozice = poziceZRosteru(roster);
  eq('pás pozic: Barista 4, bez pozice 1 (vždy poslední)', pasPozic(vse, pozice).map(x => [x.id, x.pocet]), [['Barista', 4], [BEZ_POZICE, 1]]);
  const priznaky = (r: (typeof vse)[number]) => priznakyRadku(r, plany, ted);
  eq('filtr: člověk', filtrujRadky(vse, { clovek: '15', pozice: '', jenKOvereni: false }, pozice, priznaky).map(r => r.hlavni.id), [4]);
  eq('filtr: pozice Barista a bez pozice', [filtrujRadky(vse, { clovek: '', pozice: 'Barista', jenKOvereni: false }, pozice, priznaky).length, filtrujRadky(vse, { clovek: '', pozice: BEZ_POZICE, jenKOvereni: false }, pozice, priznaky).map(r => r.hlavni.id)], [4, [4]]);
  eq('filtr: jen k ověření = pozdě (A), mimo podnik, poznámka', filtrujRadky(vse, { clovek: '', pozice: '', jenKOvereni: true }, pozice, priznaky).map(r => r.hlavni.id), [1, 6, 8]);
  eq('filtr: hledání jménem zúží na Martina', filtrujRadky(vse, { clovek: '', pozice: '', jenKOvereni: false }, pozice, priznaky, r => (r.hlavni.employeeName ?? '').includes('Martin')).map(r => r.hlavni.id), [4]);
  eq('pilulka: druhý klik ruší', [prepniHodnotu('', '16'), prepniHodnotu('16', '16'), prepniHodnotu('16', '15')], ['16', '', '15']);
  const s = souhrnRadku(vse.filter(r => String(r.hlavni.employeeId) === '16'), plany, ted);
  eq('souhrn Evy: 4 směny, 1× pozdě, pauza 30 min, 3 k ověření', [s.smen, s.pozde, s.pauzaMs / MIN, s.kOvereni], [4, 1, 30, 3]);

  // ---- CSV ----
  eq('csv: pauza v minutách jen u řádku s pauzou', [csvPauzaMin(r1[0]), csvPauzaMin(r1[1])], ['30', '']);
  eq('csv: poloha slovy', [csvPoloha(far.hlavni), csvPoloha(okG.hlavni), csvPoloha({ ...A, geoStatus: 'missing' }), csvPoloha(A)], ['mimo podnik 1234 m', 'u podniku 40 m', 'bez polohy', '']);

  // ---- zámek ----
  const zari = { id: 1, od: '2026-09-01', do: '2026-09-30' };
  const pulka = { id: 2, od: '2026-10-01', do: '2026-10-15' };
  eq('zámek: den v zámku', [zamekDne([zari, pulka], '2026-09-15')?.id, zamekDne([zari, pulka], '2026-10-10')?.id, zamekDne([zari, pulka], '2026-10-20')], [1, 2, null]);
  eq('zámek: celý měsíc → „2026-09", půlka ne', [mesicZamku(zari), mesicZamku(pulka), mesicZamku({ od: '2026-02-01', do: '2026-02-28' }), mesicZamku({ od: '2024-02-01', do: '2024-02-29' })], ['2026-09', null, '2026-02', '2024-02']);
  eq('zámek: hláška jmenuje měsíc a kam jít', hlaskaZamku(zari), 'Září 2026 je uzavřené ve výplatách — otevři ho ve Výplatní listině.');
  eq('zámek: hláška pro půlku měsíce', hlaskaZamku(pulka), 'Období 1. 10. – 15. 10. 2026 je uzavřené ve výplatách — otevři ho ve Výplatní listině.');
  eq('zámek: den záznamu v Praze (příchod 23:30 UTC = 1:30 v Praze)', [denZaznamuPraha('2026-10-12T23:30:00.000Z'), denZaznamuPraha(null)], ['2026-10-13', null]);

  // ---- fronta tabletu ----
  const tedF = Date.parse('2026-10-13T10:00:00Z');
  const pol = (klic: string, id: number, action: 'in' | 'out', min: number): PolozkaFronty => ({ klic, employeeId: id, jmeno: `#${id}`, action, cas: new Date(tedF - min * MIN).toISOString(), pinOvereno: true });
  let f = pridejDoFronty([], pol('k-00000001', 8, 'in', 30));
  f = pridejDoFronty(f, pol('k-00000002', 1, 'out', 10));
  f = pridejDoFronty(f, pol('k-00000001', 8, 'in', 30));
  eq('fronta: stejný klíč podruhé se nepřidá, řadí se podle času', f.map(x => x.klic), ['k-00000001', 'k-00000002']);
  let plna: PolozkaFronty[] = [];
  for (let i = 0; i < MAX_FRONTA + 5; i++) plna = pridejDoFronty(plna, pol(`k-${String(i).padStart(8, '0')}`, 1, 'in', 1000 - i));
  eq('fronta: strop — nejstarší se zahodí', [plna.length, plna[0].klic], [MAX_FRONTA, 'k-00000005']);
  const rost = [{ id: 1, name: 'Martin', openSince: '2026-10-13T06:00:00.000Z' }, { id: 8, name: 'Lucie', openSince: null }, { id: 3, name: 'Jakub', openSince: null }];
  eq('fronta: rozpis podle fronty — Lucie přišla, Martin odešel, Jakub beze změny', rosterSFrontou(rost, f).map(m => [m.id, m.openSince]), [[1, null], [8, f[0].cas], [3, null]]);
  ok('fronta: prázdná fronta vrátí tytéž řádky', rosterSFrontou(rost, [])[0] === rost[0]);
  const stare = pol('k-00000009', 1, 'in', 25 * 60);
  eq('fronta: starší než den se odloží', zastaraleVeFronte([...f, stare], tedF).zastarale.map(x => x.klic), ['k-00000009']);
  const po = poSynchronizaci(f, [{ klic: 'k-00000001', ok: true }, { klic: 'k-00000002', ok: false, error: 'Žádný otevřený příchod k odpíchnutí.' }]);
  eq('fronta: po odpovědi doručené i odmítnuté zmizí, bez odpovědi zůstane', [po.doruceno, po.odmitnuto.map(o => o.jmeno), po.zbyva.length, poSynchronizaci(f, []).zbyva.length], [1, ['#1'], 0, 2]);
  eq('fronta: s PINem bez otisku nejde offline, bez PINu jde', [duvodProcNeOffline({ hasPin: true }, false), duvodProcNeOffline({ hasPin: true }, true), duvodProcNeOffline({ hasPin: false }, false)], ['bez_otisku', null, null]);

  // ---- server: ověření kusu ----
  const okK = overPolozkuSync({ klic: 'k-00000001', employeeId: 8, action: 'in', cas: new Date(tedF - 5 * MIN).toISOString(), pinOvereno: true }, tedF);
  ok('sync: platný kus projde', okK.ok && okK.p.employeeId === 8 && okK.p.action === 'in' && okK.p.pinOvereno);
  eq('sync: krátký klíč, cizí akce, nečitelný čas', [
    overPolozkuSync({ klic: 'abc', employeeId: 8, action: 'in', cas: new Date(tedF).toISOString() }, tedF).ok,
    overPolozkuSync({ klic: 'k-00000001', employeeId: 8, action: 'pauza', cas: new Date(tedF).toISOString() }, tedF).ok,
    overPolozkuSync({ klic: 'k-00000001', employeeId: 8, action: 'in', cas: 'včera' }, tedF).ok,
  ], [false, false, false]);
  const starý = overPolozkuSync({ klic: 'k-00000001', employeeId: 8, action: 'in', cas: new Date(tedF - 25 * H).toISOString() }, tedF);
  const budouci = overPolozkuSync({ klic: 'k-00000001', employeeId: 8, action: 'in', cas: new Date(tedF + 15 * MIN).toISOString() }, tedF);
  ok('sync: starší než den a v budoucnosti se odmítne (s důvodem)', !starý.ok && /starší než den/.test(starý.chyba) && !budouci.ok && /budoucnosti/.test(budouci.chyba));
  ok('sync: 9 minut dopředu (rozladěné hodiny) ještě projde', overPolozkuSync({ klic: 'k-00000001', employeeId: 8, action: 'out', cas: new Date(tedF + 9 * MIN).toISOString() }, tedF).ok);

  // ---- DDL, audit, zdroje ----
  const init = zdroj('app/api/init/route.ts');
  ok('DDL: teams.clock_geo, time_entries.geo_status / geo_distance_m / offline', ['ALTER TABLE teams ADD COLUMN IF NOT EXISTS clock_geo JSONB', 'ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS geo_status TEXT', 'ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS geo_distance_m INTEGER', 'ALTER TABLE time_entries ADD COLUMN IF NOT EXISTS offline BOOLEAN DEFAULT FALSE'].every(s => init.includes(s)));
  ok('audit: klíče R8-2 mají popisek', ['dochazka.pravidla_pichani', 'dochazka.mimo_podnik', 'dochazka.sync_offline'].every(k => !!AUDIT_POPISKY[k]));
  const api = zdroj('app/api/attendance/route.ts');
  ok('API: PATCH i DELETE i ruční POST odmítnou uzavřené období (odmitniZamceny → 409)', (api.match(/await odmitniZamceny\(/g) ?? []).length >= 3 && /status: 409/.test(api) && api.includes('hlaskaZamku'));
  ok('API: GET nese breakAfter, geoStatus, geoDistanceM, offline, jobTitle, breakSince a zámky', ['te.break_after AS "breakAfter"', 'te.geo_status AS "geoStatus"', 'te.geo_distance_m AS "geoDistanceM"', 'te.offline', 'AS "jobTitle"', 'pz.clock_in AS "breakSince"', 'zamky'].every(s => api.includes(s)));
  ok('API: pauza z tabletu přes výběr člověka a PIN (break_start / break_end), odchod rovnou z pauzy', api.includes("action === 'break_start'") && api.includes("action === 'break_end'") && api.includes('otevrenaPauza(employeeId'));
  ok('API: poloha jen u vlastního píchnutí, mimo podnik = upozornění, ne blokace', api.includes("const pravidla = isKiosk ? null : await pravidlaPichaniPodniku") && api.includes("poloha?.status === 'far'") && api.includes("'dochazka.mimo_podnik'"));
  ok('API: otisk PINu dostane jen účet tabletu', api.includes("c.role.typ === 'kiosk' && opr.has('dochazka.tablet')") && api.includes('r.offlinePin'));
  ok('API: PUT ukládá pravidla píchání s dochazka.upravit a auditem', api.includes('export async function PUT') && api.includes("pozaduj('dochazka.upravit')") && api.includes("'dochazka.pravidla_pichani'"));
  ok('API: /api/attendance/pauza dál odmítá tablet (tablet jde přes výběr člověka)', zdroj('app/api/attendance/pauza/route.ts').includes("c.role.typ === 'kiosk'"));
  const sync = zdroj('app/api/attendance/sync/route.ts');
  ok('sync: jen účet tabletu, idempotence, PIN ověřený, zámek, offline = TRUE, audit a oznámení', ["c.role.typ !== 'kiosk'", 'sIdempotenci(', 'maPin && !p.pinOvereno', 'hlaskaZamku', 'offline', "'dochazka.sync_offline'", 'notifyUsers('].every(s => sync.includes(s)));
  const tablet = zdroj('components/kiosk/KioskShiftGate.tsx');
  ok('tablet: pás bez internetu, fronta v localStorage, otisky, pauza tlačítky ≥ 48 px', ['data-offline-pas', "'managero-kiosk-fronta'", "'managero-kiosk-otisky'", "submit('break_start')", "submit('break_end')", '!h-14', 'overPinOffline', "from 'bcryptjs'"].every(s => tablet.includes(s)));
  ok('tablet: na pauze je člověk pořád na směně (tablet zůstává odemčený)', tablet.includes('m.openSince || m.breakSince'));
  const ui = zdroj('components/employer/Attendance.tsx');
  ok('nástroj: řádky se spojenou pauzou, pásy s počty, jen k ověření, zámek, pravidla píchání, CSV s pauzou a polohou',
    ['radkyZaznamu(', 'pasLidi(', 'pasPozic(', 'data-jen-overeni', 'data-zamek', "t('Pravidla píchání')", "'Pauza (min)'", "'Poloha'", 'useUlozeno'].every(s => ui.includes(s)));
  ok('nástroj: data z GET nesou zámky a pravidla (vyberData)', ui.includes('zamky: Array.isArray(raw.zamky)') && ui.includes('normalizujPravidlaPichani(raw.pravidlaPichani)'));
  ok('lib: čisté moduly bez Reactu, fetch a úložiště', ['lib/geoPichani.ts', 'lib/dochazkaZaznamy.ts', 'lib/kioskOffline.ts'].every(f => !/from 'react'|\bfetch\(|localStorage\./.test(zdroj(f).replace(/^\/\/.*$/gm, ''))));
}
