// Kolo 69, balík B6b (Postupy a návody) — jednotkové testy.
//
// Čistá logika je v lib/postupyPrehled.ts a lib/navodyPrehled.ts: povinné postupy dnes,
// poslední průběhy, přeskočené kroky, připomínky dnes a výběry návodů pro widgety.
// Hlídá se hlavně to, co se dřív pokazilo nebo snadno pokazí: párování běhu s postupem
// podle NÁZVU (přejmenovaný postup vypadal jako neudělaný), nečekaná odpověď jako
// „žádné povinné postupy" (podle toho se zavírá podnik), návrh připnutý k uzávěrce,
// připomínka v zavřený den. K tomu katalog a stránky balíku a pojistky nad zdrojáky.

import { readFileSync } from 'node:fs';
import type { Testy } from './_testy.ts';
import type { Divak } from '../../lib/widgety/typy.ts';
import {
  vyberPostupy, vyberPrubehy, povinneDnes, posledniPrubehy, posledniDokonceni, preskoceneKroky, pripominkyDnes,
  casPripominky, navrhyPostupu, delka, posunDen, denTydne, popisPripominky,
} from '../../lib/postupyPrehled.ts';
import {
  vyberNavody, vyberCtenare, povinneNeprectene, noveUpravene, navrhyNavodu, navodKUzaverce, kdoNecetl, poctyKategorii, kdyUpraveno,
} from '../../lib/navodyPrehled.ts';
import { WIDGETY as POSTUPY } from '../../lib/widgety/katalog/postupy.ts';
import { WIDGETY as NAVODY } from '../../lib/widgety/katalog/navody.ts';
import { widget } from '../../lib/widgety/katalog/index.ts';
import { stranka } from '../../lib/widgety/stranky/index.ts';
import { vyresRozlozeni, jeViditelny } from '../../lib/widgety/rozlozeni.ts';
import { SYSTEMOVE_ROLE } from '../../lib/opravneni.ts';

const zdroj = (cesta: string) => readFileSync(new URL(`../../${cesta}`, import.meta.url), 'utf8');
/** Kód bez komentářů — komentáře popisují, co se opravilo („dřív confirm()"), a pojistky by chytaly je. */
const kod = (cesta: string) => zdroj(cesta).split('\n').filter(r => !/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(r)).join('\n');

const postupyRaw = {
  procedures: [
    { id: 1, name: 'Otevírání', icon: 'clock', items: ['Odemknout', { text: 'Kávovar', minutes: 10 }], remindAnchor: 'open', remindDays: [], requireBeforeClosing: false },
    { id: 2, name: 'Zavírání (nové jméno)', icon: 'check', items: ['Uklidit', 'Spočítat kasu', 'Zamknout'], remindAnchor: 'close', remindDays: [0, 1, 2, 3, 4], requireBeforeClosing: true },
    { id: 3, name: 'Kontrola lednic', icon: 'box', items: ['Teplota'], remindAnchor: 'time', remindAt: '14:00', remindDays: [], requireBeforeClosing: true },
    { id: 4, name: 'Návrh: sklad', icon: 'box', items: ['Spočítat'], approved: false, requireBeforeClosing: true, remindAnchor: 'time', remindAt: '09:00' },
    { id: 5, name: 'Víkendový úklid', items: ['Okna'], remindAnchor: 'time', remindAt: '10:00', remindDays: [5, 6] },
  ],
  hasShiftToday: true,
  openingToday: { open: '07:30', close: '21:00', closed: false },
};

const behy = [
  // Dokončeno pod STARÝM jménem — páruje se podle procedure_id, ne podle názvu.
  { id: 11, procedure_id: 2, procedure_name: 'Zavírání', user_name: 'Jana', status: 'completed', total_items: 3, checked_items: [0, 1], skipped_items: [2], skip_reasons: { 2: { reason: 'no_time' } }, started_at: '2026-09-25 20:00:00', completed_at: '2026-09-25 20:20:00', duration_seconds: 1200 },
  { id: 12, procedure_id: 1, procedure_name: 'Otevírání', user_name: 'Petr', status: 'running', total_items: 2, checked_items: [0], started_at: '2026-09-26 07:31:00', completed_at: null },
  { id: 13, procedure_id: 2, procedure_name: 'Zavírání', user_name: 'Petr', status: 'completed', total_items: 3, checked_items: [0], skipped_items: [1, 2], skip_reasons: { 1: { reason: 'missing' }, 2: { reason: 'no_time' } }, started_at: '2026-09-24 20:00:00', completed_at: '2026-09-24 20:09:30', duration_seconds: 570 },
  { id: 14, procedure_id: 3, procedure_name: 'Kontrola lednic', user_name: 'Jana', status: 'completed', total_items: 1, checked_items: [], skipped_items: [0], skip_reasons: {}, started_at: '2026-08-01 10:00:00', completed_at: '2026-08-01 10:01:00', duration_seconds: 60 },
];

