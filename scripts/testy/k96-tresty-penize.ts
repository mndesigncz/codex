// Tresty a peníze z výplaty: čistá logika lib/trestyPenize.ts — nenároková složka a strop krácení,
// souhlas se srážkou podle smlouvy (HPP/DPP/DPČ až po souhlasu, OSVČ hned), náhrada škody se stropem
// 4,5× průměru, splátky, záskok (rovně / částkami / poměrně ke strženým kusům), uzavřené období
// (opravný řádek do dalšího otevřeného), hromadné dávky a rozpad výplaty.
import type { Testy } from './_testy.ts';
import {
  MAX_LIDI_DAVKY, NASOBEK_STROPU_NAHRADY, VETA_BEZ_PRUMERU, VETA_OSVC, VETA_SCHODEK, VETA_SOUHLAS_NEZNAMY, VETA_SOUHLAS_ZP,
  castkyDavky, cekaNaSouhlas, dalsiMesic, dniVMesici, jePracovnepravni, lideDavky, mesicePrumeru, normalizujSlozku, odKdySrazka,
  penizeText, popisSlozky, potrebujeSouhlas, preskalujPodily, prumernyVydelek, prvniOtevrenyDen, rozdelZaskok, rozlozSplatky, rozpadUprav, rozpadVyplaty,
  rozpisPrevoduNaKusy, rozpocitej, rozvrhSplatek, slozkaZaObdobi, slozkaZeSloupcu, srovnejSZamky, stavNoveSrazky, stavSrazky,
  stropKraceniMesice, stropNahrady, ucinneKraceni, validujNahradu, validujOdmenu, validujSrazku, validujZaskok, vetaSouhlasu, vyberPenizeTrestu,
  zneniDohodyOSrazce, ZDROJ_KRACENI, ZDROJ_NAHRADA, ZDROJ_SRAZKA, ZDROJ_ZASKOK,
} from '../../lib/trestyPenize.ts';
import { ZDROJ_NENAROKOVE_PREMIE, vyberTresty } from '../../lib/tresty.ts';
import { csvVyplatniListiny, vyplatniListina, type RadekSouhrnu } from '../../lib/dochazkaPrehled.ts';

const kc = (n: number) => `${n} Kč`;
const H = 3_600_000;

