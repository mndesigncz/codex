// Plocha s widgety a úpravy stránek (kolo 68) — jednotkové testy jádra (spec §7.3).
//
// Logika rozložení se testuje nad vlastním malým registrem (ne nad
// katalogem): balíky kola 69 přepínají widgety na 'hotovo' a výchozí
// rozložení se tím mění, ale pravidla vyhodnocení a normalizace zůstávají.
// Katalog a stránky se kontrolují zvlášť (AK-19, AK-20).

import { readFileSync, existsSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import type { DefiniceStranky, DefiniceWidgetu, Divak, PoleNastaveni, PolozkaRozlozeni, RadekRozlozeni, Tarif } from '../../lib/widgety/typy.ts';
import { KATALOG_WIDGETU, OBLASTI, WIDGETY_OBLASTI, widget } from '../../lib/widgety/katalog/index.ts';
import { ZDROJE_FRONT } from '../../lib/widgety/katalog/obecne.ts';
import { STRANKY, stranka } from '../../lib/widgety/stranky/index.ts';
import { normalizujRozlozeni, vycistiNastaveni, sNastavenimVychozimi, vyresRozlozeni, jeViditelny, smiUpravitRozlozeni, zachovejSkryte, slozZapis, slozZapisVychoziho, zVychozich, rozeberRozsah, presun, tvarOdpovedi, filtrujViditelne, vychoziZKodu, jeSpravceStranky, kostraWidgetu, inkoustovaInstance } from '../../lib/widgety/rozlozeni.ts';
import { zDashboardConfig } from '../../lib/widgety/migrace.ts';
import { rozvrhni, cilovyIndex, sloupcuProSirku } from '../../lib/widgety/mrizka.ts';
import { krok, USAZENO, rychlostZVzorku, rychlostRolovani } from '../../lib/widgety/pruzina.ts';
import { hash32, fazeKyvu, delkaKyvu, uhelKyvu, idZWidgetu, nahradniId } from '../../lib/widgety/hash.ts';
import { MAX_POLOZEK, MAX_NASTAVENI_BAJTU } from '../../lib/widgety/konstanty.ts';
import { KATALOG, SYSTEMOVE_ROLE, sZavislostmi } from '../../lib/opravneni.ts';

// ---------------------------------------------------------------------------
// Vlastní registr a stránky pro testy logiky
// ---------------------------------------------------------------------------

const w = (id: string, x: Partial<DefiniceWidgetu> = {}): DefiniceWidgetu => ({
  id, oblast: 'obecne', nazev: id, popis: '', ikona: 'box', velikosti: ['S', 'M'], vychoziVelikost: 'S',
  rozhrani: ['vedeni'], stranky: [], opravneni: { vse: [], nektere: [] }, tarif: 'zdarma', stav: 'hotovo', ...x,
});

const REGISTR: DefiniceWidgetu[] = [
  w('t.maly'),
  w('t.stredni', { velikosti: ['M', 'L'], vychoziVelikost: 'M', rozhrani: ['vedeni', 'zamestnanec'],
    nastaveni: [{ klic: 'den', nazev: 'Den', typ: 'vyber', moznosti: [{ id: 'dnes', nazev: 'Dnes' }, { id: 'zitra', nazev: 'Zítra' }], vychozi: 'dnes' }] }),
  w('t.plan', { stav: 'planovany' }),
  w('t.zam', { rozhrani: ['zamestnanec'] }),
  w('t.vice', { vicekrat: true, maxInstanci: 3 }),
  w('t.povinny', { povinny: true, velikosti: ['L'], vychoziVelikost: 'L' }),
  w('t.sklad', { opravneni: { vse: ['sklad.zobrazit'], nektere: [] } }),
  w('t.nektery', { opravneni: { vse: [], nektere: ['volno.schvalovat', 'uzaverky.schvalovat'] } }),
  w('t.pro', { tarif: 'pro' }),
  w('t.max', { tarif: 'max' }),
  ...Array.from({ length: 50 }, (_, i) => w(`t.n${i}`)),
  ...Array.from({ length: 8 }, (_, i) => w(`t.p${i}`, { stav: 'planovany' })),
];
const R = new Map(REGISTR.map(x => [x.id, x]));
const najdi = (id: string) => R.get(id);

const str = (x: Partial<DefiniceStranky>): DefiniceStranky => ({
  id: 'vedeni.prehled', rozhrani: 'vedeni', nazev: 'Test', pohled: 'overview', pristup: null, nastroj: null,
  doporucene: [], vychozi: {}, aktivni: true, ...x,
});
const BEZ_NASTROJE = str({ vychozi: { 'typ:vedeni': [{ w: 't.maly' }, { w: 't.stredni', s: 'L' }] } });
const S_NASTROJEM = str({
  id: 'vedeni.sklad', nastroj: { nazev: 'Nástroj', ikona: 'archive', popis: '' },
  vychozi: { 'typ:vedeni': [{ w: 't.maly' }, { w: 'nastroj' }, { w: 't.stredni' }] },
});
const S_POVINNYM = str({ vychozi: { 'typ:vedeni': [{ w: 't.maly' }, { w: 't.povinny' }, { w: 't.stredni' }] } });

const p = (id: string, widgetId: string, velikost: 'S' | 'M' | 'L' = 'S', nastaveni?: Record<string, unknown>): PolozkaRozlozeni =>
  ({ id, widget: widgetId, velikost, ...(nastaveni ? { nastaveni } : {}) });
const widgety = (l: readonly PolozkaRozlozeni[]) => l.map(x => x.widget);

const divak = (x: Partial<Divak> = {}): Divak => ({
  userId: 15, typ: 'vedeni', klic: 'provozni', roleId: null, zdrojRole: null,
  opravneni: new Set(['sklad.zobrazit']), tarif: 'max', jeSpravce: false, ...x,
});
const radek = (rozsah: string, polozky: PolozkaRozlozeni[], x: Partial<RadekRozlozeni> = {}): RadekRozlozeni =>
  ({ rozsah, polozky, zamceno: false, verze: 1, ...x });

export default function (t: Testy) {
  const { eq, ok } = t;

  // ---- normalizujRozlozeni ----
  eq('normalizace: vstup, který není pole → prázdné rozložení', normalizujRozlozeni(BEZ_NASTROJE, { x: 1 }, najdi), []);
  eq('normalizace: neznámý, plánovaný a cizího rozhraní se zahodí',
    widgety(normalizujRozlozeni(BEZ_NASTROJE, [p('a', 'neznamy.widget'), p('b', 't.plan'), p('c', 't.zam'), p('d', 't.maly')], najdi)), ['t.maly']);
  eq('normalizace: špatná velikost → výchozí velikost widgetu',
    normalizujRozlozeni(BEZ_NASTROJE, [p('a', 't.stredni', 'S'), p('b', 't.maly', 'X' as never)], najdi).map(x => x.velikost), ['M', 'S']);
  {
    const n = normalizujRozlozeni(BEZ_NASTROJE, [p('stejne', 't.vice'), p('stejne', 't.vice'), p('Spatne_ID', 't.stredni', 'M'), { widget: 't.n1', velikost: 'S' }], najdi);
    ok('normalizace: platné id zůstane', n[0].id === 'stejne');
    ok('normalizace: opakované, chybné a chybějící id dostane nové [a-z0-9]{8}', n.slice(1).every(x => /^[a-z0-9]{8}$/.test(x.id)));
    ok('normalizace: id jsou po opravě unikátní', new Set(n.map(x => x.id)).size === n.length);
    eq('normalizace: náhradní id jsou stálá (stejný vstup → stejná id)',
      normalizujRozlozeni(BEZ_NASTROJE, [p('stejne', 't.vice'), p('stejne', 't.vice'), p('Spatne_ID', 't.stredni', 'M'), { widget: 't.n1', velikost: 'S' }], najdi).map(x => x.id), n.map(x => x.id));
  }
  eq('normalizace: druhá instance widgetu bez „víckrát" se zahodí, první zůstane',
    normalizujRozlozeni(BEZ_NASTROJE, [p('a', 't.maly'), p('b', 't.stredni', 'M'), p('c', 't.maly')], najdi).map(x => x.id), ['a', 'b']);
  eq('normalizace: „víckrát" nejvýš maxInstanci',
    normalizujRozlozeni(BEZ_NASTROJE, [1, 2, 3, 4, 5].map(i => p(`v${i}`, 't.vice')), najdi).length, 3);
  eq('normalizace: ořízne na 40 položek',
    normalizujRozlozeni(BEZ_NASTROJE, Array.from({ length: 50 }, (_, i) => p(`n${i}`, `t.n${i}`)), najdi).length, MAX_POLOZEK);
  {
    const vstup = [...Array.from({ length: 45 }, (_, i) => p(`n${i}`, `t.n${i}`)), p('nastroj', 'nastroj', 'L')];
    const n = normalizujRozlozeni(S_NASTROJEM, vstup, najdi);
    ok('normalizace: limit 40 nevyhodí nástroj', n.length === MAX_POLOZEK && n.some(x => x.widget === 'nastroj'));
  }
  {
    const n = normalizujRozlozeni(S_NASTROJEM, [p('a', 't.maly'), p('b', 't.stredni', 'M'), p('c', 't.n1')], najdi);
    eq('normalizace: chybějící nástroj se vloží na pozici z výchozího', widgety(n), ['t.maly', 'nastroj', 't.stredni', 't.n1']);
    eq('normalizace: vložený nástroj má velikost L a stálé id', [n[1].velikost, n[1].id], ['L', 'nastroj']);
  }
  eq('normalizace: nástroj je právě jednou a vždy L',
    normalizujRozlozeni(S_NASTROJEM, [p('x', 'nastroj', 'S'), p('y', 'nastroj', 'L'), p('a', 't.maly')], najdi).map(x => `${x.widget}:${x.velikost}`), ['nastroj:L', 't.maly:S']);
  eq('normalizace: stránka bez nástroje nástroj zahodí', widgety(normalizujRozlozeni(BEZ_NASTROJE, [p('x', 'nastroj', 'L'), p('a', 't.maly')], najdi)), ['t.maly']);
  eq('normalizace: prázdné rozložení stránky s nástrojem má aspoň nástroj', widgety(normalizujRozlozeni(S_NASTROJEM, [], najdi)), ['nastroj']);
  eq('normalizace: chybějící povinný widget se vloží na výchozí pozici',
    widgety(normalizujRozlozeni(S_POVINNYM, [p('a', 't.maly'), p('b', 't.stredni', 'M')], najdi)), ['t.maly', 't.povinny', 't.stredni']);
  {
    const n = normalizujRozlozeni(BEZ_NASTROJE, [p('a', 't.stredni', 'M', { den: 'zitra', cizi: 1 }), p('b', 't.maly', 'S', { cokoli: true })], najdi);
    eq('normalizace: nastavení vyčištěné podle schématu, prázdné se neukládá', n.map(x => x.nastaveni ?? null), [{ den: 'zitra' }, null]);
  }

  // ---- vycistiNastaveni ----
  const SCHEMA: PoleNastaveni[] = [
    { klic: 'obdobi', nazev: 'Období', typ: 'vyber', moznosti: [{ id: 'dnes', nazev: 'Dnes' }, { id: '7_dni', nazev: '7 dní' }], vychozi: 'dnes' },
    { klic: 'fronty', nazev: 'Fronty', typ: 'vicevyber', moznosti: [{ id: 'a', nazev: 'A' }, { id: 'b', nazev: 'B' }, { id: 'c', nazev: 'C' }], vychozi: 'vse' },
    { klic: 'prah', nazev: 'Práh', typ: 'cislo', min: 0, max: 500, krok: 10, vychozi: 50 },
    { klic: 'jen', nazev: 'Jen', typ: 'prepinac', vychozi: false },
    { klic: 'nadpis', nazev: 'Nadpis', typ: 'text', maxDelka: 20, vychozi: '' },
    { klic: 'kategorie', nazev: 'Kategorie', typ: 'zdroj', zdroj: 'sklad.kategorie', vychozi: null },
  ];
  eq('nastavení: typy vynucené, neznámé klíče pryč',
    vycistiNastaveni(SCHEMA, { obdobi: 'rok', fronty: 'a', prah: 'moc', jen: 'ano', nadpis: 5, kategorie: { x: 1 }, cizi: 'x' }), {});
  eq('nastavení: platné hodnoty zůstanou',
    vycistiNastaveni(SCHEMA, { obdobi: '7_dni', fronty: ['c', 'a', 'x'], prah: 120, jen: true, nadpis: '  Ahoj  ', kategorie: 12 }),
    { obdobi: '7_dni', fronty: ['a', 'c'], prah: 120, jen: true, nadpis: 'Ahoj', kategorie: 12 });
  eq('nastavení: čísla oříznutá na min/max a zaokrouhlená na krok',
    [vycistiNastaveni(SCHEMA, { prah: 9999 }), vycistiNastaveni(SCHEMA, { prah: -5 }), vycistiNastaveni(SCHEMA, { prah: 123 }), vycistiNastaveni(SCHEMA, { prah: '80' })],
    [{ prah: 500 }, { prah: 0 }, { prah: 120 }, { prah: 80 }]);
  eq('nastavení: hodnota rovná výchozí se neukládá (i „všechno" vyjmenované)',
    vycistiNastaveni(SCHEMA, { obdobi: 'dnes', prah: 50, jen: false, fronty: ['a', 'b', 'c'], kategorie: null }), {});
  eq('nastavení: text nejvýš maxDelka znaků', vycistiNastaveni(SCHEMA, { nadpis: 'x'.repeat(50) }), { nadpis: 'x'.repeat(20) });
  eq('nastavení: odkaz — cíl, popisek do 40 znaků, ikona jen jako jméno',
    vycistiNastaveni([{ klic: 'cil', nazev: 'Kam', typ: 'odkaz' }], { cil: 'view:inventory', popisek: 'P'.repeat(60), ikona: '<svg>', jine: 1 }),
    { cil: 'view:inventory', popisek: 'P'.repeat(40) });
  {
    const texty: PoleNastaveni[] = Array.from({ length: 15 }, (_, i) => ({ klic: `t${i}`, nazev: `T${i}`, typ: 'text', maxDelka: 80, vychozi: '' }));
    const raw = Object.fromEntries(texty.map(x => [x.klic, 'ž'.repeat(80)]));
    const c = vycistiNastaveni(texty, raw);
    ok('nastavení: celý objekt nejvýš 2 KB (v bajtech, ne znacích)', new TextEncoder().encode(JSON.stringify(c)).length <= MAX_NASTAVENI_BAJTU && Object.keys(c).length > 0);
  }
  eq('nastavení: doplnění výchozími, „vse" se rozvine na všechny možnosti',
    sNastavenimVychozimi(SCHEMA, { prah: 120 }), { obdobi: 'dnes', fronty: ['a', 'b', 'c'], prah: 120, jen: false, nadpis: '', kategorie: null });

  // ---- jeViditelny ----
  const V = (x: Partial<{ typ: Divak['typ']; opravneni: string[]; tarif: Tarif }> = {}) =>
    ({ typ: x.typ ?? 'vedeni', opravneni: new Set(x.opravneni ?? []), tarif: x.tarif ?? 'zdarma' } as const);
  ok('viditelnost: „vse" — bez klíče ne, s klíčem ano', !jeViditelny(R.get('t.sklad')!, V()) && jeViditelny(R.get('t.sklad')!, V({ opravneni: ['sklad.zobrazit'] })));
  ok('viditelnost: „některé" — stačí jeden klíč', jeViditelny(R.get('t.nektery')!, V({ opravneni: ['uzaverky.schvalovat'] })) && !jeViditelny(R.get('t.nektery')!, V({ opravneni: ['sklad.zobrazit'] })));
  eq('viditelnost: tarif (zdarma / pro / max)',
    (['zdarma', 'pro', 'max'] as const).map(tarif => [jeViditelny(R.get('t.maly')!, V({ tarif })), jeViditelny(R.get('t.pro')!, V({ tarif })), jeViditelny(R.get('t.max')!, V({ tarif }))]),
    [[true, false, false], [true, true, false], [true, true, true]]);
  ok('viditelnost: widget jiného rozhraní ne', !jeViditelny(R.get('t.zam')!, V()) && jeViditelny(R.get('t.zam')!, V({ typ: 'zamestnanec' })));
  ok('viditelnost: plánovaný widget nikdy', !jeViditelny(R.get('t.plan')!, V({ opravneni: KATALOG.map(k => k.id), tarif: 'max' })));
  eq('viditelnost: filtr nechá nástroj a viditelné', widgety(filtrujViditelne([p('n', 'nastroj', 'L'), p('a', 't.sklad'), p('b', 't.maly')], V(), najdi)), ['nastroj', 't.maly']);

  // ---- vyresRozlozeni ----
  {
    const osobni = radek('osobni:15', [p('o', 't.n1')], { verze: 7 });
    const rid = radek('role:#12', [p('r12', 't.n2')]);
    const rkl = radek('role:provozni', [p('rp', 't.n3')]);
    const rtyp = radek('typ:vedeni', [p('rt', 't.n4')]);
    const d = divak({ roleId: 12 });
    const res = (osob: RadekRozlozeni | null, vych: RadekRozlozeni[], dd = d, cfg: unknown = null) =>
      vyresRozlozeni({ stranka: BEZ_NASTROJE, divak: dd, osobni: osob, vychozi: vych, dashboardConfig: cfg }, najdi);
    const shrn = (v: ReturnType<typeof res>) => [v.zdroj, v.rozsah, widgety(v.polozky)];
    eq('vyhodnocení 1: výchozí podniku role:#id má přednost', shrn(res(null, [rtyp, rkl, rid])), ['podnik', 'role:#12', ['t.n2']]);
    eq('vyhodnocení 1: bez role:#id platí role:klíč', shrn(res(null, [rtyp, rkl])), ['podnik', 'role:provozni', ['t.n3']]);
    eq('vyhodnocení 1: jinak typ role', shrn(res(null, [rtyp])), ['podnik', 'typ:vedeni', ['t.n4']]);
    eq('vyhodnocení 3: osobní přebije nezamčené výchozí (rozsah = výchozí, ze kterého vychází)', shrn(res(osobni, [rtyp])), ['osobni', 'typ:vedeni', ['t.n1']]);
    const zamcene = radek('typ:vedeni', [p('rt', 't.n4')], { zamceno: true });
    const v2 = res(osobni, [zamcene]);
    eq('vyhodnocení 2: zamčené výchozí platí i přes osobní', [...shrn(v2), v2.zamceno, v2.verze], ['podnik', 'typ:vedeni', ['t.n4'], true, 7]);
    const v3 = res(osobni, [zamcene], divak({ roleId: 12, jeSpravce: true }));
    eq('vyhodnocení 2: správce zámek nemá — vidí svoje', [...shrn(v3), v3.zamceno], ['osobni', 'typ:vedeni', ['t.n1'], true]);
    eq('vyhodnocení 5: starý dashboard_config jen pro Přehled a jen před migrací',
      shrn(res(null, [], d, { employer: { layout: ['posToday'] } })).slice(0, 2), ['podnik', 'typ:vedeni']);
    eq('vyhodnocení 5: s příznakem migrovano68 se starý config ignoruje',
      shrn(res(null, [], d, { migrovano68: true, employer: { layout: ['posToday'] } })), ['aplikace', null, ['t.maly', 't.stredni']]);
    eq('vyhodnocení 6: bez všeho výchozí z kódu', shrn(res(null, [])), ['aplikace', null, ['t.maly', 't.stredni']]);
    eq('vyhodnocení: verze osobního řádku, bez něj 0', [res(osobni, []).verze, res(null, []).verze], [7, 0]);
    const skryte = res(radek('osobni:15', [p('a', 't.sklad'), p('b', 't.maly')]), [], divak({ opravneni: new Set() }));
    eq('vyhodnocení: klient dostane jen viditelné, nefiltrované zůstanou pro zápis', [widgety(skryte.polozky), widgety(skryte.nefiltrovane)], [['t.maly'], ['t.sklad', 't.maly']]);
    ok('vyhodnocení: výchozí pro bránu úprav je výchozí podniku diváka', res(osobni, [rtyp, rkl]).vychozi?.rozsah === 'role:provozni');
  }
  {
    // Pravidlo tří: výchozí z kódu pro roli jen s aspoň třemi viditelnými widgety.
    const s = str({ vychozi: {
      'typ:vedeni': [{ w: 't.maly' }, { w: 't.stredni' }],
      'role:skladnik': [{ w: 't.sklad' }, { w: 't.max' }, { w: 't.n5' }, { w: 't.n6' }, { w: 't.plan' }],
    } });
    const vyres = (d: Divak) => vyresRozlozeni({ stranka: s, divak: d, osobni: null, vychozi: [] }, najdi);
    const bezSkladu = new Set<string>();
    eq('pravidlo tří: dost viditelných → výchozí role', widgety(vyres(divak({ klic: 'skladnik', tarif: 'max' })).polozky), ['t.sklad', 't.max', 't.n5', 't.n6']);
    const tri = vyres(divak({ klic: 'skladnik', tarif: 'pro' }));
    eq('pravidlo tří: právě tři viditelné → výchozí role, skrytý zůstane v nefiltrovaném',
      [widgety(tri.polozky), widgety(tri.nefiltrovane)], [['t.sklad', 't.n5', 't.n6'], ['t.sklad', 't.max', 't.n5', 't.n6']]);
    eq('pravidlo tří: jen dva viditelné → výchozí typu role', widgety(vyres(divak({ klic: 'skladnik', tarif: 'pro', opravneni: bezSkladu })).polozky), ['t.maly', 't.stredni']);
    eq('pravidlo tří: vlastní role bere výchozí role, ze které vznikla (zdrojRole)',
      widgety(vyres(divak({ klic: null, roleId: 44, zdrojRole: 'skladnik', tarif: 'max' })).polozky), ['t.sklad', 't.max', 't.n5', 't.n6']);
    eq('pravidlo tří: vlastní role bez zdroje → typ role', widgety(vyres(divak({ klic: null, roleId: 44, zdrojRole: null, tarif: 'max' })).polozky), ['t.maly', 't.stredni']);
    eq('pravidlo tří: výchozí z kódu je nefiltrované, plánovaný pryč',
      widgety(vychoziZKodu(s, divak({ klic: 'skladnik', tarif: 'pro' }), najdi)), ['t.sklad', 't.max', 't.n5', 't.n6']);
  }
  {
    // Tři viditelné nestačí, když je to menšina výchozího role (Skladník s tarifem Max v kole 68:
    // tři z deseti, zbytek plánovaný) — jinak by vyšší tarif dal chudší plochu než výchozí vedení.
    const plan = (n: number) => Array.from({ length: n }, (_, i) => ({ w: `t.p${i}` }));
    const s = str({ vychozi: {
      'typ:vedeni': [{ w: 't.maly' }, { w: 't.stredni' }],
      'role:skladnik': [{ w: 't.sklad' }, { w: 't.n5' }, { w: 't.n6' }, ...plan(7)],
      'role:ucetni': [{ w: 't.sklad' }, { w: 't.n5' }, { w: 't.n6' }, { w: 't.n7' }, ...plan(4)],
    } });
    const vyres = (d: Divak) => widgety(vyresRozlozeni({ stranka: s, divak: d, osobni: null, vychozi: [] }, najdi).polozky);
    eq('pravidlo tří: tři viditelné z deseti → výchozí typu role', vyres(divak({ klic: 'skladnik', tarif: 'max' })), ['t.maly', 't.stredni']);
    eq('pravidlo tří: přesně polovina viditelných stačí', vyres(divak({ klic: 'ucetni', tarif: 'max' })), ['t.sklad', 't.n5', 't.n6', 't.n7']);
  }

  // ---- smiUpravitRozlozeni ----
  ok('brána úprav: tablet ne', !smiUpravitRozlozeni({ typ: 'kiosk', jeSpravce: false }, null).ok);
  {
    const b = smiUpravitRozlozeni({ typ: 'zamestnanec', jeSpravce: false }, { zamceno: true });
    ok('brána úprav: zamčené výchozí ne (a odpověď nese zamceno)', !b.ok && b.zamceno === true && b.chyba === 'Rozložení téhle stránky nastavuje vedení.');
  }
  ok('brána úprav: zamčené, ale správce ano', smiUpravitRozlozeni({ typ: 'vedeni', jeSpravce: true }, { zamceno: true }).ok);
  ok('brána úprav: vlastník (správce) ano', smiUpravitRozlozeni({ typ: 'vedeni', jeSpravce: true }, null).ok);
  ok('brána úprav: bez výchozího podniku ano', smiUpravitRozlozeni({ typ: 'zamestnanec', jeSpravce: false }, null).ok);
  ok('brána úprav: nezamčené výchozí ano', smiUpravitRozlozeni({ typ: 'zamestnanec', jeSpravce: false }, { zamceno: false }).ok);
  eq('správce výchozích: podnik.nastaveni všude, kiosk.spravovat jen u tabletu',
    [jeSpravceStranky(new Set(['podnik.nastaveni']), { rozhrani: 'zamestnanec' }), jeSpravceStranky(new Set(['kiosk.spravovat']), { rozhrani: 'kiosk' }),
      jeSpravceStranky(new Set(['kiosk.spravovat']), { rozhrani: 'vedeni' }), jeSpravceStranky(new Set(['tym.zobrazit']), { rozhrani: 'kiosk' })],
    [true, true, false, false]);

  // ---- zachovejSkryte ----
  {
    const skryte = new Set(['h1', 'h2', 'h0']);
    const vid = (x: PolozkaRozlozeni) => !skryte.has(x.id);
    const A = p('a', 't.n1'), B = p('b', 't.n2'), H1 = p('h1', 't.sklad'), H2 = p('h2', 't.pro'), H0 = p('h0', 't.max');
    eq('skryté: přežijí přeskládání za svým posledním viditelným předchůdcem', zachovejSkryte([A, H1, B, H2], [B, A], vid).map(x => x.id), ['b', 'h2', 'a', 'h1']);
    eq('skryté: bez předchůdce na začátek', zachovejSkryte([H0, A, B], [B, A], vid).map(x => x.id), ['h0', 'b', 'a']);
    eq('skryté: předchůdce odebraný z nového pořadí → kotva o krok dřív', zachovejSkryte([A, B, H1], [A], vid).map(x => x.id), ['a', 'h1']);
    eq('skryté: položka, která v novém už je, se nezdvojí', zachovejSkryte([A, H1], [H1, A], vid).map(x => x.id), ['h1', 'a']);
    eq('skryté: plánovaný widget se nezachová (normalizace ho zahodí)',
      slozZapis(BEZ_NASTROJE, [B, A], [A, p('pl', 't.plan'), B], x => x.widget !== 't.plan', najdi).map(x => x.id), ['b', 'a']);
    eq('skryté: zápis vrátí skrytý widget na místo a normalizuje',
      slozZapis(BEZ_NASTROJE, [B, A], [A, H1, B], vid, najdi).map(x => x.id), ['b', 'a', 'h1']);
  }
  {
    // PUT výchozího podniku (spec §1.6): „Uložit jako výchozí" z plochy posílá jen to, co správce
    // na své profiltrované ploše vidí — widgety, které nevidí, se nesmí smazat všem ostatním.
    const sp = stranka('vedeni.prehled')!;
    const provozni = SYSTEMOVE_ROLE.find(r => r.klic === 'provozni')!;
    const spravce = divak({ klic: null, roleId: 7, opravneni: new Set([...provozni.opravneni, 'podnik.nastaveni']), tarif: 'max', jeSpravce: true });
    const ulozene = normalizujRozlozeni(sp, [p('pokladna-dnes', 'pokladna.dnes', 'M'), p('sklad-dochazi', 'sklad.dochazi', 'S'), p('ukoly-dnes', 'ukoly.dnes', 'S')]);
    const plocha = vyresRozlozeni({ stranka: sp, divak: spravce, osobni: null, vychozi: [radek('typ:vedeni', ulozene)] }).polozky;
    eq('výchozí z plochy: delegovaný správce bez finance.trzby pokladnu nevidí', widgety(plocha), ['sklad.dochazi', 'ukoly.dnes']);
    eq('výchozí z plochy: zápis vrátí widget, který správce nevidí',
      widgety(slozZapisVychoziho(sp, [...plocha].reverse(), ulozene, spravce, new Set())), ['pokladna.dnes', 'ukoly.dnes', 'sklad.dochazi']);
    eq('výchozí z editoru: výslovně odebraný skrytý widget se nevrátí',
      widgety(slozZapisVychoziho(sp, plocha, ulozene, spravce, new Set(['pokladna-dnes']))), ['sklad.dochazi', 'ukoly.dnes']);
    const vlastnikBezMax = divak({ klic: 'vedeni', opravneni: new Set(KATALOG.map(k => k.id)), tarif: 'pro', jeSpravce: true });
    eq('výchozí z plochy: výpadek tarifu Max widgety Max nesmaže, viditelný odebraný zmizí',
      widgety(slozZapisVychoziho(sp, [p('ukoly-dnes', 'ukoly.dnes', 'S')], ulozene, vlastnikBezMax, new Set())), ['pokladna.dnes', 'ukoly.dnes']);
  }

  // ---- zDashboardConfig (AK-21) ----
  {
    const prevod = (cfg: unknown) => zDashboardConfig(cfg).map(([s, r, l]) => [s, r, l.map(x => `${x.widget}:${x.velikost}`)]);
    eq('migrace: prázdný config → nic', [prevod({}), prevod(null), prevod({ employer: {}, employee: { posToday: true } })], [[], [], []]);
    eq('migrace: s příznakem migrovano68 → nic', prevod({ migrovano68: true, employer: { layout: ['kpis'] } }), []);
    eq('migrace: kpis → 4× S, natvrdo bloky na začátek', prevod({ employer: { layout: ['kpis'] } }),
      [['vedeni.prehled', 'typ:vedeni', ['prehled.ceka_na_tebe:L', 'prehled.prvni_kroky:L', 'tym.clenove:S', 'rozvrh.dnesni_smeny:S', 'ukoly.dnes:S', 'sklad.dochazi:S']]]);
    eq('migrace: stats → 3× S, u zaměstnance natvrdo objednávky od stolu a výroba', prevod({ employee: { layout: ['stats'] } }),
      [['zamestnanec.domu', 'typ:zamestnanec', ['klient.objednavky_od_stolu:M', 'vyroba.k_vyrobe:L', 'ukoly.dnes:S', 'chat.neprectene:S', 'dochazka.moje_odpracovano:S']]]);
    eq('migrace: pořadí zůstane', prevod({ employer: { layout: ['announcements', 'posToday'] } })[0][2], ['prehled.ceka_na_tebe:L', 'prehled.prvni_kroky:L', 'oznameni.nastenka:L', 'pokladna.dnes:M']);
    const [[, , sOdkazem]] = zDashboardConfig({ employer: { layout: [{ type: 'link', label: 'Sirupy', target: 'inventory:Sirupy', icon: 'box' }] } });
    eq('migrace: odkaz → widget odkaz s nastavením {cil, popisek, ikona}', sOdkazem.slice(2).map(x => [x.widget, x.nastaveni]), [['odkaz', { cil: 'inventory:Sirupy', popisek: 'Sirupy', ikona: 'box' }]]);
    const vypnuto = prevod({ employer: { clock: false, lowStock: false } })[0][2];
    ok('migrace: příznak false widget vynechá, zbytek ve vestavěném pořadí',
      !vypnuto.includes('dochazka.moje_pichacky:M') && vypnuto[2] === 'pokladna.dnes:M' && vypnuto.includes('rozvrh.dnesni_smeny:M'));
    eq('migrace: jen zkratky → převede se i se zkratkou na konci',
      prevod({ employee: { shortcuts: [{ label: 'Sklad', target: 'view:inventory' }] } })[0][2].slice(-1), ['odkaz:S']);
    eq('migrace: id instancí jsou stálá a unikátní i u zdvojených widgetů',
      zDashboardConfig({ employer: { layout: ['lowStock', 'lowStock', { type: 'link', label: 'A', target: 'view:tasks' }, { type: 'link', label: 'B', target: 'view:shifts' }] } })[0][2].slice(2).map(x => x.id),
      ['sklad-dochazi', 'sklad-dochazi-2', 'odkaz', 'odkaz-2']);
    // Starý přehled kreslil dlaždice `kpis` i samostatné seznamy „Nízké zásoby" a „Dnešní směny".
    // Nový widget je na stránce jednou, takže vyhraje samostatný seznam (M) na svém místě —
    // dřív vyhrála dlaždice z kpis (stojí dřív) a normalizace seznam zahodila.
    const s = stranka('vedeni.prehled')!;
    const poNormalizaci = (cfg: unknown) => normalizujRozlozeni(s, zDashboardConfig(cfg)[0][2]).map(x => `${x.widget}:${x.velikost}`);
    eq('migrace: samostatný seznam má přednost před dlaždicí z kpis',
      poNormalizaci({ employer: { layout: ['kpis', 'announcements', 'lowStock', 'todayShifts'] } }),
      ['prehled.ceka_na_tebe:L', 'prehled.prvni_kroky:L', 'tym.clenove:S', 'ukoly.dnes:S', 'oznameni.nastenka:L', 'sklad.dochazi:M', 'rozvrh.dnesni_smeny:M']);
    const seznamy = (l: string[]) => l.filter(x => x.startsWith('sklad.dochazi:') || x.startsWith('rozvrh.dnesni_smeny:')).sort();
    eq('migrace: vestavěné pořadí s jedním vypnutým příznakem nechá seznamy zásob i směn',
      seznamy(poNormalizaci({ employer: { posToday: false } })), ['rozvrh.dnesni_smeny:M', 'sklad.dochazi:M']);
    eq('migrace: bez samostatného seznamu zůstane dlaždice z kpis',
      seznamy(poNormalizaci({ employer: { lowStock: false, todayShifts: false } })), ['rozvrh.dnesni_smeny:S', 'sklad.dochazi:S']);
  }
  {
    // Config zapisuje klient (PATCH /api/teams), převod nesmí vyhodit: výjimka shodila GET, PUT
    // i DELETE /api/rozlozeni obou aktivních stránek celému podniku a init tým nikdy neoznačil.
    const vyhodi = (f: () => unknown) => { try { f(); return false; } catch { return true; } };
    const PROTO = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];
    ok('migrace robustně: id z Object.prototype nevyhodí', PROTO.every(id => !vyhodi(() => zDashboardConfig({ employer: { layout: [id] } }))));
    eq('migrace robustně: id z Object.prototype nic nepřidá',
      zDashboardConfig({ employer: { layout: [...PROTO, 'posToday'] } })[0][2].map(x => x.widget), ['prehled.ceka_na_tebe', 'prehled.prvni_kroky', 'pokladna.dnes']);
    const divne = { toString: 1 };
    eq('migrace robustně: objekt místo řetězce (id, popisek, cíl) se zahodí',
      zDashboardConfig({ employer: { layout: [{ id: divne }, { type: 'link', label: divne, target: 'view:x' }, { type: 'link', label: 'Sklad', target: 'view:inventory', icon: divne }, 'clock'] } })[0][2].slice(2).map(x => [x.widget, x.nastaveni ?? null]),
      [['odkaz', { cil: 'view:inventory', popisek: 'Sklad' }], ['dochazka.moje_pichacky', null]]);
    eq('migrace robustně: zkratka s objektem místo textu se zahodí, platná zůstane',
      zDashboardConfig({ employee: { shortcuts: [{ label: divne, target: 'view:inventory' }, { label: 'Úkoly', target: { valueOf: 1 } }, { label: 'Směny', target: 'view:shifts', icon: divne }] } })[0][2].filter(x => x.widget === 'odkaz').map(x => x.nastaveni),
      [{ cil: 'view:shifts', popisek: 'Směny' }]);
    const past = () => new Proxy({}, { get() { throw new Error('past'); } });
    const chyby: string[] = [];
    ok('migrace robustně: config, na který nejde sáhnout, nevyhodí a chybu zapíše', !vyhodi(() => zDashboardConfig(past(), { chyby })) && chyby.length === 1);
    const chyby2: string[] = [];
    const castecne = zDashboardConfig({ employer: past(), employee: { layout: ['clock'] } }, { chyby: chyby2 });
    eq('migrace robustně: vadná část se přeskočí, druhá platí', [castecne.map(([st]) => st), chyby2.length], [['zamestnanec.domu'], 1]);
    eq('migrace: jen část zvolené stránky', zDashboardConfig({ employer: { layout: ['clock'] }, employee: { layout: ['clock'] } }, { stranka: 'zamestnanec.domu' }).map(([st]) => st), ['zamestnanec.domu']);

    // Rozbitý config znamená výchozí z kódu, ne výjimku — ani pro diváka s osobním řádkem.
    const sp = stranka('vedeni.prehled')!;
    const vlastnik = divak({ klic: 'vedeni', opravneni: new Set(KATALOG.map(k => k.id)), tarif: 'max', jeSpravce: true });
    const vys = (osobni: RadekRozlozeni | null, cfg: unknown) => vyresRozlozeni({ stranka: sp, divak: vlastnik, osobni, vychozi: [], dashboardConfig: cfg });
    const osobni = radek('osobni:15', [p('ukoly-dnes', 'ukoly.dnes', 'S')], { verze: 3 });
    ok('vyhodnocení: rozbitý starý config nevyhodí', !vyhodi(() => vys(osobni, { employer: past() })) && !vyhodi(() => vys(null, { employer: past() })));
    eq('vyhodnocení: rozbitý starý config → osobní platí, bez něj výchozí z kódu',
      [vys(osobni, { employer: past() }).zdroj, vys(null, { employer: past() }).zdroj, vys(osobni, { employer: { layout: ['constructor'] } }).zdroj], ['osobni', 'aplikace', 'osobni']);
    eq('vyhodnocení: vadná část zaměstnanců Přehled vedení neshodí',
      [vys(null, { employer: { layout: ['posToday'] }, employee: past() }).zdroj, widgety(vys(null, { employer: { layout: ['posToday'] }, employee: past() }).polozky).includes('pokladna.dnes')], ['podnik', true]);
  }

  // ---- mřížka ----
  eq('mřížka: sloupců podle šířky plochy', [1008, 840, 839, 390, 300, 299].map(sloupcuProSirku), [4, 4, 2, 2, 2, 1]);
  eq('mřížka: doplnění řad na 4 sloupcích',
    [rozvrhni(['S', 'S'], 4, true), rozvrhni(['S', 'M'], 4, true), rozvrhni(['S', 'S', 'S'], 4, true), rozvrhni(['S'], 4, true), rozvrhni(['M'], 4, true)],
    [[2, 2], [2, 2], [1, 1, 2], [4], [4]]);
  eq('mřížka: skryté se nepočítají', rozvrhni(['S', null, 'S'], 4, true), [2, 0, 2]);
  eq('mřížka: celá řada zůstane, další položka jde na nový řádek', rozvrhni(['L', 'S', 'M', 'M'], 4, true), [4, 2, 2, 4]);
  eq('mřížka: 2 sloupce', [rozvrhni(['S', 'M', 'S'], 2, true), rozvrhni(['S', 'S', 'L'], 2, true)], [[2, 2, 2], [1, 1, 2]]);
  eq('mřížka: 1 sloupec', rozvrhni(['S', 'M', 'L'], 1, true), [1, 1, 1]);
  eq('mřížka: v režimu úprav jmenovité velikosti', [rozvrhni(['S', 'M', 'L', null], 4, false), rozvrhni(['S', 'M', 'L'], 2, false)], [[1, 2, 4, 0], [1, 2, 2]]);
  {
    const r = [0, 110, 220].map(x => ({ left: x, top: 0, width: 100, height: 100 }));
    eq('cíl tahu: ukazatel ve vnitřní zóně položky → její index', cilovyIndex({ x: 160, y: 50 }, r, 0, 0), 1);
    eq('cíl tahu: mezera mezi kartami cíl nemění', cilovyIndex({ x: 105, y: 50 }, r, 0, 2), 2);
    eq('cíl tahu: okraj karty (mimo vnitřní zónu) cíl nemění', cilovyIndex({ x: 112, y: 50 }, r, 0, 0), 0);
    eq('cíl tahu: pod poslední řadou → konec', cilovyIndex({ x: 50, y: 300 }, r, 0, 0), 2);
    eq('cíl tahu: vlastní zóna tažené položky se nepočítá', cilovyIndex({ x: 50, y: 50 }, r, 0, 1), 1);
    eq('cíl tahu: skrytá položka (bez obdélníku) se přeskočí', cilovyIndex({ x: 160, y: 50 }, [r[0], null, r[2]], 0, 0), 0);
    eq('cíl tahu: zóna položky, která vyvolala minulé přeskládání, cíl nemění', cilovyIndex({ x: 160, y: 50 }, r, 0, 0, 1), 0);
    eq('cíl tahu: blokovaná položka neblokuje ostatní', cilovyIndex({ x: 270, y: 50 }, r, 0, 0, 1), 2);
  }
  {
    // Review kola 68 (rev-fyz2): S se drží nad středem L, která zabírá celou
    // řadu. Přesun S za L nechá L na místě (bez dense S spadne pod ni), takže
    // ukazatel zůstane v zóně L. Bez blokace by cíl skákal „za L" / „před L"
    // každých 80 ms. Simulace smyčky tahu: nejvýš jedno přeskládání.
    const zona = (x: number, y: number, w: number, h: number) => ({ left: x, top: y, width: w, height: h });
    const bod = { x: 640, y: 300 };
    let poradi = ['s', 'L'];
    let blok: string | null = null;
    let preskladani = 0;
    for (let snimek = 0; snimek < 20; snimek++) {
      // Rozvržení: L vždy v řadě y 200–400 přes celou šířku; S nad ní, nebo pod ní.
      const rozvrzeni: Record<string, ReturnType<typeof zona>> = { L: zona(0, 200, 1280, 200), s: poradi[0] === 's' ? zona(0, 0, 310, 180) : zona(0, 420, 310, 180) };
      if (blok && !(bod.x >= 320 && bod.x <= 960 && bod.y >= 240 && bod.y <= 360)) blok = null;
      const tazeny = poradi.indexOf('s');
      const c = cilovyIndex(bod, poradi.map(id => rozvrzeni[id]), tazeny, tazeny, blok ? poradi.indexOf(blok) : -1);
      if (c === tazeny) continue;
      blok = poradi[c];
      poradi = presun(poradi, tazeny, c);
      preskladani++;
    }
    eq('cíl tahu: malá karta držená nad velkou přeskládá nejvýš jednou', preskladani, 1);
  }

  // ---- pružina ----
  {
    let x = 100, v = 0, t0 = 0, monotonni = true, prestrelila = false, usazeno = -1;
    for (let i = 0; i < 120; i++) {
      const n = krok(x, v, 1 / 60);
      if (n.x > x + 1e-9) monotonni = false;
      if (n.x < -1e-9) prestrelila = true;
      x = n.x; v = n.v; t0 += 1 / 60;
      if (usazeno < 0 && USAZENO(x, v)) usazeno = t0;
    }
    ok('pružina: bez rychlosti monotónně k 0 bez přestřelení', monotonni && !prestrelila);
    ok('pružina: usadí se do 0,5 s', usazeno > 0 && usazeno <= 0.5);
    const cely = krok(80, -300, 0.05);
    const pul = krok(80, -300, 0.025);
    const dva = krok(pul.x, pul.v, 0.025);
    ok('pružina: dva kroky po dt/2 = jeden krok dt (nezávislá na snímkové frekvenci)', Math.abs(cely.x - dva.x) < 1e-6 && Math.abs(cely.v - dva.v) < 1e-6);
  }
  eq('pružina: rychlost puštění z posledních 100 ms před puštěním, oříznutá',
    [rychlostZVzorku([{ t: 0, x: 0, y: 0 }, { t: 900, x: 0, y: 0 }, { t: 960, x: 60, y: -30 }], { t: 980, x: 100, y: -50 }),
      rychlostZVzorku([{ t: 0, x: 0, y: 0 }], { t: 10, x: 500, y: 0 }), rychlostZVzorku([], { t: 0, x: 0, y: 0 })],
    [{ vx: 1250, vy: -625 }, { vx: 2500, vy: 0 }, { vx: 0, vy: 0 }]);
  // Prst dotáhne kartu, zastaví a drží: pointermove nechodí, takže okno se musí měřit od puštění.
  // Dřív vyšlo 2500 px/s a karta při dosednutí přestřelila o ~45 px.
  eq('pružina: pauza před puštěním rychlost srazí (po 100 ms klidu nula)',
    [rychlostZVzorku([{ t: 0, x: 0, y: 0 }, { t: 16, x: 40, y: 0 }, { t: 32, x: 80, y: 0 }], { t: 600, x: 80, y: 0 }),
      rychlostZVzorku([{ t: 500, x: 0, y: 0 }, { t: 516, x: 40, y: 0 }, { t: 532, x: 80, y: 0 }], { t: 600, x: 80, y: 0 })],
    [{ vx: 0, vy: 0 }, { vx: 800, vy: 0 }]);
  eq('pružina: vzorek z pointerup se nezapočítá dvakrát', rychlostZVzorku([{ t: 900, x: 0, y: 0 }, { t: 980, x: 100, y: 0 }], { t: 980, x: 100, y: 0 }), { vx: 1250, vy: 0 });
  eq('pružina: rolování u okraje (zóna 72 px, max 1100 px/s)', [rychlostRolovani(0), rychlostRolovani(36), rychlostRolovani(72), rychlostRolovani(200)], [1100, 275, 0, 0]);

  // ---- hash a vlnění ----
  eq('hash32: známé hodnoty FNV-1a', [hash32(''), hash32('a'), hash32('foobar')], [0x811c9dc5, 0xe40c292c, 0xbf9cf968]);
  ok('hash32: stálý (stejné id → stejná hodnota)', hash32('sklad-dochazi') === hash32('sklad-dochazi'));
  {
    const ids = Array.from({ length: 300 }, (_, i) => `instance-${i}`);
    ok('vlnění: fáze v 0–519 ms', ids.every(id => { const f = fazeKyvu(id); return Number.isInteger(f) && f >= 0 && f <= 519; }));
    ok('vlnění: délka kmitu v 239–283 ms', ids.every(id => { const d = delkaKyvu(id); return d >= 239 && d <= 283; }));
    ok('vlnění: sousedé nemají stejnou fázi', new Set(ids.slice(0, 20).map(fazeKyvu)).size > 15);
  }
  eq('vlnění: úhel podle velikosti karty (strop 1,2°, minimum 0,15°)',
    [uhelKyvu(170, 136), uhelKyvu(2, 2), uhelKyvu(4000, 3000)], [1.2, 1.2, 0.15]);
  ok('vlnění: velký widget na monitoru kolem 0,25°', Math.abs(uhelKyvu(1008, 300) - 0.25) < 0.02);

  // ---- id instancí, rozsahy, přesun ----
  eq('id: z id widgetu, druhý výskyt s číslem', [idZWidgetu('sklad.dochazi'), idZWidgetu('sklad.dochazi', 2), idZWidgetu('prehled.ceka_na_tebe')], ['sklad-dochazi', 'sklad-dochazi-2', 'prehled-ceka-na-tebe']);
  {
    const obsazene = new Set<string>();
    const a = nahradniId('odkaz', 3, obsazene);
    obsazene.add(a);
    const b = nahradniId('odkaz', 3, obsazene);
    ok('id: náhradní id má tvar [a-z0-9]{8} a vyhne se obsazenému', /^[a-z0-9]{8}$/.test(a) && /^[a-z0-9]{8}$/.test(b) && a !== b);
  }
  eq('rozsah: rozbor platných tvarů',
    ['osobni:15', 'typ:kiosk', 'role:provozni', 'role:#12'].map(rozeberRozsah),
    [{ druh: 'osobni', userId: 15 }, { druh: 'typ', typ: 'kiosk' }, { druh: 'role', klic: 'provozni' }, { druh: 'vlastni', roleId: 12 }]);
  eq('rozsah: nesmysl se odmítne', ['typ:admin', 'role:#0', 'osobni:x', 'role:', 42, null, 'role:Provozni'].map(rozeberRozsah), [null, null, null, null, null, null, null]);
  eq('přesun: položka na nové místo', [presun(['a', 'b', 'c'], 0, 2), presun(['a', 'b', 'c'], 2, 0), presun(['a', 'b', 'c'], 1, 9)], [['b', 'c', 'a'], ['c', 'a', 'b'], ['a', 'c', 'b']]);

  // ---- kostra a inkoust ----
  eq('kostra: z definice, jinak S = číslo, M/L = seznam',
    [kostraWidgetu({ kostra: { M: 'graf' } }, 'M'), kostraWidgetu({ kostra: { M: 'graf' } }, 'S'), kostraWidgetu(undefined, 'L')], ['graf', 'cislo', 'seznam']);
  {
    const penize = new Map([['t.penize', w('t.penize', { muzeInkoust: true, velikosti: ['S', 'M'] })], ['t.maly', R.get('t.maly')!]]);
    const n = (id: string) => penize.get(id);
    eq('inkoust: první widget peněz v M nebo L, jen na stránce s inkoustem',
      [inkoustovaInstance({ inkoust: true }, [p('a', 't.maly'), p('b', 't.penize', 'S'), p('c', 't.penize', 'M')], n),
        inkoustovaInstance({ inkoust: false }, [p('c', 't.penize', 'M')], n), inkoustovaInstance({ inkoust: true }, [p('b', 't.penize', 'S')], n)],
      ['c', null, null]);
  }

  // ---- tvar odpovědi GET ----
  {
    const s = stranka('zamestnanec.domu')!;
    const barista = new Set(SYSTEMOVE_ROLE.find(r => r.klic === 'barista')!.opravneni);
    const d = divak({ typ: 'zamestnanec', klic: 'barista', opravneni: barista, tarif: 'zdarma' });
    const v = vyresRozlozeni({ stranka: s, divak: d, osobni: null, vychozi: [radek('typ:zamestnanec', [], { zamceno: true })] });
    const o = tvarOdpovedi(s, d, v);
    ok('odpověď: zamčené výchozí → smiUpravit false, zamceno true', !o.smiUpravit && o.zamceno && o.zdroj === 'podnik');
    ok('odpověď: dostupné jsou jen viditelné widgety rozhraní stránky', o.dostupne.length > 0 && o.dostupne.every(id => { const x = widget(id); return !!x && jeViditelny(x, d); }));
    ok('odpověď: bez predplatne.spravovat žádné „s tarifem"', o.tarifem.length === 0 && !o.smiVychozi);
    const vedeni = divak({ klic: 'vedeni', opravneni: new Set(KATALOG.map(k => k.id)), tarif: 'zdarma', jeSpravce: true });
    const sp = stranka('vedeni.prehled')!;
    const o2 = tvarOdpovedi(sp, vedeni, vyresRozlozeni({ stranka: sp, divak: vedeni, osobni: null, vychozi: [] }));
    ok('odpověď: s predplatne.spravovat nabídne widgety vyššího tarifu', o2.tarifem.some(x => x.widget === 'pokladna.dnes' && x.tarif === 'max') && o2.smiVychozi);
  }

  // ---- Katalog a stránky (AK-19, AK-20) ----
  const iconsSrc = readFileSync(new URL('../../components/Icons.tsx', import.meta.url), 'utf8');
  const blokIkon = iconsSrc.split('const paths')[1]?.split('\n};')[0] ?? '';
  const IKONY = new Set([...blokIkon.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*):/gm)].map(m => m[1]));
  ok('katalog: ikony z Icons.tsx se daly přečíst', IKONY.size > 40 && IKONY.has('box'));
  const KLICE = new Set(KATALOG.map(k => k.id));
  const vsechnyKlice = (x: string | string[] | undefined) => (x == null ? [] : Array.isArray(x) ? x : [x]);

  const ids = KATALOG_WIDGETU.map(x => x.id);
  ok('katalog: id widgetů jsou unikátní a žádné není „nastroj"', new Set(ids).size === ids.length && !ids.includes('nastroj'));
  ok('katalog: 20 oblastí a všechny widgety v souboru své oblasti',
    OBLASTI.length === 20 && KATALOG_WIDGETU.every(x => WIDGETY_OBLASTI[x.oblast]?.includes(x)));
  const PORADI = ['S', 'M', 'L'];
  const spatne: string[] = [];
  for (const x of KATALOG_WIDGETU) {
    if (!x.velikosti.length || x.velikosti.some((v, i) => i > 0 && PORADI.indexOf(v) <= PORADI.indexOf(x.velikosti[i - 1]))) spatne.push(`${x.id}: velikosti`);
    if (!x.velikosti.includes(x.vychoziVelikost)) spatne.push(`${x.id}: výchozí velikost mimo povolené`);
    if (!x.rozhrani.length || x.rozhrani.some(r => !['vedeni', 'zamestnanec', 'kiosk'].includes(r))) spatne.push(`${x.id}: rozhraní`);
    if (!IKONY.has(x.ikona)) spatne.push(`${x.id}: ikona ${x.ikona} není v Icons.tsx`);
    if (!['zdarma', 'pro', 'max'].includes(x.tarif) || !['hotovo', 'planovany'].includes(x.stav)) spatne.push(`${x.id}: tarif/stav`);
    if (!x.nazev || !x.popis) spatne.push(`${x.id}: název a popis`);
    if (x.vicekrat && !((x.maxInstanci ?? 0) >= 2)) spatne.push(`${x.id}: víckrát bez stropu`);
    const klice = [...x.opravneni.vse, ...x.opravneni.nektere, ...Object.values(x.opravneni.pole ?? {}).flatMap(vsechnyKlice)];
    for (const pole of x.nastaveni ?? []) {
      klice.push(...vsechnyKlice(pole.opravneni));
      if (pole.typ === 'vyber' || pole.typ === 'vicevyber') {
        pole.moznosti.forEach(m => klice.push(...vsechnyKlice(m.opravneni)));
        const mids = pole.moznosti.map(m => m.id);
        if (new Set(mids).size !== mids.length) spatne.push(`${x.id}.${pole.klic}: opakované možnosti`);
        if (pole.typ === 'vyber' && !mids.includes(pole.vychozi)) spatne.push(`${x.id}.${pole.klic}: výchozí mimo možnosti`);
        if (pole.typ === 'vicevyber' && pole.vychozi !== 'vse' && pole.vychozi.some(v => !mids.includes(v))) spatne.push(`${x.id}.${pole.klic}: výchozí mimo možnosti`);
      }
      if (pole.typ === 'cislo' && !(pole.min <= pole.vychozi && pole.vychozi <= pole.max)) spatne.push(`${x.id}.${pole.klic}: výchozí mimo meze`);
    }
    const kn = (x.nastaveni ?? []).map(n => n.klic);
    if (new Set(kn).size !== kn.length) spatne.push(`${x.id}: opakovaný klíč nastavení`);
    for (const k of klice) if (!KLICE.has(k)) spatne.push(`${x.id}: klíč ${k} není v katalogu oprávnění`);
    for (const sid of x.stranky) {
      const s = stranka(sid);
      if (!s || !x.rozhrani.includes(s.rozhrani)) spatne.push(`${x.id}: doporučeno pro ${sid} (neexistuje nebo jiné rozhraní)`);
    }
  }
  eq('katalog: widgety jsou konzistentní (velikosti, ikony, klíče oprávnění, nastavení, stránky)', spatne, []);

  const KOLO68 = ['prehled.ceka_na_tebe', 'prehled.prvni_kroky', 'odkaz', 'sdileni.pripnuta_nabidka', 'oznameni.nastenka', 'chat.neprectene',
    'pokladna.dnes', 'akce.nejblizsi', 'klient.hoste_vernost', 'dochazka.moje_pichacky', 'tym.clenove', 'rozvrh.dnesni_smeny', 'ukoly.dnes',
    'sklad.dochazi', 'dochazka.prave_na_smene', 'hodnoceni.ohodnotit_smeny', 'rozvrh.dostupnost_tymu', 'uzaverky.predavka', 'moje.tento_mesic',
    'moje.nejblizsi_smena', 'moje.zpetna_vazba', 'dochazka.moje_odpracovano', 'uzaverky.moje_uzaverka', 'rozvrh.pripominka_dostupnosti',
    'klient.objednavky_od_stolu', 'vyroba.k_vyrobe'];
  eq('katalog: 26 widgetů kola 68 je hotových', KOLO68.filter(id => widget(id)?.stav !== 'hotovo'), []);
  eq('katalog: pokladna.dnes chce finance.trzby a tarif Max (N2)', [widget('pokladna.dnes')?.opravneni.vse, widget('pokladna.dnes')?.tarif], [['finance.trzby'], 'max']);
  eq('katalog: dostupnost týmu chce dostupnost.zobrazit (N11)', widget('rozvrh.dostupnost_tymu')?.opravneni.vse, ['dostupnost.zobrazit']);

  const sids = STRANKY.map(s => s.id);
  ok('stránky: 36 stránek s unikátním id', sids.length === 36 && new Set(sids).size === 36);
  ok('stránky: Přehled vedení a Domů zaměstnance jsou aktivní', !!stranka('vedeni.prehled')?.aktivni && !!stranka('zamestnanec.domu')?.aktivni);
  const spatneStr: string[] = [];
  const ROLE = new Map(SYSTEMOVE_ROLE.map(r => [r.klic, r]));
  for (const s of STRANKY) {
    if (s.nastroj && !IKONY.has(s.nastroj.ikona)) spatneStr.push(`${s.id}: ikona nástroje ${s.nastroj.ikona}`);
    for (const k of s.pristup ?? []) if (!KLICE.has(k)) spatneStr.push(`${s.id}: přístup ${k}`);
    if (!s.vychozi[`typ:${s.rozhrani}`]) spatneStr.push(`${s.id}: chybí výchozí pro typ:${s.rozhrani}`);
    for (const d of s.doporucene) {
      const x = widget(d);
      if (!x || !x.rozhrani.includes(s.rozhrani)) spatneStr.push(`${s.id}: doporučený ${d} (neexistuje nebo jiné rozhraní)`);
    }
    for (const [klic, seznam] of Object.entries(s.vychozi)) {
      const role = klic.startsWith('role:') ? ROLE.get(klic.slice(5)) : null;
      if (klic.startsWith('typ:') ? klic !== `typ:${s.rozhrani}` : !role || role.typ !== s.rozhrani) spatneStr.push(`${s.id}: klíč výchozího ${klic}`);
      const videno = new Set<string>();
      const ikony: string[] = [];
      for (const q of seznam ?? []) {
        if (q.w === 'nastroj') {
          if (!s.nastroj) spatneStr.push(`${s.id} ${klic}: nástroj na stránce bez nástroje`);
          else ikony.push(s.nastroj.ikona);
          continue;
        }
        const x = widget(q.w);
        if (!x) { spatneStr.push(`${s.id} ${klic}: neznámý widget ${q.w}`); continue; }
        if (!x.rozhrani.includes(s.rozhrani)) spatneStr.push(`${s.id} ${klic}: ${q.w} jiného rozhraní`);
        if (q.s && !x.velikosti.includes(q.s)) spatneStr.push(`${s.id} ${klic}: ${q.w} ve velikosti ${q.s}`);
        if (!x.vicekrat && videno.has(q.w)) spatneStr.push(`${s.id} ${klic}: ${q.w} dvakrát`);
        videno.add(q.w);
        if (x.stav === 'hotovo') ikony.push(x.ikona);
      }
      if (s.nastroj && !(seznam ?? []).some(q => q.w === 'nastroj')) spatneStr.push(`${s.id} ${klic}: chybí nástroj`);
      // AK-19: na stránce se ve výchozím rozložení neopakuje ikona (kreslí se jen hotové widgety a nástroj).
      const opakovane = ikony.filter((ik, i) => ikony.indexOf(ik) !== i);
      if (opakovane.length) spatneStr.push(`${s.id} ${klic}: opakovaná ikona ${[...new Set(opakovane)].join(', ')}`);
    }
  }
  eq('stránky: výchozí rozložení a doporučené odkazují na existující widgety správného rozhraní, ikony se neopakují (AK-19)', spatneStr, []);

  {
    // Výchozí Přehledu vedení kola 68 (spec §6.1) pro vlastníka: hotové widgety v pořadí.
    const sp = stranka('vedeni.prehled')!;
    const vlastnik = divak({ klic: 'vedeni', opravneni: new Set(KATALOG.map(k => k.id)), tarif: 'max', jeSpravce: true });
    const vid = widgety(vyresRozlozeni({ stranka: sp, divak: vlastnik, osobni: null, vychozi: [] }).polozky).filter(id => KOLO68.includes(id));
    eq('výchozí Přehledu vedení: widgety kola 68 v pořadí ze spec §6.1', vid,
      ['prehled.ceka_na_tebe', 'prehled.prvni_kroky', 'pokladna.dnes', 'dochazka.prave_na_smene', 'sklad.dochazi', 'ukoly.dnes', 'rozvrh.dnesni_smeny',
        'hodnoceni.ohodnotit_smeny', 'akce.nejblizsi', 'klient.hoste_vernost', 'oznameni.nastenka', 'rozvrh.dostupnost_tymu', 'dochazka.moje_pichacky', 'sdileni.pripnuta_nabidka']);
    const barista = new Set(SYSTEMOVE_ROLE.find(r => r.klic === 'barista')!.opravneni);
    const sd = stranka('zamestnanec.domu')!;
    const baristaVidi = widgety(vyresRozlozeni({ stranka: sd, divak: divak({ typ: 'zamestnanec', klic: 'barista', opravneni: barista, tarif: 'max' }), osobni: null, vychozi: [] }).polozky);
    ok('výchozí Domů: barista nevidí „Čeká na tebe" a vidí jen widgety zaměstnance', !baristaVidi.includes('prehled.ceka_na_tebe') && baristaVidi.every(id => widget(id)?.rozhrani.includes('zamestnanec')));
    const kuchar = new Set(SYSTEMOVE_ROLE.find(r => r.klic === 'kuchar')!.opravneni);
    const kucharVidi = widgety(vyresRozlozeni({ stranka: sd, divak: divak({ typ: 'zamestnanec', klic: 'kuchar', opravneni: kuchar, tarif: 'max' }), osobni: null, vychozi: [] }).polozky);
    ok('výchozí Domů: kuchař bez uzávěrky nemá „Moje uzávěrka"', !kucharVidi.includes('uzaverky.moje_uzaverka') && kucharVidi.includes('uzaverky.predavka'));
  }

  {
    // Pravidlo tří nad skutečným katalogem a systémovými rolemi: výchozí role jen tehdy, když
    // z něj divák vidí aspoň tři widgety a aspoň polovinu položek; jinak výchozí vedení.
    // Platí v kole 68 i po balících kola 69 (výsledek se mění, pravidlo ne).
    const sp = stranka('vedeni.prehled')!;
    const TARIFY = ['zdarma', 'pro', 'max'] as const;
    const typVedeni = widgety(normalizujRozlozeni(sp, zVychozich(sp.vychozi['typ:vedeni']!))).join();
    const vyres = (klic: string, tarif: Tarif) => vyresRozlozeni({ stranka: sp, divak: divak({ klic, opravneni: new Set(SYSTEMOVE_ROLE.find(r => r.klic === klic)!.opravneni), tarif }), osobni: null, vychozi: [] });
    const porusene: string[] = [];
    for (const klic of ['provozni', 'skladnik', 'ucetni']) {
      const proRoli = sp.vychozi[`role:${klic}`]!;
      const zRole = widgety(normalizujRozlozeni(sp, zVychozich(proRoli))).join();
      for (const tarif of TARIFY) {
        const v = vyres(klic, tarif);
        const zaklad = widgety(v.nefiltrovane).join();
        const vidi = v.polozky.length;
        if (zaklad === zRole && zRole !== typVedeni ? vidi < 3 || vidi * 2 < proRoli.length : zaklad !== typVedeni) porusene.push(`${klic}/${tarif}: vidí ${vidi} z ${proRoli.length}`);
      }
    }
    eq('pravidlo tří (katalog): výchozí role jen s aspoň třemi a aspoň polovinou viditelných, jinak výchozí vedení', porusene, []);
    // Kolo 68: výchozí Skladníka a Účetní je z většiny plánované, takže mají výchozí vedení v každém
    // tarifu — s Max dřív Skladník dostal tři widgety z deseti (dva L) a s Pro devět.
    for (const klic of ['skladnik', 'ucetni']) {
      const proRoli = sp.vychozi[`role:${klic}`]!;
      if (proRoli.filter(q => widget(q.w)?.stav !== 'hotovo').length * 2 <= proRoli.length) {
        console.log(`– pravidlo tří (kolo 68, ${klic}): přeskočeno, výchozí role už není z většiny plánované`);
        continue;
      }
      eq(`pravidlo tří (kolo 68): ${klic} má výchozí vedení ve všech tarifech`, TARIFY.map(t => widgety(vyres(klic, t).nefiltrovane).join() === typVedeni), [true, true, true]);
    }
  }

  {
    // „Čeká na tebe": klíč pole fronty musí otevřít bránu endpointu, ze kterého fronta čte (přímo,
    // nebo přes `vyzaduje` — role se ukládají se závislostmi). Rezervace a objednávky dřív četly
    // /api/client/admin/summary (klient.prehled) a Provozní by na nich dostal 403.
    const cekaNaTebe = widget('prehled.ceka_na_tebe')!;
    const poleFront = (cekaNaTebe.nastaveni ?? []).find(n => n.klic === 'fronty');
    const fronty = poleFront?.typ === 'vicevyber' ? poleFront.moznosti.map(m => m.id) : [];
    ok('čeká na tebe: fronty se daly přečíst', fronty.length >= 10);
    const spatneFronty: string[] = [];
    for (const f of fronty) {
      const url = ZDROJE_FRONT[f];
      const klic = cekaNaTebe.opravneni.pole?.[f];
      if (!url || !klic) { spatneFronty.push(`${f}: chybí zdroj nebo klíč pole`); continue; }
      const soubor = new URL(`../../app${url}/route.ts`, import.meta.url);
      const brana = existsSync(soubor) ? branaGet(readFileSync(soubor, 'utf8')) : undefined;
      if (brana === undefined) { spatneFronty.push(`${f}: GET ${url} bez čitelné brány`); continue; }
      if (brana === null) continue; // každý člen podniku
      // Pole s víc klíči znamená „stačí kterýkoli", takže bránu musí otevřít každý z nich.
      const klice = Array.isArray(klic) ? klic : [klic];
      for (const k of klice) if (!sZavislostmi([k]).some(z => brana.includes(z))) spatneFronty.push(`${f}: ${k} neotevře GET ${url} (${brana.join(' | ')})`);
      for (const r of SYSTEMOVE_ROLE.filter(x => x.typ === 'vedeni')) {
        const ma = new Set(r.opravneni);
        if (klice.some(k => ma.has(k)) && !brana.some(b => ma.has(b))) spatneFronty.push(`${f}: role ${r.klic} frontu vidí, ale GET ${url} ji nepustí`);
      }
    }
    eq('čeká na tebe: klíč každé fronty projde bránou jejího endpointu (i u systémových rolí)', spatneFronty, []);
  }

  // AK-20: hotovo ⇔ komponenta v oblasti. Komponenty píše UI kola 68 (components/widgety/oblasti/*.tsx);
  // dokud složka není, kontrola se jen oznámí — pak platí naplno.
  const slozka = new URL('../../components/widgety/oblasti/', import.meta.url);
  if (!existsSync(slozka)) {
    console.log('– hotovo ⇔ komponenta: přeskočeno, components/widgety/oblasti ještě neexistuje');
  } else {
    const nesoulad: string[] = [];
    for (const o of OBLASTI) {
      const soubor = new URL(`${o.id}.tsx`, slozka);
      const src = existsSync(soubor) ? readFileSync(soubor, 'utf8') : '';
      const klice = klicePrvniUrovne(src, 'export const KOMPONENTY');
      if (!src) nesoulad.push(`${o.id}: chybí soubor ${o.id}.tsx`);
      for (const x of WIDGETY_OBLASTI[o.id]) {
        if (x.stav === 'hotovo' && !klice.has(x.id)) nesoulad.push(`${x.id}: hotovo, ale komponenta chybí`);
      }
      for (const k of klice) if (widget(k)?.stav !== 'hotovo' || widget(k)?.oblast !== o.id) nesoulad.push(`${o.id}.tsx: komponenta ${k} bez hotového widgetu oblasti`);
    }
    eq('katalog: hotovo ⇔ komponenta v oblasti (AK-20)', nesoulad, []);
  }
  // Pomocná kontrola samotného testu: zVychozich dává stálá id i pro opakovaný widget.
  eq('výchozí: id se odvodí z widgetu, opakování s číslem', zVychozich([{ w: 't.vice' }, { w: 't.vice' }, { w: 'nastroj' }], najdi).map(x => `${x.id}:${x.velikost}`), ['t-vice:S', 't-vice-2:S', 'nastroj:L']);
}