const navodyRaw = {
  guides: [
    { id: 1, title: 'Čištění kávovaru', categoryId: 1, updatedAt: '2026-09-20T10:00:00Z', requireRead: true, myRead: false, excerpt: 'Každý večer…' },
    { id: 2, title: 'Latte art', categoryId: 1, updatedAt: '2026-09-25T10:00:00Z', requireRead: true, myRead: true },
    { id: 3, title: 'Když kasa nesedí', categoryId: null, updatedAt: '2026-09-10T10:00:00Z', forClosing: true },
    { id: 4, title: 'Návrh: nový drink', categoryId: 2, updatedAt: '2026-09-26T08:00:00Z', approved: false, requireRead: true, forClosing: true },
    { id: 5, title: 'Starý návod k uzávěrce', categoryId: null, updatedAt: '2026-01-10T10:00:00Z', forClosing: true },
  ],
};

export default function ({ eq, ok }: Testy) {
  // ---- postupy: výběr dat ----
  const d = vyberPostupy(postupyRaw);
  eq('postupy: výběr, směna a otevírací doba z odpovědi', [d.postupy.length, d.maSmenuDnes, d.oteviraciDoba.close], [5, true, '21:00']);
  eq('postupy: bez otevírací doby platí výchozí 8–20 (jako ReminderWatcher)', vyberPostupy({ procedures: [] }).oteviraciDoba, { open: '08:00', close: '20:00', closed: false });
  for (const spatne of [null, {}, { procedures: 'x' }]) {
    let hodila = false; try { vyberPostupy(spatne); } catch { hodila = true; }
    ok(`postupy: nečekaný tvar (${JSON.stringify(spatne)}) je chyba widgetu, ne „žádné povinné postupy"`, hodila);
  }
  let bezBehu = false; try { vyberPrubehy({}); } catch { bezBehu = true; }
  ok('průběhy: odpověď bez runs je chyba, ne prázdná historie', bezBehu);

  // ---- povinné dnes ----
  const dnesni = [
    { id: 21, procedure_id: 2, status: 'completed', user_name: 'Jana' },
    { id: 22, procedure_id: 3, status: 'running', user_name: 'Petr' },
  ];
  const pov = povinneDnes(d.postupy, dnesni);
  eq('povinné dnes: jen schválené povinné, čekající nahoře, hotové podle ID (i po přejmenování)',
    pov.map(p => [p.id, p.hotovo, p.kdo]), [[3, false, null], [2, true, 'Jana']]);
  ok('povinné dnes: návrh (approved=false) se nepočítá, i když je označený jako povinný', !pov.some(p => p.id === 4));
  eq('povinné dnes: bez dnešních běhů čeká všechno', povinneDnes(d.postupy, []).every(p => !p.hotovo), true);

  // ---- poslední průběhy ----
  const pp = posledniPrubehy(behy, 3);
  eq('poslední průběhy: nejnovější nahoře (běžící podle začátku), strop podle nastavení', pp.map(r => r.id), [12, 11, 13]);
  eq('poslední průběhy: nedokončeno = celkem − odškrtnuté', pp.map(r => r.nedokonceno), [1, 1, 2]);
  eq('poslední průběhy: běžící nemá délku, hotový ano', [pp[0].hotovo, pp[0].sekund, pp[1].sekund], [false, null, 1200]);
  eq('poslední průběhy: strop 0 = nic', posledniPrubehy(behy, 0), []);
  eq('poslední dokončení: podle ID postupu, ne podle názvu; běžící se nepočítá', [posledniDokonceni(behy, 2)?.id, posledniDokonceni(behy, 1)], [11, null]);
  eq('délka: m:ss, nic pro null', [delka(1200), delka(570), delka(65), delka(null)], ['20:00', '9:30', '1:05', '']);

  // ---- přeskočené kroky ----
  const pk = preskoceneKroky(behy, d.postupy, 7, '2026-09-26');
  eq('přeskočené: za 7 dní, text kroku z aktuálního postupu, nejčastější nahoře',
    pk.map(k => [k.krok, k.pocet, k.duvod]), [['Zamknout', 2, 'no_time'], ['Spočítat kasu', 1, 'missing']]);
  eq('přeskočené: lidé bez duplicit', pk[0].lide, ['Jana', 'Petr']);
  ok('přeskočené: srpnový běh do 30 dní nespadá', !preskoceneKroky(behy, d.postupy, 30, '2026-09-26').some(k => k.postupId === 3));
  eq('přeskočené: krok, který už v postupu není, jako „Krok N"', preskoceneKroky([{ ...behy[0], skipped_items: [7] }], d.postupy, 7, '2026-09-26')[0].krok, 'Krok 8');
  eq('posun dne a den v týdnu (0 = pondělí)', [posunDen('2026-09-26', -6), posunDen('2026-03-01', -1), denTydne('2026-09-26'), denTydne('2026-09-28')], ['2026-09-20', '2026-02-28', 5, 0]);

  // ---- připomínky ----
  const oh = d.oteviraciDoba;
  // 26. 9. 2026 je sobota: Zavírání (po–pá) dnes ne, víkendový úklid ano, návrh nikdy.
  eq('připomínky dnes: podle dní v týdnu, kotvy k otevírací době a času; bez návrhů',
    pripominkyDnes(d.postupy, oh, '2026-09-26', '12:00').map(r => [r.nazev, r.cas, r.kotva, r.minula]),
    [['Otevírání', '07:30', 'open', true], ['Víkendový úklid', '10:00', 'time', true], ['Kontrola lednic', '14:00', 'time', false]]);
  eq('připomínky dnes: ve všední den i Zavírání při zavření', pripominkyDnes(d.postupy, oh, '2026-09-28', '06:00').map(r => r.nazev),
    ['Otevírání', 'Kontrola lednic', 'Zavírání (nové jméno)']);
  eq('připomínky dnes: zavřeno = žádná připomínka vázaná na otevírací dobu', pripominkyDnes(d.postupy, { ...oh, closed: true }, '2026-09-28', '06:00').map(r => r.nazev), ['Kontrola lednic']);
  eq('čas připomínky: neplatný čas = žádná', casPripominky({ id: 9, name: 'x', remindAnchor: 'time', remindAt: '25' }, oh), null);
  eq('popis připomínky do řádku', [popisPripominky(d.postupy[0]), popisPripominky(d.postupy[2]), popisPripominky({ id: 9, name: 'x' })], ['Při otevření', 'V 14:00', null]);
  eq('návrhy postupů: jen approved=false', navrhyPostupu(d.postupy).map(p => p.id), [4]);

  // ---- návody ----
  const n = vyberNavody(navodyRaw);
  let bezNavodu = false; try { vyberNavody({ guides: null }); } catch { bezNavodu = true; }
  ok('návody: odpověď bez seznamu je chyba, ne „žádné návody"', bezNavodu);
  eq('povinné čtení: jen schválené povinné, které jsem nečetl', povinneNeprectene(n).map(g => g.id), [1]);
  eq('nově upravené: schválené, nejnovější nahoře, strop', noveUpravene(n, 2).map(g => g.id), [2, 1]);
  eq('návrhy návodů: jen approved=false', navrhyNavodu(n).map(g => g.id), [4]);
  eq('návod k uzávěrce: schválený (návrh ne), při víc připnutých naposledy upravený', navodKUzaverce(n)?.id, 3);
  eq('návod k uzávěrce: nic připnutého = null', navodKUzaverce(n.filter(g => !g.forClosing)), null);
  const ct = vyberCtenare({ guides: [
    { id: 1, title: 'B', precetlo: 3, celkem: 5, neprecetli: [{ id: 7, name: 'Ota' }, { id: 8, name: 'Eva' }] },
    { id: 2, title: 'A', precetlo: 5, celkem: 5, neprecetli: [] },
    { id: 3, title: 'C', precetlo: 0, celkem: 0, neprecetli: [] },
    { id: 4, title: 'D', precetlo: 1, celkem: 5, neprecetli: [] },
  ] });
  eq('kdo nečetl: nejvíc chybějících nahoře, návod bez lidí pryč', kdoNecetl(ct).map(r => r.id), [4, 1, 2]);
  let bezCtenaru = false; try { vyberCtenare({}); } catch { bezCtenaru = true; }
  ok('kdo nečetl: nečekaný tvar je chyba (prázdno by znamenalo „přečetli všichni")', bezCtenaru);
  const pc = poctyKategorii(n);
  eq('počty kategorií: vše, kategorie a bez kategorie (-1)', [pc.get('vse'), pc.get(1), pc.get(2), pc.get(-1)], [5, 2, 1, 2]);
  const ted = new Date('2026-09-26T12:00:00Z');
  eq('kdy upraveno: dnes, včera, datum, jiný rok', [kdyUpraveno('2026-09-26T08:00:00Z', ted), kdyUpraveno('2026-09-25T08:00:00Z', ted), kdyUpraveno('2026-09-10T08:00:00Z', ted), kdyUpraveno('2025-12-31T08:00:00Z', ted), kdyUpraveno(null, ted)],
    ['dnes', 'včera', '10. 9.', '31. 12. 2025', '']);

  // ---- katalog a stránky ----
  const moje = [...POSTUPY, ...NAVODY];
  eq('katalog B6b: všech 11 widgetů postupů a návodů je hotových', moje.filter(w => w.stav !== 'hotovo').map(w => w.id), []);
  eq('katalog B6b: ikony se v oblastech neopakují a žádná není ikonou nástroje své stránky (AK-19)',
    [new Set(POSTUPY.map(w => w.ikona)).size === POSTUPY.length, new Set(NAVODY.map(w => w.ikona)).size === NAVODY.length,
      POSTUPY.some(w => w.ikona === 'clipboard'), NAVODY.some(w => w.ikona === 'book')], [true, true, false, false]);
  eq('katalog B6b: oprávnění podle katalogu (povinné dnes, přeskočené, spustit, návrhy, kdo nečetl)', [
    widget('postupy.povinne_dnes')?.opravneni, widget('postupy.preskocene_kroky')?.opravneni.vse, widget('postupy.spustit')?.opravneni.vse,
    widget('postupy.navrhy')?.opravneni.vse, widget('navody.navrhy')?.opravneni.vse, widget('navody.kdo_necetl')?.opravneni.vse,
  ], [
    { vse: ['postupy.zobrazit'], nektere: ['uzaverky.vytvorit', 'postupy.prubehy_tymu'], pole: { 'akce:spustit': 'postupy.spoustet' } },
    ['postupy.prubehy_tymu'], ['postupy.spoustet'], ['postupy.schvalovat'], ['navody.schvalovat'], ['navody.povinne_cteni'],
  ]);
  for (const id of ['vedeni.postupy', 'zamestnanec.postupy', 'vedeni.navody', 'zamestnanec.navody'] as const) ok(`stránka ${id}: aktivní`, stranka(id)?.aktivni === true);

  const role = (klic: string): Divak => {
    const r = SYSTEMOVE_ROLE.find(x => x.klic === klic)!;
    return { userId: 1, typ: r.typ, klic, roleId: null, zdrojRole: null, opravneni: new Set(r.opravneni), tarif: 'max', jeSpravce: false };
  };
  const vid = (sid: string, dv: Divak) => vyresRozlozeni({ stranka: stranka(sid as any)!, divak: dv, osobni: null, vychozi: [] }).polozky.map(x => x.widget);
  eq('výchozí Postupů vedení (vlastník): povinné dnes, návrhy, nástroj, poslední průběhy', vid('vedeni.postupy', role('vedeni')),
    ['postupy.povinne_dnes', 'postupy.navrhy', 'nastroj', 'postupy.posledni_prubehy']);
  eq('výchozí Postupů pro skladníka: bez povinných dnes (nemá uzávěrku ani průběhy týmu) a bez návrhů', vid('vedeni.postupy', role('skladnik')),
    ['nastroj', 'postupy.posledni_prubehy']);
  eq('výchozí Postupů pro baristu: povinné dnes, připomínky, nástroj, moje průběhy', vid('zamestnanec.postupy', role('barista')),
    ['postupy.povinne_dnes', 'postupy.pripominky', 'nastroj', 'postupy.posledni_prubehy']);
  eq('výchozí Postupů pro kuchaře: bez povinných dnes (neuzavírá)', vid('zamestnanec.postupy', role('kuchar')), ['postupy.pripominky', 'nastroj', 'postupy.posledni_prubehy']);
  eq('výchozí Návodů vedení: návrhy, kdo nečetl, knihovna', vid('vedeni.navody', role('provozni')), ['navody.navrhy', 'navody.kdo_necetl', 'nastroj']);
  eq('výchozí Návodů vedení pro skladníka: jen knihovna (bez schvalování a povinného čtení)', vid('vedeni.navody', role('skladnik')), ['nastroj']);
  eq('výchozí Návodů zaměstnance: povinné čtení, nové, knihovna', vid('zamestnanec.navody', role('barista')), ['navody.povinne_cteni', 'navody.nove', 'nastroj']);
  ok('barista nevidí Přeskočené kroky ani Kdo nečetl', !jeViditelny(widget('postupy.preskocene_kroky')!, role('barista')) && !jeViditelny(widget('navody.kdo_necetl')!, role('barista')));
  ok('účetní (bez postupů) nevidí ani Poslední průběhy mimo stránku bez přístupu', stranka('vedeni.postupy')!.pristup!.every(k => !role('ucetni').opravneni.has(k)));

  // ---- pojistky nad zdrojáky ----
  const proc = kod('components/procedures/Procedures.tsx');
  ok('Postupy: plocha s hlavičkou (žádný vlastní h1), stránka podle rozhraní', proc.includes('<PlochaWidgetu stranka={stranka}') && !/<h1/.test(proc) && proc.includes("'vedeni.postupy'") && proc.includes("'zamestnanec.postupy'"));
  ok('Postupy: žádné confirm(), ruční okno, emoji stavu ani animate-pulse', !/confirm\(|modal-overlay|✅|⏭️|❌|animate-(pulse|ping)/.test(proc));
  ok('Postupy: kdo co smí podle oprávnění, ne podle typu účtu', ['postupy.vytvorit', 'postupy.upravit', 'postupy.mazat', 'postupy.schvalovat', 'postupy.spoustet'].every(k => proc.includes(`smi('${k}')`)) && !/role === 'employer'/.test(proc));
  ok('Postupy: přepínač povinnosti je SwitchRow, ne checkbox', proc.includes('<SwitchRow') && !/type="checkbox"/.test(proc));
  const guides = kod('components/Guides.tsx');
  ok('Návody: plocha s hlavičkou, žádné confirm(), ruční okno ani tmavé <option>', guides.includes('<PlochaWidgetu stranka={stranka}') && !/<h1|confirm\(|modal-overlay|bg-neutral-900/.test(guides));
  ok('Návody: kdo co smí podle oprávnění', ['navody.vytvorit', 'navody.upravit', 'navody.mazat', 'navody.schvalovat', 'navody.povinne_cteni', 'navody.kategorie'].every(k => guides.includes(`smi('${k}')`)) && !/role === 'employer'/.test(guides));
  ok('Návody: vybraná kategorie inkoustem (seg-on), ne limetkou', guides.includes('seg-on') && !/bg-\[#C8F542\]\/15/.test(guides));
  const ostatni = ['components/procedures/FloatingRunner.tsx', 'components/procedures/ReminderWatcher.tsx', 'components/procedures/StepTimeline.tsx', 'components/guides/GuideProductLink.tsx', 'components/guides/GuideItemLink.tsx', 'components/guides/GuideStepIngredient.tsx', 'components/guides/StepGuidePicker.tsx'].map(kod).join('\n');
  ok('běžec, připomínka, osa kroků a vazby návodu: bez limetkových ploch, pulzu, konfet a hexu mimo tokeny', !/bg-\[#C8F542\]|animate-(pulse|ping)|#0A84FF|pr-confetti|text-\[#5B7A08\]/.test(ostatni));
  for (const soubor of ['components/widgety/oblasti/postupy.tsx', 'components/widgety/oblasti/navody.tsx']) {
    const s = kod(soubor);
    const cteni = [...s.matchAll(/fetch\(([^)]*)\)(?![^;]*method)/g)].filter(m => !/method/.test(s.slice(m.index!, m.index! + 200)));
    eq(`${soubor}: fetch jen pro zápis (čtení přes useDataWidgetu)`, cteni.map(x => x[0]), []);
    ok(`${soubor}: widget nikdy s limetkou ani pulzováním`, !/variant="accent"|animate-(pulse|ping)|btn-accent/.test(s));
  }
  const klice = (s: string) => [...(s.split('export const KOMPONENTY')[1] ?? '').matchAll(/'([a-z_.]+)':/g)].map(x => x[1]).sort();
  eq('oblasti B6b: komponenty = hotové widgety katalogu (AK-20)',
    [...klice(zdroj('components/widgety/oblasti/postupy.tsx')), ...klice(zdroj('components/widgety/oblasti/navody.tsx'))].sort(), moje.map(w => w.id).sort());
  const api = kod('app/api/guides/ctenari/route.ts');
  ok('API čtenářů: jen navody.povinne_cteni, bez tabletu, chyba = 503 (ne prázdno)', /pozaduj\('navody\.povinne_cteni'\)/.test(api) && /IN \('employer', 'employee'\)/.test(api) && /status: 503/.test(api));
}
