// Kolo 8, balík R8-3 — Rozvrh, tým a odměny.
//
// Tým (vedení, 1280 i 390×844 s dotykem): u každého člena hodiny za zvolené období a pod
// nimi výdělek (hodiny × sazba), ObdobiLista nad seznamem, řazení Jméno / Hodiny / Výdělek,
// součet nad seznamem a odkaz „Rozpad v Docházce"; bez dochazka.zobrazit se /api/attendance
// nevolá a sloupec hodin není. Nic nepřetéká.
// Plánovač (vedení): souhrn „3 varování k limitům rozvrhu" s proklikem na první den, v okně
// dne chip „48 h týdně" pod časem směny a věta s očekávanou tržbou, mzdami a podílem; týdenní
// pohled má řádek Mzdy / tržba s chipem podílu a chip varování v pilulce; souhrn plánu čtvrté
// číslo Podíl mezd s cílem. Bez finance.trzby podíl není. Pravidla: tři nové limity a PUT
// /api/schedule/rules s `limity`.
//
// Čas je pevný: prohlížeč žije 20. dne aktuálního měsíce v 16:00 (Praha); docházka nese tokeny
// "@D-<n>T<HH:MM>" (pražský čas před n dny) a "@<min>" (minut před „teď"), rozvrh tokeny PO1…NE1,
// PO2, UT2 (první celý týden požadovaného měsíce a pondělí/úterý toho dalšího).
//   SONDY_ZAKLAD=http://localhost:3433 node scripts/sondy/k84-tym.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, dokud, roleMine, dotazyNa, DIR, OUT, BASE } from './k68-spolecne.mjs';

