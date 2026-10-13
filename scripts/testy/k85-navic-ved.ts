// Navíc (kolo 9, N1) — balík V (vedení): katalog widgetu Navíc v týmu, fronta v „Čeká na tebe",
// akce hledání, výchozí rozložení Odměn a čistá logika components/navic-vedeni/logika.ts
// (filtr, lidé, krokovač bodů, měsíc z nastavení, sloučení čekajících, stav nabídky, těla PATCH).
// Ve zdroji: Odměny mají část „navíc" otevíranou z adresy, profil člena a detail uzávěrky sekci Navíc.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { ZDROJE_FRONT } from '../../lib/widgety/katalog/obecne.ts';
import { STRANKA as ODMENY } from '../../lib/widgety/stranky/vedeni.odmeny.ts';
import { STRANKA as PREHLED } from '../../lib/widgety/stranky/vedeni.prehled.ts';
import { AKCE_HLEDANI, akceProHledani } from '../../components/widgety/akceHledani.ts';
import { obsahujeNekde, proHledani } from '../../lib/hledani.ts';
import type { Navic } from '../../lib/navic.ts';
import {
  ARG_NAVIC, FILTRY_STAVU, KROK_BODU, filtrujNavic, jeFiltrStavu, krokBodu, lideZeZapisu, mesicZNastaveni, poctyStavu, sloucCekajici,
  stavNabidky, teloOdmitnuti, teloUznani, uznaniVMezich,
} from '../../components/navic-vedeni/logika.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const z = (p: Partial<Navic>): Navic => ({
  id: 1, userId: 3, userName: 'Eva', userAvatar: null, reportedBy: null, reportedByName: null, day: '2026-10-13', shiftId: null, closingId: null,
  taskId: null, offerId: null, offerTitle: null, text: 'Vytřela sklad', photoUrl: null, pointsProposed: null, status: 'ceka', points: null, bonusCzk: null,
  decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: null, createdAt: '2026-10-13T18:00:00.000Z', ...p,
});

