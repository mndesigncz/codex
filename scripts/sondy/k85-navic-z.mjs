// Kolo 9, N1 — balík Z: „Navíc" u zaměstnance, na tabletu, v úkolu a při uzávěrce.
//
// Z1 Domů 390 (dotyk): widget Navíc (M + S) — chip „1 čeká", řádky s chipem stavu a odměnou, důvod
//    odmítnutí, pilulky nabídky (vyčerpaný limit vypnutý), okno Zapsat navíc: pilulka předvyplní text a
//    ukáže body, počítadlo, hlášky validace jako server, fotka přes /api/upload, POST s offerId, Toast,
//    409 limitu větou pod polem, DiscardGuard při Escape nad rozepsaným. Světlý i tmavý, 1280 i 390.
// Z2 Odměny 1280: velký widget — souhrn měsíce, filtr Vše / Čeká / Uznané, menu „···" u čekajícího
//    (Upravit → PATCH /api/navic/1, Smazat → potvrzení → DELETE).
// Z3 Moje směny 390: chip „navíc: 1" u včerejší směny, akce „Navíc" → okno se dnem směny → POST shiftId;
//    Můj výdělek M: řádek „Navíc" z prémie source navic.
// Z4 Uzávěrka 390: po odeslání karta „Udělal(a) jsi dnes něco navíc?" s pilulkami, „Napsat vlastní" →
//    okno s closingId z odpovědi → POST; karta zmizí.
// Z5 Tablet 1024×1366: odchod Martina (PIN) → souhrn s blokem navíc; pilulka → POST s actingAs = 1
//    (nikdy bez něj) → „Zapsáno, díky!"; pilulky ≥ 44 px; „Napsat…" otevře okno „Za: Martin Nemeškal".
// Z6 Úkoly 390: detail úkolu → „Zapsat jako navíc" → okno s názvem úkolu → POST s taskId.
// Z7 Polština 320: Domů s widgetem i oknem bez přetečení.
//   SONDY_ZAKLAD=http://localhost:3441 node scripts/sondy/k85-navic-z.mjs
import { readFileSync, mkdirSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { kontext, konec, tvrdi, otevri, dokud, jdi, roleMine, mine, sysRole, DIR, OUT, BASE } from './k68-spolecne.mjs';
import { nastavJazyk } from './preteceni-jadro.mjs';

const TEL = { width: 390, height: 844 };
const PC = { width: 1280, height: 900 };
const TABLET = { width: 1024, height: 1366 };
const SNIMKY = process.env.K85_SNIMKY ? process.env.K85_SNIMKY.replace(/\/?$/, '/') : OUT;
mkdirSync(SNIMKY, { recursive: true });

/** Role s klíči „navíc" — obecná fixtura roles.json je z doby před kolem 9. */
const sRole = (klic, navic) => { const r = sysRole(klic); return mine([...r.opravneni, ...navic], { klic, roleId: null, nazev: r.nazev, typ: r.typ, jeVlastnik: false }); };
const BARISTA = sRole('barista', ['navic.zapsat']);
const KIOSK = sRole('kiosk', ['navic.zapsat']);

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PRED2: praha(-2), PREDEVCIREM: praha(-2), PRED3: praha(-3), PRED5: praha(-5), PRED6: praha(-6), ZITRA: praha(1), POZITRI: praha(2), ZA3: praha(3), ZA5: praha(5), ZA7: praha(7), ZA10: praha(10), ZA12: praha(12), ZA20: praha(20) };
const MESIC = DNY.DNES.slice(0, 7);
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`).replaceAll(`"${k}T`, `"${v}T`);
  return JSON.parse(t.replaceAll('"MESIC"', `"${MESIC}"`).replaceAll('"@-', `"${MESIC}-`));
};
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat|Failed to load resource/i.test(c));
const preteceni = (p) => p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]`);
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : '').replace(/ /g, ' ');
const dialogNavic = (p, nazev = 'Zapsat navíc') => p.getByRole('dialog', { name: nazev });
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const telo = (req) => { try { return req.postData() ? JSON.parse(req.postData()) : null; } catch { return null; } };

const NAVIC = () => nacti('k85-navic-z-navic');

/**
 * Podvrh /api/navic: GET vrací fixturu (čtení si zapisuje do `stav.cteni`), POST / PATCH / DELETE do `stav.zapisy`.
 * `stav.navic409` → POST odpoví 409 limitu; `stav.navicUznano` → POST vrátí zápis rovnou uznaný.
 */
const podvrhNavic = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (!path.startsWith('/api/navic')) return undefined;
  if (m === 'GET') { (stav.cteni ??= []).push(url.pathname + url.search); return json(NAVIC()); }
  const t = telo(req);
  (stav.zapisy ??= []).push({ m, path, telo: t, q: url.search });
  if (m === 'POST') {
    if (stav.navic409) return json({ error: 'Tohle už máš dnes zapsané (limit 1× za den).' }, 409);
    const n = NAVIC().nabidka.find(x => x.id === t?.offerId) ?? null;
    const uznano = stav.navicUznano || n?.autoApprove;
    return json({ ok: true, item: { ...NAVIC().items[0], id: 99, text: t?.text, day: t?.day, offerId: t?.offerId ?? null, offerTitle: n?.title ?? null, shiftId: t?.shiftId ?? null, closingId: t?.closingId ?? null, taskId: t?.taskId ?? null, status: uznano ? 'uznano' : 'ceka', points: uznano ? (n?.points ?? 15) : null, bonusCzk: uznano ? (n?.bonusCzk ?? null) : null } }, 201);
  }
  if (m === 'PATCH') return json({ ok: true, item: { ...NAVIC().items[0], ...t } });
  return json({ ok: true });
};

/** Domů / Odměny / Úkoly zaměstnance: navíc + úkoly + směny + nahrání fotky. */
const podvrhZamestnanec = (req, json, stav) => {
  const r = podvrhNavic(req, json, stav);
  if (r !== undefined) return r;
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (path === '/api/upload' && m === 'POST') { (stav.zapisy ??= []).push({ m, path }); return json({ url: `/api/upload/k85-foto-${(stav.zapisy ?? []).length}` }); }
  if (path === '/api/shifts' && m === 'GET' && url.searchParams.get('employeeId')) return json(nacti('k69-b1-shifts-mine').map(s => ({ ...s, employeeId: 16 })));
  if (path === '/api/tasks' && m === 'GET') return json(nacti('k69-b6a-tasks'));
  if (path === '/api/teams' && m === 'GET') return json(nacti('k69-b6a-teams'));
  if (path === '/api/notes' && m === 'GET') return json([]);
  if (path === '/api/notes/pocty') return json({ pocty: {} });
  if (path === '/api/rewards' && m === 'GET') return json(nacti('k69-b7-rewards-zam'));
  return undefined;
};

const FIX_DOMU = nacti('k85-navic-z-rozlozeni-domu');
const FIX_ODMENY = nacti('k85-navic-z-rozlozeni-odmeny');
const FIX_MOJE = nacti('k85-navic-z-rozlozeni-moje-smeny');
const FIX_UKOLY = nacti('k69-b6a-rozlozeni-ukoly-zam');
const FIX_UZAVERKA = nacti('k69-b5a-rozlozeni-uzaverka');
const FIX_SMENA = nacti('k69-b9-rozlozeni-smena');

// ---------------------------------------------------------------------------
// Z1 — Domů 390 (dotyk) + 1280: widget Navíc a okno Zapsat navíc
// ---------------------------------------------------------------------------
for (const [nazev, volby] of [['390', { viewport: TEL, mobil: true }], ['1280', { viewport: PC, mobil: false }]]) {
  const { ctx, p, stav, chyby } = await kontext({ ...volby, role: 'employee', fix: FIX_DOMU, mineData: BARISTA, dalsi: podvrhZamestnanec });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  const w = widgetLi(p, 'moje-smeny.navic').first();
  const male = widgetLi(p, 'moje-smeny.navic').nth(1);
  await dokud(() => w.locator('[data-navic-seznam]').count().then(n => n > 0), 6000);
  const tw = await text(w);
  tvrdi(`Z1 (${nazev}): widget Navíc (M) — titulek bez chipu v hlavičce (stav nesou řádky), pilulky a akce`, /^Navíc/.test(tw) && !/^Navíc\s*\n?\s*1 čeká/.test(tw) && /Co se dá udělat navíc/i.test(tw), tw.slice(0, 80).replace(/\n/g, ' | '));
  tvrdi(`Z1 (${nazev}): řádky zápisů — Včera „z nabídky: Vytřít sklad a chodbu" čeká na uznání, reklamace uznaná +30 b · 200 Kč, poslední 3 a „…a 1 další"`,
    /Včera · z nabídky: Vytřít sklad a chodbu/.test(tw) && /Čeká na uznání/.test(tw) && /\+30 b · 200 Kč/.test(tw) && /…a 1 další/.test(tw) && await w.locator('[data-navic-seznam] > li').count() === 3, tw.replace(/\n/g, ' | ').slice(0, 400));
  tvrdi(`Z1 (${nazev}): pilulky a „Zapsat navíc" stojí nad seznamem (akce není pod odleskem „Zobrazit vše")`, await w.locator('[data-navic-akce]').evaluate(el => el.getBoundingClientRect().top) < await w.locator('[data-navic-seznam]').evaluate(el => el.getBoundingClientRect().top));
  tvrdi(`Z1 (${nazev}): stav je Chip (tone wait / ok), žádná ruční pilulka`, await w.locator('.chip.chip-wait').count() >= 1 && await w.locator('.chip.chip-ok').count() >= 1);
  const pilulky = w.locator('[data-nabidka-navic] button');
  tvrdi(`Z1 (${nazev}): pilulky nabídky — 3 položky, „Vytřít sklad a chodbu · 20 b", „Zaskočit… · 50 b · 300 Kč" (měna podniku)`, await pilulky.count() === 3
    && /Vytřít sklad a chodbu · 20 b/.test(await text(pilulky.nth(0))) && /Zaskočit za kolegu na směnu · 50 b · 300 Kč/.test(await text(pilulky.nth(2))), await text(w.locator('[data-nabidka-navic]')));
  tvrdi(`Z1 (${nazev}): „Umýt výlohu" je dnes vyčerpaná (limit 1× za den) — pilulka vypnutá`, await pilulky.nth(1).isDisabled());
  const vyskyPilulek = await pilulky.evaluateAll(els => els.map(e => e.getBoundingClientRect().height));
  tvrdi(`Z1 (${nazev}): pilulky nabídky ≥ 44 px`, vyskyPilulek.every(v => v >= 44), JSON.stringify(vyskyPilulek));
  tvrdi(`Z1 (${nazev}): bez limetky ve widgetu (jediná limetka obrazovky není jeho)`, await w.locator('button.on-accent, .btn-accent').count() === 0);
  const tm = await text(male);
  tvrdi(`Z1 (${nazev}): malá karta — body za měsíc (45 b), chip „1 čeká" a tlačítko Zapsat navíc`, /45/.test(tm) && /1 čeká/.test(tm) && await male.getByRole('button', { name: 'Zapsat navíc' }).count() === 1, tm.replace(/\n/g, ' | '));
  tvrdi(`Z1 (${nazev}): /api/navic se ptá jednou pro oba widgety (sdílená mezipaměť)`, (stav.cteni ?? []).filter(u => u === '/api/navic').length === 1, JSON.stringify(stav.cteni));
  await p.screenshot({ path: SNIMKY + `k85-navic-domu-${nazev}.png`, fullPage: true });

  // Okno: pilulka předvyplní text a ukáže body, počítadlo, POST.
  await w.getByRole('button', { name: 'Zapsat navíc' }).click();
  const d = dialogNavic(p);
  tvrdi(`Z1 (${nazev}): okno Zapsat navíc se otevře (Modal) s pilulkami nabídky a textarea „Co bylo navíc?"`, await dokud(() => d.isVisible().catch(() => false), 4000)
    && await d.locator('[data-nabidka-navic] button').count() === 3 && await d.getByLabel('Co bylo navíc?').count() === 1);
  const pole = d.getByLabel('Co bylo navíc?');
  if (nazev === '390') tvrdi('Z1 (390): textarea má písmo ≥ 16 px (bez zoomu na iPhonu)', (await pole.evaluate(el => parseFloat(getComputedStyle(el).fontSize))) >= 16);
  await d.locator('[data-nabidka-navic] button').nth(0).click();
  tvrdi(`Z1 (${nazev}): klepnutí na pilulku předvyplní text názvem a řekne „+20 b po uznání vedením."`, await dokud(async () => (await pole.inputValue()) === 'Vytřít sklad a chodbu', 1500)
    && /\+20 b po uznání vedením\./.test(await text(d.locator('[data-vybrana-nabidka="1"]'))) && (await d.locator('[data-nabidka-navic] button').nth(0).getAttribute('aria-pressed')) === 'true', await text(d));
  await pole.fill('Vytřít sklad a chodbu — i za regály.');
  tvrdi(`Z1 (${nazev}): počítadlo znaků „36/500"`, await dokud(async () => /36\/500/.test(await text(d.locator('[data-pocitadlo]'))), 1500), await text(d.locator('[data-pocitadlo]')));
  const den = d.getByLabel('Den');
  tvrdi(`Z1 (${nazev}): den je dnes, nejvýš 14 dní zpětně a ne do budoucna (min/max)`, (await den.inputValue()) === DNY.DNES && (await den.getAttribute('max')) === DNY.DNES && (await den.getAttribute('min')) === praha(-14));
  if (nazev === '390') {
    // Fotka: fotoaparát přímo (capture=environment), POST /api/upload, náhled.
    const [vyber] = await Promise.all([p.waitForEvent('filechooser'), d.getByRole('button', { name: 'Vyfotit / nahrát' }).click()]);
    await vyber.setFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG });
    tvrdi('Z1 (390): fotka jde na POST /api/upload a ukáže se náhled s „Odebrat fotku"', await dokud(() => stav.zapisy?.some(z => z.path === '/api/upload'), 4000)
      && await dokud(() => d.getByRole('button', { name: 'Odebrat fotku' }).isVisible().catch(() => false), 3000) && await d.locator('img[alt="Náhled fotky"]').count() === 1);
    tvrdi('Z1 (390): vstup fotky otvírá fotoaparát (capture=environment)', (await d.locator('input[type=file]').getAttribute('capture')) === 'environment');
    tvrdi('Z1 (390): okno nepřetéká', await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1) && await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
    const cile = await d.getByRole('button').evaluateAll(els => els.filter(e => e.offsetParent !== null && !e.classList.contains('btn-icon')).map(e => [e.textContent.trim().slice(0, 20), e.getBoundingClientRect().height]));
    tvrdi('Z1 (390): tlačítka v okně ≥ 36 px (pilulky a hlavní ≥ 44)', cile.every(([, h]) => h >= 36), JSON.stringify(cile));
  }
  await p.screenshot({ path: SNIMKY + `k85-navic-okno-${nazev}.png` });
  await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
  const post = await dokud(async () => stav.zapisy?.find(z => z.m === 'POST' && z.path === '/api/navic'), 4000);
  tvrdi(`Z1 (${nazev}): POST /api/navic { text, day: dnes, offerId: 1, shiftId/closingId/taskId null${nazev === '390' ? ', photoUrl' : ''} }`, post?.telo?.text === 'Vytřít sklad a chodbu — i za regály.' && post?.telo?.day === DNY.DNES && post?.telo?.offerId === 1
    && post?.telo?.shiftId === null && post?.telo?.closingId === null && post?.telo?.taskId === null && (nazev !== '390' || /^\/api\/upload\//.test(post?.telo?.photoUrl ?? '')) && !('actingAs' in (post?.telo ?? {})), JSON.stringify(post?.telo));
  tvrdi(`Z1 (${nazev}): po uložení Toast „Zapsáno — čeká na uznání." a okno je zavřené`, await dokud(() => p.getByRole('status').filter({ hasText: 'Zapsáno — čeká na uznání.' }).isVisible().catch(() => false), 3000) && await dokud(async () => (await d.count()) === 0, 2000));
  tvrdi(`Z1 (${nazev}): po zápisu se /api/navic načte znovu (obnovNavic)`, await dokud(() => (stav.cteni ?? []).filter(u => u === '/api/navic').length >= 2, 4000), JSON.stringify(stav.cteni));

  // Validace: prázdný text, moc krátký, 409 limitu — věta pod polem, okno zůstává.
  await w.getByRole('button', { name: 'Zapsat navíc' }).click();
  await dokud(() => d.isVisible().catch(() => false), 3000);
  await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
  tvrdi(`Z1 (${nazev}): prázdný text → „Napiš, co bylo navíc." pod polem (role=alert), žádný POST`, await dokud(() => d.getByRole('alert').filter({ hasText: 'Napiš, co bylo navíc.' }).isVisible().catch(() => false), 2000)
    && (stav.zapisy ?? []).filter(z => z.m === 'POST' && z.path === '/api/navic').length === 1);
  await d.getByLabel('Co bylo navíc?').fill('x');
  await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
  tvrdi(`Z1 (${nazev}): jeden znak → „Text je moc dlouhý … nebo moc krátký."`, await dokud(() => d.getByRole('alert').filter({ hasText: /moc krátký/ }).isVisible().catch(() => false), 2000));
  stav.navic409 = true;
  await d.getByLabel('Co bylo navíc?').fill('Umytá výloha podruhé.');
  await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
  tvrdi(`Z1 (${nazev}): 409 limitu → věta serveru pod polem, okno zůstává s textem`, await dokud(() => d.getByRole('alert').filter({ hasText: 'Tohle už máš dnes zapsané (limit 1× za den).' }).isVisible().catch(() => false), 3000)
    && (await d.getByLabel('Co bylo navíc?').inputValue()) === 'Umytá výloha podruhé.');
  stav.navic409 = false;
  if (nazev === '390') await p.screenshot({ path: SNIMKY + 'k85-navic-okno-409-390.png' });
  // DiscardGuard: Escape nad rozepsaným se zeptá, „Zpět k úpravám" text nechá.
  await p.keyboard.press('Escape');
  const otazka = p.getByRole('alertdialog', { name: 'Zahodit rozepsané?' });
  tvrdi(`Z1 (${nazev}): Escape nad rozepsaným textem se zeptá „Zahodit rozepsané?"`, await dokud(() => otazka.isVisible().catch(() => false), 2000));
  await otazka.getByRole('button', { name: 'Zpět k úpravám' }).click();
  tvrdi(`Z1 (${nazev}): „Zpět k úpravám" nechá okno i text`, await dokud(async () => (await otazka.count()) === 0, 2000) && await d.isVisible() && (await d.getByLabel('Co bylo navíc?').inputValue()) === 'Umytá výloha podruhé.');
  await d.getByRole('button', { name: 'Zrušit' }).click();
  tvrdi(`Z1 (${nazev}): „Zrušit" zavře bez ptaní`, await dokud(async () => (await d.count()) === 0, 2000));
  tvrdi(`Z1 (${nazev}): stránka nepřetéká`, await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
  tvrdi(`Z1 (${nazev}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// Z1b — tmavý režim 390: widget i okno čitelné (snímek), bez přetečení.
{
  const { ctx, p, chyby } = await kontext({ role: 'employee', viewport: TEL, mobil: true, tmavy: true, fix: FIX_DOMU, mineData: BARISTA, dalsi: podvrhZamestnanec });
  await otevri(p, '/employee/shifts?view=home', 'zamestnanec.domu');
  const w = widgetLi(p, 'moje-smeny.navic').first();
  await dokud(() => w.locator('[data-navic-seznam]').count().then(n => n > 0), 6000);
  tvrdi('Z1b (tmavý 390): widget je na tmavém pozadí (ne bílá karta)', await p.evaluate(() => { const c = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return c[0] < 80 && c[1] < 80 && c[2] < 80; }));
  await p.screenshot({ path: SNIMKY + 'k85-navic-domu-390-tmavy.png', fullPage: true });
  await w.getByRole('button', { name: 'Zapsat navíc' }).click();
  const d = dialogNavic(p);
  await dokud(() => d.isVisible().catch(() => false), 4000);
  await d.locator('[data-nabidka-navic] button').nth(2).click();
  await p.waitForTimeout(300);
  await p.screenshot({ path: SNIMKY + 'k85-navic-okno-390-tmavy.png' });
  tvrdi('Z1b (tmavý 390): okno nepřetéká', await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  tvrdi('Z1b: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z2 — Odměny 1280: velký widget — souhrn, filtr, Upravit (PATCH), Smazat (DELETE)
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', viewport: PC, fix: FIX_ODMENY, mineData: BARISTA, dalsi: podvrhZamestnanec });
  await otevri(p, '/employee/shifts?view=rewards', 'zamestnanec.odmeny');
  const w = widgetLi(p, 'moje-smeny.navic');
  await dokud(() => w.locator('[data-navic-seznam]').count().then(n => n > 0), 6000);
  tvrdi('Z2 (1280): souhrn měsíce „2 uznáno · 45 b · 200 Kč" (měna podniku, ne natvrdo)', /: 2 uznáno · 45 b · 200 Kč/.test(await text(w.locator('[data-navic-souhrn]'))), await text(w.locator('[data-navic-souhrn]')));
  tvrdi('Z2 (1280): rychlý filtr měsíce v hlavičce (Měsíc: Tento)', await w.locator('[data-rychly-filtr="obdobi"]').count() === 1 && /Tento/.test(await text(w.locator('[data-rychly-filtr="obdobi"]'))));
  const seg = w.getByRole('tablist', { name: 'Stav' });
  tvrdi('Z2 (1280): Segmented Vše / Čeká 1 / Uznané 2, všechny 4 řádky', await seg.count() === 1 && /Čeká\s*1/.test(await text(seg)) && /Uznané\s*2/.test(await text(seg)) && await w.locator('[data-navic-seznam] > li').count() === 4, await text(seg));
  await seg.getByRole('tab', { name: /^Čeká/ }).click();
  tvrdi('Z2 (1280): filtr Čeká nechá jeden řádek s menu „···"', await dokud(() => w.locator('[data-navic-seznam] > li').count().then(n => n === 1), 2000) && await w.locator('[data-navic-seznam] button[aria-haspopup="menu"]').count() === 1);
  await p.screenshot({ path: SNIMKY + 'k85-navic-odmeny-1280.png', fullPage: true });
  await w.locator('[data-navic-seznam] button[aria-haspopup="menu"]').click();
  await p.getByRole('menuitem', { name: 'Upravit' }).click();
  const d = dialogNavic(p, 'Upravit zápis navíc');
  tvrdi('Z2 (1280): „Upravit" otevře okno s textem zápisu a vybranou položkou nabídky', await dokud(() => d.isVisible().catch(() => false), 3000)
    && (await d.getByLabel('Co bylo navíc?').inputValue()) === 'Vytřela jsem sklad i chodbu, včetně rohů za regály.' && (await d.locator('[data-nabidka-navic] button').nth(0).getAttribute('aria-pressed')) === 'true');
  await d.getByLabel('Co bylo navíc?').fill('Vytřela jsem sklad i chodbu, včetně rohů za regály a pod dřezem.');
  await d.getByRole('button', { name: 'Uložit' }).click();
  const patch = await dokud(async () => stav.zapisy?.find(z => z.m === 'PATCH' && z.path === '/api/navic/1'), 4000);
  tvrdi('Z2 (1280): Uložit → PATCH /api/navic/1 { text, day: včera, offerId: 1, shiftId: 702 }', patch?.telo?.text === 'Vytřela jsem sklad i chodbu, včetně rohů za regály a pod dřezem.' && patch?.telo?.day === DNY.VCERA && patch?.telo?.offerId === 1 && patch?.telo?.shiftId === 702, JSON.stringify(patch?.telo));
  tvrdi('Z2 (1280): Toast „Zápis je upravený."', await dokud(() => p.getByRole('status').filter({ hasText: 'Zápis je upravený.' }).isVisible().catch(() => false), 3000));
  await dokud(() => w.locator('[data-navic-seznam] button[aria-haspopup="menu"]').isVisible().catch(() => false), 4000);
  await w.locator('[data-navic-seznam] button[aria-haspopup="menu"]').click();
  await p.getByRole('menuitem', { name: 'Smazat' }).click();
  const potvrzeni = p.getByRole('dialog', { name: 'Smazat zápis?' });
  tvrdi('Z2 (1280): Smazat chce potvrzení v okně (ne confirm())', await dokud(() => potvrzeni.isVisible().catch(() => false), 3000) && !(stav.zapisy ?? []).some(z => z.m === 'DELETE'));
  await potvrzeni.getByRole('button', { name: 'Smazat' }).click();
  const del = await dokud(async () => stav.zapisy?.find(z => z.m === 'DELETE' && z.path === '/api/navic/1'), 4000);
  tvrdi('Z2 (1280): potvrzení → DELETE /api/navic/1 a Toast „Zápis smazaný."', !!del && await dokud(() => p.getByRole('status').filter({ hasText: 'Zápis smazaný.' }).isVisible().catch(() => false), 3000));
  tvrdi('Z2 (1280): bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z3 — Moje směny 390: chip „navíc: 1" u směny, akce Navíc → POST shiftId; Můj výdělek řádek Navíc
// ---------------------------------------------------------------------------
{
  const prahaISO = (den, hm) => {
    const odhad = new Date(`${den}T${hm}:00Z`);
    const tz = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', timeZoneName: 'longOffset' }).formatToParts(odhad).find(x => x.type === 'timeZoneName')?.value ?? 'GMT+01:00';
    return new Date(`${den}T${hm}:00${tz.replace('GMT', '') || '+00:00'}`).toISOString();
  };
  const dochazka = () => ({
    roster: [{ id: 16, openSince: null, shiftStart: '08:00', shiftEnd: '16:00', shiftDate: DNY.DNES, hourlyRate: 150 }],
    entries: [{ id: 702, employeeId: 16, clockIn: prahaISO(DNY.PRED2, '07:58'), clockOut: prahaISO(DNY.PRED2, '16:10'), source: 'kiosk', note: null, updatedBy: null }],
    adjustments: [{ id: 1, userId: 16, day: DNY.PRED3, amount: 200, note: 'Navíc: Vyřešila jsem reklamaci dortu', source: 'navic' }, { id: 2, userId: 16, day: DNY.PRED5, amount: 150, note: 'Víkendová akce', source: 'manual' }],
  });
  const podvrh = (req, json, stav) => {
    const r = podvrhZamestnanec(req, json, stav);
    if (r !== undefined) return r;
    const path = new URL(req.url()).pathname;
    if (path === '/api/attendance' && req.method() === 'GET') return json(dochazka());
    if (path === '/api/payroll') return json({ ja: { vyplaty: [], zKasy: 0, zKasyPocet: 0, spropitne: null, spropitnePoDnech: [] }, zamky: [], pravidla: { priplatky: null } });
    return undefined;
  };
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', viewport: TEL, mobil: true, fix: FIX_MOJE, mineData: BARISTA, dalsi: podvrh });
  await otevri(p, '/employee/shifts?view=my-shifts', 'zamestnanec.moje_smeny');
  const minule = widgetLi(p, 'moje.minule_smeny');
  await dokud(async () => /navíc: 1/.test(await text(minule)), 6000);
  // Fixtura směn (k69-b1) má včerejší ranní (702) a noční před třemi dny (701); k oběma je po jednom zápisu.
  const radekVcera = minule.locator('ul.list > li', { hasText: 'Ranní · 08:00–12:30' });
  tvrdi('Z3 (390): u včerejší směny chip „navíc: 1" (z jedné odpovědi, ne GET ?shiftId=)', /navíc: 1/.test(await text(radekVcera)) && !(stav.cteni ?? []).some(u => /shiftId=/.test(u)), (await text(radekVcera)).replace(/\n/g, ' | '));
  tvrdi('Z3 (390): chip jen u směn se zápisem (2 ze 2 minulých směn ve fixtuře)', await minule.locator('ul.list > li').filter({ hasText: 'navíc: 1' }).count() === 2 && await minule.locator('ul.list > li').count() === 2);
  const akce = radekVcera.getByRole('button', { name: /^Zapsat navíc ke směně/ });
  tvrdi('Z3 (390): akce „Navíc" u směny je cíl ≥ 36 px s přístupným jménem i dnem', await akce.count() === 1 && (await akce.boundingBox()).height >= 36, String(await akce.count()));
  const vydelek = widgetLi(p, 'moje.vydelek');
  const tv = await text(vydelek);
  tvrdi('Z3 (390): Můj výdělek má řádek „Navíc · 1 uznaný zápis s prémií · +200 Kč"', /Navíc/.test(tv) && /1 uznaný zápis s prémií/.test(tv) && /\+200 Kč/.test(tv), tv.replace(/\n/g, ' | ').slice(0, 300));
  await p.screenshot({ path: SNIMKY + 'k85-navic-moje-smeny-390.png', fullPage: true });
  await akce.click();
  const d = dialogNavic(p);
  tvrdi('Z3 (390): okno má den směny (včera)', await dokud(() => d.isVisible().catch(() => false), 3000) && (await d.getByLabel('Den').inputValue()) === DNY.VCERA);
  await d.getByLabel('Co bylo navíc?').fill('Zaskočila jsem na baru za Jakuba.');
  await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
  const post = await dokud(async () => stav.zapisy?.find(z => z.m === 'POST' && z.path === '/api/navic'), 4000);
  tvrdi('Z3 (390): POST nese shiftId 702 a den směny', post?.telo?.shiftId === 702 && post?.telo?.day === DNY.VCERA && post?.telo?.offerId === null, JSON.stringify(post?.telo));
  tvrdi('Z3 (390): stránka nepřetéká', await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
  tvrdi('Z3 (390): bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z4 — Uzávěrka 390: po odeslání karta „Udělal(a) jsi dnes něco navíc?" → okno s closingId → POST
// ---------------------------------------------------------------------------
{
  const podvrh = (req, json, stav) => {
    const r = podvrhNavic(req, json, stav);
    if (r !== undefined) return r;
    const url = new URL(req.url());
    const path = url.pathname;
    const m = req.method();
    if (m !== 'GET') {
      (stav.zapisy ??= []).push({ m, path, telo: telo(req), q: url.search });
      if (path === '/api/closings') return json({ ok: true, closing: { id: 777, date: DNY.DNES }, approved: true, covered: 0, tipsInDrawer: false, openClockIns: [] });
      return json({ ok: true });
    }
    if (path === '/api/closings') return json({ ...nacti('k69-b5a-closings-zamestnanec'), payDailyCash: true });
    if (path === '/api/closings/coworkers') return json(nacti('k84-uzaverky-coworkers'));
    if (path === '/api/closings/wage') return json({ available: false });
    if (path === '/api/closings/calendar') return json({ ...nacti('k69-b5a-calendar'), month: url.searchParams.get('month') ?? MESIC });
    if (path === '/api/closings/handover') return json(nacti('k69-b5a-handover'));
    if (path === '/api/notes') return json([]);
    if (path === '/api/notes/pocty') return json({ pocty: {} });
    return undefined;
  };
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', viewport: TEL, mobil: true, fix: FIX_UZAVERKA, mineData: BARISTA, dalsi: podvrh });
  await otevri(p, '/employee/shifts?view=closing', 'zamestnanec.uzaverka');
  const nastroj = widgetLi(p, 'nastroj');
  tvrdi('Z4 (390): před odesláním karta „navíc" není (ptá se až po uložení)', await nastroj.locator('[data-navic-po-uzaverce]').count() === 0);
  await nastroj.getByRole('button', { name: 'Přejít na krok Kontrola' }).click();
  await p.waitForTimeout(400);
  await nastroj.getByLabel(/Skutečný stav kasy/).first().fill('5000');
  await nastroj.getByRole('button', { name: 'Odeslat uzávěrku' }).click();
  await dokud(async () => stav.zapisy?.find(z => z.m === 'POST' && z.path === '/api/closings'), 5000);
  const karta = nastroj.locator('[data-navic-po-uzaverce]');
  tvrdi('Z4 (390): po uložení karta „Udělal(a) jsi dnes něco navíc?" s pilulkami nabídky a „Napsat vlastní"', await dokud(() => karta.isVisible().catch(() => false), 5000)
    && await dokud(() => karta.locator('[data-nabidka-navic] button').count().then(n => n === 3), 4000) && await karta.getByRole('button', { name: 'Napsat vlastní' }).count() === 1, await text(karta));
  tvrdi('Z4 (390): uzávěrka uložená, jediná limetka je „Odeslat uzávěrku" (karta navíc bez limetky)', await karta.locator('button.on-accent, .btn-accent').count() === 0);
  await karta.scrollIntoViewIfNeeded();
  await p.screenshot({ path: SNIMKY + 'k85-navic-uzaverka-390.png' });
  await karta.locator('[data-nabidka-navic] button').nth(2).click();
  const d = dialogNavic(p);
  tvrdi('Z4 (390): pilulka otevře okno s názvem položky a vybranou nabídkou', await dokud(() => d.isVisible().catch(() => false), 3000) && (await d.getByLabel('Co bylo navíc?').inputValue()) === 'Zaskočit za kolegu na směnu');
  await d.getByLabel('Co bylo navíc?').fill('Zaskočit za kolegu na směnu — za Jakuba.');
  await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
  const post = await dokud(async () => stav.zapisy?.find(z => z.m === 'POST' && z.path === '/api/navic'), 4000);
  const uzaverka = stav.zapisy.find(z => z.m === 'POST' && z.path === '/api/closings');
  tvrdi('Z4 (390): POST /api/navic nese closingId 777 z odpovědi serveru, den uzávěrky (den směny, ne dnešek) a offerId 3', post?.telo?.closingId === 777 && post?.telo?.day === uzaverka?.telo?.date && post?.telo?.day === DNY.PREDEVCIREM && post?.telo?.offerId === 3 && !('actingAs' in (post?.telo ?? {})), JSON.stringify({ navic: post?.telo, denUzaverky: uzaverka?.telo?.date }));
  tvrdi('Z4 (390): po zápisu karta zmizí a je Toast', await dokud(async () => (await karta.count()) === 0, 3000) && await dokud(() => p.getByRole('status').filter({ hasText: 'Zapsáno — čeká na uznání.' }).isVisible().catch(() => false), 3000));
  tvrdi('Z4 (390): stránka nepřetéká', await preteceni(p) <= 1, `přetečení ${await preteceni(p)} px`);
  tvrdi('Z4 (390): bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z5 — Tablet 1024×1366: souhrn po odchodu s blokem navíc (POST s actingAs), „Napsat…"
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
  const podvrh = (req, json, stav) => {
    const r = podvrhNavic(req, json, stav);
    if (r !== undefined) return r;
    const path = new URL(req.url()).pathname;
    const m = req.method();
    if (path === '/api/attendance' && m === 'GET') return json(roster());
    if (path === '/api/attendance' && m === 'POST') { (stav.dochazka ??= []).push(telo(req)); return json({ ok: true, action: 'out', entry: { clockIn: isoPred(180), clockOut: isoPred(0) }, closingDone: true }); }
    if (path === '/api/closings/handover' && m === 'GET') return json(nacti('k69-b9-handover'));
    if (path === '/api/procedures/runs' && m === 'GET') return json({ runs: [] });
    return undefined;
  };
  const { ctx, p, stav, chyby } = await kontext({ role: 'kiosk', viewport: TABLET, mobil: true, fix: FIX_SMENA, mineData: KIOSK, dalsi: podvrh });
  await ctx.addInitScript(() => { try { localStorage.removeItem('managero-kiosk-fronta'); localStorage.removeItem('managero-kiosk-active'); } catch { /* */ } });
  await jdi(p, BASE + '/kiosk');
  await p.locator('[data-plocha="kiosk.smena"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 15000 });
  await p.waitForTimeout(900);
  const nastroj = p.locator('[data-plocha="kiosk.smena"] li[data-widget="nastroj"]');
  await nastroj.getByRole('button', { name: 'Odchod – Martin Nemeškal' }).click();
  const okno = p.getByRole('dialog', { name: 'Martin Nemeškal' });
  await dokud(() => okno.isVisible().catch(() => false), 3000);
  for (const k of ['1', '2', '3', '4']) await okno.getByRole('button', { name: k, exact: true }).click();
  await okno.getByRole('button', { name: 'Odpíchnout odchod' }).click();
  const souhrn = p.getByRole('dialog', { name: 'Martin Nemeškal, díky za směnu' });
  tvrdi('Z5 (tablet): po odchodu souhrn směny s blokem „Udělal(a) jsi dnes něco navíc?"', await dokud(() => souhrn.locator('[data-navic-tablet]').isVisible().catch(() => false), 5000), await text(souhrn));
  tvrdi('Z5 (tablet): nabídka se načte za vybraného (GET /api/navic?actingAs=1)', await dokud(() => (stav.cteni ?? []).some(u => u === '/api/navic?actingAs=1'), 4000), JSON.stringify(stav.cteni));
  const pilulky = souhrn.locator('[data-nabidka-navic] button');
  await dokud(() => pilulky.count().then(n => n === 3), 4000);
  const vyskyTabletu = [...await pilulky.evaluateAll(els => els.map(e => e.getBoundingClientRect().height)), (await souhrn.getByRole('button', { name: 'Napsat…' }).boundingBox())?.height ?? 0];
  // 43,99 px: kiosk-surface škáluje písmo a Chromium zaokrouhlí rect o setinu — cíl je 44 (min-h-[44px]).
  tvrdi('Z5 (tablet): tři pilulky nabídky, všechny ≥ 44 px, „Napsat…" ≥ 44 px', await pilulky.count() === 3 && vyskyTabletu.every(h => h >= 43.9), JSON.stringify(vyskyTabletu));
  tvrdi('Z5 (tablet): na tabletu nic pod 14 px v bloku navíc', (await souhrn.locator('[data-navic-tablet] *').evaluateAll(els => els.filter(e => e.textContent.trim() && e.children.length === 0).map(e => parseFloat(getComputedStyle(e).fontSize)))).every(v => v >= 14));
  await p.screenshot({ path: SNIMKY + 'k85-navic-tablet.png' });
  await pilulky.nth(2).click();
  const post = await dokud(async () => stav.zapisy?.find(z => z.m === 'POST' && z.path === '/api/navic'), 4000);
  tvrdi('Z5 (tablet): pilulka → POST /api/navic { text: název, offerId: 3, day: dnes, actingAs: 1 } — nikdy bez actingAs', post?.telo?.actingAs === 1 && post?.telo?.offerId === 3 && post?.telo?.day === DNY.DNES && post?.telo?.text === 'Zaskočit za kolegu na směnu', JSON.stringify(post?.telo));
  tvrdi('Z5 (tablet): po zápisu „Zapsáno, díky! Vedení to uzná." a odpočet stojí (okno zůstane otevřené)', await dokud(() => souhrn.getByText('Zapsáno, díky! Vedení to uzná.').isVisible().catch(() => false), 3000)
    && /Okno zůstane otevřené/.test(await text(souhrn)));
  await p.screenshot({ path: SNIMKY + 'k85-navic-tablet-zapsano.png' });
  await souhrn.getByRole('button', { name: 'Hotovo' }).click();
  await dokud(async () => (await souhrn.count()) === 0, 3000);
  // Druhý odchod: „Napsat…" otevře okno za člověka.
  await nastroj.getByRole('button', { name: 'Odchod – Jakub Horák' }).click();
  const oknoJ = p.getByRole('dialog', { name: 'Jakub Horák' });
  await dokud(() => oknoJ.isVisible().catch(() => false), 3000);
  await oknoJ.getByRole('button', { name: 'Odpíchnout odchod' }).click();
  const souhrnJ = p.getByRole('dialog', { name: 'Jakub Horák, díky za směnu' });
  await dokud(() => souhrnJ.getByRole('button', { name: 'Napsat…' }).isVisible().catch(() => false), 5000);
  await souhrnJ.getByRole('button', { name: 'Napsat…' }).click();
  const d = dialogNavic(p);
  tvrdi('Z5 (tablet): „Napsat…" otevře okno „Za: Jakub Horák" nad souhrnem', await dokud(() => d.isVisible().catch(() => false), 3000) && /Za: Jakub Horák/.test(await text(d)));
  await d.getByLabel('Co bylo navíc?').fill('Vyřešil jsem reklamaci u stolu 4.');
  await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
  const post2 = await dokud(async () => (stav.zapisy ?? []).filter(z => z.m === 'POST' && z.path === '/api/navic')[1], 4000);
  tvrdi('Z5 (tablet): okno pošle actingAs 3 (Jakub) a den dnes', post2?.telo?.actingAs === 3 && post2?.telo?.day === DNY.DNES, JSON.stringify(post2?.telo));
  tvrdi('Z5 (tablet): po zápisu z okna souhrn hlásí „Zapsáno, díky!"', await dokud(() => souhrnJ.getByText('Zapsáno, díky! Vedení to uzná.').isVisible().catch(() => false), 3000));
  tvrdi('Z5 (tablet): bez přetečení', await preteceni(p) <= 1);
  tvrdi('Z5 (tablet): bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z6 — Úkoly 390: detail úkolu → „Zapsat jako navíc" → POST s taskId
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', viewport: TEL, mobil: true, fix: FIX_UKOLY, mineData: BARISTA, dalsi: podvrhZamestnanec });
  await otevri(p, '/employee/shifts?view=tasks', 'zamestnanec.ukoly');
  const nastroj = widgetLi(p, 'nastroj');
  await nastroj.getByRole('button', { name: 'Umýt okna' }).first().click();
  const detail = p.getByRole('dialog', { name: 'Umýt okna' });
  tvrdi('Z6 (390): detail úkolu má „Zapsat jako navíc" (s navic.zapsat)', await dokud(() => detail.isVisible().catch(() => false), 4000) && await detail.getByRole('button', { name: 'Zapsat jako navíc' }).count() === 1);
  tvrdi('Z6 (390): patička detailu nepřetéká', await detail.evaluate(el => el.scrollWidth <= el.clientWidth + 1));
  await detail.getByRole('button', { name: 'Zapsat jako navíc' }).click();
  const d = dialogNavic(p);
  tvrdi('Z6 (390): okno předvyplněné názvem úkolu', await dokud(() => d.isVisible().catch(() => false), 3000) && (await d.getByLabel('Co bylo navíc?').inputValue()) === 'Umýt okna');
  await p.screenshot({ path: SNIMKY + 'k85-navic-ukol-390.png' });
  await d.getByLabel('Co bylo navíc?').fill('Umýt okna — i zvenku, mimo můj rozpis.');
  await d.getByRole('button', { name: 'Zapsat', exact: true }).click();
  const post = await dokud(async () => stav.zapisy?.find(z => z.m === 'POST' && z.path === '/api/navic'), 4000);
  tvrdi('Z6 (390): POST nese taskId 1 a dnešní den', post?.telo?.taskId === 1 && post?.telo?.day === DNY.DNES, JSON.stringify(post?.telo));
  tvrdi('Z6 (390): po uložení zůstává otevřený detail úkolu (okno navíc zavřené)', await dokud(async () => (await d.count()) === 0, 2000) && await detail.isVisible());
  tvrdi('Z6 (390): bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// Z7 — Polština 320: Domů s widgetem i oknem bez přetečení
// ---------------------------------------------------------------------------
{
  const { ctx, p } = await kontext({ role: 'employee', viewport: { width: 320, height: 700 }, mobil: true, fix: FIX_DOMU, mineData: BARISTA, dalsi: podvrhZamestnanec });
  await nastavJazyk(p.context(), 'pl');
  await jdi(p, BASE + '/employee/shifts?view=home');
  await p.locator('[data-plocha="zamestnanec.domu"] li[data-instance]:not([hidden])').first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(900);
  const w = widgetLi(p, 'moje-smeny.navic').first();
  await dokud(() => w.locator('[data-navic-seznam]').count().then(n => n > 0), 6000);
  const karty = await p.evaluate(() => [...document.querySelectorAll('[data-plocha] li[data-widget]:not([hidden]) section')].filter(s => s.scrollWidth > s.clientWidth + 1).map(s => s.closest('li')?.getAttribute('data-widget')));
  tvrdi('Z7 (320 pl): Domů s widgetem Navíc nepřetéká (dokument ani karty)', await preteceni(p) <= 1 && karty.length === 0, `přetečení ${await preteceni(p)} px, karty ${JSON.stringify(karty)}`);
  await p.screenshot({ path: SNIMKY + 'k85-navic-domu-320-pl.png', fullPage: true });
  await w.getByRole('button', { name: 'Zapisz ekstra' }).click();
  const d = p.getByRole('dialog', { name: 'Zapisz ekstra' });
  await dokud(() => d.isVisible().catch(() => false), 4000);
  await d.locator('[data-nabidka-navic] button').nth(2).click();
  await p.waitForTimeout(300);
  tvrdi('Z7 (320 pl): okno Zapisz ekstra nepřetéká', await d.evaluate(el => el.scrollWidth <= el.clientWidth + 1) && await preteceni(p) <= 1);
  await p.screenshot({ path: SNIMKY + 'k85-navic-okno-320-pl.png' });
  await ctx.close();
}

await konec();