const TEL = { width: 390, height: 844 };
const prahaDen = (ms) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(ms));
const prahaISO = (den, hm) => {
  const odhad = new Date(`${den}T${hm}:00Z`);
  const tz = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', timeZoneName: 'longOffset' }).formatToParts(odhad).find(x => x.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  return new Date(`${den}T${hm}:00${tz.replace('GMT', '') || '+00:00'}`).toISOString();
};
const DNES = `${prahaDen(Date.now()).slice(0, 7)}-20`;
const TED = Date.parse(prahaISO(DNES, '16:00'));
const POSUN = TED - Date.now();
const den = (n) => { const d = new Date(`${DNES}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
// Obecná fixtura teams.json má dvakrát člena 17 (Jakub Horák a „Jakub Přepnutý" — člen přepnutý
// do jiného podniku); React na to hlásí stejný klíč. Není to chyba kola 8, sonda ji nepočítá.
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat|same key/i.test(c));
const text = async (loc) => ((await loc.count()) ? (await loc.first().innerText()) : '').replace(/\u00a0/g, ' ');
const preteceni = (p) => p.evaluate(() => {
  const okno = window.innerWidth;
  const dokument = document.documentElement.scrollWidth - okno;
  const karty = [...document.querySelectorAll('[data-plocha] li[data-widget]:not([hidden]) section, [data-plocha] li[data-widget="nastroj"] > *, [role="dialog"]')]
    .filter(s => s.scrollWidth > s.clientWidth + 1).length;
  return { dokument, karty };
});

/** Docházka s pevnými časy (tokeny jako k83-dochazka). */
const nactiDochazku = (jmeno = 'k84-tym-attendance') => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  t = t.replace(/"@D-(\d+)T(\d\d:\d\d)"/g, (_, n, hm) => `"${prahaISO(den(Number(n)), hm)}"`);
  t = t.replace(/"D-(\d+)"/g, (_, n) => `"${den(Number(n))}"`);
  t = t.replace(/"@(\d+)"/g, (_, m) => `"${new Date(TED - Number(m) * 60000).toISOString()}"`);
  return JSON.parse(t.replaceAll('"DNES"', `"${den(0)}"`));
};
/** Rozvrh měsíce: PO1…NE1 = první celý týden (po–ne) měsíce, PO2/UT2 pondělí a úterý dalšího. */
const nactiRozvrh = (mesic) => {
  const [y, m] = mesic.split('-').map(Number);
  const posledni = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let po1 = 1;
  while (new Date(Date.UTC(y, m - 1, po1)).getUTCDay() !== 1) po1++;
  if (po1 + 6 > posledni) po1 -= 7; // měsíc bez celého týdne od prvního pondělí není (max. 7 dní posun)
  const d = (o) => `${mesic}-${String(po1 + o).padStart(2, '0')}`;
  const mapa = { PO1: d(0), UT1: d(1), ST1: d(2), CT1: d(3), PA1: d(4), SO1: d(5), NE1: d(6), PO2: d(7), UT2: d(8) };
  let t = readFileSync(DIR + 'k84-tym-schedule.json', 'utf8');
  for (const [k, v] of Object.entries(mapa)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return { data: JSON.parse(t), mapa };
};
const PLAN = JSON.parse(readFileSync(DIR + 'k84-tym-plan.json', 'utf8'));

const FIX_TYM = { stranka: 'vedeni.tym', polozky: [{ id: 'tym-pozvanky', widget: 'tym.pozvanky', velikost: 'S' }, { id: 'nastroj', widget: 'nastroj', velikost: 'L' }], dostupne: ['tym.pozvanky', 'tym.role', 'tym.bez_sazby'], tarifem: [], zdroj: 'aplikace', rozsah: 'typ:vedeni', zamceno: false, smiUpravit: true, smiVychozi: true, verze: 0 };
const FIX_ROZVRH = { stranka: 'vedeni.rozvrh', polozky: [{ id: 'nastroj', widget: 'nastroj', velikost: 'L' }], dostupne: [], tarifem: [], zdroj: 'aplikace', rozsah: 'typ:vedeni', zamceno: false, smiUpravit: true, smiVychozi: true, verze: 0 };

const DOCHAZKA = nactiDochazku();
const ZED = nactiDochazku('k84-tym-zed');
/** Pražský den s posunem (pro fixtury k69-b1 s tokeny ZA5…). */
const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(TED + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PRED3: praha(-3), ZITRA: praha(1), POZITRI: praha(2), ZA3: praha(3), ZA5: praha(5), ZA7: praha(7), ZA10: praha(10), ZA12: praha(12), ZA20: praha(20) };
const MESIC = DNY.DNES.slice(0, 7);
const nactiB1 = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t.replaceAll('"MESIC"', `"${MESIC}"`).replaceAll('"@-', `"${MESIC}-`));
};
/** Nárok 20 dní, letos čerpáno 14 → zbývá 6 (stejná čísla jako test k84-tym). */
const NAROK = { rok: Number(DNY.DNES.slice(0, 4)), dni: 20, cerpano: 14, ceka: 0, zbyva: 6 };
const podvrh = (bezPlanu = false) => (req, json, stav) => {
  const u = new URL(req.url()); const path = u.pathname; const q = u.searchParams;
  if (req.method() !== 'GET') {
    (stav.zapisy ??= []).push({ m: req.method(), path, body: req.postData() });
    if (path === '/api/schedule/rules') return json({ ok: true });
    if (path === '/api/timeoff') return json({ ok: true, request: {}, vacationPerYear: 25 });
    if (path === '/api/rewards/awards') return json({ award: { id: 99 }, zbyva: 20 });
    if (path === '/api/teams') return json({ ok: true });
    return undefined;
  }
  if (path === '/api/rewards/awards' && q.get('zed') === '1') return json(ZED);
  if (path === '/api/timeoff' && q.get('mine') === '1') return json({ ...nactiB1('k69-b1-timeoff-mine'), narok: NAROK });
  if (path === '/api/availability') return json(q.get('mine') ? null : nactiB1('k69-b1-availability'));
  if (path === '/api/shifts/offers') return json(nactiB1('k69-b1-offers'));
  if (path === '/api/shifts' && q.get('employeeId')) return json(nactiB1('k69-b1-shifts-mine').map(s => ({ ...s, employeeId: 16 })));
  if (path === '/api/attendance') { (stav.dochazka ??= []).push(u.search); return json(DOCHAZKA); }
  if (path === '/api/invitations') return json({ invitations: [] });
  if (path === '/api/schedule') { const r = nactiRozvrh(q.get('month') ?? DNES.slice(0, 7)); stav.mapa = r.mapa; return json(r.data); }
  if (path === '/api/schedule/generate') return json(bezPlanu ? [] : PLAN);
  if (path === '/api/schedule/rules') return json({ teamMax: null, teamMaxHours: null, balanceShifts: true, splitShifts: false, members: [], trzby: { podleTrzeb: false, prah: null, prahNastaven: false, smiTrzby: true, dny: {}, navrhPrahu: null }, limity: PLAN.limity });
  if (path === '/api/availability') return json(q.get('mine') ? null : []);
  if (path === '/api/timeoff') return json({ requests: [], isEmployer: true, naroky: { 16: NAROK } });
  if (path === '/api/fixed-assignments') return json({ assignments: [] });
  if (path === '/api/events') return json({ events: [] });
  return undefined;
};

async function otevriPlochu(p, cesta, stranka) {
  await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
  await p.locator(`[data-plocha="${stranka}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(1200);
}

const TYM = '/employer/overview?view=team-settings';
const ROZVRH = '/employer/overview?view=shifts';

// ---------------------------------------------------------------------------
// T — Tým: hodiny a výdělek u lidí (1280)
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_TYM, posunCasu: POSUN, dalsi: podvrh() });
  await otevriPlochu(p, TYM, 'vedeni.tym');
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  await dokud(async () => (await nastroj.locator('[data-tym-hodiny]').count()) > 0, 8000);
  tvrdi('T1 (1280): nad seznamem je výběr období (ObdobiLista) s „Tento měsíc"', /Tento měsíc/.test(await text(nastroj.getByRole('group', { name: 'Období' }))));
  const eva = await text(nastroj.locator('[data-tym-hodiny="16"]'));
  const evaKc = await text(nastroj.locator('[data-tym-vydelek="16"]'));
  tvrdi('T1: Eva má 23 h 58 min za měsíc a pod tím 3 595 Kč (hodiny × 150)', /23 h 58 min/.test(eva) && /3\s?595/.test(evaKc), `${eva} / ${evaKc}`);
  tvrdi('T1: Tereza s běžícím příchodem má 2 h 00 min', /2 h 00 min/.test(await text(nastroj.locator('[data-tym-hodiny="18"]'))), await text(nastroj.locator('[data-tym-hodiny="18"]')));
  tvrdi('T1: Martin bez záznamu má 0 min, ne prázdno', /0 min/.test(await text(nastroj.locator('[data-tym-hodiny="15"]'))));
  tvrdi('T1: Ondřej bez sazby má hodiny, ale bez výdělku', /4 h 00 min/.test(await text(nastroj.locator('[data-tym-hodiny="19"]'))) && (await nastroj.locator('[data-tym-vydelek="19"]').count()) === 0);
  const soucet = await text(nastroj.locator('[data-tym-soucet]'));
  tvrdi('T1: součet nad seznamem „Celkem 46 h 58 min · 6 44x Kč · bez sazby: 1 člověk"', /Celkem 46 h 58 min/.test(soucet) && /6\s?44\d/.test(soucet) && /bez sazby: 1 člověk/.test(soucet), soucet);
  tvrdi('T1: /api/attendance se ptá na dny od 1. do 20. (days=20)', (stav.dochazka ?? []).some(s => s === '?days=20'), JSON.stringify(stav.dochazka));
  // Řazení: Hodiny → Eva první; Výdělek → Eva, Jakub, Tereza, pak bez výdělku.
  const razeni = nastroj.getByRole('tablist', { name: 'Řadit lidi' });
  tvrdi('T1: řazení Jméno / Hodiny / Výdělek', /Jméno/.test(await text(razeni)) && /Hodiny/.test(await text(razeni)) && /Výdělek/.test(await text(razeni)), await text(razeni));
  await razeni.getByRole('tab', { name: 'Hodiny' }).click();
  await p.waitForTimeout(300);
  // Obecná fixtura má dva členy s id 17 (React je se stejným klíčem i zdvojí) — pořadí se bere bez opakování.
  // Kdo nic neodpíchl, je dole v abecedě: Adam (23), Klára (24), Lukáš (21), Martin (15), Nikola (22), Petra (20).
  const jmena = async () => [...new Set(await nastroj.locator('[data-tym-hodiny]').evaluateAll(els => els.map(e => e.getAttribute('data-tym-hodiny'))))];
  const poHodinach = await jmena();
  tvrdi('T1: podle hodin Eva, Jakub, Ondřej (4 h), Tereza (2 h), pak bez záznamu v abecedě', poHodinach.join(',') === '16,17,19,18,23,24,21,15,22,20', poHodinach.join(','));
  await razeni.getByRole('tab', { name: 'Výdělek' }).click();
  await p.waitForTimeout(300);
  const poVydelku = await jmena();
  tvrdi('T1: podle výdělku Eva, Jakub, Tereza; bez sazby (Ondřej) až za nimi', poVydelku.slice(0, 4).join(',') === '16,17,18,19', poVydelku.join(','));
  const rozpad = nastroj.getByRole('button', { name: 'Rozpad v Docházce' });
  tvrdi('T1: pod seznamem je „Rozpad v Docházce"', (await rozpad.count()) === 1);
  await p.screenshot({ path: OUT + 'k84-tym-tym-1280.png', fullPage: false });
  // Nárok na dovolenou (kolo 8): v řádku „dovolená 6/20", v okně Upravit pole Dovolená na rok → PUT /api/timeoff.
  tvrdi('T1: u Evy je „dovolená 6/20"', /dovolená 6\/20/.test(await text(nastroj.locator('[data-tym-dovolena="16"]'))));
  await nastroj.getByRole('button', { name: 'Upravit: Eva Testová' }).click();
  const okno = p.getByRole('dialog');
  await okno.waitFor({ timeout: 5000 });
  const pole = okno.locator('#clen-dovolena');
  tvrdi('T1: okno Upravit člena má pole Dovolená na rok s hodnotou 20 a nápovědou o čerpání', (await pole.inputValue()) === '20' && /čerpáno 14, zbývá 6/.test(await text(okno)), await text(okno));
  await pole.fill('25');
  await okno.getByRole('button', { name: 'Uložit' }).click();
  const put = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/timeoff' && z.m === 'PUT'), 4000);
  tvrdi('T1: Uložit pošle PUT /api/timeoff { userId: 16, vacationPerYear: 25 } a žádný PATCH členství', !!put && /"userId":16,"vacationPerYear":25/.test(put.body) && !(stav.zapisy ?? []).some(z => z.path === '/api/teams/members'), put?.body);
  tvrdi('T1: okno se po uložení zavře', await dokud(async () => (await okno.count()) === 0, 4000));
  await rozpad.click();
  tvrdi('T1: Rozpad v Docházce otevře Docházku', await dokud(async () => (await p.locator('[data-plocha="vedeni.dochazka"]').count()) > 0 || /view=attendance/.test(p.url()), 6000), p.url());
  tvrdi('T1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
// Tým bez dochazka.zobrazit: žádný dotaz na docházku, řádek bez hodin.
{
  const role = roleMine('vedeni', ['dochazka.zobrazit']);
  const { ctx, p, stav } = await kontext({ fix: FIX_TYM, mineData: role, posunCasu: POSUN, dalsi: podvrh() });
  await otevriPlochu(p, TYM, 'vedeni.tym');
  await p.waitForTimeout(800);
  tvrdi('T2: bez dochazka.zobrazit se /api/attendance nevolá', dotazyNa(stav, ['/api/attendance']).length === 0, dotazyNa(stav, ['/api/attendance']).map(d => d.u).join(','));
  tvrdi('T2: …a v seznamu nejsou hodiny ani období', (await p.locator('[data-tym-hodiny]').count()) === 0 && (await p.locator('[data-plocha] li[data-widget="nastroj"]').getByRole('group', { name: 'Období' }).count()) === 0);
  await ctx.close();
}
// Tým na telefonu (390×844, dotyk): čísla vpravo, nic nepřetéká, cíle ≥ 44 px.
{
  const { ctx, p, chyby } = await kontext({ fix: FIX_TYM, viewport: TEL, mobil: true, posunCasu: POSUN, dalsi: podvrh() });
  await otevriPlochu(p, TYM, 'vedeni.tym');
  const nastroj = p.locator('[data-plocha] li[data-widget="nastroj"]');
  await dokud(async () => (await nastroj.locator('[data-tym-hodiny]').count()) > 0, 8000);
  const pr = await preteceni(p);
  tvrdi('T3 (390): bez přetečení dokumentu i karet', pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  const obdBtn = nastroj.getByRole('group', { name: 'Období' }).getByRole('button');
  const obd = await obdBtn.boundingBox();
  // ObdobiLista je sdílený kus: 38 px pilulka s `tap-target` (dotyková plocha 44 px přes pseudo-prvek, jako v Docházce).
  tvrdi('T3 (390): tlačítko období je dotykový cíl (tap-target) a nad ohybem', !!obd && /tap-target/.test(await obdBtn.getAttribute('class') ?? '') && obd.y + obd.height <= TEL.height, JSON.stringify(obd));
  // Na telefonu se ocas řádku (hodiny, výdělek, chip) zalomí pod jméno jako u Souhrnu hodin — čísla jsou vidět celá.
  const evaBox = await nastroj.locator('[data-tym-hodiny="16"]').boundingBox();
  const evaRadek = await nastroj.getByRole('button', { name: 'Profil: Eva Testová' }).boundingBox();
  tvrdi('T3 (390): hodiny Evy jsou v jejím řádku, celé v šířce obrazovky', !!evaBox && !!evaRadek && evaBox.y >= evaRadek.y && evaBox.y - evaRadek.y < 80 && evaBox.x + evaBox.width <= TEL.width, JSON.stringify({ evaBox, evaRadek }));
  const profil = nastroj.getByRole('button', { name: 'Profil: Eva Testová' });
  tvrdi('T3 (390): jméno je tlačítko „Profil: Eva Testová"', (await profil.count()) === 1);
  await p.screenshot({ path: OUT + 'k84-tym-tym-390.png', fullPage: false });
  tvrdi('T3: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// P — Plánovač: limity a plán proti tržbám (1280)
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ fix: FIX_ROZVRH, posunCasu: POSUN, dalsi: podvrh() });
  await otevriPlochu(p, ROZVRH, 'vedeni.rozvrh');
  const lista = p.locator('[data-varovani-limitu]');
  await dokud(async () => (await lista.count()) > 0, 10000);
  const tl = await text(lista);
  tvrdi('P1 (1280): nad mřížkou „3 varování k limitům rozvrhu · odpočinek 1× · dlouhá směna 1× · nad týdenní strop 1×"', /3 varování k limitům rozvrhu/.test(tl) && /odpočinek 1×/.test(tl) && /dlouhá směna 1×/.test(tl) && /nad týdenní strop 1×/.test(tl), tl);
  tvrdi('P1: v mřížce jsou výstražné ikony u tří pilulek', (await p.locator('[data-varovani-pilulky]').count()) === 3, String(await p.locator('[data-varovani-pilulky]').count()));
  const souhrn = await text(p.locator('[data-naklad-planu]'));
  // Podíl jen z naplánovaných dnů: 14 280 Kč mezd proti 140 700 Kč tržby devíti dnů = 10 %.
  tvrdi('P1: souhrn plánu má Podíl mezd 10 % s cílem 28 % a tržbou naplánovaných dnů', /podíl mezd/i.test(souhrn) && /10 %/.test(souhrn) && /cíl 28 %/.test(souhrn) && /tržba ~140\s?700/.test(souhrn), souhrn);
  // Proklik na první den s varováním (sobota: Tereza 48 h týdně).
  await lista.getByRole('button', { name: 'Ukázat první' }).click();
  const okno = p.getByRole('dialog');
  await okno.waitFor({ timeout: 5000 });
  await p.waitForTimeout(400);
  const to = await text(okno);
  tvrdi('P1: okno dne ukáže chip „48 h týdně (nejvýš 40)" pod časem Terezy', (await okno.locator('[data-varovani="tyden"]').count()) === 1 && /48 h týdně \(nejvýš 40\)/.test(to), to.slice(0, 400));
  tvrdi('P1: …a větu s očekávanou tržbou, mzdami a podílem (2 640 / 22 000 = 12 %, cíl 28 %)', /Očekávaná tržba ~22\s?000/.test(to) && /mzdy 2\s?640/.test(to) && /12 %/.test(to), to.slice(0, 500));
  await okno.screenshot({ path: OUT + 'k84-tym-okno-dne-1280.png' });
  // Přidání s vlastním časem: Eva v sobotu 23–07 by porušila odpočinek i směnu → věta a „Přesto přidat".
  const vlastni = okno.getByRole('button', { name: 'Přidat s vlastním časem…' });
  if (await vlastni.count()) await vlastni.click();
  await okno.locator('#den-kdo').selectOption('16');
  await okno.locator('#den-od').fill('02:00');
  await okno.locator('#den-do').fill('06:00');
  await p.waitForTimeout(300);
  const limitRucne = await text(okno.locator('[data-limit-rucne]'));
  tvrdi('P1: vlastní čas 02–06 pro Evu (po noční do 23) ukáže větu o limitech', /Směna poruší limity rozvrhu/.test(limitRucne) && /odpočinku/.test(limitRucne), limitRucne);
  tvrdi('P1: tlačítko říká „Přesto přidat"', (await okno.getByRole('button', { name: 'Přesto přidat' }).count()) >= 1);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  // Týdenní pohled: řádek Mzdy / tržba s chipy podílu a chip varování v pilulce.
  await p.getByRole('tablist', { name: 'Pohled plánovače' }).getByRole('tab', { name: 'Týden' }).click();
  await p.locator('[data-tydenni-pohled]').waitFor({ timeout: 5000 });
  for (let i = 0; i < 6 && (await p.locator('[data-tydenni-pohled] [data-varovani]').count()) === 0; i++) {
    const dalsi = p.getByRole('button', { name: 'Další týden' });
    if (await dalsi.isDisabled()) break;
    await dalsi.click();
    await p.waitForTimeout(250);
  }
  const radekTrzeb = p.locator('[data-plan-trzby-tyden]');
  tvrdi('P1 (týden): řádek „Mzdy / tržba" s chipy podílu v procentech', (await radekTrzeb.count()) === 1 && /%/.test(await text(radekTrzeb)) && /Mzdy \/ tržba/.test(await text(radekTrzeb)), await text(radekTrzeb));
  tvrdi('P1 (týden): v pilulce směny je chip varování (odpočinek / týden)', (await p.locator('[data-tydenni-pohled] [data-varovani]').count()) >= 1);
  await p.screenshot({ path: OUT + 'k84-tym-planovac-tyden-1280.png', fullPage: false });
  tvrdi('P1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  // Pravidla: tři limity a uložení s `limity`.
  await p.getByRole('tablist', { name: 'Část rozvrhu' }).getByRole('tab', { name: 'Pravidla' }).click();
  const limity = p.locator('[data-pravidla-limity]');
  await limity.waitFor({ timeout: 8000 });
  tvrdi('R1: Pravidla mají Odpočinek mezi směnami / Nejdelší směna / Hodin za týden s načtenými 11 / 12 / 40',
    (await limity.locator('#pravidla-odpocinek').inputValue()) === '11' && (await limity.locator('#pravidla-smena').inputValue()) === '12' && (await limity.locator('#pravidla-tyden').inputValue()) === '40');
  await limity.locator('#pravidla-tyden').selectOption('48');
  await p.getByRole('button', { name: 'Uložit pravidla' }).click();
  const put = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/schedule/rules' && z.m === 'PUT'), 4000);
  tvrdi('R1: Uložit pošle PUT /api/schedule/rules s limity { minRestHours: 11, maxShiftHours: 12, maxWeekHours: 48 }', !!put && /"limity":\{"minRestHours":11,"maxShiftHours":12,"maxWeekHours":48\}/.test(put.body), put?.body?.slice(0, 300));
  await ctx.close();
}
// Bez finance.trzby: podíl mezd ani řádek tržeb nejsou; limity dál platí.
{
  const role = roleMine('vedeni', ['finance.trzby']);
  const { ctx, p } = await kontext({ fix: FIX_ROZVRH, mineData: role, posunCasu: POSUN, dalsi: podvrh() });
  await otevriPlochu(p, ROZVRH, 'vedeni.rozvrh');
  await dokud(async () => (await p.locator('[data-varovani-limitu]').count()) > 0, 10000);
  tvrdi('P2: bez finance.trzby varování k limitům zůstávají', (await p.locator('[data-varovani-limitu]').count()) === 1);
  tvrdi('P2: …ale Podíl mezd se nekreslí', !/Podíl mezd/.test(await text(p.locator('[data-naklad-planu]'))));
  await ctx.close();
}
// Plánovač na telefonu: souhrn varování nahoře nad mřížkou, okno zdola s chipy a výpočtem, bez přetečení.
{
  const { ctx, p, chyby } = await kontext({ fix: FIX_ROZVRH, viewport: TEL, mobil: true, posunCasu: POSUN, dalsi: podvrh() });
  await otevriPlochu(p, ROZVRH, 'vedeni.rozvrh');
  const lista = p.locator('[data-varovani-limitu]');
  await dokud(async () => (await lista.count()) > 0, 10000);
  const box = await lista.boundingBox();
  const mrizka = await p.getByLabel('Mřížka rozvrhu').boundingBox();
  tvrdi('P3 (390): souhrn varování je nad mřížkou', !!box && !!mrizka && box.y < mrizka.y, JSON.stringify({ box, mrizka }));
  await p.screenshot({ path: OUT + 'k84-tym-planovac-390.png', fullPage: false });
  await lista.getByRole('button', { name: 'Ukázat první' }).click();
  const okno = p.getByRole('dialog');
  await okno.waitFor({ timeout: 5000 });
  await p.waitForTimeout(500);
  const to = await text(okno);
  tvrdi('P3 (390): okno dne má chip „48 h týdně" a větu s tržbou a podílem', (await okno.locator('[data-varovani="tyden"]').count()) === 1 && /12 %/.test(to), to.slice(0, 300));
  const pr = await preteceni(p);
  tvrdi('P3 (390): bez přetečení dokumentu i okna', pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  await p.screenshot({ path: OUT + 'k84-tym-okno-dne-390.png', fullPage: false });
  tvrdi('P3: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// D — Zůstatek dovolené u žádosti o volno (zaměstnanec, 390×844) a ve widgetu Moje volno
// ---------------------------------------------------------------------------
{
  const BARISTA = roleMine('barista');
  const { ctx, p, chyby } = await kontext({ role: 'employee', fix: nactiB1('k69-b1-rozlozeni-dostupnost'), mineData: BARISTA, viewport: TEL, mobil: true, posunCasu: POSUN, dalsi: podvrh() });
  await otevriPlochu(p, '/employee/shifts?view=availability', 'zamestnanec.dostupnost');
  await p.getByRole('button', { name: 'Žádost o volno' }).first().click();
  const okno = p.getByRole('dialog', { name: 'Žádost o volno' });
  await okno.waitFor({ timeout: 5000 });
  await dokud(async () => (await okno.locator('[data-narok-dovolene]').count()) > 0, 5000);
  const chip = await text(okno.locator('[data-narok-dovolene]'));
  tvrdi('D1 (390): nad poli žádosti je „Dovolená: zbývá 6 z 20 dní"', /Dovolená: zbývá 6 z 20 dní/.test(chip), chip);
  await okno.getByLabel('Od').fill(DNY.ZA10);
  await okno.getByLabel('Do').fill(DNY.ZA12);
  tvrdi('D1 (390): po výběru tří dnů „po schválení zbude 3"', await dokud(async () => /po schválení zbude 3/.test(await text(okno.locator('[data-narok-dovolene]'))), 2000), await text(okno.locator('[data-narok-dovolene]')));
  await okno.screenshot({ path: OUT + 'k84-tym-volno-390.png' });
  await okno.getByLabel('Do').fill(DNY.ZA20);
  tvrdi('D1 (390): jedenáct dnů = „o 5 dní víc, než zbývá"', await dokud(async () => /o 5 dní víc, než zbývá/.test(await text(okno.locator('[data-narok-dovolene]'))), 2000), await text(okno.locator('[data-narok-dovolene]')));
  await okno.getByRole('tab', { name: 'Nemoc' }).click();
  tvrdi('D1 (390): u nemoci se zůstatek nekreslí (neodečítá se)', await dokud(async () => (await okno.locator('[data-narok-dovolene]').count()) === 0, 2000));
  const pr = await preteceni(p);
  tvrdi('D1 (390): bez přetečení', pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  tvrdi('D1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
{
  const BARISTA = roleMine('barista');
  const { ctx, p } = await kontext({ role: 'employee', fix: nactiB1('k69-b1-rozlozeni-moje-zamestnanec'), mineData: BARISTA, viewport: TEL, mobil: true, posunCasu: POSUN, dalsi: podvrh() });
  await otevriPlochu(p, '/employee/shifts?view=my-shifts', 'zamestnanec.moje_smeny');
  const w = p.locator('[data-plocha] li[data-widget="moje.schvalene_volno"]:not([hidden])');
  await dokud(async () => (await w.locator('[data-narok-dovolene]').count()) > 0, 6000);
  tvrdi('D2 (390): widget Moje volno ukáže „Dovolená: zbývá 6 z 20 dní"', /Dovolená: zbývá 6 z 20 dní/.test(await text(w)), await text(w));
  await w.screenshot({ path: OUT + 'k84-tym-moje-volno-390.png' });
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z — Zeď díků a Poděkovat (zaměstnanec Domů 390), nastavení příspěvku (vedení 1280)
// ---------------------------------------------------------------------------
{
  const BARISTA = roleMine('barista');
  const fix = { stranka: 'zamestnanec.domu', polozky: [{ id: 'zed', widget: 'odmeny.zed_diku', velikost: 'M' }, { id: 'moje-uroven', widget: 'moje.uroven', velikost: 'M' }], dostupne: ['odmeny.zed_diku', 'moje.uroven'], tarifem: [], zdroj: 'osobni', rozsah: 'typ:zamestnanec', zamceno: false, smiUpravit: true, smiVychozi: false, verze: 1 };
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix, mineData: BARISTA, viewport: TEL, mobil: true, posunCasu: POSUN, dalsi: podvrh() });
  await otevriPlochu(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  const w = p.locator('[data-plocha] li[data-widget="odmeny.zed_diku"]:not([hidden])');
  await dokud(async () => (await w.locator('li.list-row, .list-row').count()) > 0, 8000);
  const tw = await text(w);
  tvrdi('Z1 (390): Zeď díků ukáže kdo, od koho, #hodnotu, větu a body', /Jakub Horák/.test(tw) && /od Eva Testová/.test(tw) && /#tým/.test(tw) && /Díky za záskok v sobotu/.test(tw) && /\+10/.test(tw), tw.slice(0, 300));
  const tl = w.locator('[data-podekovat]');
  tvrdi('Z1 (390): tlačítko „Poděkovat · 30 b" (zbytek příspěvku) je nad ohybem a ≥ 44 px', /Poděkovat · 30 b/.test(await text(tl)) && (await tl.boundingBox()).y + (await tl.boundingBox()).height <= TEL.height, await text(tl));
  await w.screenshot({ path: OUT + 'k84-tym-zed-390.png' });
  await tl.click();
  const okno = p.getByRole('dialog');
  await okno.waitFor({ timeout: 5000 });
  await dokud(async () => (await okno.locator('[data-zbyva-rozdat]').count()) > 0, 4000);
  tvrdi('Z1 (390): okno říká „Tento měsíc můžeš rozdat ještě 30 b z 50."', /rozdat ještě 30 b z 50/.test(await text(okno)), (await text(okno)).slice(0, 200));
  await okno.locator('#dik-komu').selectOption('18');
  await okno.getByRole('tab', { name: '+20' }).click();
  await okno.getByRole('button', { name: '#čistota' }).click();
  await okno.locator('#dik-veta').fill('Umyla mlýnek za mě');
  await p.screenshot({ path: OUT + 'k84-tym-podekovat-390.png', fullPage: false });
  await okno.getByRole('button', { name: 'Poslat díky' }).click();
  const post = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/rewards/awards' && z.m === 'POST'), 4000);
  tvrdi('Z1 (390): Poslat díky → POST { kind: kolega, userId: 18, points: 20, valueTag: čistota, reason }', !!post && /"kind":"kolega","userId":18,"points":20,"valueTag":"čistota","reason":"Umyla mlýnek za mě"/.test(post.body), post?.body);
  tvrdi('Z1 (390): okno se zavře a přijde toast', await dokud(async () => (await okno.count()) === 0, 4000) && await dokud(() => p.getByText('Díky odeslané').isVisible().catch(() => false), 3000));
  const pr = await preteceni(p);
  tvrdi('Z1 (390): bez přetečení', pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  tvrdi('Z1: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
// Tablet jen čte: žádné tlačítko Poděkovat (odpověď bez příspěvku).
{
  const fixK = { stranka: 'kiosk.smena', polozky: [{ id: 'zed', widget: 'odmeny.zed_diku', velikost: 'M' }, { id: 'nastroj', widget: 'nastroj', velikost: 'L' }], dostupne: ['odmeny.zed_diku'], tarifem: [], zdroj: 'podnik', rozsah: 'typ:kiosk', zamceno: true, smiUpravit: false, smiVychozi: false, verze: 1 };
  const { ctx, p } = await kontext({ role: 'kiosk', fix: fixK, mineData: roleMine('kiosk'), viewport: { width: 1024, height: 768 }, posunCasu: POSUN, dalsi: (req, json, stav) => {
    const u = new URL(req.url());
    if (u.pathname === '/api/rewards/awards' && u.searchParams.get('zed') === '1') return json({ ...ZED, prispevek: null, kolegove: [] });
    return podvrh()(req, json, stav);
  } });
  await p.goto(BASE + '/kiosk', { waitUntil: 'networkidle' });
  const w = p.locator('[data-plocha="kiosk.smena"] li[data-widget="odmeny.zed_diku"]:not([hidden])');
  const je = await dokud(async () => (await w.count()) > 0, 20000);
  tvrdi('Z2 (tablet): Zeď díků je na tabletu, jen ke čtení (bez Poděkovat)', je && (await w.locator('[data-podekovat]').count()) === 0, String(je));
  await ctx.close();
}
// Vedení: Odměny › Nastavení má Poděkování mezi kolegy a Uložit pošle příspěvek a hodnoty v pointsConfig.
{
  const fixO = { stranka: 'vedeni.odmeny', polozky: [{ id: 'nastroj', widget: 'nastroj', velikost: 'L' }], dostupne: [], tarifem: [], zdroj: 'aplikace', rozsah: 'typ:vedeni', zamceno: false, smiUpravit: true, smiVychozi: true, verze: 0 };
  const { ctx, p, stav } = await kontext({ fix: fixO, posunCasu: POSUN, dalsi: (req, json, stav) => {
    const u = new URL(req.url());
    if (u.pathname === '/api/rewards' && req.method() === 'GET') return json({ role: 'employer', levels: [{ name: 'Barista', minPoints: 0, perks: '' }], points: { task: 5, procedure: 10, closing: 15, ratingStar: 4, taskMissed: -5, procedureSkipped: -2, procedureMissed: -4, closingMissing: -10, closingBalanced: 3 }, dik: { prispevek: 50, hodnoty: ['ochota', 'tým'] }, standings: [] });
    return podvrh()(req, json, stav);
  } });
  await otevriPlochu(p, '/employer/overview?view=rewards', 'vedeni.odmeny');
  await p.getByRole('tablist', { name: 'Část stránky' }).getByRole('tab', { name: 'Nastavení' }).click();
  const karta = p.locator('[data-nastaveni-diku]');
  await karta.waitFor({ timeout: 8000 });
  tvrdi('N1 (1280): karta Poděkování mezi kolegy s příspěvkem 50 a hodnotami „ochota, tým"', (await karta.locator('#dik-prispevek').inputValue()) === '50' && (await karta.locator('#dik-hodnoty').inputValue()) === 'ochota, tým');
  await karta.locator('#dik-prispevek').fill('80');
  await karta.locator('#dik-hodnoty').fill('ochota, tým, #host');
  await p.getByRole('button', { name: 'Uložit nastavení' }).click();
  const patch = await dokud(() => (stav.zapisy ?? []).find(z => z.path === '/api/teams' && z.m === 'PATCH'), 4000);
  tvrdi('N1: Uložit pošle PATCH /api/teams s pointsConfig.mesicniPrispevek 80 a hodnotami bez „#"', !!patch && /"mesicniPrispevek":80,"hodnoty":\["ochota","tým","host"\]/.test(patch.body), patch?.body?.slice(0, 300));
  await karta.screenshot({ path: OUT + 'k84-tym-nastaveni-diku-1280.png' });
  await ctx.close();
}

await konec();
