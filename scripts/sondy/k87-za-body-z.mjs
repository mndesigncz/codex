// Kolo 11 — balík Z: „Úkoly za body" u zaměstnance a na tabletu.
//
// Fixtura k87-za-body-z-ukoly (seřazená jako seradUkoly): 5 Vyleštit kávovar (mám vzaté, každé 3 dny, 10 b),
// 3 Zaskočit za kolegu (kdokoli, bez kapacity, 50 b + 300 Kč), 1 Vytřít sklad (každý den, kapacita 1, fotka
// povinná, 20 b), 2 Umýt výlohu (jednou týdně, 1 z 2 — bere Eva, uzná se samo, 15 b), 4 Přerovnat regál
// (Po, St, Pá, obsazeno — bere Jakub, 30 b). K vzetí jsou 3 (3, 1, 2) za až 85 b.
//
// Z1 Domů 390 (dotyk) + 1280: widget M (4 řádky + „…a 1 další", chipy, akce podle stavu, ≥ 44 px, bez limetky),
//    malá karta („3 úkoly za body · až +85 b", první volný Zaskočit s „Hotovo"), odznak 3 u Úkolů (dok / boční pás),
//    jeden GET /api/navic/ukoly pro oba widgety i odznak; „Beru si" → POST { offerId 1, akce vzit } → řádek
//    „Mám vzaté" s Hotovo/Vrátit; „Hotovo" u úkolu s povinnou fotkou → okno „Zapsat navíc" s názvem, „Fotka
//    (povinná)", bez fotky věta a žádný POST, s fotkou (390) POST /api/navic { offerId 1, photoUrl }; „Vrátit" →
//    POST vratit; 409 obsazeno → věta serveru v Toastu. Z1b tmavý 390.
// Z2 Úkoly 390 + 1280 s arg za-body (odkaz z oznámení): sekce „Za body navíc (3)" nahoře, zvýrazněná, v okně,
//    5 řádků, „Zapsat navíc" otevře prázdné okno, sbalení (aria-expanded), odznak na Úkolech se neukazuje.
//    Z2b bez úkolů: tichý řádek „Dnes tu nic za body není…" a „Zapsat navíc".
// Z3 Widget Navíc (Domů 390): odkaz „Úkoly za body" vede do Úkolů na sekci; v okně Zapsat navíc je
//    „Přerovnat regál · 30 b · Obsazeno" vypnutý.
// Z4 Tablet 1024×1366: bez vybraného člověka widget „Kdo jsi?" → výběr → úkoly ?actingAs=1, „Beru si" s actingAs;
//    po odchodu souhrn s úkoly za body jen s „Hotovo" → okno „Za: Martin Nemeškal" → POST s actingAs a offerId.
// Z5 Polština 320: Domů s widgetem a Úkoly se sekcí bez přetečení, okno.
//   SONDY_ZAKLAD=http://localhost:3445 node scripts/sondy/k87-za-body-z.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { kontext, konec, tvrdi, otevri, dokud, jdi, mine, sysRole, DIR, OUT, BASE } from './k68-spolecne.mjs';
import { nastavJazyk } from './preteceni-jadro.mjs';

const TEL = { width: 390, height: 844 };
const PC = { width: 1280, height: 900 };
const TABLET = { width: 1024, height: 1366 };
const SNIMKY = process.env.K87_SNIMKY ? process.env.K87_SNIMKY.replace(/\/?$/, '/') : OUT;
mkdirSync(SNIMKY, { recursive: true });

const sRole = (klic, navic) => { const r = sysRole(klic); return mine([...r.opravneni, ...navic], { klic, roleId: null, nazev: r.nazev, typ: r.typ, jeVlastnik: false }); };
const BARISTA = sRole('barista', ['navic.zapsat']);
const KIOSK = sRole('kiosk', ['navic.zapsat']);

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PRED6: praha(-6) };
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat|Failed to load resource/i.test(c));
const preteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const widgetLi = (p, id) => p.locator(`[data-plocha] li[data-instance="${id}"]`);
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : '').replace(/[\u00a0\u202f]/g, ' ');
const telo = (req) => { try { return req.postData() ? JSON.parse(req.postData()) : null; } catch { return null; } };
const poAnimaci = (loc) => loc.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished.catch(() => {}))));
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAAABJRU5ErkJggg==', 'base64');
const radek = (w, id) => w.locator(`[data-ukol-za-body="${id}"]`);
const vysky = (loc) => loc.evaluateAll(els => els.filter(e => e.offsetParent !== null).map(e => Math.round(e.getBoundingClientRect().height * 100) / 100));

