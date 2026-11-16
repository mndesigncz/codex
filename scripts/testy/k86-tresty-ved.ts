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
import {
  akceSrazky, castkaPenez, castkyNaOsobu, chybaPenez, jmenaDavky, kraceniZPenez, lideVyberu, maPenize, prazdnePenize, prepniVyber, roleVyberu, rychlaVolba,
  souhrnPenez, strhavaSe, teloPenez, teloZaskoku,
} from '../../components/tresty-vedeni/penize.ts';

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
  // Kolo 96: manko se řeší náhradou škody se schodkem (bez klíče návrhu manko:<id>, ten server odmítá).
  ok('detail uzávěrky: u manka náhrada škody se schodkem (autor, uzávěrka, výše manka) a sekce Tresty na směně', /diff < 0 && c\.created_by/.test(cd)
    && /penize: \{ rezim: 'nahrada', druhSkody: 'schodek', skoda: -diff \}/.test(cd) && !/sourceKey: `manko:/.test(cd) && /<TrestyUzaverky uzaverka=/.test(cd));
  const srm = zdroj('components/employer/ShiftReviewModal.tsx');
  ok('hodnocení směny: u výtky Dát trest s klíčem dohledaným v návrzích', /isFlagged && \(/.test(srm) && /klicVytky\(/.test(srm) && /druh: 'vytka'/.test(srm));
  const doch = zdroj('components/widgety/oblasti/dochazka.tsx');
  ok('Docházka: trest za pozdní příchod (pozde:<id>) a krácení prémie (trest) v úpravách', /sourceKey: `pozde:\$\{k\.id\}`/.test(doch) && (doch.match(/u\.source === 'trest'/g) ?? []).length === 2);
  const okno = zdroj('components/tresty-vedeni/DatTrest.tsx');
  const penizeOkna = zdroj('components/tresty-vedeni/PenizeVOkne.tsx');
  ok('okno Dát trest: validujTrest před odesláním, strop z GET ?strop=1, 409 se stropem pod krácením, čísla s klávesnicí', /validujTrest\(/.test(okno) && /urlStropu\(/.test(okno) && /res\.status === 409 && typeof d\?\.strop === 'number'/.test(okno)
    && (okno.match(/inputMode="numeric"/g) ?? []).length === 1 && (penizeOkna.match(/inputMode="numeric"/g) ?? []).length === 1);
  ok('okno Dát trest: krácení vždy s větou, že jde jen o nenárokovou prémii (§ 346b)', /Krátí se jen nenároková prémie za ten měsíc, ne mzda — peněžní postihy zákoník práce zakazuje \(§ 346b\)/.test(penizeOkna));
  // Kolo 96 — peníze, hromadně, záskok.
  ok('okno Dát trest: peníze jen s finance.mzdy (sekce Peníze i Záskok)', /const smiPenize = nacteno && ma\('finance\.mzdy'\)/.test(okno) && /\{smiPenize && \(\s*<SekcePenez/.test(okno) && /const strhava = smiPenize && /.test(okno));
  ok('okno Dát trest: dávka posílá userIds bez klíče návrhu a peníze z teloPenez', /userIds: ids, sourceKey: undefined/.test(okno) && /teloPenez\(penize, ids\.length\)/.test(okno) && /chybaPenez\(penize, ids\.length, dnes\)/.test(okno));
  ok('okno Dát trest: výběr lidí z /api/tresty/vyber (celá směna, uzávěrka, role) a souhrn před uložením', /useVyberLidi\(/.test(okno) && /<VyberLidi /.test(okno) && /<SouhrnPenezBlok /.test(okno)
    && /data-rychla-volba/.test(zdroj('components/tresty-vedeni/VyberLidi.tsx')) && /roleVyberu\(/.test(zdroj('components/tresty-vedeni/VyberLidi.tsx')));
  ok('okno Dát trest: srážka a náhrada s větou, kdy se strhne (vetaSouhlasu), schodek s dohodou o odpovědnosti a datem', /vetaSouhlasu\(/.test(penizeOkna) && /U HPP, DPP a DPČ se strhne až po souhlasu zaměstnance v aplikaci; u OSVČ hned\./.test(penizeOkna)
    && /Máme podepsanou dohodu o odpovědnosti/.test(penizeOkna) && /id="trest-dohoda-datum"/.test(penizeOkna));
  const radekZ = zdroj('components/tresty-vedeni/TrestRadek.tsx');
  ok('řádek trestu: peníze (PenizeVRadku) a akce srážek a záskoku jen se smiPenize', /<PenizeVRadku x=\{x\} davka=\{davka\} \/>/.test(radekZ) && /smiPenize && !zruseno && onSrazka/.test(radekZ) && /Změnit záskok…/.test(radekZ));
  const tc = zdroj('components/tresty-vedeni/TrestyClena.tsx');
  ok('profil člena: nenároková složka uvnitř sekce Tresty (čte finance.mzdy, mění finance.sazby_upravit)', /<SlozkaClena clovek=\{clovek\}/.test(tc)
    && /ma\('finance\.mzdy'\)/.test(zdroj('components/tresty-vedeni/SlozkaClena.tsx')) && /ma\('finance\.sazby_upravit'\)/.test(zdroj('components/tresty-vedeni/SlozkaClena.tsx')));
  const odmenyW = zdroj('components/widgety/oblasti/odmeny.tsx');
  ok('widget Tresty v týmu: fronta nesouhlasů se srážkou a odměna v penězích; Navíc v týmu ji má taky', /<FrontaSrazek zapnuto=\{smiPenize\}/.test(odmenyW) && (odmenyW.match(/<OdmenaVKcTlacitko \/>/g) ?? []).length === 2);
  ok('Čeká na tebe: fronta „srazky" (nesouhlas se srážkou) jako čtrnáctý háček', /id: 'srazky', ikona: 'coins'/.test(obecne) && /useFronta\(FRONTY\[13\], zap\(FRONTY\[13\]\)\)/.test(obecne)
    && ZDROJE_FRONT.srazky === '/api/tresty/srazky?scope=team&stav=nesouhlas' && ceka.opravneni.pole?.srazky === 'finance.mzdy');
  eq('katalog: Tresty v týmu mají pole penize (finance.mzdy)', w?.opravneni.pole?.penize, 'finance.mzdy');
  ok('okno Dát trest: věta, že napomenutí není výtka podle § 52 písm. g)', /Napomenutí v aplikaci není výtka podle § 52 písm\. g\) zákoníku práce\./.test(okno));
  ok('okno Dát trest: při stropu 0 řekne proč a jak prémii založit', /Krátit jde jen nenárokovou prémii a tenhle měsíc žádná není\. Založ ji v Docházce/.test(okno));
  // Spuštění (balík P): manko trestem není — detail uzávěrky dál volá TrestTlacitko s klíčem manko:<id>,
  // ale tlačítko místo okna ukáže jen větu (TrestyUzaverky.tsx).
  const tu = zdroj('components/tresty-vedeni/TrestyUzaverky.tsx');
  ok('manko: TrestTlacitko bez finance.mzdy větu „Manko řeš dohodou o odpovědnosti, ne trestem.", s ním náhradu škody se schodkem bez klíče návrhu',
    /druhNavrhu === 'manko'/.test(tu) && /Manko řeš dohodou o odpovědnosti, ne trestem\./.test(tu) && /manko && !smiPenize/.test(tu)
    && /sourceKey: null, druhNavrhu: undefined, typeId: null, points: 0, bonusCut: 0, penize: \{ rezim: 'nahrada', druhSkody: 'schodek'/.test(tu));

  // ---- kolo 96: peníze v okně (components/tresty-vedeni/penize.ts) ----
  const f0 = prazdnePenize();
  eq('peníze: výchozí krácení bez částky, záskok podniku, nic se nestrhává', [f0.rezim, f0.zaskokKomu, strhavaSe(f0), teloPenez(f0, 1)], ['kraceni', 'podnik', false, {}]);
  eq('peníze: krácení jde do bonusCut (kraceniZPenez), jinak prázdné', [kraceniZPenez({ ...f0, kraceni: '300' }), kraceniZPenez({ ...f0, rezim: 'srazka', kraceni: '300' })], ['300', '']);
  eq('peníze: srážka se splátkami', teloPenez({ ...f0, rezim: 'srazka', srazka: '1200', splatky: '3' }, 1), { srazka: { castka: 1200, splatky: 3 } });
  eq('peníze: náhrada schodku s dohodou a datem, bez „kolik chtít" = celá škoda', teloPenez({ ...f0, rezim: 'nahrada', skoda: '340', druhSkody: 'schodek', dohoda: true, dohodaDatum: '2026-01-05' }, 1),
    { nahrada: { skoda: 340, druh: 'schodek', dohoda: true, dohodaDatum: '2026-01-05', splatky: 1 } });
  eq('peníze: zaviněná škoda nese zavinění a „kolik chtít"', teloPenez({ ...f0, rezim: 'nahrada', skoda: '5000', nahrada: '2000', zavineni: 'umysl' }, 1),
    { nahrada: { skoda: 5000, castka: 2000, druh: 'zavinena', zavineni: 'umysl', splatky: 1 } });
  eq('peníze: dávka posílá rozpocitat, záskok na lidi rovným dílem / vlastní částky / směna',
    [teloPenez({ ...f0, kraceni: '900', rozpocitat: true, zaskokKomu: 'lide', zaskokLide: [{ userId: 9, castka: '' }] }, 3),
      teloPenez({ ...f0, kraceni: '300', zaskokKomu: 'lide', zaskokZpusob: 'castky', zaskokLide: [{ userId: 9, castka: '200' }] }, 1),
      teloPenez({ ...f0, kraceni: '300', zaskokKomu: 'smena' }, 1)],
    [{ rozpocitat: true, zaskok: { komu: 'lide', zpusob: 'rovne', lide: [{ userId: 9 }] } },
      { zaskok: { komu: 'lide', zpusob: 'castky', lide: [{ userId: 9, castka: 200 }] } },
      { zaskok: { komu: 'smena' } }]);
  eq('peníze: záskok bez stržené částky se neposílá', teloPenez({ ...f0, zaskokKomu: 'smena' }, 1), {});
  eq('peníze: změna záskoku (PATCH) i zpět na podnik', [teloZaskoku({ zaskokKomu: 'podnik', zaskokZpusob: 'rovne', zaskokLide: [] }), teloZaskoku({ zaskokKomu: 'lide', zaskokZpusob: 'rovne', zaskokLide: [{ userId: 4, castka: '' }] })],
    [{ zaskok: { komu: 'podnik' } }, { zaskok: { komu: 'lide', zpusob: 'rovne', lide: [{ userId: 4 }] } }]);
  eq('peníze: každý X / rozpočítat X na osobu', [castkyNaOsobu({ ...f0, kraceni: '1000' }, 3), castkyNaOsobu({ ...f0, kraceni: '1000', rozpocitat: true }, 3)], [[1000, 1000, 1000], [334, 333, 333]]);
  eq('peníze: kontrola před odesláním — schodek bez dohody, náhrada nad škodu, kolegům víc než strženo, rozpočítání na 0',
    [chybaPenez({ ...f0, rezim: 'nahrada', skoda: '340', druhSkody: 'schodek' }, 1, '2026-10-13'),
      chybaPenez({ ...f0, rezim: 'nahrada', skoda: '340', nahrada: '500' }, 1, '2026-10-13'),
      chybaPenez({ ...f0, kraceni: '300', zaskokKomu: 'lide', zaskokZpusob: 'castky', zaskokLide: [{ userId: 9, castka: '' }] }, 1, '2026-10-13'),
      chybaPenez({ ...f0, rezim: 'srazka', srazka: '2', rozpocitat: true }, 3, '2026-10-13'),
      chybaPenez({ ...f0, rezim: 'srazka', srazka: '500' }, 1, '2026-10-13')],
    ['Schodek a ztrátu svěřených věcí jde vymáhat jen s podepsanou dohodou o odpovědnosti — zaškrtni ji a doplň datum.', 'Náhrada nemůže být vyšší než škoda.',
      'Zadej částku aspoň jednomu kolegovi.', 'Po rozpočítání by někomu vyšlo 0 — zvyš částku.', null]);
  // Souhrn: hromadný trest 3 lidem s rozpočítáním, záskok kolegovi; srážka u DPP čeká na souhlas; OSVČ hned.
  const tri = [{ id: 1, jmeno: 'Jana' }, { id: 2, jmeno: 'Petr' }, { id: 3, jmeno: 'Eva' }];
  const s3 = souhrnPenez({ f: { ...f0, kraceni: '900', rozpocitat: true, zaskokKomu: 'lide', zaskokLide: [{ userId: 7, castka: '' }] }, lide: tri, jmena: new Map([[7, 'Adam']]) });
  eq('souhrn: rozpočítat 900 mezi 3 → každý −300 z prémie, Adam +900, podniku 0', [s3.strhne.map(x => [x.jmeno, x.castka, x.ceka]), s3.prijme, s3.podniku, s3.chyba],
    [[['Jana', 300, false], ['Petr', 300, false], ['Eva', 300, false]], [{ userId: 7, jmeno: 'Adam', castka: 900, poSouhlasu: false }], 0, null]);
  const sDpp = souhrnPenez({ f: { ...f0, rezim: 'srazka', srazka: '500', zaskokKomu: 'lide', zaskokZpusob: 'castky', zaskokLide: [{ userId: 2, castka: '300' }] }, lide: [{ id: 1, jmeno: 'Jana', smlouva: 'DPP' }], jmena: new Map([[2, 'Petr']]) });
  eq('souhrn: srážka u DPP čeká na souhlas, Petr +300 až po souhlasu, podniku 200', [sDpp.strhne[0].ceka, sDpp.prijme[0], sDpp.podniku], [true, { userId: 2, jmeno: 'Petr', castka: 300, poSouhlasu: true }, 200]);
  eq('souhrn: OSVČ hned, záskok celé směně bez potrestaného', (() => {
    const s = souhrnPenez({ f: { ...f0, rezim: 'srazka', srazka: '600', zaskokKomu: 'smena' }, lide: [{ id: 1, jmeno: 'Jana', smlouva: 'OSVC' }], osadka: [{ id: 1, jmeno: 'Jana' }, { id: 2, jmeno: 'Petr' }, { id: 3, jmeno: 'Eva' }] });
    return [s.strhne[0].ceka, s.prijme.map(x => [x.jmeno, x.castka]), s.podniku];
  })(), [false, [['Petr', 300], ['Eva', 300]], 0]);
  eq('souhrn: neznámá smlouva (bez výplatní listiny) = počká na souhlas', souhrnPenez({ f: { ...f0, rezim: 'nahrada', skoda: '100' }, lide: [{ id: 1, jmeno: 'Jana' }] }).strhne[0].ceka, true);
  // Výběr lidí.
  const vyberL = [
    { id: 1, name: 'Jana', avatar: null, role: 'zamestnanec', jobTitle: 'Barista' },
    { id: 2, name: 'Adam', avatar: null, role: 'zamestnanec', jobTitle: 'Kuchař' },
    { id: 3, name: 'Eva', avatar: null, role: 'vedouci', jobTitle: null },
  ];
  eq('výběr: role z pozice nebo role, filtr podle ní, podle jména', [roleVyberu(vyberL), lideVyberu(vyberL, 'Barista').map(l => l.id), lideVyberu(vyberL, '').map(l => l.name)],
    [['Barista', 'Kuchař', 'vedouci'], [1], ['Adam', 'Eva', 'Jana']]);
  eq('výběr: přepnout, rychlá volba přidá skupinu, druhé klepnutí ji odebere', [prepniVyber([1], 2), prepniVyber([1, 2], 1), rychlaVolba([3], [1, 2]), rychlaVolba([1, 2, 3], [1, 2])],
    [[1, 2], [2], [3, 1, 2], [3]]);
  eq('srážka: akce vedení podle stavu', [akceSrazky({ stav: 'ceka', castka: 500 }, true), akceSrazky({ stav: 'nesouhlas', castka: 500 }, true), akceSrazky({ stav: 'zruseno', castka: 500 }, true), akceSrazky({ stav: 'uplatneno', castka: 500 }, false)],
    [{ zrusit: true, snizit: true, znovu: false }, { zrusit: true, snizit: false, znovu: true }, { zrusit: false, snizit: false, znovu: false }, { zrusit: false, snizit: false, znovu: false }]);
  eq('dávka: jména lidí stejného hromadného trestu', jmenaDavky([{ batchId: 5, userName: 'Jana', status: 'plati' }, { batchId: 5, userName: 'Petr', status: 'plati' }, { batchId: 6, userName: 'Eva', status: 'plati' }], 5), ['Jana', 'Petr']);
  ok('peníze v řádku: maPenize jen s krácením, srážkou nebo platným převodem', !maPenize(null) && maPenize({ kraceni: 0, srazky: [], zaskok: { komu: 'lide', zpusob: 'rovne', prevody: [{ id: 1, userId: 2, userName: 'Petr', castka: 100, preslo: 0, stav: 'plati' }] }, cekaNaSouhlas: 0, strzeno: 100 })
    && castkaPenez({ ...f0, rezim: 'nahrada', skoda: '340' }) === 340);
}
