// Kolo 73 — průvodce prvotním nastavením: jednotkové testy čisté logiky
// a pojistky nad zdroji.
//
// Čisté jsou: předvolby podle typu (lib/pruvodce/predvolby.ts), Přehled podle
// cílů (widgety.ts), plán operací (plan.ts), čištění odpovědí (schema.ts)
// a stavový stroj (typy.ts). Databázová část (pouzij.ts, stav.ts) se netestuje
// přímo; hlídá se, co nesmí obsahovat: žádný DELETE, žádný UPDATE bez týmu,
// žádné zakládání menu.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import { CURRENCIES, LOCALES } from '../../lib/money.ts';
import { KATALOG_WIDGETU, widget as najdiWidget } from '../../lib/widgety/katalog/index.ts';
import { normalizujRozlozeni, zVychozich } from '../../lib/widgety/rozlozeni.ts';
import { STRANKA as PREHLED } from '../../lib/widgety/stranky/vedeni.prehled.ts';
import {
  CILE, CILE_ID, TYPY, TYPY_ID, ZEME, ZEME_ID, krokPoObnoveni, krokyProOdpovedi, dalsiStav, jeStav,
  type Cil, type Odpovedi, type Onboarding, type Pokladna, type Tarif, type TypPodniku,
} from '../../lib/pruvodce/typy.ts';
import {
  CILE_PODLE_TYPU, DNY_KRATKE, KATEGORIE_SKLADU, POSTUPY, POZICE, PREDVOLBY_DOBY, cistiDobu, dobaZPredvolby, hhmm,
  minuty, navrhniSmeny, rozsahDoby, vychoziDoba,
} from '../../lib/pruvodce/predvolby.ts';
import { MIN_PREHLEDU, STROP_PREHLEDU, sestavPrehled } from '../../lib/pruvodce/widgety.ts';
import { POZNAMKY, dataPodniku, doporucenyTarif, otisk, radkyShrnuti, sestavPlan, type StavPodniku } from '../../lib/pruvodce/plan.ts';
import { MAX_BAJTU, bajtu, cistiOdpovedi, cistiOnboarding, jeMalyDost, odeberKlice, slouciOdpovedi } from '../../lib/pruvodce/schema.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Kód bez komentářů — komentáře popisují zákazy a pojistky by chytaly je. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(r)).join('\n');

// Stejný regex jako scripts/check-generic-copy.mjs: v textech nesmí být sortiment jednoho provozu.
const ZAKAZANA_SLOVA = /([čc]ajovn\w*|pangea|sencha\w*|gyokuro|pu-?erh|matcha\w*|matchu|matchy|oolong|gunpowder|darjeeling)/i;

const PRAZDNY: StavPodniku = {
  nazev: 'Podnik', tarif: 'zdarma', openingHoursPrazdne: true, maxDniNull: true, drawerFloatNull: true,
  typySmen: [], kategorieSkladu: [], postupy: [], prehled: 'zadny',
};

const TARIFY: Tarif[] = ['zdarma', 'pro', 'max'];
const POCET_TARIFU: Record<Tarif, number> = { zdarma: 0, pro: 1, max: 2 };