/**
 * Stavový podvrh úkolů za body: GET /api/navic/ukoly vrací `stav.ukoly` (čtení do `stav.cteniUkolu`), POST zabere
 * nebo vrátí (zápis do `stav.zapisy`); `stav.ukoly409` → 409 obsazeno. GET /api/navic: nabídka = tytéž položky.
 * `stav.prazdne` → žádné úkoly.
 */
const podvrhZaBody = (ja) => (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  stav.ukoly ??= nacti('k87-za-body-z-ukoly').ukoly;
  if (path === '/api/navic/ukoly') {
    if (m === 'GET') { (stav.cteniUkolu ??= []).push(path + url.search); return json({ ukoly: stav.prazdne ? [] : stav.ukoly, den: DNY.DNES, smi: { zapsat: true, nabidka: false, tym: false } }); }
    const t = telo(req);
    (stav.zapisy ??= []).push({ m, path, telo: t });
    if (stav.ukoly409) return json({ error: 'Úkol už mají vzatý: Eva Svobodová.' }, 409);
    const u = stav.ukoly.find(x => x.nabidka.id === t?.offerId);
    if (!u) return json({ error: 'Úkol už v nabídce není.' }, 404);
    const kdo = t?.actingAs ?? ja;
    if (t?.akce === 'vzit') { u.stav = 'vzato'; u.obsazeno += 1; u.kdo = [...u.kdo, { userId: kdo, name: 'Já', stav: 'vzato' }]; }
    else { u.stav = 'volne'; u.obsazeno = Math.max(0, u.obsazeno - 1); u.kdo = u.kdo.filter(k => k.userId !== kdo); }
    return json({ ok: true, ukol: u });
  }
  if (path.startsWith('/api/navic')) {
    if (m === 'GET') { (stav.cteni ??= []).push(path + url.search); return json({ items: [], nabidka: stav.ukoly.map(u => u.nabidka), smi: { uznat: false, nabidka: false, tym: false, zapsat: true } }); }
    const t = telo(req);
    (stav.zapisy ??= []).push({ m, path, telo: t });
    return json({ ok: true, item: { id: 99, userId: t?.actingAs ?? ja, userName: '', userAvatar: null, reportedBy: null, reportedByName: null, day: t?.day, shiftId: null, closingId: null, taskId: null, offerId: t?.offerId ?? null, offerTitle: null, text: t?.text, photoUrl: t?.photoUrl ?? null, pointsProposed: null, status: 'ceka', points: null, bonusCzk: null, decidedBy: null, decidedByName: null, decidedAt: null, decisionNote: null, createdAt: new Date().toISOString() } }, 201);
  }
  if (path === '/api/upload' && m === 'POST') { (stav.zapisy ??= []).push({ m, path }); return json({ url: '/api/upload/k87-foto-1' }); }
  if (path === '/api/tasks' && m === 'GET') return json(nacti('k69-b6a-tasks'));
  if (path === '/api/teams' && m === 'GET') return json(nacti('k69-b6a-teams'));
  if (path === '/api/notes' && m === 'GET') return json([]);
  if (path === '/api/notes/pocty') return json({ pocty: {} });
  return undefined;
};
const postyUkolu = (stav) => (stav.zapisy ?? []).filter(z => z.m === 'POST' && z.path === '/api/navic/ukoly');
const postyNavic = (stav) => (stav.zapisy ?? []).filter(z => z.m === 'POST' && z.path === '/api/navic');

const FIX_DOMU = nacti('k87-za-body-z-rozlozeni-domu');
const FIX_UKOLY = nacti('k69-b6a-rozlozeni-ukoly-zam');
const FIX_SMENA = nacti('k87-za-body-z-rozlozeni-smena');

