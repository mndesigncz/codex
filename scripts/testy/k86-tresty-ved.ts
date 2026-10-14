// Tresty (kolo 10) — balík V (vedení): katalog widgetu Tresty v týmu, fronta nesouhlasů v „Čeká na tebe",
// akce hledání, výchozí rozložení Odměn a ukázky a čistá logika components/tresty-vedeni/logika.ts
// (filtr, počty, lidé, krokovač, měsíc, sloučení sporných, předvolby z návrhu, těla POST a PATCH,
// strop krácení, pozdní příchod k trestu, klíč výtky). Ve zdroji: Odměny mají část „tresty" otevíranou
// z adresy, profil člena a detail uzávěrky sekci Tresty, uzávěrka „Dát trest za manko", hodnocení směny
// „Dát trest" u výtky a Docházka trest za pozdní příchod a pojmenované krácení prémie.
import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { ZDROJE_FRONT } from '../../lib/widgety/katalog/obecne.ts';
import { STRANKA as ODMENY } from '../../lib/widgety/stranky/vedeni.odmeny.ts';
import { STRANKA as PREHLED } from '../../lib/widgety/stranky/vedeni.prehled.ts';
import { AKCE_HLEDANI, akceProHledani } from '../../components/widgety/akceHledani.ts';
import { obsahujeNekde, proHledani } from '../../lib/hledani.ts';
import type { DruhTrestu, NavrhTrestu, Trest } from '../../lib/tresty.ts';
import {
  ARG_TRESTY, FILTRY_TRESTU, KROK_BODU, filtrujTresty, jeFiltrTrestu, klicVytky, kraceniVMezich, krokBodu, lideZTrestu, meniDopad,
  mesicZNastaveni, poctyFiltru, pozdniKTrestu, predvolbyZNavrhu, predvyplnitText, sloucSporne, teloTrestu, teloUpravy, vyhovujeFiltru,
} from '../../components/tresty-vedeni/logika.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
const tr = (p: Partial<Trest>): Trest => ({
  id: 1, userId: 3, userName: 'Eva', userAvatar: null, givenBy: 1, givenByName: 'Martin', day: '2026-10-13', shiftId: null, closingId: null,
  taskId: null, typeId: null, typeTitle: null, text: 'Pozdní příchod', photoUrl: null, points: 10, bonusCut: 0, status: 'plati', source: 'rucne',
  sourceKey: null, seenAt: null, response: null, responseAt: null, disputed: false, disputeHandledAt: null, cancelledBy: null, cancelledByName: null,
  cancelledAt: null, cancelNote: null, createdAt: '2026-10-13T18:00:00.000Z', ...p,
});
const kc = (n: number) => `${n} Kč`;