export default function ({ eq, ok }: Testy) {
  // ---- pomocníci ----
  eq('rozpočítat: zbytek na první, součet sedí', [rozpocitej(500, 3), rozpocitej(1000, 4), rozpocitej(-500, 3), rozpocitej(5, 0)], [[167, 167, 166], [250, 250, 250, 250], [-167, -167, -166], []]);
  eq('měsíce', [dalsiMesic('2026-12'), dalsiMesic('2026-01'), dniVMesici('2026-02'), dniVMesici('2028-02')], ['2027-01', '2026-02', 28, 29]);
  eq('zdroj nenárokové prémie je společný', ZDROJ_NENAROKOVE_PREMIE, 'premie');

  // ---- A) nenároková složka ----
  eq('složka: prázdný typ = zrušit', normalizujSlozku({ typ: '' }), { ok: true, slozka: null });
  eq('složka: % na desetiny, výchozí součást sazby', normalizujSlozku({ typ: 'pct', hodnota: '12.34' }), { ok: true, slozka: { typ: 'pct', hodnota: 12.3, vSazbe: true } });
  eq('složka: Kč/h navíc', normalizujSlozku({ typ: 'kc_hod', hodnota: 30, vSazbe: false }), { ok: true, slozka: { typ: 'kc_hod', hodnota: 30, vSazbe: false } });
  ok('složka: 0, záporně, nad 100 % a neznámý typ neprojdou', !normalizujSlozku({ typ: 'pct', hodnota: 0 }).ok && !normalizujSlozku({ typ: 'pct', hodnota: 101 }).ok
    && !normalizujSlozku({ typ: 'kc_mesic', hodnota: -5 }).ok && !normalizujSlozku({ typ: 'bonus', hodnota: 5 }).ok);
  eq('složka ze sloupců: nic / platná', [slozkaZeSloupcu(null, null, null), slozkaZeSloupcu('kc_mesic', '2000', true)], [null, { typ: 'kc_mesic', hodnota: 2000, vSazbe: true }]);
  const LISTOPAD = { od: '2026-11-01', do: '2026-11-30' };
  eq('složka %: 10 % z 20 000', slozkaZaObdobi({ typ: 'pct', hodnota: 10, vSazbe: true }, { mzda: 20000, ms: 100 * H, ...LISTOPAD }), 2000);
  eq('složka Kč/h: 100 h × 30', slozkaZaObdobi({ typ: 'kc_hod', hodnota: 30, vSazbe: false }, { mzda: 20000, ms: 100 * H, ...LISTOPAD }), 3000);
  eq('složka Kč/měsíc: celý měsíc celá, půl měsíce půl', [slozkaZaObdobi({ typ: 'kc_mesic', hodnota: 3000, vSazbe: false }, { mzda: 0, ms: H, ...LISTOPAD }),
    slozkaZaObdobi({ typ: 'kc_mesic', hodnota: 3000, vSazbe: false }, { mzda: 0, ms: H, od: '2026-11-01', do: '2026-11-15' })], [3000, 1500]);
  eq('složka: bez odpracovaného času 0', slozkaZaObdobi({ typ: 'kc_mesic', hodnota: 3000, vSazbe: false }, { mzda: 0, ms: 0, ...LISTOPAD }), 0);
  eq('složka v sazbě nepřesáhne mzdu (a bez sazby je 0)', [slozkaZaObdobi({ typ: 'kc_mesic', hodnota: 3000, vSazbe: true }, { mzda: 1200, ms: 8 * H, ...LISTOPAD }),
    slozkaZaObdobi({ typ: 'kc_hod', hodnota: 30, vSazbe: true }, { mzda: null, ms: 8 * H, ...LISTOPAD })], [1200, 0]);
  eq('popis složky', [popisSlozky({ typ: 'pct', hodnota: 7.5, vSazbe: true }, kc), popisSlozky(null, kc)], ['7,5 % ze mzdy (součást sazby)', 'Bez nenárokové složky']);

  // ---- strop krácení 409 ----
  eq('strop krácení = složka + nenárokové prémie − už kráceno', [stropKraceniMesice({ slozka: 2000, premie: 500, uzKraceno: 300 }), stropKraceniMesice({ slozka: 0, premie: 0, uzKraceno: 0 }), stropKraceniMesice({ slozka: 100, premie: 0, uzKraceno: 400 })], [2200, 0, 0]);
  eq('účinné krácení: nad strop se vrací, mzda zůstane celá', [ucinneKraceni(500, 300, 100), ucinneKraceni(200, 300, 0), ucinneKraceni(300, 0, 0)],
    [{ uplatneno: 400, nadStrop: 100 }, { uplatneno: 200, nadStrop: 0 }, { uplatneno: 0, nadStrop: 300 }]);

  // ---- smlouva a souhlas (právo) ----
  eq('pracovněprávní: HPP, DPP, DPČ i neznámý ano, jen OSVČ ne', ['HPP', 'DPP', 'DPC', null, undefined, 'cokoli', 'OSVC'].map(jePracovnepravni), [true, true, true, true, true, true, false]);
  eq('bez souhlasu se u HPP/DPP/DPČ nic nestrhne: nová srážka čeká', ['HPP', 'DPP', 'DPC', null].map(stavNoveSrazky), ['ceka', 'ceka', 'ceka', 'ceka']);
  eq('OSVČ: srážka se uplatní hned', [stavNoveSrazky('OSVC'), potrebujeSouhlas('OSVC')], ['uplatneno', false]);
  eq('věta pro vedení', [vetaSouhlasu('HPP'), vetaSouhlasu('OSVC'), vetaSouhlasu(null)], [VETA_SOUHLAS_ZP, VETA_OSVC, VETA_SOUHLAS_NEZNAMY]);
  ok('věta cituje § 146 písm. b) (dohoda o srážkách ze mzdy)', /§ 146 písm\. b\)/.test(VETA_SOUHLAS_ZP));
  eq('stav srážky', (['ceka', 'uplatneno', 'nesouhlas', 'zruseno'] as const).map(s => stavSrazky(s).text), ['Čeká na souhlas', 'Uplatněno', 'Nesouhlasí', 'Zrušeno']);
  const z = zneniDohodyOSrazce({ castka: 500, splatky: 1, duvod: 'Rozbitá  sklenice', podnik: 'Kavárna', odMesice: '2026-11', druh: 'srazka' }, kc);
  ok('znění dohody: částka, měsíc, důvod, § 146 a podnik', z.startsWith('Souhlasím se srážkou 500 Kč ze mzdy z výplaty za 11/2026 (důvod: Rozbitá sklenice)') && /§ 146 písm\. b\)/.test(z) && /Kavárna/.test(z));
  ok('znění dohody se splátkami', /rozloženou do 3 výplat od výplaty za 12\/2026/.test(zneniDohodyOSrazce({ castka: 900, splatky: 3, duvod: 'X y', podnik: '', odMesice: '2026-12', druh: 'nahrada' }, kc)));

  // ---- C) přímá srážka ----
  eq('srážka: nic / platná / splátky', [validujSrazku(null), validujSrazku({ castka: 0 }), validujSrazku({ castka: 500, splatky: 2 })],
    [{ ok: true, srazka: null }, { ok: true, srazka: null }, { ok: true, srazka: { castka: 500, splatky: 2 } }]);
  ok('srážka: záporná, desetinná a 13 splátek neprojdou', !validujSrazku({ castka: -5 }).ok && !validujSrazku({ castka: 2.5 }).ok && !validujSrazku({ castka: 100, splatky: 13 }).ok);

  // ---- B) náhrada škody ----
  const DNES = '2026-11-16';
  const n1 = validujNahradu({ skoda: 3000, druh: 'zavinena' }, DNES);
  ok('náhrada: výchozí celá škoda, nedbalost, 1 splátka', n1.ok && n1.nahrada?.castka === 3000 && n1.nahrada.zavineni === 'nedbalost' && n1.nahrada.splatky === 1);
  eq('náhrada: schodek bez dohody o odpovědnosti neprojde', validujNahradu({ skoda: 3000, druh: 'schodek' }, DNES), { ok: false, chyba: VETA_SCHODEK });
  ok('náhrada: schodek s dohodou a datem projde, datum v budoucnu ne', validujNahradu({ skoda: 3000, druh: 'schodek', dohoda: true, dohodaDatum: '2026-01-10' }, DNES).ok
    && !validujNahradu({ skoda: 3000, druh: 'ztrata', dohoda: true, dohodaDatum: '2026-12-01' }, DNES).ok);
  ok('náhrada: víc než škoda a bez druhu neprojde', !validujNahradu({ skoda: 1000, castka: 1500, druh: 'zavinena' }, DNES).ok && !validujNahradu({ skoda: 1000 }, DNES).ok);
  eq('průměr: 3 měsíce před listopadem', mesicePrumeru(DNES), ['2026-08', '2026-09', '2026-10']);
  eq('průměr: jen měsíce s výplatou; žádná = null', [prumernyVydelek([{ mesic: '2026-08', hruba: 0 }, { mesic: '2026-09', hruba: 20000 }, { mesic: '2026-10', hruba: 22000 }]), prumernyVydelek([])],
    [{ prumer: 21000, mesicu: 2 }, { prumer: null, mesicu: 0 }]);
  eq('strop 4,5× průměru u nedbalosti', [NASOBEK_STROPU_NAHRADY, stropNahrady({ druh: 'zavinena', zavineni: 'nedbalost', skoda: 200000, prumer: 20000 })],
    [4.5, { strop: 90000, tvrdy: true, varovani: null, stropPrumeru: 90000 }]);
  eq('strop: menší škoda je strop sama', stropNahrady({ druh: 'zavinena', zavineni: 'nedbalost', skoda: 3000, prumer: 20000 }).strop, 3000);
  eq('strop: bez průměru jen varování, nevynucuje se', stropNahrady({ druh: 'zavinena', zavineni: 'nedbalost', skoda: 200000, prumer: null }), { strop: 200000, tvrdy: false, varovani: VETA_BEZ_PRUMERU, stropPrumeru: null });
  eq('strop: úmysl a schodek = celá škoda', [stropNahrady({ druh: 'zavinena', zavineni: 'umysl', skoda: 200000, prumer: 20000 }).strop, stropNahrady({ druh: 'schodek', zavineni: 'nedbalost', skoda: 200000, prumer: 20000 }).strop], [200000, 200000]);

  // ---- splátky a uzavřené období ----
  eq('splátky: 1000 do 3', rozlozSplatky(1000, 3), [334, 333, 333]);
  eq('rozvrh: první k dni, další k 1. dalších měsíců', rozvrhSplatek(1000, 3, '2026-11-20'), [{ den: '2026-11-20', castka: 334 }, { den: '2026-12-01', castka: 333 }, { den: '2027-01-01', castka: 333 }]);
  const ZAMKY = [{ id: 1, od: '2026-10-01', do: '2026-10-31' }, { id: 2, od: '2026-11-01', do: '2026-11-30' }];
  eq('první otevřený den přeskočí navazující zámky', [prvniOtevrenyDen('2026-10-05', ZAMKY), prvniOtevrenyDen('2026-12-03', ZAMKY)], ['2026-12-01', '2026-12-03']);
  eq('srážka od: den trestu, po souhlasu den souhlasu, ne v zamčeném', [odKdySrazka({ denTrestu: '2026-12-02', denSouhlasu: null, zamky: [] }),
    odKdySrazka({ denTrestu: '2026-12-02', denSouhlasu: '2026-12-10', zamky: [] }), odKdySrazka({ denTrestu: '2026-10-20', denSouhlasu: null, zamky: ZAMKY })], ['2026-12-02', '2026-12-10', '2026-12-01']);

  // srovnání s uzavřeným obdobím
  eq('srovnat: otevřené zrušit, shodné nechat', srovnejSZamky([{ id: 1, den: '2026-12-02', castka: -300 }, { id: 2, den: '2026-12-05', castka: -100 }], [{ den: '2026-12-02', castka: -300 }], []),
    { smazat: [2], vlozit: [] });
  eq('uzavřené období se nemění: zrušení trestu → opravný řádek do dalšího otevřeného', srovnejSZamky([{ id: 7, den: '2026-10-12', castka: -300 }], [], ZAMKY),
    { smazat: [], vlozit: [{ den: '2026-12-01', castka: 300, oprava: true }] });
  eq('nový trest do uzavřeného období jde do dalšího otevřeného', srovnejSZamky([], [{ den: '2026-11-03', castka: -200 }], ZAMKY), { smazat: [], vlozit: [{ den: '2026-12-01', castka: -200, oprava: true }] });
  eq('snížení po uzavření: rozdíl opravou', srovnejSZamky([{ id: 7, den: '2026-10-12', castka: -300 }], [{ den: '2026-10-12', castka: -100 }], ZAMKY).vlozit, [{ den: '2026-12-01', castka: 200, oprava: true }]);
  eq('splátky přes zamčený měsíc: nic se neposune ani nezdvojí', srovnejSZamky([{ id: 1, den: '2026-11-20', castka: -334 }, { id: 2, den: '2026-12-01', castka: -333 }],
    rozvrhSplatek(1000, 3, '2026-11-20').map(x => ({ den: x.den, castka: -x.castka })), [{ id: 2, od: '2026-11-01', do: '2026-11-30' }]), { smazat: [], vlozit: [{ den: '2027-01-01', castka: -333, oprava: false }] });

  // ---- záskok ----
  eq('záskok: výchozí podnik', validujZaskok(null), { ok: true, zaskok: { komu: 'podnik', zpusob: 'rovne', lide: [] } });
  ok('záskok: lidé bez lidí a neznámé komu neprojdou', !validujZaskok({ komu: 'lide', lide: [] }).ok && !validujZaskok({ komu: 'kamosi' }).ok);
  eq('záskok: lidé bez duplicit, směna vždy rovně', [validujZaskok({ komu: 'lide', lide: [{ userId: 5 }, { userId: 5 }, 6] }), validujZaskok({ komu: 'smena', zpusob: 'castky' })],
    [{ ok: true, zaskok: { komu: 'lide', zpusob: 'rovne', lide: [{ userId: 5, castka: null }, { userId: 6, castka: null }] } }, { ok: true, zaskok: { komu: 'smena', zpusob: 'rovne', lide: [] } }]);
  eq('rozdělit rovným dílem (potrestaný vyřazen)', rozdelZaskok({ zaklad: 500, zpusob: 'rovne', prijemci: [{ userId: 2 }, { userId: 3 }, { userId: 4 }, { userId: 9 }], krome: [9] }),
    { ok: true, podily: [{ userId: 2, castka: 167 }, { userId: 3, castka: 167 }, { userId: 4, castka: 166 }], podniku: 0 });
  eq('rozdělit částkami: zbytek podniku', rozdelZaskok({ zaklad: 500, zpusob: 'castky', prijemci: [{ userId: 2, castka: 300 }, { userId: 3, castka: 100 }] }),
    { ok: true, podily: [{ userId: 2, castka: 300 }, { userId: 3, castka: 100 }], podniku: 100 });
  eq('rozdělit částkami: víc než strženo neprojde', rozdelZaskok({ zaklad: 300, zpusob: 'castky', prijemci: [{ userId: 2, castka: 400 }] }), { ok: false, chyba: 'Kolegům nejde převést víc, než se strhlo.' });
  // krácení 200 hned + srážka 300 čeká: převod 250/250 → z krácení jde hned 100/100, zbytek až se srážkou
  const pod = [{ klic: 2, castka: 250 }, { klic: 3, castka: 250 }];
  eq('převod před souhlasem: jen z krácení', rozpisPrevoduNaKusy(pod, [{ den: '2026-12-02', castka: 200 }], 500), [{ klic: 2, den: '2026-12-02', castka: 100 }, { klic: 3, den: '2026-12-02', castka: 100 }]);
  const vse = rozpisPrevoduNaKusy(pod, [{ den: '2026-12-02', castka: 200 }, { den: '2026-12-10', castka: 150 }, { den: '2027-01-01', castka: 150 }], 500);
  eq('převod po souhlasu se splátkami: přesně podíl', [2, 3].map(k => vse.filter(x => x.klic === k).reduce((a, x) => a + x.castka, 0)), [250, 250]);
  eq('převod při nesouhlasu: jen poměr z krácení', rozpisPrevoduNaKusy([{ klic: 'a', castka: 333 }], [{ den: '2026-12-02', castka: 200 }], 500), [{ klic: 'a', den: '2026-12-02', castka: 133 }]);

  eq('přeškálování podílů: snížení na polovinu, nesouhlas (jen krácení), nula', [preskalujPodily([250, 250], 500, 250), preskalujPodily([167, 167, 166], 500, 200), preskalujPodily([300, 100], 500, 0)],
    [[125, 125], [67, 67, 66], [0, 0]]);
  eq('přeškálování: zbytek podniku zůstane poměrně', preskalujPodily([300, 100], 500, 1000), [600, 200]);

  // ---- hromadně ----
  eq('dávka: ids bez duplicit, prázdná a moc velká neprojde', [lideDavky({ userIds: [3, '4', 3, 0] }), lideDavky({}).ok, lideDavky({ userIds: Array.from({ length: MAX_LIDI_DAVKY + 1 }, (_, i) => i + 1) }).ok],
    [{ ok: true, ids: [3, 4] }, false, false]);
  eq('dávka: zpětně kompatibilní userId', lideDavky({ userId: 7 }), { ok: true, ids: [7] });
  eq('dávka: každý X / rozpočítat X', [castkyDavky(200, 3, false), castkyDavky(200, 3, true)], [[200, 200, 200], [67, 67, 66]]);
  const od = validujOdmenu({ userIds: [3, 4], castka: 1000, rozpocitat: true, text: 'Inventura o víkendu', day: '2026-11-15' }, DNES);
  ok('odměna: rozpočítaná, nenároková výchozí', od.ok && od.odmena.castky.join() === '500,500' && od.odmena.nenarokova && od.odmena.den === '2026-11-15');
  ok('odměna: bez textu, nula a budoucí den neprojdou', !validujOdmenu({ userIds: [3], castka: 100 }, DNES).ok && !validujOdmenu({ userIds: [3], castka: 0, text: 'Xx' }, DNES).ok
    && !validujOdmenu({ userIds: [3], castka: 100, text: 'Xx', day: '2026-12-01' }, DNES).ok);

  // ---- rozpad výplaty ----
  const upr = [
    { amount: 1000, source: 'premie' }, { amount: 300, source: ZDROJ_ZASKOK }, { amount: -400, source: ZDROJ_KRACENI },
    { amount: -500, source: ZDROJ_NAHRADA }, { amount: -200, source: ZDROJ_SRAZKA }, { amount: 150, source: 'manual' }, { amount: 80, source: 'reward' },
  ];
  eq('rozpad úprav podle zdroje', rozpadUprav(upr), { premie: 1000, zaskok: 300, kraceni: 400, nahrada: 500, srazky: 200, ostatni: 230 });
  const rv = rozpadVyplaty({ mzda: 20000, ms: 100 * H, ...LISTOPAD, upravy: upr, slozka: { typ: 'pct', hodnota: 10, vSazbe: true }, cekaNaSouhlas: 700 });
  ok('výplata: složka v sazbě rozdělí mzdu, čeká na souhlas se nestrhává', rv.slozka === 2000 && rv.zakladni === 18000 && rv.slozkaNavic === 0 && rv.cekaNaSouhlas === 700 && rv.hruba === 20000 + 430);
  const rv2 = rozpadVyplaty({ mzda: 10000, ms: 50 * H, ...LISTOPAD, upravy: [{ amount: -900, source: ZDROJ_KRACENI }], slozka: { typ: 'kc_mesic', hodnota: 500, vSazbe: false } });
  ok('výplata: složka navíc + krácení nad strop se vrátí (nároková mzda celá)', rv2.slozkaNavic === 500 && rv2.kraceniUplatneno === 500 && rv2.kraceniNadStrop === 400 && rv2.hruba === 10000);
  const rv3 = rozpadVyplaty({ mzda: 10000, ms: 50 * H, ...LISTOPAD, upravy: [{ amount: -900, source: 'manual' }] });
  ok('výplata bez složky a bez trestů = jako dřív', rv3.hruba === 9100 && rv3.slozka === 0 && rv3.kraceniNadStrop === 0);

  // ---- výplatní listina a CSV ----
  const radek: RadekSouhrnu = { id: '3', jmeno: 'Eva', avatar: null, ms: 100 * H, pocet: 12, bezi: false, vynechano: 0, mzda: 20000, spropitne: null, upravy: 430, priplatky: 0,
    priplatkyMs: { vikend: 0, noc: 0, svatek: 0 }, vyplata: 20430, planMs: 0, pozde: 0 };
  const bez = vyplatniListina([radek], [{ id: 3, name: 'Eva' }]);
  ok('listina bez peněžních údajů: stejná jako dřív (bez penize)', bez[0].doplatit === 20430 && bez[0].penize === undefined);
  const lid = vyplatniListina([radek], [{ id: 3, name: 'Eva', slozka: { typ: 'kc_mesic', hodnota: 1000, vSazbe: false }, cekaNaSouhlas: 700 }],
    { od: LISTOPAD.od, do: LISTOPAD.do, upravy: upr.map((u, i) => ({ id: i + 1, userId: 3, day: '2026-11-05', ...u })) });
  ok('listina s penězi: složka navíc v hrubé i doplatit, rozpad u řádku', lid[0].penize?.slozka === 1000 && lid[0].hruba === 21430 && lid[0].doplatit === 21430 && lid[0].penize?.cekaNaSouhlas === 700);
  const csv = csvVyplatniListiny(lid, { od: LISTOPAD.od, do: LISTOPAD.do, symbol: 'Kč', priplatky: false, spropitne: false, smlouvy: false, penize: true });
  ok('CSV: sloupce složky, krácení, náhrady, srážek, záskoku a čeká na souhlas', ['Nenároková složka (Kč)', 'Krácení (Kč)', 'Náhrada škody (Kč)', 'Srážky (Kč)', 'Záskok (Kč)', 'Čeká na souhlas (Kč)'].every(h => csv[0].includes(h)));
  const i = (h: string) => csv[0].indexOf(h);
  eq('CSV: hodnoty řádku', [csv[1][i('Nenároková složka (Kč)')], csv[1][i('Krácení (Kč)')], csv[1][i('Náhrada škody (Kč)')], csv[1][i('Srážky (Kč)')], csv[1][i('Záskok (Kč)')], csv[1][i('Čeká na souhlas (Kč)')], csv[1][i('Doplatit (Kč)')]],
    ['1000', '400', '500', '200', '300', '700', '21430']);
  ok('CSV bez penize: hlavička beze změny', !csvVyplatniListiny(bez, { od: LISTOPAD.od, do: LISTOPAD.do, symbol: 'Kč', priplatky: false, spropitne: false, smlouvy: false })[0].includes('Krácení (Kč)'));

  // ---- tvar pro klienta ----
  const p = vyberPenizeTrestu({ kraceni: '300', srazky: [{ id: 5, druh: 'srazka', castka: 500, stav: 'ceka', rozvrh: [{ den: '2026-12-01', castka: 500 }] }, { id: 0, castka: 5 }],
    zaskok: { komu: 'lide', zpusob: 'rovne', prevody: [{ id: 1, userId: 2, castka: 400, preslo: 150 }] }, cekaNaSouhlas: 500, strzeno: 300 });
  ok('penize z odpovědi: srážka bez id pryč, stav, převod', !!p && p.srazky.length === 1 && p.srazky[0].stav === 'ceka' && p.zaskok.prevody[0].preslo === 150 && cekaNaSouhlas(p));
  eq('penize do věty', penizeText(p, kc), 'krácení 300 Kč · srážka 500 Kč (čeká na souhlas)');
  eq('trest z odpovědi nese penize i dávku', [vyberTresty([{ id: 1, userId: 2, day: '2026-11-10', batchId: 4, penize: { kraceni: 100 } }])[0].penize?.kraceni, vyberTresty([{ id: 1, userId: 2, day: '2026-11-10', batchId: 4 }])[0].batchId], [100, 4]);
  eq('trest bez peněz: penize null', vyberTresty([{ id: 1, userId: 2, day: '2026-11-10' }])[0].penize, null);
}