/**
 * Brána GET routy z textu souboru: klíče z prvního pozaduj() (nebo místního obalu ctx()/me())
 * v GET. null = každý člen (pozaduj(null), me()), undefined = brána se nenašla.
 */
function branaGet(src: string): string[] | null | undefined {
  const i = src.indexOf('export async function GET');
  if (i < 0) return undefined;
  const m = /\b(?:pozaduj|ctx|me)\(([^)]*)\)/.exec(src.slice(i));
  if (!m) return undefined;
  const klice = [...m[1].matchAll(/'([a-z_.]+)'/g)].map(x => x[1]);
  return klice.length ? klice : null;
}

/**
 * Klíče objektu za značkou (`export const KOMPONENTY … = { … }`) — jen první
 * úroveň, v uvozovkách i bez nich. Stačí na výpis komponent oblasti; spread
 * (`...X`) se přeskočí, protože se z textu nedá vyčíst.
 */
function klicePrvniUrovne(src: string, znacka: string): Set<string> {
  const out = new Set<string>();
  const start = src.indexOf(znacka);
  if (start < 0) return out;
  const otevreni = src.indexOf('{', src.indexOf('=', start));
  if (otevreni < 0) return out;
  let hloubka = 0, kus = '';
  const polozky: string[] = [];
  for (let i = otevreni; i < src.length; i++) {
    const ch = src[i];
    if ('{[('.includes(ch)) { hloubka++; if (hloubka === 1) continue; }
    if ('}])'.includes(ch)) { hloubka--; if (hloubka === 0) { polozky.push(kus); break; } }
    if (hloubka === 1 && ch === ',') { polozky.push(kus); kus = ''; continue; }
    kus += ch;
  }
  for (const pol of polozky) {
    const t = pol.replace(/\/\/[^\n]*/g, '').trim();
    if (!t || t.startsWith('...')) continue;
    const klic = (t.includes(':') ? t.slice(0, t.indexOf(':')) : t).trim().replace(/^['"]|['"]$/g, '');
    if (klic) out.add(klic);
  }
  return out;
}