export default function ({ eq, ok }: Testy) {
  // ---- katalog a stránky ----
  const w = widget('odmeny.navic_tymu');
  ok('katalog: Navíc v týmu je hotový widget oblasti odměny pro vedení', !!w && w.stav === 'hotovo' && w.oblast === 'odmeny' && w.rozhrani.join() === 'vedeni');
  eq('katalog: velikosti M a L, výchozí L, na Odměnách i Přehledu', [w?.velikosti, w?.vychoziVelikost, w?.stranky], [['M', 'L'], 'L', ['vedeni.odmeny', 'vedeni.prehled']]);
  eq('katalog: vidí ho jen navic.zobrazit_tym, rozhoduje a zapisuje za člena navic.uznat', [w?.opravneni.vse, w?.opravneni.pole?.['akce:uznat'], w?.opravneni.pole?.['akce:zapsat_za_clena']], [['navic.zobrazit_tym'], 'navic.uznat', 'navic.uznat']);
  eq('katalog: rychlý filtr v hlavičce je období (tento / minulý měsíc)', [w?.rychlyFiltr, w?.nastaveni?.[0]?.klic, (w?.nastaveni?.[0] as any)?.vychozi], ['obdobi', 'obdobi', 'tento']);
  eq('katalog: cíl karty je Odměny › Navíc', w?.cil, { pohled: 'rewards', arg: ARG_NAVIC });
  ok('Odměny: široký Navíc v týmu je ve výchozím rozložení vedení i v doporučených', ODMENY.vychozi['typ:vedeni']!.some(p => p.w === 'odmeny.navic_tymu' && p.s === 'L') && ODMENY.doporucene.includes('odmeny.navic_tymu'));
  ok('Přehled: Navíc v týmu je mezi doporučenými', PREHLED.doporucene.includes('odmeny.navic_tymu'));

  // ---- Čeká na tebe ----
  const ceka = widget('prehled.ceka_na_tebe')!;
  eq('fronta navíc: zdroj jen čekající z celého týmu', ZDROJE_FRONT.navic, '/api/navic?scope=team&status=ceka');
  eq('fronta navíc: klíč pole je navic.uznat a widget ho má mezi „některé"', [ceka.opravneni.pole?.navic, ceka.opravneni.nektere.includes('navic.uznat')], ['navic.uznat', true]);
  const pole = ceka.nastaveni?.find(n => n.klic === 'fronty');
  ok('fronta navíc: volba „Navíc k uznání" v nastavení s oprávněním', pole?.typ === 'vicevyber' && pole.moznosti.some(m => m.id === 'navic' && m.nazev === 'Navíc k uznání' && m.opravneni === 'navic.uznat'));
  const obecne = zdroj('components/widgety/oblasti/obecne.tsx');
  ok('fronta navíc: komponenta počítá jen status ceka a otevírá část Navíc', /id: 'navic'[\s\S]{0,400}status === 'ceka'[\s\S]{0,200}otevriCastNavic/.test(obecne));

  // ---- hledání ----
  const uznat = AKCE_HLEDANI.find(a => a.id === 'navic-uznat');
  eq('akce: Navíc k uznání vede u vedení na Odměny s argumentem navic', [uznat?.nazev, uznat?.stranka, uznat?.arg, uznat?.rozhrani], ['Navíc k uznání', 'rewards', 'navic', ['vedeni']]);
  const zam = akceProHledani('zamestnanec', () => true);
  const ved = akceProHledani('vedeni', () => true);
  ok('akce: Zapsat navíc vede zaměstnance na Domů a vedení na Odměny', zam.some(a => a.nazev === 'Zapsat navíc' && a.stranka === 'home' && a.arg === 'navic') && ved.some(a => a.nazev === 'Zapsat navíc' && a.stranka === 'rewards'));
  const najdi = (q: string) => ved.filter(a => obsahujeNekde(proHledani(q), a.nazev, a.kde, ...a.slova)).map(a => a.id);
  ok('akce: „navic" bez diakritiky i „nad ramec" najdou Navíc k uznání', najdi('navic').includes('navic-uznat') && najdi('nad ramec').includes('navic-uznat'));

  // ---- logika ----
  const seznam = [
    z({ id: 1, userId: 3, userName: 'Eva', status: 'ceka', createdAt: '2026-10-13T10:00:00Z' }),
    z({ id: 2, userId: 4, userName: 'Adam', status: 'uznano', points: 20, day: '2026-10-10', createdAt: '2026-10-10T10:00:00Z' }),
    z({ id: 3, userId: 3, userName: 'Eva', status: 'odmitnuto', day: '2026-10-09', createdAt: '2026-10-09T10:00:00Z' }),
    z({ id: 4, userId: 5, userName: 'Zdeněk', status: 'ceka', createdAt: '2026-10-12T10:00:00Z' }),
  ];
  eq('filtr: stav + člověk', filtrujNavic(seznam, { stav: 'ceka', clovek: 3 }).map(x => x.id), [1]);
  eq('filtr: vse a bez člověka = vše', filtrujNavic(seznam, { stav: 'vse', clovek: null }).length, 4);
  eq('lidé ze zápisů: každý jednou, podle jména', lideZeZapisu(seznam).map(l => l.jmeno), ['Adam', 'Eva', 'Zdeněk']);
  eq('počty stavů', poctyStavu(seznam), { ceka: 2, uznano: 1, odmitnuto: 1, vse: 4 });
  ok('filtr stavu: čtyři hodnoty, cizí neprojde', FILTRY_STAVU.length === 4 && jeFiltrStavu('vse') && !jeFiltrStavu('x'));
  eq('krokovač: ±5, strop 500, dno 0, nečíslo = 0', [krokBodu('17', 1), krokBodu(498, 1), krokBodu(3, -1), krokBodu('', 1), KROK_BODU], [22, 500, 0, 5, 5]);
  eq('měsíc z nastavení: tento / minulý přes rok', [mesicZNastaveni('tento', '2026-10-13'), mesicZNastaveni('minuly', '2026-10-13'), mesicZNastaveni('minuly', '2026-01-05'), mesicZNastaveni(undefined, '2026-03-01')], ['2026-10', '2026-09', '2025-12', '2026-03']);
  const mesicni = [seznam[1], seznam[0]];
  const cekajici = [seznam[3], seznam[0], z({ id: 9, status: 'ceka', day: '2026-09-30', createdAt: '2026-09-30T10:00:00Z' })];
  eq('sloučení: čekající ze starého měsíce přibudou, nic dvakrát, čekající nejstarší první', sloucCekajici(mesicni, cekajici).map(x => x.id), [9, 4, 1, 2]);
  eq('stav nabídky', [
    stavNabidky({ active: true, validFrom: null, validTo: null }, '2026-10-13'),
    stavNabidky({ active: false, validFrom: null, validTo: null }, '2026-10-13'),
    stavNabidky({ active: true, validFrom: null, validTo: '2026-10-12' }, '2026-10-13'),
    stavNabidky({ active: true, validFrom: '2026-10-20', validTo: null }, '2026-10-13'),
  ], ['plati', 'vypnuta', 'prosla', 'zacne']);
  eq('tělo uznání: body číslo (0 = bez odměny), prémie jen kladná, poznámka jen neprázdná', [teloUznani('', '', '  '), teloUznani('20', '300', ' díky ')], [{ status: 'uznano', points: 0, bonusCzk: null }, { status: 'uznano', points: 20, bonusCzk: 300, note: 'díky' }]);
  eq('tělo odmítnutí: důvod jen neprázdný', [teloOdmitnuti(''), teloOdmitnuti('patří k úkolu')], [{ status: 'odmitnuto' }, { status: 'odmitnuto', note: 'patří k úkolu' }]);
  eq('meze uznání: 0–500 b, prémie do stropu, celá čísla', [uznaniVMezich('', '', 5000), uznaniVMezich(500, 5000, 5000), uznaniVMezich(501, 0, 5000), uznaniVMezich(2.5, 0, 5000), uznaniVMezich(0, 5001, 5000)], [true, true, false, false, false]);

  // ---- ve zdroji ----
  const rv = zdroj('components/employer/RewardsView.tsx');
  ok('Odměny: část „navic" s nabídkou (SpravaNabidky) a otevírání z adresy / události (useCastNavic)', /'navic' as const/.test(rv) && /<SpravaNabidky \/>/.test(rv) && /useCastNavic\(/.test(rv));
  ok('profil člena má sekci Navíc (NavicClena) s obnovou profilu po rozhodnutí', /<NavicClena clovek=\{\{ id: e\.id, jmeno: e\.name \}\} onZmena=\{load\} \/>/.test(zdroj('components/employer/EmployeeProfile.tsx')));
  ok('detail uzávěrky má sekci Navíc na směně (osádka = crew, den = obchodní den)', /<NavicUzaverky uzaverka=\{\{ id, day: String\(c\.shift_date \?\? c\.date\)\.slice\(0, 10\), lide: d\.crew\.map\(p => p\.id\) \}\}/.test(zdroj('components/employer/ClosingDetail.tsx')));
  const okno = zdroj('components/navic-vedeni/UznatNavic.tsx');
  ok('okno Uznat: body i prémie s klávesnicí čísel a PATCH /api/navic/[id]', /inputMode="numeric"/.test(okno) && /fetch\(`\/api\/navic\/\$\{zapis\.id\}`/.test(okno) && /method: 'PATCH'/.test(okno));
  ok('okno nabídky: validace validujNabidku před odesláním, POST i PATCH /api/navic/offers', /validujNabidku\(telo\(\)\)/.test(zdroj('components/navic-vedeni/NabidkaNavicOkno.tsx')) && /nova \? 'POST' : 'PATCH'/.test(zdroj('components/navic-vedeni/NabidkaNavicOkno.tsx')));
  ok('zapsat za člena: POST /api/navic s userId a uznat', /userId: Number\(kdo\)/.test(zdroj('components/navic-vedeni/ZapsatZaClena.tsx')) && /uznat: \{ points/.test(zdroj('components/navic-vedeni/ZapsatZaClena.tsx')));
}