export default function ({ eq, ok }: Testy) {
  // ---- katalog a stránky ----
  const w = widget('odmeny.tresty_tymu');
  ok('katalog: Tresty v týmu je hotový widget oblasti odměny pro vedení', !!w && w.stav === 'hotovo' && w.oblast === 'odmeny' && w.rozhrani.join() === 'vedeni');
  eq('katalog: velikosti M a L, výchozí L, na Odměnách i Přehledu', [w?.velikosti, w?.vychoziVelikost, w?.stranky], [['M', 'L'], 'L', ['vedeni.odmeny', 'vedeni.prehled']]);
  eq('katalog: vidí ho jen tresty.zobrazit_tym, udělovat a návrhy tresty.udelit', [w?.opravneni.vse, w?.opravneni.pole?.['akce:udelit'], w?.opravneni.pole?.navrhy], [['tresty.zobrazit_tym'], 'tresty.udelit', 'tresty.udelit']);
  eq('katalog: rychlý filtr je období a cíl Odměny › Tresty', [w?.rychlyFiltr, w?.cil], ['obdobi', { pohled: 'rewards', arg: ARG_TRESTY }]);
  ok('katalog: ikona není warning (tu mají na Odměnách Výtky v týmu — AK-19)', w?.ikona !== widget('odmeny.vytky_tymu')?.ikona);
  ok('Odměny: široké Tresty v týmu ve výchozím rozložení vedení i v doporučených, před nástrojem', (() => {
    const v = ODMENY.vychozi['typ:vedeni']!;
    const i = v.findIndex(p => p.w === 'odmeny.tresty_tymu');
    return i >= 0 && v[i].s === 'L' && i < v.findIndex(p => p.w === 'nastroj') && ODMENY.doporucene.includes('odmeny.tresty_tymu');
  })());
  ok('Přehled: Tresty v týmu mezi doporučenými, ne ve výchozím', PREHLED.doporucene.includes('odmeny.tresty_tymu') && !PREHLED.vychozi['typ:vedeni']!.some(p => p.w === 'odmeny.tresty_tymu'));
  // Rozložení ukázky se čte jako text: soubor importuje typy přes alias `@/` (check-test-imports).
  const demo = zdroj('lib/demo/data/rozlozeni.ts').split("'vedeni.prehled': [")[1]?.split('\n  ],')[0] ?? '';
  const polozkyDema = [...demo.matchAll(/\{ w: '([^']+)'/g)].map(m => m[1]);
  eq('ukázka: Tresty v týmu úplně na konci Přehledu (průvodce míří na widgety výš)', polozkyDema.slice(-2), ['odmeny.navic_tymu', 'odmeny.tresty_tymu']);

  // ---- Čeká na tebe ----
  const ceka = widget('prehled.ceka_na_tebe')!;
  eq('fronta tresty: zdroj platné tresty týmu (stejná adresa jako sporné ve widgetu)', ZDROJE_FRONT.tresty, '/api/tresty?scope=team&status=plati');
  eq('fronta tresty: klíč pole tresty.udelit a mezi „některé"', [ceka.opravneni.pole?.tresty, ceka.opravneni.nektere.includes('tresty.udelit')], ['tresty.udelit', true]);
  const pole = ceka.nastaveni?.find(n => n.klic === 'fronty');
  ok('fronta tresty: volba „Nesouhlasy s tresty" v nastavení s oprávněním', pole?.typ === 'vicevyber' && pole.moznosti.some(m => m.id === 'tresty' && m.opravneni === 'tresty.udelit'));
  const obecne = zdroj('components/widgety/oblasti/obecne.tsx');
  ok('fronta tresty: počítá cekaSpor, ikona warning, otevírá část Tresty', /id: 'tresty', ikona: 'warning'[\s\S]{0,400}filter\(cekaSpor\)[\s\S]{0,100}otevriCastTresty/.test(obecne));
  ok('fronta tresty: třináctý háček fronty', /useFronta\(FRONTY\[12\], zap\(FRONTY\[12\]\)\)/.test(obecne));

  // ---- hledání ----
  const ved = akceProHledani('vedeni', () => true);
  const zam = akceProHledani('zamestnanec', () => true);
  const dat = AKCE_HLEDANI.find(a => a.id === 'tresty-dat');
  eq('akce: Dát trest vede vedení na Odměny › Tresty', [dat?.nazev, dat?.stranka, dat?.arg, dat?.rozhrani], ['Dát trest', 'rewards', 'tresty', ['vedeni']]);
  ok('akce: zaměstnanec akce trestů nemá', !zam.some(a => a.id.startsWith('tresty-')));
  const najdi = (q: string) => ved.filter(a => obsahujeNekde(proHledani(q), a.nazev, a.kde, ...a.slova)).map(a => a.id);
  ok('akce: „potrestat", „prusvih", „pokuta", „napomenuti" i „vytka" najdou Dát trest', ['potrestat', 'prusvih', 'pokuta', 'napomenuti', 'vytka'].every(q => najdi(q).includes('tresty-dat')));
  ok('akce: „sazebnik" najde Sazebník trestů', najdi('sazebnik').includes('tresty-sazebnik'));

  // ---- logika: filtr, počty, lidé ----
  const seznam = [
    tr({ id: 1, userId: 3, userName: 'Eva', disputed: true, response: 'Lednice netěsní.' }),
    tr({ id: 2, userId: 4, userName: 'Adam', seenAt: '2026-10-11T10:00:00Z', day: '2026-10-10' }),
    tr({ id: 3, userId: 3, userName: 'Eva', status: 'zruseno', day: '2026-10-09', cancelNote: 'omyl' }),
    tr({ id: 4, userId: 5, userName: 'Zdeněk', disputed: true, disputeHandledAt: '2026-10-12T10:00:00Z', seenAt: '2026-10-12T09:00:00Z' }),
  ];
  eq('filtr: platné / nesouhlasí / zrušené / vše', FILTRY_TRESTU.map(f => filtrujTresty(seznam, { stav: f }).map(x => x.id)), [[1, 2, 4], [1], [3], [1, 2, 3, 4]]);
  eq('filtr: člověk', filtrujTresty(seznam, { stav: 'vse', clovek: 3 }).map(x => x.id), [1, 3]);
  ok('filtr: vyřízený spor už „nesouhlasí" není, ale platí', !vyhovujeFiltru(seznam[3], 'spor') && vyhovujeFiltru(seznam[3], 'plati'));
  eq('počty filtrů', poctyFiltru(seznam), { plati: 3, spor: 1, zruseno: 1, vse: 4 });
  ok('filtr: čtyři hodnoty, cizí neprojde', FILTRY_TRESTU.length === 4 && jeFiltrTrestu('spor') && !jeFiltrTrestu('ceka'));
  eq('lidé: každý jednou, podle jména', lideZTrestu(seznam).map(l => l.jmeno), ['Adam', 'Eva', 'Zdeněk']);
  eq('krokovač: ±5, strop 500, dno 0, nečíslo = 0', [krokBodu('17', 1), krokBodu(498, 1), krokBodu(3, -1), krokBodu('', 1), KROK_BODU], [22, 500, 0, 5, 5]);
  eq('měsíc z nastavení: tento / minulý přes rok', [mesicZNastaveni('tento', '2026-10-13'), mesicZNastaveni('minuly', '2026-01-05')], ['2026-10', '2025-12']);
  const stary = tr({ id: 9, day: '2026-09-28', disputed: true, createdAt: '2026-09-28T10:00:00Z' });
  eq('sloučení: sporný z minulého měsíce přibude, nic dvakrát, sporné první', sloucSporne([seznam[1], seznam[0]], [seznam[0], stary, seznam[1]]).map(x => x.id), [1, 9, 2]);

  // ---- předvolby z návrhu a těla ----
  const druhy: DruhTrestu[] = [
    { id: 1, title: 'Pozdní příchod', description: null, points: 10, bonusCut: null, active: true, createdAt: '' },
    { id: 2, title: 'Manko v kase', description: null, points: 20, bonusCut: 200, active: true, createdAt: '' },
  ];
  const navrh: NavrhTrestu = { klic: 'manko:77', druh: 'manko', userId: 4, userName: 'Adam', userAvatar: null, day: '2026-10-11', closingId: 77, shiftId: null, minuty: null, castka: 340, poznamka: null };
  eq('předvolby z návrhu manka: text, položka sazebníku s body a krácením, klíč, uzávěrka', predvolbyZNavrhu(navrh, druhy, kc),
    { userId: 4, jmeno: 'Adam', day: '2026-10-11', shiftId: null, closingId: 77, text: 'Manko v uzávěrce 340 Kč.', typeId: 2, sourceKey: 'manko:77', points: 20, bonusCut: 200 });
  eq('předvolby z návrhu bez položky v sazebníku: napomenutí', predvolbyZNavrhu({ ...navrh, druh: 'vytka', klic: 'vytka:5', poznamka: 'Špinavá linka' }, druhy, kc).typeId, null);
  const f = { userId: '4', text: 'Manko', day: '2026-10-11', typeId: 2, points: '20', bonusCut: '', photoUrl: null };
  eq('tělo POST: čísla, vazby a klíč z předvoleb, bez fotky', teloTrestu(f, { closingId: 77, sourceKey: 'manko:77' }),
    { userId: 4, text: 'Manko', day: '2026-10-11', typeId: 2, points: 20, bonusCut: 0, closingId: 77, sourceKey: 'manko:77' });
  const puv = tr({ id: 5, text: 'Manko', day: '2026-10-11', typeId: 2, points: 20, bonusCut: 0 });
  eq('tělo PATCH: jen změny', [teloUpravy(f, puv), teloUpravy({ ...f, points: '25', text: 'Manko 340' }, puv)], [{}, { text: 'Manko 340', points: 25 }]);
  ok('změna dopadu: body, krácení a den ano, text ne', meniDopad({ points: 5 }) && meniDopad({ day: 'x' }) && !meniDopad({ text: 'x' }));
  eq('strop krácení: nezadané projde, nad strop ne, bez stropu projde', [kraceniVMezich('', 0), kraceniVMezich('300', 300), kraceniVMezich('301', 300), kraceniVMezich('900', null)], [true, true, false, true]);
  eq('chip sazebníku přepíše jen prázdný text nebo název jiné položky', [predvyplnitText('', druhy), predvyplnitText(' Manko v kase ', druhy), predvyplnitText('Přišel pozdě', druhy)], [true, true, false]);

  // ---- pozdní příchod v Docházce ----
  const prichody = [
    { id: 11, userId: 3, den: '2026-10-12', minuty: 18 },
    { id: 12, userId: 3, den: '2026-10-05', minuty: 25 },
    { id: 13, userId: 3, den: '2026-09-01', minuty: 40 },
    { id: 14, userId: 4, den: '2026-10-13', minuty: 12 },
  ];
  eq('pozdní příchod: nejnovější člověka, když návrhy nejsou načtené', pozdniKTrestu(prichody, 3, '2026-10-13', null)?.id, 11);
  eq('pozdní příchod: vyřízený (není v návrzích) se přeskočí', pozdniKTrestu(prichody, 3, '2026-10-13', new Set(['pozde:12']))?.id, 12);
  eq('pozdní příchod: starší 31 dní ne, mimo návrhy nic', pozdniKTrestu(prichody, 3, '2026-10-13', new Set())?.id ?? null, null);
  eq('pozdní příchod: id člověka jako text i číslo', pozdniKTrestu(prichody, '4', '2026-10-13', null)?.id, 14);

  // ---- klíč výtky ----
  const vytky: NavrhTrestu[] = [
    { klic: 'vytka:1', druh: 'vytka', userId: 3, userName: 'Eva', userAvatar: null, day: '2026-10-12', closingId: null, shiftId: null, minuty: null, castka: null, poznamka: 'Špinavá linka' },
    { klic: 'vytka:2', druh: 'vytka', userId: 3, userName: 'Eva', userAvatar: null, day: '2026-10-12', closingId: null, shiftId: null, minuty: null, castka: null, poznamka: 'Nezavřený sklad' },
    { klic: 'vytka:3', druh: 'vytka', userId: 4, userName: 'Adam', userAvatar: null, day: '2026-10-12', closingId: null, shiftId: null, minuty: null, castka: null, poznamka: null },
  ];
  eq('klíč výtky: jediná výtka dne', klicVytky(vytky, { userId: 4, day: '2026-10-12', poznamka: 'cokoli' }), 'vytka:3');
  eq('klíč výtky: víc výtek → podle poznámky', klicVytky(vytky, { userId: 3, day: '2026-10-12', poznamka: ' Nezavřený sklad ' }), 'vytka:2');
  eq('klíč výtky: nejednoznačné nebo nic → null', [klicVytky(vytky, { userId: 3, day: '2026-10-12', poznamka: null }), klicVytky(vytky, { userId: 3, day: '2026-10-11', poznamka: 'x' })], [null, null]);

  // ---- ve zdroji ----
  const rv = zdroj('components/employer/RewardsView.tsx');
  ok('Odměny: část „tresty" se sazebníkem a otevírání z adresy / události (useCastTresty)', /'tresty' as const/.test(rv) && /<SazebnikTrestu \/>/.test(rv) && /useCastTresty\(/.test(rv));
  ok('profil člena má sekci Tresty (TrestyClena)', /<TrestyClena clovek=\{\{ id: e\.id, jmeno: e\.name \}\} onZmena=\{load\} \/>/.test(zdroj('components/employer/EmployeeProfile.tsx')));
  const cd = zdroj('components/employer/ClosingDetail.tsx');
  ok('detail uzávěrky: Dát trest za manko (autor, klíč manko:<id>) a sekce Tresty na směně', /diff < 0 && c\.created_by/.test(cd) && /sourceKey: `manko:\$\{id\}`/.test(cd) && /<TrestyUzaverky uzaverka=/.test(cd));
  const srm = zdroj('components/employer/ShiftReviewModal.tsx');
  ok('hodnocení směny: u výtky Dát trest s klíčem dohledaným v návrzích', /isFlagged && \(/.test(srm) && /klicVytky\(/.test(srm) && /druh: 'vytka'/.test(srm));
  const doch = zdroj('components/widgety/oblasti/dochazka.tsx');
  ok('Docházka: trest za pozdní příchod (pozde:<id>) a krácení prémie (trest) v úpravách', /sourceKey: `pozde:\$\{k\.id\}`/.test(doch) && (doch.match(/u\.source === 'trest'/g) ?? []).length === 2);
  const okno = zdroj('components/tresty-vedeni/DatTrest.tsx');
  ok('okno Dát trest: validujTrest před odesláním, strop z GET ?strop=1, 409 se stropem pod krácením, čísla s klávesnicí', /validujTrest\(/.test(okno) && /urlStropu\(/.test(okno) && /res\.status === 409 && typeof d\?\.strop === 'number'/.test(okno) && (okno.match(/inputMode="numeric"/g) ?? []).length === 2);
  ok('okno Dát trest: krácení vždy s větou, že jde jen o nenárokovou prémii (§ 346b)', /Krátí se jen nenároková prémie za ten měsíc, ne mzda — peněžní postihy zákoník práce zakazuje \(§ 346b\)/.test(okno));
  ok('okno Dát trest: věta, že napomenutí není výtka podle § 52 písm. g)', /Napomenutí v aplikaci není výtka podle § 52 písm\. g\) zákoníku práce\./.test(okno));
  ok('okno Dát trest: při stropu 0 řekne proč a jak prémii založit', /Krátit jde jen nenárokovou prémii a tenhle měsíc žádná není\. Založ ji v Docházce/.test(okno));
  // Spuštění (balík P): manko trestem není — detail uzávěrky dál volá TrestTlacitko s klíčem manko:<id>,
  // ale tlačítko místo okna ukáže jen větu (TrestyUzaverky.tsx).
  const tu = zdroj('components/tresty-vedeni/TrestyUzaverky.tsx');
  ok('manko: TrestTlacitko u manka místo tlačítka větu „Manko řeš dohodou o odpovědnosti, ne trestem."', /druhNavrhu === 'manko'/.test(tu) && /Manko řeš dohodou o odpovědnosti, ne trestem\./.test(tu));
}