export default function ({ eq, ok }: Testy) {
  // ================= A: předvolby =================
  ok('typů podniku je sedm a jsou unikátní', TYPY.length === 7 && new Set(TYPY_ID).size === 7);
  for (const t of TYPY_ID) {
    const d = vychoziDoba(t);
    ok(`doba ${t}: klíče 0..6 a čas HH:MM`, Object.keys(d).join() === '0,1,2,3,4,5,6' && Object.values(d).every(x => /^\d{2}:\d{2}$/.test(x.open) && /^\d{2}:\d{2}$/.test(x.close)));
    ok(`doba ${t}: aspoň jeden den otevřeno`, cistiDobu(d) !== null);
    ok(`kategorie skladu ${t}: neprázdné a unikátní`, KATEGORIE_SKLADU[t].length >= 3 && new Set(KATEGORIE_SKLADU[t].map(x => x.toLowerCase())).size === KATEGORIE_SKLADU[t].length);
    ok(`postupy ${t}: názvy a kroky`, POSTUPY[t].length >= 2 && POSTUPY[t].every(p => p.name && p.kroky.length >= 3));
    ok(`pozice ${t}: neprázdná`, POZICE[t].length > 0);
    ok(`cíle podle typu ${t}: neprázdné a známé`, CILE_PODLE_TYPU[t].length > 0 && CILE_PODLE_TYPU[t].every(c => CILE_ID.includes(c)));
  }
  ok('pekárna má alespoň jeden zavřený den', Object.values(vychoziDoba('pekarna')).some(d => d.closed));
  ok('bar má v pondělí zavřeno', vychoziDoba('bar')['0'].closed);
  ok('dnů v týdnu je sedm', DNY_KRATKE.length === 7);
  for (const z of ZEME_ID) {
    const p = ZEME[z];
    if (!p) continue;
    ok(`země ${z}: měna z CURRENCIES a formát z LOCALES`, CURRENCIES.some(c => c.code === p.mena) && LOCALES.some(l => l.code === p.locale));
  }
  ok('jiná země nemá předvolbu (nic se nepřepisuje)', ZEME.JINA === null);
  // Texty, které jdou uživateli na oči, projdou kontrolou univerzálních textů.
  const texty: string[] = [
    ...TYPY.flatMap(t => [t.nazev, t.veta]), ...CILE.flatMap(c => [c.nazev, c.veta, c.ukazka]),
    ...Object.values(KATEGORIE_SKLADU).flat(), ...Object.values(POSTUPY).flat().flatMap(p => [p.name, p.description, ...p.kroky]),
    ...Object.values(POZICE), ...PREDVOLBY_DOBY.flatMap(p => [p.nazev, p.popis]),
  ];
  ok('žádný text předvoleb nezmiňuje sortiment jednoho provozu', texty.every(t => !ZAKAZANA_SLOVA.test(t)));
  ok('štítek čajového podniku není „čajovna"', TYPY.find(t => t.id === 'caj')!.nazev === 'Čajový podnik');
  for (const p of PREDVOLBY_DOBY) ok(`předvolba doby ${p.id}: platná`, cistiDobu(dobaZPredvolby(p.id, 'kavarna')) !== null);

  // --- čas a směny ---
  eq('minuty a hhmm jsou inverzní', [hhmm(minuty('08:30')), hhmm(minuty('00:00')), hhmm(1500)], ['08:30', '00:00', '01:00']);
  const kav = navrhniSmeny('kavarna', vychoziDoba('kavarna'));
  eq('kavárna: Otevírací a Zavírací s příznaky', kav.map(s => [s.name, s.startsAtOpen, s.endsAtClose]), [['Otevírací', true, false], ['Zavírací', false, true]]);
  eq('kavárna: Otevírací začíná v nejdřívější otevření, Zavírací končí v nejpozdější zavření', [kav[0].startTime, kav[1].endTime], ['08:00', '18:00']);
  eq('restaurace má i Střední', navrhniSmeny('restaurace', undefined).map(s => s.name), ['Otevírací', 'Střední', 'Zavírací']);
  eq('bar má jen Zavírací', navrhniSmeny('bar', undefined).map(s => s.name), ['Zavírací']);
  eq('foodtruck má jednu směnu na celý den', navrhniSmeny('foodtruck', undefined).map(s => [s.name, s.startsAtOpen, s.endsAtClose]), [['Celý den', true, true]]);
  const po = vychoziDoba('bar');
  po['1'] = { open: '18:00', close: '02:00', closed: false };
  ok('zavírání po půlnoci se počítá do dalšího dne', (rozsahDoby(po)?.zavreno ?? 0) >= 26 * 60);
  eq('všechny dny zavřeno: není z čeho navrhnout směny', navrhniSmeny('kavarna', Object.fromEntries(Object.entries(vychoziDoba('kavarna')).map(([k, d]) => [k, { ...d, closed: true }]))), []);
  ok('všechny dny zavřeno čistí cistiDobu na null', cistiDobu(Object.fromEntries(Object.entries(vychoziDoba('kavarna')).map(([k, d]) => [k, { ...d, closed: true }]))) === null);
  ok('typy směn mají časy HH:MM a barvu', TYPY_ID.every(t => navrhniSmeny(t, undefined).every(s => /^\d{2}:\d{2}$/.test(s.startTime) && /^\d{2}:\d{2}$/.test(s.endTime) && s.color.startsWith('#'))));

  // ================= B: Přehled podle cílů =================
  const podmnoziny: Cil[][] = [];
  for (let m = 0; m < 1 << CILE_ID.length; m++) podmnoziny.push(CILE_ID.filter((_, i) => m & (1 << i)));
  const velikosti = ['sam', 'mali', 'stredni', 'velky'] as const;
  const pokladny: (Pokladna | undefined)[] = [undefined, 'storyous', 'jina', 'zadna'];
  let zkouseno = 0;
  const vadne: string[] = [];
  for (const cile of podmnoziny) for (const tarif of TARIFY) for (const vt of velikosti) for (const pokladna of pokladny) {
    zkouseno++;
    const popis = `${cile.join('+') || '∅'}/${tarif}/${vt}/${pokladna}`;
    const p = sestavPrehled({ cile, tarif, velikostTymu: vt, pokladna });
    const defs = p.map(x => najdiWidget(x.w));
    if (!defs.every(d => d && d.stav === 'hotovo' && d.rozhrani.includes('vedeni'))) vadne.push(`${popis}: neexistující nebo plánovaný widget`);
    if (new Set(p.map(x => x.w)).size !== p.length) vadne.push(`${popis}: opakovaný widget`);
    const ikony = defs.map(d => d?.ikona);
    if (new Set(ikony).size !== ikony.length) vadne.push(`${popis}: opakovaná ikona ${ikony.join(',')}`);
    if (defs.filter(d => d?.muzeInkoust).length > 1) vadne.push(`${popis}: víc inkoustových ploch`);
    if (p.length > STROP_PREHLEDU) vadne.push(`${popis}: ${p.length} položek`);
    if (p.length < MIN_PREHLEDU) vadne.push(`${popis}: jen ${p.length} položek`);
    if (!p.every((x, i) => x.s && defs[i]?.velikosti.includes(x.s))) vadne.push(`${popis}: velikost mimo povolené`);
    if (!defs.every(d => d && POCET_TARIFU[d.tarif] <= POCET_TARIFU[tarif])) vadne.push(`${popis}: widget vyššího tarifu`);
    if (p.filter(x => x.s === 'S').length % 2 !== 0) vadne.push(`${popis}: lichý počet S`);
    if (p[0]?.w !== 'prehled.ceka_na_tebe' || p[1]?.w !== 'prehled.prvni_kroky') vadne.push(`${popis}: začátek`);
    if (normalizujRozlozeni(PREHLED, zVychozich(p)).length !== p.length) vadne.push(`${popis}: normalizace něco zahodila`);
  }
  ok(`Přehled podle cílů: ${zkouseno} kombinací bez vady`, vadne.length === 0);
  if (vadne.length) console.error(vadne.slice(0, 8).join('\n'));
  for (const c of CILE_ID) {
    const p = sestavPrehled({ cile: [c], tarif: 'max', velikostTymu: 'mali' });
    ok(`cíl ${c}: v Přehledu je aspoň jeden jeho widget`, p.length > 4);
  }
  const zdarma = sestavPrehled({ cile: ['hoste', 'finance'], tarif: 'zdarma' });
  ok('Zdarma nedostane hosty (Max) ani měsíční přehled, když je widget vyššího tarifu', !zdarma.some(x => x.w.startsWith('klient.')));
  ok('Pokladna Storyous přidá jedinou inkoustovou plochu na Max', sestavPrehled({ cile: ['finance'], tarif: 'max', pokladna: 'storyous' }).filter(x => najdiWidget(x.w)?.muzeInkoust).length === 1);
  ok('Díry v obsazení jen u většího týmu', sestavPrehled({ cile: ['rozvrh'], tarif: 'zdarma', velikostTymu: 'velky' }).some(x => x.w === 'rozvrh.diry')
    && !sestavPrehled({ cile: ['rozvrh'], tarif: 'zdarma', velikostTymu: 'sam' }).some(x => x.w === 'rozvrh.diry'));
  ok('ze známých widgetů katalogu jsou všechny použité widgety hotové', KATALOG_WIDGETU.filter(w => w.stav === 'hotovo').length > 50);

  // ================= C: plán operací =================
  eq('prázdné odpovědi: prázdný plán, žádný pád', sestavPlan({}, PRAZDNY), []);
  const kavarna: Odpovedi = { typ: 'kavarna', nazev: 'Kavárna Test', zeme: 'CZ', cile: ['rozvrh', 'sklad', 'uzaverky', 'provoz'], doba: vychoziDoba('kavarna'), hotovostVKase: 2000, tym: { velikost: 'mali' } };
  const plan = sestavPlan(kavarna, PRAZDNY);
  eq('kavárna + cíle: operace v pořadí', plan.map(o => [o.klic, o.stav]),
    [['podnik', 'provest'], ['doba', 'provest'], ['smeny', 'provest'], ['pravidla', 'provest'], ['sklad', 'provest'], ['postupy', 'provest'], ['prehled', 'provest'], ['kasa', 'provest']]);
  const smeny = plan.find(o => o.klic === 'smeny');
  ok('typy směn z plánu: Otevírací a Zavírací', smeny?.stav === 'provest' && smeny.klic === 'smeny' && smeny.smeny.map(s => s.name).join() === 'Otevírací,Zavírací');
  const sklad = plan.find(o => o.klic === 'sklad');
  ok('kategorie skladu z plánu odpovídají typu', sklad?.stav === 'provest' && sklad.klic === 'sklad' && sklad.kategorie.join() === KATEGORIE_SKLADU.kavarna.join());
  const podnik = plan.find(o => o.klic === 'podnik');
  ok('podnik: měna a formát z předvolby země, typ uložený', podnik?.stav === 'provest' && podnik.klic === 'podnik'
    && podnik.podnik.mena === 'CZK' && podnik.podnik.formatCisel === 'cs-CZ' && podnik.podnik.typ === 'kavarna' && podnik.podnik.zacatekTydne === 1);
  // opakované spuštění s ledgerem nevytvoří nic znovu
  const pouzito = Object.fromEntries(plan.map(o => [o.klic, o.hash]));
  const stavPo: StavPodniku = { ...PRAZDNY, openingHoursPrazdne: false, maxDniNull: false, drawerFloatNull: false, typySmen: ['Otevírací', 'Zavírací'], kategorieSkladu: KATEGORIE_SKLADU.kavarna, postupy: POSTUPY.kavarna.map(p => p.name), prehled: 'pruvodce' };
  const podruhe = sestavPlan(kavarna, stavPo, pouzito);
  ok('podruhé se nic neprovede (ledger a dedupe)', podruhe.every(o => o.stav === 'preskocit'));
  // druhá záložka bez ledgeru: dedupe podle názvu
  const bezLedgeru = sestavPlan(kavarna, { ...stavPo, prehled: 'zadny' }, {});
  ok('bez ledgeru dedupe podle názvu zabrání duplicitám skladu, směn a postupů', !bezLedgeru.some(o => o.stav === 'provest' && ['smeny', 'sklad', 'postupy'].includes(o.klic)));
  // aditivní: co člověk nastavil, se nepřepíše
  const cizi = sestavPlan(kavarna, { ...PRAZDNY, openingHoursPrazdne: false, maxDniNull: false, drawerFloatNull: false, typySmen: ['Ranní'], prehled: 'jiny' });
  eq('cizí doba, směny, pravidlo, kasa a Přehled zůstanou', cizi.filter(o => ['doba', 'smeny', 'pravidla', 'kasa', 'prehled'].includes(o.klic)).map(o => o.stav), ['preskocit', 'preskocit', 'preskocit', 'preskocit', 'preskocit']);
  ok('přeskočené operace nesou důvod', cizi.filter(o => o.stav === 'preskocit').every(o => (o.poznamka ?? '').length > 5));
  ok('Přehled vytvořený průvodcem se při opakování smí přepsat', sestavPlan(kavarna, { ...PRAZDNY, prehled: 'pruvodce' }).find(o => o.klic === 'prehled')?.stav === 'provest');
  // vypnutá položka
  const vypnuto = sestavPlan({ ...kavarna, polozky: { sklad: false, postupy: false, smeny: false, prehled: false, pravidla: false } }, PRAZDNY);
  eq('vypnuté položky ve Shrnutí se nevytvoří', vypnuto.map(o => o.klic), ['podnik', 'doba', 'kasa']);
  // přeskočený krok
  const preskoceno = sestavPlan({ ...kavarna, preskoceno: ['doba', 'kasa'] }, PRAZDNY);
  ok('přeskočený krok nic nevytváří', !preskoceno.some(o => o.klic === 'doba' || o.klic === 'kasa'));
  ok('cíl Sklad bez typu nezakládá kategorie', !sestavPlan({ cile: ['sklad'] }, PRAZDNY).some(o => o.klic === 'sklad'));
  ok('bez cílů není Přehled', !sestavPlan({ typ: 'bar' }, PRAZDNY).some(o => o.klic === 'prehled'));
  ok('otisk je stabilní a citlivý na vstup', otisk({ a: 1 }) === otisk({ a: 1 }) && otisk({ a: 1 }) !== otisk({ a: 2 }) && /^[0-9a-f]{8}$/.test(otisk('x')));
  ok('dataPodniku vynechá nevyplněné pole', Object.keys(dataPodniku({ nazev: 'X' })).join() === 'nazev');
  eq('dataPodniku: Jiná země nepřepisuje měnu', dataPodniku({ zeme: 'JINA' }), { zeme: 'JINA' });
  ok('Shrnutí: řádky odpovídají cílům a typu', radkyShrnuti({ typ: 'bar', cile: ['sklad'] }).map(r => r.klic).join() === 'smeny,sklad');
  ok('Shrnutí bez odpovědí je prázdné', radkyShrnuti({}).length === 0);
  ok('Shrnutí nese jednotlivé názvy pro překlad', radkyShrnuti({ typ: 'bar', cile: ['sklad'] }).every(r => r.polozky.length > 0 && r.polozky.join(', ') === r.popis));

  // Výchozí obsah se zakládá v jazyce majitele: názvy jdou přes překladač, otisky (ledger) zůstávají z češtiny.
  const EN: Record<string, string> = { 'Otevírací': 'Opening', 'Zavírací': 'Closing', 'Káva': 'Coffee', 'Otevírání': 'Opening (routine)', 'Odemknout a rozsvítit': 'Unlock' };
  const pr = (cs: string) => EN[cs] ?? cs;
  const planEn = sestavPlan(kavarna, PRAZDNY, {}, pr);
  const smenyEn = planEn.find(o => o.klic === 'smeny');
  ok('překladač: názvy typů směn jdou v jazyce majitele', smenyEn?.stav === 'provest' && smenyEn.klic === 'smeny' && smenyEn.smeny.map(x => x.name).join() === 'Opening,Closing');
  const skladEn = planEn.find(o => o.klic === 'sklad');
  ok('překladač: kategorie skladu', skladEn?.stav === 'provest' && skladEn.klic === 'sklad' && skladEn.kategorie[0] === 'Coffee');
  const postupyEn = planEn.find(o => o.klic === 'postupy');
  ok('překladač: název, popis i kroky postupu', postupyEn?.stav === 'provest' && postupyEn.klic === 'postupy'
    && postupyEn.postupy[0].name === 'Opening (routine)' && postupyEn.postupy[0].kroky[0] === 'Unlock');
  eq('překladač nemění otisky (ledger zná češtinu)', planEn.map(o => o.hash), plan.map(o => o.hash));
  // majitel, který průvodce spustil česky a pak znovu anglicky, nedostane duplicity
  const cesky = sestavPlan(kavarna, { ...stavPo, prehled: 'zadny' }, {}, pr);
  ok('dedupe zná český i přeložený název', !cesky.some(o => o.stav === 'provest' && ['smeny', 'sklad', 'postupy'].includes(o.klic)));
  ok('bez překladače je plán beze změny oproti češtině', sestavPlan(kavarna, PRAZDNY, {}, s => s).map(o => o.klic).join() === plan.map(o => o.klic).join());
  ok('poznámky přeskočených operací jsou z jednoho seznamu', cizi.filter(o => o.stav === 'preskocit').every(o => Object.values(POZNAMKY).includes((o.poznamka ?? '') as never)));
  ok('doporučení tarifu: hosté → Max, tablet → Pro, jinak Zdarma',
    doporucenyTarif({ cile: ['hoste'] }) === 'max' && doporucenyTarif({ pokladna: 'storyous' }) === 'max' && doporucenyTarif({ tablet: true }) === 'pro'
    && doporucenyTarif({ tym: { velikost: 'velky' } }) === 'pro' && doporucenyTarif({ cile: ['sklad'] }) === 'zdarma');

  // ================= D: čištění odpovědí =================
  eq('neznámý typ a měna mimo seznam se zahodí', cistiOdpovedi({ typ: 'hospoda', mena: 'XXX', formatCisel: 'xx-XX', zeme: 'Mars' }), {});
  ok('dlouhý název se ořízne na 80 znaků', (cistiOdpovedi({ nazev: 'x'.repeat(300) }).nazev ?? '').length === 80);
  ok('e-mail v textu se vyřízne (neukládají se)', !/@/.test(cistiOdpovedi({ nazev: 'Kavárna info@firma.cz', adresa: 'a@b.cz' }).nazev ?? '')
    && cistiOdpovedi({ adresa: 'a@b.cz' }).adresa === undefined);
  ok('pole e-mailů pozvaných se zahodí jako neznámé', !('emaily' in cistiOdpovedi({ emaily: ['a@b.cz'], tym: { emaily: ['a@b.cz'], pozvanych: 2 } })) && cistiOdpovedi({ tym: { emaily: ['a@b.cz'], pozvanych: 2 } }).tym?.pozvanych === 2);
  eq('tým: velikost mimo seznam pryč, počet zaokrouhlen a omezen', cistiOdpovedi({ tym: { velikost: 'obri', pozvanych: 99.9 } }).tym, { pozvanych: 50 });
  ok('nesmyslná doba se zahodí', cistiOdpovedi({ doba: { 0: { open: '99:99', close: 'x', closed: false } } }).doba?.['0'].open === '08:00');
  ok('doba se všemi dny zavřeno se zahodí', cistiOdpovedi({ doba: Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map(i => [i, { open: '08:00', close: '18:00', closed: true }])) }).doba === undefined);
  eq('cíle: neznámé pryč, pořadí podle seznamu', cistiOdpovedi({ cile: ['sklad', 'nic', 'rozvrh'] }).cile, ['rozvrh', 'sklad']);
  ok('hotovost: záporná a obří hodnota se zahodí', cistiOdpovedi({ hotovostVKase: -5 }).hotovostVKase === undefined && cistiOdpovedi({ hotovostVKase: 9e9 }).hotovostVKase === undefined && cistiOdpovedi({ hotovostVKase: '2000' }).hotovostVKase === 2000);
  ok('heslo a tajemství se neuloží (neznámé klíče)', Object.keys(cistiOdpovedi({ heslo: 'x', password: 'y', token: 'z', nazev: 'OK' })).join() === 'nazev');
  eq('nesmysl na vstupu dá prázdné odpovědi', [cistiOdpovedi(null), cistiOdpovedi('x'), cistiOdpovedi([])], [{}, {}, {}]);
  ok('velikost záznamu se hlídá na 4 KB', jeMalyDost({ a: 'x' }) && !jeMalyDost({ a: 'x'.repeat(MAX_BAJTU) }) && bajtu({ a: 'ě' }) > bajtu({ a: 'e' }));
  eq('sloučení: nová odpověď přepíše jen svůj klíč, tým se slévá po polích',
    slouciOdpovedi({ typ: 'bar', tym: { velikost: 'mali', pozice: 'Barman' } }, { tym: { pozvanych: 2 } }), { typ: 'bar', tym: { velikost: 'mali', pozice: 'Barman', pozvanych: 2 } });
  eq('odebrání klíče přes null', odeberKlice({ typ: 'bar', adresa: 'x' }, { adresa: null }), { typ: 'bar' });
  ok('záznam z databáze: poškozený JSON a neznámý stav dá null', cistiOnboarding('{') === null && cistiOnboarding({ stav: 'nic' }) === null && cistiOnboarding(null) === null);
  const o = cistiOnboarding({ v: 1, stav: 'rozpracovano', krok: 'doba', odpovedi: { typ: 'caj', x: 1 }, pouzito: { podnik: 'abc', 'špatný klíč': 'x' } });
  ok('záznam z databáze: očištěný', o?.stav === 'rozpracovano' && o.krok === 'doba' && o.odpovedi.typ === 'caj' && !('x' in o.odpovedi) && Object.keys(o.pouzito).join() === 'podnik');

  // ================= E: stavy a kroky =================
  ok('cyklus stavů: nove → rozpracovano', dalsiStav('nove', undefined) === 'rozpracovano' && dalsiStav('nove', 'rozpracovano') === 'rozpracovano');
  ok('nove → preskoceno (Nastavím později)', dalsiStav('nove', 'preskoceno') === 'preskoceno');
  ok('preskoceno → rozpracovano (Dokončit)', dalsiStav('preskoceno', 'rozpracovano') === 'rozpracovano');
  ok('rozpracovano → hotovo', dalsiStav('rozpracovano', 'hotovo') === 'hotovo');
  ok('hotovo se autosavem nevrací na nove ani se nepřepíše', dalsiStav('hotovo', 'nove') === 'hotovo' && dalsiStav('hotovo', undefined) === 'hotovo' && dalsiStav('hotovo', 'preskoceno') === 'hotovo');
  ok('hotovo → rozpracovano jen výslovně (Spustit znovu)', dalsiStav('hotovo', 'rozpracovano') === 'rozpracovano');
  ok('preskoceno se autosavem nevrací na nove', dalsiStav('preskoceno', 'nove') === 'preskoceno');
  ok('jeStav zná čtyři stavy', ['nove', 'rozpracovano', 'preskoceno', 'hotovo'].every(jeStav) && !jeStav('x'));
  eq('kroky bez cíle Uzávěrky nemají Kasu', krokyProOdpovedi({ cile: ['sklad'] }), ['vitej', 'typ', 'podnik', 'doba', 'tym', 'cile', 'shrnuti', 'hotovo']);
  ok('kroky s cílem Uzávěrky mají Kasu před Shrnutím', krokyProOdpovedi({ cile: ['uzaverky'] }).join() === 'vitej,typ,podnik,doba,tym,cile,kasa,shrnuti,hotovo');
  const rozdelany: Onboarding = { v: 1, stav: 'rozpracovano', krok: 'tym', odpovedi: {}, pouzito: {} };
  ok('obnovení otevře poslední krok; neznámý a hotovo vrací na začátek', krokPoObnoveni(rozdelany) === 'tym' && krokPoObnoveni({ ...rozdelany, krok: 'hotovo' }) === 'vitej' && krokPoObnoveni({ ...rozdelany, krok: undefined }) === 'vitej'
    && krokPoObnoveni({ ...rozdelany, krok: 'kasa' }) === 'vitej');
  ok('typy podniku mají jen známá id', (['kavarna', 'restaurace', 'bar', 'pekarna', 'caj', 'foodtruck', 'jine'] as TypPodniku[]).every(t => TYPY_ID.includes(t)));

  // ================= F: pojistky nad zdroji =================
  for (const cesta of ['app/api/onboarding/route.ts', 'app/api/onboarding/pouzit/route.ts']) {
    const k = kod(cesta);
    ok(`${cesta}: brána pozaduj(`, /pozaduj\('podnik\.nastaveni'\)/.test(k));
    ok(`${cesta}: hlídá vlastníka`, /vlastnikId !== c\.meId|vlastnikId === c\.meId/.test(k));
  }
  ok('podnik z doby před průvodcem ho dostane jen na výslovné „Spustit znovu" (GET ?znovu=1, PUT znovu: true)',
    /searchParams\.get\('znovu'\) === '1'/.test(kod('app/api/onboarding/route.ts')) && /telo\.znovu === true/.test(kod('app/api/onboarding/route.ts'))
    && /info\.stav === null \|\| info\.stav === 'hotovo'\) && !znovu/.test(kod('app/employer/start/page.tsx')));
  ok('„Spustit znovu" v Nastavení vidí jen vlastník a vede na /employer/start?znovu=1', /isOwner && \([\s\S]{0,300}\/employer\/start\?znovu=1/.test(kod('components/TeamManagement.tsx')));
  ok('První kroky připomínají nedokončený průvodce jen ve stavech rozpracovano a preskoceno', /onboarding\.data === 'rozpracovano' \|\| onboarding\.data === 'preskoceno'/.test(kod('components/widgety/oblasti/obecne.tsx')));
  // Barvy: jen tokeny a dvě hodnoty značky (inkoust a limetka), které používá celá aplikace.
  const souboryUI = ['Pruvodce', 'Kulisa', 'FotoKroku', 'DemoOkno', 'kroky/Vitej', 'kroky/Typ', 'kroky/Podnik', 'kroky/Doba', 'kroky/Tym', 'kroky/Cile', 'kroky/Kasa', 'kroky/Shrnuti', 'kroky/Hotovo'];
  const syrove = souboryUI.flatMap(f => [...kod(`components/pruvodce/${f}.tsx`).matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map(m => `${f}: ${m[0]}`)).filter(x => !/#16181A|#C8F542/i.test(x));
  ok('komponenty průvodce nemají syrové barvy mimo inkoust a limetku', syrove.length === 0);
  ok('komponenty průvodce nepoužívají transition-all ani blur mimo plovoucí lištu', souboryUI.every(f => !/transition-all|backdrop-blur/.test(kod(`components/pruvodce/${f}.tsx`))));
  ok('PUT /api/onboarding má omezení četnosti', /hit\(`onboarding:/.test(kod('app/api/onboarding/route.ts')));
  ok('POST /api/onboarding/pouzit má omezení četnosti', /hit\(`onboarding-pouzit:/.test(kod('app/api/onboarding/pouzit/route.ts')));
  const pouzij = kod('lib/pruvodce/pouzij.ts');
  ok('pouzij.ts nemaže (žádný DELETE)', !/\bDELETE\b/i.test(pouzij));
  const updaty = [...pouzij.matchAll(/UPDATE\s+(\w+)[\s\S]*?`/g)];
  ok('pouzij.ts: každý UPDATE je omezený na podnik', updaty.length >= 4 && updaty.every(m => /\$\{teamId\}/.test(m[0])));
  ok('pouzij.ts: každá operace běží ve vlastním try', /for \(const op of plan\)[\s\S]*try \{[\s\S]*catch \(e\)/.test(pouzij));
  ok('pouzij.ts nezakládá menu ani položky skladu', !/menu/i.test(pouzij.replace(/onboarding|Nastavení/g, '')) && !/INSERT INTO inventory_items/.test(pouzij));
  ok('pouzij.ts nepřepisuje ruční Přehled', /radek\.zdroj !== 'pruvodce'/.test(pouzij));
  ok('stránka Přehledu čte podnik z databáze, ne z tokenu', /infoOBrane\(Number\(user\.id\)\)/.test(kod('app/employer/overview/page.tsx')) && /FROM teams WHERE id = \(SELECT team_id FROM users/.test(kod('lib/pruvodce/brana.ts')));
  ok('přesměrování jen pro stav nove', /info\.stav === 'nove'/.test(kod('lib/pruvodce/brana.ts')));
  ok('brána je fail-open (chyba databáze = žádné přesměrování)', /catch \{ return null; \}/.test(kod('lib/pruvodce/brana.ts')));
  ok('registrace zapisuje stav nove mimo INSERT týmu a v try', /UPDATE teams SET onboarding[\s\S]*catch \{ \/\* onboarding column not migrated yet \*\/ \}/.test(kod('app/api/register/route.ts')));
  ok('DDL: sloupce onboarding, address a country jsou v /api/init', ['onboarding JSONB', 'address TEXT', 'country TEXT'].every(c => zdroj('app/api/init/route.ts').includes(`ALTER TABLE teams ADD COLUMN IF NOT EXISTS ${c}`)));
  ok('ručně uložené rozložení vynuluje zdroj „pruvodce"', /zdroj = 'pruvodce' THEN NULL/.test(zdroj('lib/widgety/rozlozeniDb.ts')));
}