// ---------------------------------------------------------------------------
// Z1 — Domů 390 (dotyk) + 1280: widget, malá karta, odznak, Beru si / Hotovo / Vrátit / 409
// ---------------------------------------------------------------------------
for (const [nazev, volby] of [['390', { viewport: TEL, mobil: true }], ['1280', { viewport: PC, mobil: false }]]) {
  const { ctx, p, stav, chyby } = await kontext({ ...volby, role: 'employee', fix: FIX_DOMU, mineData: BARISTA, dalsi: podvrhZaBody(16) });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  const w = widgetLi(p, 'ukoly-za-body');
  const male = widgetLi(p, 'za-body-male');
  await dokud(() => w.locator('[data-ukoly-za-body] > li').count().then(n => n > 0), 6000);
  const tw = await text(w);
  tvrdi(`Z1 (${nazev}): widget „Úkoly za body" (M) — 3 řádky v pořadí Vyleštit, Zaskočit, Vytřít a „…a 2 další", bez „Zobrazit vše"`,
    /^Úkoly za body/.test(tw) && JSON.stringify(await w.locator('[data-ukoly-za-body] > li').evaluateAll(els => els.map(e => e.getAttribute('data-ukol-za-body')))) === '["5","3","1"]' && /…a 2 další/.test(tw) && !/Zobrazit vše/.test(tw), tw.replace(/\n/g, ' | ').slice(0, 300));
  tvrdi(`Z1 (${nazev}): chip počtu k vzetí v hlavičce (3)`, /^Úkoly za body\s*\n?\s*3/.test(tw));
  const r5 = radek(w, 5); const r3 = radek(w, 3); const r1 = radek(w, 1);
  tvrdi(`Z1 (${nazev}): vzatý — „Mám vzaté", „+10 b", „Každé 3 dny", akce Hotovo a Vrátit`, /Mám vzaté/.test(await text(r5)) && /\+10 b/.test(await text(r5)) && /Každé 3 dny/.test(await text(r5))
    && await r5.getByRole('button', { name: 'Hotovo: Vyleštit kávovar' }).count() === 1 && await r5.getByRole('button', { name: 'Vrátit: Vyleštit kávovar' }).count() === 1, await text(r5));
  tvrdi(`Z1 (${nazev}): bez kapacity — „+50 b · 300 Kč" (měna podniku), „Kdykoli", rovnou Hotovo (žádné Beru si)`, /\+50 b · 300 Kč/.test(await text(r3)) && /Kdykoli/.test(await text(r3))
    && await r3.locator('[data-akce]').evaluateAll(els => els.map(e => e.getAttribute('data-akce')).join()) === 'hotovo', await text(r3));
  tvrdi(`Z1 (${nazev}): s kapacitou — „Každý den · 1 z 1 volné", chip „s fotkou", Beru si; střední karta bez popisu`, /Každý den · 1 z 1 volné/.test(await text(r1)) && /s fotkou/.test(await text(r1)) && !/Včetně rohů za regály/.test(await text(r1))
    && await r1.locator('[data-akce]').evaluateAll(els => els.map(e => e.getAttribute('data-akce')).join()) === 'vzit', await text(r1));
  tvrdi(`Z1 (${nazev}): stav je Chip (muted / info), žádná ruční pilulka`, await r5.locator('.chip.chip-info').count() === 1 && await r1.locator('.chip.chip-muted').count() >= 1);
  await poAnimaci(w);
  const vs = await vysky(w.locator('[data-akce]'));
  tvrdi(`Z1 (${nazev}): tlačítka akcí ≥ 44 px`, vs.length >= 3 && vs.every(v => v >= 44), JSON.stringify(vs));
  tvrdi(`Z1 (${nazev}): bez limetky ve widgetech (Hotovo je tmavé, Beru si tónované)`, await p.locator('[data-plocha] li[data-widget="ukoly.za_body"]').locator('button.on-accent, .btn-accent').count() === 0);
  const tm = await text(male);
  tvrdi(`Z1 (${nazev}): malá karta — „3 úkoly za body · až +85 b", první volný „Zaskočit… · +50 b · 300 Kč" a jeho Hotovo`, /3 úkoly za body · až \+85 b/.test(tm) && /Zaskočit za kolegu na směnu · \+50 b · 300 Kč/.test(tm)
    && await male.getByRole('button', { name: 'Hotovo: Zaskočit za kolegu na směnu' }).count() === 1, tm.replace(/\n/g, ' | '));
  tvrdi(`Z1 (${nazev}): jeden GET /api/navic/ukoly pro oba widgety i odznak v navigaci (sdílená mezipaměť)`, (stav.cteniUkolu ?? []).filter(u => u === '/api/navic/ukoly').length === 1, JSON.stringify(stav.cteniUkolu));
  const odznak = p.getByText('3 úkoly za body k vzetí', { exact: true });
  tvrdi(`Z1 (${nazev}): odznak „3" u Úkolů v navigaci (${nazev === '390' ? 'dok' : 'boční pás'}) s větou pro odečítač`, await odznak.count() >= 1
    && await p.locator(nazev === '390' ? 'nav' : 'aside').filter({ has: odznak }).count() >= 1, String(await odznak.count()));
  tvrdi(`Z1 (${nazev}): stránka nepřetéká`, await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
  await p.screenshot({ path: SNIMKY + `k87-za-body-domu-${nazev}.png`, fullPage: true });

  // Beru si → POST vzit → řádek se přepne na „Mám vzaté" s Hotovo / Vrátit.
  await r1.getByRole('button', { name: 'Beru si: Vytřít sklad a chodbu' }).click();
  const vzit = await dokud(() => postyUkolu(stav)[0], 4000);
  tvrdi(`Z1 (${nazev}): Beru si → POST /api/navic/ukoly { offerId: 1, akce: vzit } bez actingAs`, vzit?.telo?.offerId === 1 && vzit?.telo?.akce === 'vzit' && !('actingAs' in (vzit?.telo ?? {})), JSON.stringify(vzit?.telo));
  tvrdi(`Z1 (${nazev}): Toast „Máš to vzaté…" a řádek po obnově „Mám vzaté" s Hotovo a Vrátit`, await dokud(() => p.getByRole('status').filter({ hasText: 'Máš to vzaté' }).isVisible().catch(() => false), 3000)
    && await dokud(async () => /Mám vzaté/.test(await text(r1)) && await r1.getByRole('button', { name: 'Vrátit: Vytřít sklad a chodbu' }).count() === 1, 4000), await text(r1));
  // Hotovo u úkolu s povinnou fotkou: okno s názvem, bez fotky věta a žádný POST.
  await r1.getByRole('button', { name: 'Hotovo: Vytřít sklad a chodbu' }).click();
  const d = p.getByRole('dialog', { name: 'Zapsat navíc' });
  tvrdi(`Z1 (${nazev}): Hotovo otevře okno „Zapsat navíc" s názvem úkolu a „Fotka (povinná)"`, await dokud(() => d.isVisible().catch(() => false), 4000)
    && (await d.getByLabel('Co bylo navíc?').inputValue()) === 'Vytřít sklad a chodbu' && /Fotka \(povinná\)/.test(await text(d)) && /Bez fotky to zapsat nejde\./.test(await text(d)), await text(d));
  await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
  tvrdi(`Z1 (${nazev}): bez fotky → věta „Tenhle úkol chce fotku…" (role=alert) a žádný POST /api/navic`, await dokud(() => d.locator('[data-chyba-fotky]').isVisible().catch(() => false), 2000)
    && /Tenhle úkol chce fotku/.test(await text(d.locator('[data-chyba-fotky]'))) && postyNavic(stav).length === 0);
  if (nazev === '390') {
    await p.screenshot({ path: SNIMKY + 'k87-za-body-hotovo-fotka-390.png' });
    const [vyber] = await Promise.all([p.waitForEvent('filechooser'), d.getByRole('button', { name: 'Vyfotit / nahrát' }).click()]);
    await vyber.setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    await dokud(() => d.getByRole('button', { name: 'Odebrat fotku' }).isVisible().catch(() => false), 4000);
    tvrdi('Z1 (390): po nahrání fotky věta zmizí', await dokud(async () => (await d.locator('[data-chyba-fotky]').count()) === 0, 2000), `${await d.locator('[data-chyba-fotky]').count()} × ${await text(d.locator('[data-chyba-fotky]'))} · ${(await text(d)).replace(/\n/g, ' | ')}`);
    tvrdi('Z1 (390): okno nepřetéká', await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1) && await preteceni(p) <= 1);
    await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
    const post = await dokud(() => postyNavic(stav)[0], 4000);
    tvrdi('Z1 (390): s fotkou → POST /api/navic { offerId: 1, text: název, day: dnes, photoUrl }', post?.telo?.offerId === 1 && post?.telo?.text === 'Vytřít sklad a chodbu' && post?.telo?.day === DNY.DNES && post?.telo?.photoUrl === '/api/upload/k87-foto-1', JSON.stringify(post?.telo));
    tvrdi('Z1 (390): Toast „Zapsáno — čeká na uznání." a /api/navic/ukoly se načte znovu', await dokud(() => p.getByRole('status').filter({ hasText: 'Zapsáno — čeká na uznání.' }).isVisible().catch(() => false), 3000)
      && await dokud(() => (stav.cteniUkolu ?? []).length >= 3, 4000), JSON.stringify(stav.cteniUkolu));
  } else {
    await d.getByRole('button', { name: 'Zrušit' }).click();
    await dokud(async () => (await d.count()) === 0, 3000);
  }
  // Vrátit → POST vratit.
  await dokud(() => r5.getByRole('button', { name: 'Vrátit: Vyleštit kávovar' }).isVisible().catch(() => false), 3000);
  await r5.getByRole('button', { name: 'Vrátit: Vyleštit kávovar' }).click();
  const vratit = await dokud(() => postyUkolu(stav).find(z => z.telo?.akce === 'vratit'), 4000);
  tvrdi(`Z1 (${nazev}): Vrátit → POST { offerId: 5, akce: vratit } a Toast „Úkol je zase volný."`, vratit?.telo?.offerId === 5 && await dokud(() => p.getByRole('status').filter({ hasText: 'Úkol je zase volný.' }).isVisible().catch(() => false), 3000), JSON.stringify(vratit?.telo));
  tvrdi(`Z1 (${nazev}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// Z1b — tmavý 390
{
  const { ctx, p, chyby } = await kontext({ role: 'employee', viewport: TEL, mobil: true, tmavy: true, fix: FIX_DOMU, mineData: BARISTA, dalsi: podvrhZaBody(16) });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  const w = widgetLi(p, 'ukoly-za-body');
  await dokud(() => w.locator('[data-ukoly-za-body] > li').count().then(n => n > 0), 6000);
  tvrdi('Z1b (tmavý 390): tmavé pozadí, widget bez přetečení', await p.evaluate(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return c[0] < 80 && c[1] < 80 && c[2] < 80; }) && await preteceni(p) <= 1);
  const ink = await radek(w, 3).locator('p').first().evaluate(el => getComputedStyle(el).color.match(/\d+/g).map(Number));
  tvrdi('Z1b (tmavý 390): název úkolu je světlý (čitelný na tmavé kartě)', ink[0] > 180 && ink[1] > 180 && ink[2] > 180, JSON.stringify(ink));
  await p.screenshot({ path: SNIMKY + 'k87-za-body-domu-390-tmavy.png', fullPage: true });
  tvrdi('Z1b: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z2 — Úkoly s arg za-body: sekce „Za body navíc" nahoře, zvýrazněná; Zapsat navíc; sbalení
// ---------------------------------------------------------------------------
for (const [nazev, volby] of [['390', { viewport: TEL, mobil: true }], ['1280', { viewport: PC, mobil: false }]]) {
  const { ctx, p, stav, chyby } = await kontext({ ...volby, role: 'employee', fix: FIX_UKOLY, mineData: BARISTA, dalsi: podvrhZaBody(16) });
  await otevri(p, '/employee/shifts?view=tasks&arg=za-body', 'zamestnanec.ukoly');
  const s = p.locator('[data-za-body-sekce]');
  tvrdi(`Z2 (${nazev}): sekce „Za body navíc (3)" je v nástroji Úkolů nad seznamem úkolů`, await dokud(() => s.isVisible().catch(() => false), 6000) && /Za body navíc \(3\)/.test(await text(s.locator('h2')))
    && await s.evaluate(el => { const u = document.querySelector('[data-plocha] li[data-widget="nastroj"] ul.list:not([data-ukoly-za-body])'); return !u || el.getBoundingClientRect().top < u.getBoundingClientRect().top; }), await text(s.locator('h2')));
  tvrdi(`Z2 (${nazev}): arg za-body sekci zvýrazní a je v okně (nadpis nahoře, ne pod ohybem)`, await s.getAttribute('data-zvyrazneno') === '' && await s.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= -2 && r.top < window.innerHeight * 0.6; }));
  tvrdi(`Z2 (${nazev}): všech 5 úkolů v sekci (bez zkrácení), věta „Volitelné — kdo chce, vezme si."`, await s.locator('[data-ukoly-za-body] > li').count() === 5 && /Volitelné — kdo chce, vezme si/.test(await text(s)));
  const r2 = radek(s, 2);
  tvrdi(`Z2 (${nazev}): kdo bere — „Jednou týdně · Bere Eva · 1 z 2 volné" (jen křestní), chip „uzná se samo"`, /Jednou týdně · Bere Eva · 1 z 2 volné/.test(await text(r2)) && /uzná se samo/.test(await text(r2)) && !/Svobodová/.test(await text(r2)), await text(r2));
  tvrdi(`Z2 (${nazev}): v sekci je i popis úkolu („Včetně rohů za regály.")`, /Včetně rohů za regály\./.test(await text(radek(s, 1))));
  tvrdi(`Z2 (${nazev}): obsazený úkol — „Obsazeno", „Po, St, Pá · Bere Jakub", bez akcí`, /Obsazeno/.test(await text(radek(s, 4))) && /Po, St, Pá · Bere Jakub/.test(await text(radek(s, 4))) && await radek(s, 4).locator('[data-akce]').count() === 0, await text(radek(s, 4)));
  tvrdi(`Z2 (${nazev}): na Úkolech se odznak u Úkolů neukazuje (už tu je)`, await p.getByText('3 úkoly za body k vzetí', { exact: true }).count() === 0);
  tvrdi(`Z2 (${nazev}): stránka nepřetéká`, await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
  await p.screenshot({ path: SNIMKY + `k87-za-body-ukoly-${nazev}.png`, fullPage: nazev === '1280' });
  const prepinac = s.getByRole('button', { name: /Za body navíc/ });
  const vs = [...await vysky(prepinac), ...await vysky(s.getByRole('button', { name: 'Zapsat navíc' }))];
  tvrdi(`Z2 (${nazev}): přepínač sekce i „Zapsat navíc" ≥ 44 px`, vs.length === 2 && vs.every(v => v >= 44), JSON.stringify(vs));
  await s.getByRole('button', { name: 'Zapsat navíc' }).click();
  const d = p.getByRole('dialog', { name: 'Zapsat navíc' });
  tvrdi(`Z2 (${nazev}): „Zapsat navíc" otevře prázdné okno (vlastní věc mimo nabídku)`, await dokud(() => d.isVisible().catch(() => false), 3000) && (await d.getByLabel('Co bylo navíc?').inputValue()) === '');
  tvrdi(`Z2 (${nazev}): v okně je plný úkol vypnutý s „Obsazeno"`, await dokud(() => d.locator('[data-nabidka="4"]').isDisabled().catch(() => false), 3000) && /Obsazeno/.test(await text(d.locator('[data-nabidka="4"]'))), await text(d.locator('[data-nabidka="4"]')));
  await d.getByRole('button', { name: 'Zrušit' }).click();
  await dokud(async () => (await d.count()) === 0, 3000);
  // 409: někdo byl rychlejší.
  stav.ukoly409 = true;
  await r2.getByRole('button', { name: 'Beru si: Umýt výlohu zvenku' }).click();
  tvrdi(`Z2 (${nazev}): 409 → věta serveru „Úkol už mají vzatý: Eva Svobodová." v Toastu`, await dokud(() => p.getByRole('status').filter({ hasText: 'Úkol už mají vzatý: Eva Svobodová.' }).isVisible().catch(() => false), 3000)
    && postyUkolu(stav).at(-1)?.telo?.offerId === 2, JSON.stringify(postyUkolu(stav).at(-1)?.telo));
  stav.ukoly409 = false;
  tvrdi(`Z2 (${nazev}): sekce je rozbalená (aria-expanded=true)`, await prepinac.getAttribute('aria-expanded') === 'true');
  await prepinac.click();
  tvrdi(`Z2 (${nazev}): klepnutí na nadpis sekci sbalí — seznam zmizí, počet v nadpisu zůstává`, await dokud(async () => (await prepinac.getAttribute('aria-expanded')) === 'false' && (await s.locator('[data-ukoly-za-body]').count()) === 0, 2000) && /\(3\)/.test(await text(prepinac)));
  await prepinac.click();
  tvrdi(`Z2 (${nazev}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// Z2b — Úkoly bez úkolů za body: tichý řádek
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', viewport: TEL, mobil: true, fix: FIX_UKOLY, mineData: BARISTA, dalsi: podvrhZaBody(16) });
  stav.prazdne = true;
  await otevri(p, '/employee/shifts?view=tasks', 'zamestnanec.ukoly');
  const s = p.locator('[data-za-body-sekce]');
  await dokud(() => s.isVisible().catch(() => false), 6000);
  tvrdi('Z2b (390): bez úkolů jen tichý řádek „Dnes tu nic za body není…" se „Zapsat navíc" (žádná karta)', await s.locator('[data-za-body-prazdno]').count() === 1 && /Dnes tu nic za body není/.test(await text(s))
    && await s.getByRole('button', { name: 'Zapsat navíc' }).count() === 1 && await s.locator('.card').count() === 0);
  tvrdi('Z2b (390): žádný odznak u Úkolů (0 k vzetí)', await p.getByText(/úkol(y|ů)? za body k vzetí/).count() === 0);
  await p.screenshot({ path: SNIMKY + 'k87-za-body-ukoly-prazdne-390.png' });
  tvrdi('Z2b: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z3 — Widget Navíc: odkaz „Úkoly za body" do Úkolů na sekci
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ role: 'employee', viewport: TEL, mobil: true, fix: FIX_DOMU, mineData: BARISTA, dalsi: podvrhZaBody(16) });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  const navic = widgetLi(p, 'moje-smeny-navic');
  const odkaz = navic.locator('[data-navic-za-body]');
  tvrdi('Z3 (390): widget Navíc má odkaz „Úkoly za body"', await dokud(() => odkaz.isVisible().catch(() => false), 6000) && /Úkoly za body/.test(await text(odkaz)));
  tvrdi('Z3 (390): pilulka plného úkolu ve widgetu Navíc vypnutá s „Obsazeno"', await dokud(() => navic.locator('[data-nabidka="4"]').isDisabled().catch(() => false), 3000));
  await odkaz.click();
  const s = p.locator('[data-za-body-sekce]');
  tvrdi('Z3 (390): odkaz otevře Úkoly se zvýrazněnou sekcí „Za body navíc"', await dokud(() => s.isVisible().catch(() => false), 8000) && await dokud(async () => (await s.getAttribute('data-zvyrazneno')) === '', 3000));
  tvrdi('Z3: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z4 — Tablet: „Kdo jsi?" → úkoly za vybraného; po odchodu souhrn s úkoly (jen Hotovo)
// ---------------------------------------------------------------------------
{
  const TED = Date.now();
  const prahaHMS = (posunMin) => new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Prague', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(TED + posunMin * 60000));
  const isoPred = (min) => new Date(TED - min * 60000).toISOString();
  const OTISK = bcrypt.hashSync('1234', 4);
  const roster = () => ({
    roster: [
      { id: 1, name: 'Martin Nemeškal', avatar: '🧑', hasPin: true, openSince: isoPred(180), openEntryId: 501, breakSince: null, shiftStart: prahaHMS(-180), shiftEnd: prahaHMS(300), offlinePin: OTISK },
      { id: 3, name: 'Jakub Horák', avatar: '🧔', hasPin: false, openSince: isoPred(60), openEntryId: 502, breakSince: null, shiftStart: prahaHMS(-60), shiftEnd: prahaHMS(300) },
    ],
    entries: [],
  });
  const zaBody = podvrhZaBody(1);
  const podvrh = (req, json, stav) => {
    const r = zaBody(req, json, stav);
    if (r !== undefined) return r;
    const path = new URL(req.url()).pathname;
    const m = req.method();
    if (path === '/api/attendance' && m === 'GET') return json(roster());
    if (path === '/api/attendance' && m === 'POST') return json({ ok: true, action: 'out', entry: { clockIn: isoPred(180), clockOut: isoPred(0) }, closingDone: true });
    if (path === '/api/closings/handover' && m === 'GET') return json(nacti('k69-b9-handover'));
    if (path === '/api/procedures/runs' && m === 'GET') return json({ runs: [] });
    return undefined;
  };
  const { ctx, p, stav, chyby } = await kontext({ role: 'kiosk', viewport: TABLET, mobil: true, fix: FIX_SMENA, mineData: KIOSK, dalsi: podvrh });
  await ctx.addInitScript(() => { try { localStorage.removeItem('managero-kiosk-fronta'); localStorage.removeItem('managero-kiosk-active'); } catch { /* */ } });
  await jdi(p, BASE + '/kiosk');
  await p.locator('[data-plocha="kiosk.smena"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
  const w = widgetLi(p, 'ukoly-za-body');
  tvrdi('Z4 (tablet): bez vybraného člověka se widget zeptá „Kdo jsi?" a na úkoly se neptá (nezapsalo by se to tabletu)', await dokud(() => w.locator('[data-za-body-kdo]').isVisible().catch(() => false), 6000)
    && !(stav.cteniUkolu ?? []).length, JSON.stringify(stav.cteniUkolu));
  await w.getByRole('button', { name: 'Kdo jsi?' }).click();
  const vyber = p.getByRole('dialog', { name: 'Kdo teď u tabletu stojí?' });
  await dokud(() => vyber.isVisible().catch(() => false), 3000);
  await vyber.getByRole('button', { name: /Martin Nemeškal/ }).click();
  tvrdi('Z4 (tablet): po výběru úkoly za Martina (GET ?actingAs=1) a „Pro: Martin Nemeškal"', await dokud(() => (stav.cteniUkolu ?? []).includes('/api/navic/ukoly?actingAs=1'), 4000)
    && await dokud(() => w.locator('[data-ukoly-za-body] > li').count().then(n => n === 3), 4000) && /Pro: Martin Nemeškal/.test(await text(w)), JSON.stringify(stav.cteniUkolu));
  await poAnimaci(w);
  const vs = await vysky(w.locator('[data-akce]'));
  tvrdi('Z4 (tablet): tlačítka akcí ≥ 48 px (lg na tabletu)', vs.length >= 3 && vs.every(v => v >= 47.9), JSON.stringify(vs));
  tvrdi('Z4 (tablet): na tabletu nic pod 14 px ve widgetu', (await w.locator('[data-ukoly-za-body] *').evaluateAll(els => els.filter(e => e.textContent.trim() && e.children.length === 0 && e.offsetParent !== null).map(e => parseFloat(getComputedStyle(e).fontSize)))).every(v => v >= 14));
  await p.screenshot({ path: SNIMKY + 'k87-za-body-tablet.png' });
  await radek(w, 1).getByRole('button', { name: 'Beru si: Vytřít sklad a chodbu' }).click();
  const vzit = await dokud(() => postyUkolu(stav)[0], 4000);
  tvrdi('Z4 (tablet): Beru si → POST { offerId: 1, akce: vzit, actingAs: 1 }', vzit?.telo?.offerId === 1 && vzit?.telo?.akce === 'vzit' && vzit?.telo?.actingAs === 1, JSON.stringify(vzit?.telo));
  // Odchod Martina: souhrn s úkoly za body, jen Hotovo.
  const nastroj = p.locator('[data-plocha="kiosk.smena"] li[data-widget="nastroj"]');
  await nastroj.getByRole('button', { name: 'Odchod – Martin Nemeškal' }).click();
  const okno = p.getByRole('dialog', { name: 'Martin Nemeškal' });
  await dokud(() => okno.isVisible().catch(() => false), 3000);
  for (const k of ['1', '2', '3', '4']) await okno.getByRole('button', { name: k, exact: true }).click();
  await okno.getByRole('button', { name: 'Odpíchnout odchod' }).click();
  const souhrn = p.getByRole('dialog', { name: 'Martin Nemeškal, díky za směnu' });
  const blok = souhrn.locator('[data-za-body-tablet]');
  tvrdi('Z4 (tablet): souhrn po odchodu ukazuje úkoly za body toho, kdo odešel (místo holých pilulek)', await dokud(() => blok.isVisible().catch(() => false), 5000) && await souhrn.locator('[data-nabidka-navic]').count() === 0, await text(souhrn));
  const akce = await blok.locator('[data-akce]').evaluateAll(els => [...new Set(els.map(e => e.getAttribute('data-akce')))].join());
  tvrdi('Z4 (tablet): po odchodu jen „Hotovo" (nic se nebere ani nevrací)', akce === 'hotovo', akce);
  await p.screenshot({ path: SNIMKY + 'k87-za-body-tablet-odchod.png' });
  await blok.getByRole('button', { name: 'Hotovo: Zaskočit za kolegu na směnu' }).click();
  const d = p.getByRole('dialog', { name: 'Zapsat navíc' });
  tvrdi('Z4 (tablet): Hotovo otevře okno „Za: Martin Nemeškal" s názvem úkolu', await dokud(() => d.isVisible().catch(() => false), 3000) && /Za: Martin Nemeškal/.test(await text(d)) && (await d.getByLabel('Co bylo navíc?').inputValue()) === 'Zaskočit za kolegu na směnu');
  await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
  const post = await dokud(() => postyNavic(stav)[0], 4000);
  tvrdi('Z4 (tablet): POST /api/navic { offerId: 3, actingAs: 1, day: dnes } — nikdy bez actingAs', post?.telo?.offerId === 3 && post?.telo?.actingAs === 1 && post?.telo?.day === DNY.DNES, JSON.stringify(post?.telo));
  tvrdi('Z4 (tablet): souhrn hlásí „Zapsáno, díky! Vedení to uzná."', await dokud(() => souhrn.getByText('Zapsáno, díky! Vedení to uzná.').isVisible().catch(() => false), 3000));
  tvrdi('Z4 (tablet): bez přetečení', await preteceni(p) <= 1);
  tvrdi('Z4 (tablet): bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z5 — Polština 320: Domů a Úkoly bez přetečení
// ---------------------------------------------------------------------------
for (const [cesta, stranka, soubor] of [['/employee/shifts?view=home', 'zamestnanec.domu', 'domu'], ['/employee/shifts?view=tasks', 'zamestnanec.ukoly', 'ukoly']]) {
  const { ctx, p } = await kontext({ role: 'employee', viewport: { width: 320, height: 700 }, mobil: true, fix: soubor === 'domu' ? FIX_DOMU : FIX_UKOLY, mineData: BARISTA, dalsi: podvrhZaBody(16) });
  await nastavJazyk(p.context(), 'pl');
  await jdi(p, BASE + cesta);
  await p.locator(`[data-plocha="${stranka}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(900);
  await dokud(() => p.locator('[data-ukoly-za-body] > li').count().then(n => n > 0), 6000);
  const karty = await p.evaluate(() => [...document.querySelectorAll('[data-plocha] li[data-widget]:not([hidden]) section, [data-za-body-sekce]')].filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.closest('li')?.getAttribute('data-widget') ?? 'sekce'));
  tvrdi(`Z5 (320 pl, ${soubor}): bez přetečení (dokument, karty, sekce)`, await preteceni(p) <= 1 && karty.length === 0, `přetečení ${await preteceni(p)} px, karty ${JSON.stringify(karty)}`);
  tvrdi(`Z5 (320 pl, ${soubor}): přeloženo („Biorę", „Gotowe", „Zadania za punkty"/„Ekstra za punkty")`, /Biorę/.test(await text(p.locator('[data-ukoly-za-body]'))) && /Gotowe/.test(await text(p.locator('[data-ukoly-za-body]'))));
  await p.screenshot({ path: SNIMKY + `k87-za-body-${soubor}-320-pl.png`, fullPage: true });
  if (soubor === 'domu') {
    await radek(widgetLi(p, 'ukoly-za-body'), 3).getByRole('button', { name: /^Gotowe/ }).click();
    const d = p.getByRole('dialog', { name: 'Zapisz ekstra' });
    await dokud(() => d.isVisible().catch(() => false), 4000);
    await p.waitForTimeout(300);
    tvrdi('Z5 (320 pl): okno Zapisz ekstra z „Gotowe" nepřetéká', await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1) && await preteceni(p) <= 1);
    await p.screenshot({ path: SNIMKY + 'k87-za-body-okno-320-pl.png' });
  }
  await ctx.close();
}

await konec();
