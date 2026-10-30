// Hodnocení směny jako celku (Martin: „u všeho hodnotit i kritizovat přímo směnu, vždy“).
// API podvržené (nic nejde na server), 1280 i 390 × 844 s dotykem.
//  S1 Detail uzávěrky → „Hodnocení směny“ → okno „Ohodnotit směnu“: kritika (2 hvězdy, co příště jinak, štítek
//     Čistota k nápravě, směna k nápravě) a rozpis bodů na lidi se zápornými body → POST nese všechno.
//  S2 „Celý den“ z uzávěrky → Detail dne → „Ohodnotit směnu“: pochvala (5 hvězd, co bylo dobře, Rychlost dobře).
//  S3 Úprava uloženého hodnocení se změnou bodů: nejdřív náhled „Změní se body“, uloží až druhé klepnutí.
//  S4 Widget Dnešní směny: „Ohodnotit směnu“ v patce; odkaz z oznámení (?hodnotitSmenu=den) otevře okno.
//  S5 Zaměstnanec: Zpětná vazba a Hodnocení mých směn ukážou pochvalu i kritiku směny, jména kolegů, JEN jeho
//     body a jeho poznámku (Jakub ji vidí, Eva ne); tlačítko
//     hodnocení u sebe nemá (bez hodnoceni.hodnotit).
//  S6 390: okno nepřetéká, štítky a hvězdy mají cíl ≥ 44 px.
//   SONDY_ZAKLAD=http://localhost:3119 node scripts/sondy/hodnoceni-smeny.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, fixtura, roleMine, DIR, OUT, BASE } from './k68-spolecne.mjs';
import { dayPlus, pragueToday } from '../../lib/pragueTime.ts';

const SNIMKY = process.env.SNIMKY_DIR ?? OUT;
const dnes = pragueToday();
const mesic = dnes.slice(0, 7);
const DNY = Object.fromEntries(['DNES', 'VCERA', 'PREDEVCIREM', 'PRED3', 'PRED4', 'PRED5', 'PRED6'].map((k, i) => [k, dayPlus(dnes, -i)]));
const nacti = (j) => { let t = readFileSync(DIR + j + '.json', 'utf8'); for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`); return JSON.parse(t.replaceAll('"MESIC"', `"${mesic}"`)); };
const text = async (loc) => ((await loc.count()) ? (await loc.first().innerText()) : '').replace(/\s+/g, ' ');

const LIDE = [{ id: 16, jmeno: 'Eva Testová', avatar: '🙂' }, { id: 17, jmeno: 'Jakub Horák', avatar: null }, { id: 18, jmeno: 'Tereza Malá', avatar: '👩' }];
const skupiny = () => [
  { klic: '08:00-16:00', nazev: 'Ranní', od: '08:00', do: '16:00', lide: [LIDE[0], LIDE[1]] },
  { klic: '12:00-20:00', nazev: 'Odpolední', od: '12:00', do: '20:00', lide: [LIDE[2]] },
  { klic: 'den', nazev: null, od: null, do: null, lide: LIDE },
];
const ULOZENE = (den) => ({ id: 9, den, klic: '08:00-16:00', nazev: 'Ranní', od: '08:00', do: '16:00', hvezdy: 3, dobre: null, kritika: 'Pomalu u baru',
  stitky: { rychlost: 'minus' }, kNaprave: false, foto: null, osadka: [16, 17], videli: [16], body: [{ id: 16, body: 4, poznamka: null }, { id: 17, body: 2, poznamka: null }], kdo: 'Martin Nemeškal', upraveno: null });

function podvrh({ ulozene = false } = {}) {
  return (req, json, stav) => {
    const u = new URL(req.url()); const q = u.searchParams; const m = req.method();
    if (u.pathname === '/api/hodnoceni-smeny') {
      if (m === 'GET') {
        const den = q.get('den') ?? dnes;
        (stav.dny ??= []).push(den);
        return json({ den, skupiny: skupiny(), hodnoceni: ulozene ? [ULOZENE(den)] : [], smiHodnotit: true, pripominat: false, clenove: LIDE });
      }
      (stav.hodnoceni ??= []).push({ m, body: req.postData() ? JSON.parse(req.postData()) : null });
      return json({ ok: true, nove: !ulozene, hodnoceni: {}, zmeny: [] });
    }
    if (m !== 'GET') return undefined;
    if (u.pathname === '/api/closings') return json(nacti('k69-b5a-closings'));
    if (u.pathname === '/api/closings/calendar') return json({ ...nacti('k69-b5a-calendar'), month: q.get('month') ?? mesic });
    if (u.pathname === '/api/closings/handover') return json(nacti('k69-b5a-handover'));
    if (/^\/api\/closings\/\d+$/.test(u.pathname)) return json(nacti('k69-b5a-closing-detail'));
    if (u.pathname === '/api/shifts' && q.get('team') === '1') {
      const sm = (id, jm, od, d) => ({ id, employeeId: id, employeeName: jm, employeeAvatar: '🙂', date: dnes, startTime: od, endTime: d, type: 'custom', isMine: false });
      return json({ enabled: true, shifts: [sm(16, 'Eva Testová', '08:00', '16:00'), sm(17, 'Jakub Horák', '08:00', '16:00')] });
    }
    return undefined;
  };
}

const okno = (p) => p.getByRole('dialog', { name: 'Ohodnotit směnu' });
async function preteceni(p) {
  return p.evaluate(() => {
    const dokument = document.documentElement.scrollWidth - window.innerWidth;
    const prvky = [...document.querySelectorAll('[data-okno-hodnoceni-smeny], [data-okno-hodnoceni-smeny] *')]
      .filter(e => e.scrollWidth > e.clientWidth + 1 && getComputedStyle(e).overflowX !== 'auto' && !['TEXTAREA', 'INPUT', 'SELECT'].includes(e.tagName))
      .map(e => e.getAttribute('data-stitek') ?? e.className.toString().slice(0, 40));
    return { dokument, prvky };
  });
}
async function otevriUzaverku(p) {
  await otevri(p, '/employer/overview?view=reports', 'vedeni.uzaverky');
  const nastroj = p.locator('li[data-widget="nastroj"]');
  await nastroj.locator('ul.list > li').first().waitFor({ timeout: 10000 });
  await nastroj.locator('ul.list > li').first().locator('button').first().click();
}

// ---------------------------------------------------------------------------
// S1 + S2 + S6 — uzávěrka (kritika, rozpis bodů) a detail dne (pochvala), 1280 i 390
// ---------------------------------------------------------------------------
for (const w of [1280, 390]) {
  const { ctx, p, stav, chyby } = await kontext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, mobil: w < 600, fix: nacti('k69-b5a-rozlozeni-uzaverky'), dalsi: podvrh() });
  await otevriUzaverku(p);
  const sekce = p.locator('[data-hodnoceni-smeny-uzaverky]');
  tvrdi(`S1 ${w}: detail uzávěrky má „Hodnocení směny“ s tlačítkem Ohodnotit směnu`, await dokud(() => sekce.getByRole('button', { name: 'Ohodnotit směnu' }).isVisible(), 8000));
  await sekce.getByRole('button', { name: 'Ohodnotit směnu' }).click();
  const o = okno(p);
  await o.waitFor({ timeout: 8000 });
  await dokud(async () => (await o.locator('[data-smena]').count()) === 3, 6000);
  tvrdi(`S1 ${w}: okno nabídne směny dne podle rozvrhu (Ranní, Odpolední, Celý den) a otevře se na dni uzávěrky`,
    (await o.locator('[data-smena]').count()) === 3 && /Ranní 08:00–16:00/.test(await text(o)) && /Celý den/.test(await text(o)) && (stav.dny ?? []).includes(DNY.PRED3), JSON.stringify(stav.dny));
  tvrdi(`S1 ${w}: výchozí je směna autora uzávěrky (Eva → Ranní)`, (await o.locator('[data-smena="08:00-16:00"]').getAttribute('aria-pressed')) === 'true');
  // kritika
  await o.getByRole('button', { name: '2 z 5' }).click();
  await o.getByLabel('Co příště jinak').fill('Nepořádek u baru a pozdě otevřeno');
  const cistota = o.locator('[data-stitek="cistota"]');
  await cistota.click(); await cistota.click();
  tvrdi(`S1 ${w}: štítek Čistota dvakrát = k nápravě`, (await cistota.getAttribute('data-stav')) === 'minus' && /k nápravě/.test(await cistota.getAttribute('aria-label') ?? ''));
  await o.getByRole('switch', { name: 'Směna k nápravě' }).click();
  await o.getByRole('switch', { name: 'Body a poznámky pro lidi' }).click();
  const jakub = o.locator('[data-clovek-bodu="17"] input[id^="hodnoceni-smeny-body"]');
  await jakub.waitFor({ timeout: 4000 });
  await jakub.fill('-5');
  const eva = o.locator('[data-clovek-bodu="16"] input[id^="hodnoceni-smeny-body"]');
  await eva.fill('3');
  // Poznámka konkrétnímu člověku (Martin): jen Jakubovi.
  await o.getByLabel('Osobní poznámka — Jakub Horák').fill('Utři bar před odchodem');
  tvrdi(`S1 ${w}: záporné body ukážou „srážka“ u člověka`, /srážka/.test(await text(o.locator('[data-clovek-bodu="17"]'))));
  if (w === 390) {
    const pr = await preteceni(p);
    tvrdi('S6 390: okno nepřetéká (dokument ani prvky)', pr.dokument <= 0 && pr.prvky.length === 0, JSON.stringify(pr));
    const male = await o.evaluate(el => [...el.querySelectorAll('[data-stitek], [data-hvezdy-smeny] button')].filter(b => b.getBoundingClientRect().height < 44).length);
    tvrdi('S6 390: štítky a hvězdy mají cíl aspoň 44 px', male === 0, String(male));
    await o.screenshot({ path: SNIMKY + 'hodnoceni-smeny-kritika-390.png' });
    await p.screenshot({ path: SNIMKY + 'hodnoceni-smeny-okno-390.png' });
  } else {
    await o.screenshot({ path: SNIMKY + 'hodnoceni-smeny-kritika-1280.png' });
  }
  await o.getByRole('button', { name: 'Uložit pro 2 lidi' }).click();
  await dokud(() => (stav.hodnoceni ?? []).length > 0, 4000);
  const b = stav.hodnoceni?.[0]?.body ?? {};
  tvrdi(`S1 ${w}: POST nese den, směnu, 2 hvězdy, kritiku, Čistota −, k nápravě`, b.den === DNY.PRED3 && b.klic === '08:00-16:00' && b.hvezdy === 2 && /Nepořádek u baru/.test(b.kritika) && b.stitky?.cistota === 'minus' && b.kNaprave === true, JSON.stringify(b));
  tvrdi(`S1 ${w}: …a rozpis bodů po lidech (Eva +3, Jakub −5), poznámku jen Jakubovi a osádku`, JSON.stringify(b.body) === JSON.stringify([{ id: 16, body: 3, poznamka: null }, { id: 17, body: -5, poznamka: 'Utři bar před odchodem' }]) && JSON.stringify(b.osadka) === '[16,17]', JSON.stringify(b.body));
  tvrdi(`S1 ${w}: po uložení potvrzení v okně`, await dokud(() => o.locator('[data-hodnoceni-ulozeno]').isVisible(), 8000));
  await o.getByRole('button', { name: 'Zavřít' }).last().click();
  await dokud(async () => (await okno(p).count()) === 0, 3000);

  // S2 — z uzávěrky „Celý den“ → detail dne → Ohodnotit směnu (pochvala)
  stav.hodnoceni = [];
  await p.getByRole('button', { name: 'Celý den', exact: true }).first().click();
  const den = p.getByRole('dialog', { name: 'Uzávěrky dne' }).first();
  await den.waitFor({ timeout: 8000 });
  const tl = den.locator('[data-hodnoceni-smeny-dne]').getByRole('button', { name: 'Ohodnotit směnu' });
  tvrdi(`S2 ${w}: detail dne má „Hodnocení směny“ s tlačítkem`, await dokud(() => tl.isVisible(), 6000));
  await tl.click();
  const o2 = okno(p);
  await o2.waitFor({ timeout: 8000 });
  await dokud(async () => (await o2.locator('[data-smena]').count()) === 3, 6000);
  await o2.getByRole('button', { name: '5 z 5' }).click();
  await o2.getByLabel('Co bylo dobře').fill('Skvělý nával, bez front');
  await o2.locator('[data-stitek="rychlost"]').click();
  if (w === 390) await o2.screenshot({ path: SNIMKY + 'hodnoceni-smeny-pochvala-390.png' });
  else await o2.screenshot({ path: SNIMKY + 'hodnoceni-smeny-pochvala-1280.png' });
  await o2.locator('[data-ulozit-hodnoceni-smeny]').click();
  await dokud(() => (stav.hodnoceni ?? []).length > 0, 4000);
  const b2 = stav.hodnoceni?.[0]?.body ?? {};
  tvrdi(`S2 ${w}: pochvala — POST 5 hvězd, co bylo dobře, Rychlost +, bez bodů`, b2.hvezdy === 5 && b2.dobre === 'Skvělý nával, bez front' && b2.stitky?.rychlost === 'plus' && b2.kNaprave === false && (b2.body ?? []).length === 0, JSON.stringify(b2));
  tvrdi(`S1/S2 ${w}: konzole čistá`, chyby.length === 0, chyby.join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// S3 — úprava uloženého hodnocení se změnou bodů: náhled před uložením (1280)
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav } = await kontext({ viewport: { width: 1280, height: 900 }, fix: nacti('k69-b5a-rozlozeni-uzaverky'), dalsi: podvrh({ ulozene: true }) });
  await jdiNaOdkaz(p, `/employer/overview?view=reports&hodnotitSmenu=${DNY.VCERA}`, 'vedeni.uzaverky');
  const o = okno(p);
  tvrdi('S4: odkaz z oznámení (?hodnotitSmenu=den) otevře okno hodnocení', await dokud(() => o.isVisible(), 8000));
  await dokud(async () => /Ohodnoceno/.test(await text(o)), 6000);
  tvrdi('S3: uložené hodnocení se načte (3 hvězdy, kritika, body, kdo hodnotil, kolik potvrdilo)',
    (await o.getByLabel('Co příště jinak').inputValue()) === 'Pomalu u baru' && /Martin Nemeškal/.test(await text(o)) && /potvrdilo 1 z 2/.test(await text(o))
      && (await o.locator('[data-clovek-bodu="17"] input[id^="hodnoceni-smeny-body"]').inputValue()) === '2', await text(o));
  await o.locator('[data-clovek-bodu="17"] input[id^="hodnoceni-smeny-body"]').fill('-3');
  await o.locator('[data-ulozit-hodnoceni-smeny]').click();
  const nahled = o.locator('[data-nahled-zmen]');
  tvrdi('S3: první klepnutí ukáže náhled „Změní se body: celkem −5 b“ (Jakub +2 → −3) a nic neuloží',
    await dokud(() => nahled.isVisible(), 3000) && /Změní se body: celkem -5 b/.test(await text(nahled)) && /Jakub Horák: \+2 → -3 b/.test(await text(nahled)) && (stav.hodnoceni ?? []).length === 0, await text(nahled));
  tvrdi('S3: tlačítko se změní na „Uložit se změnou bodů“', await o.getByRole('button', { name: 'Uložit se změnou bodů' }).isVisible());
  await o.screenshot({ path: SNIMKY + 'hodnoceni-smeny-nahled-1280.png' });
  await o.getByRole('button', { name: 'Uložit se změnou bodů' }).click();
  await dokud(() => (stav.hodnoceni ?? []).length > 0, 4000);
  const b = stav.hodnoceni?.[0]?.body ?? {};
  tvrdi('S3: druhé klepnutí uloží nové body', JSON.stringify(b.body) === JSON.stringify([{ id: 16, body: 4, poznamka: null }, { id: 17, body: -3, poznamka: null }]), JSON.stringify(b.body));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// S4 — widget Dnešní směny (patka „Ohodnotit směnu“), 390
// ---------------------------------------------------------------------------
{
  const fix = { ...fixtura('k68-rozlozeni-vedeni'), polozky: [{ id: 'dnes', widget: 'rozvrh.dnesni_smeny', velikost: 'M' }] };
  const { ctx, p, stav } = await kontext({ viewport: { width: 390, height: 844 }, mobil: true, fix, dalsi: podvrh() });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  const karta = p.locator('[data-instance="dnes"]');
  const tl = karta.getByRole('button', { name: 'Ohodnotit směnu' });
  tvrdi('S4 390: Dnešní směny mají v patce „Ohodnotit směnu“', await dokud(() => tl.isVisible(), 8000));
  const vyska = await tl.evaluate(e => e.getBoundingClientRect().height);
  tvrdi('S4 390: tlačítko v patce má 44 px', vyska >= 44, String(vyska));
  await karta.screenshot({ path: SNIMKY + 'hodnoceni-smeny-dnesni-smeny-390.png' });
  await p.waitForTimeout(600);
  await tl.click();
  tvrdi('S4 390: …otevře okno na dnešku', await dokud(() => okno(p).isVisible(), 6000) && (stav.dny ?? []).includes(dnes), JSON.stringify(stav.dny));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// S5 — zaměstnanec vidí hodnocení své směny (pochvala i kritika, jména kolegů, jen svoje body a svoji
// poznámku): Jakub (poznámka „Utři bar před odchodem“, −5) na 390 i 1280, Eva (+3, bez poznámky) na 390
// ---------------------------------------------------------------------------
const SMENA_CLENA = { id: 9, den: DNY.VCERA, klic: '08:00-16:00', nazev: 'Ranní', od: '08:00', do: '16:00', hvezdy: 2, dobre: 'Hezky obsloužení hosté',
  kritika: 'Neumytý mlýnek na konci směny', stitky: { hoste: 'plus', cistota: 'minus' }, kNaprave: true, foto: null, videno: false, lidi: 2 };
const CLENOVE = {
  jakub: { mojeBody: -5, mojePoznamka: 'Utři bar před odchodem', kolegove: ['Eva Testová'] },
  eva: { mojeBody: 3, mojePoznamka: null, kolegove: ['Jakub Horák'] },
};
const odmeny = (kdo, potvrzeno) => ({
  role: 'employee', levels: [{ name: 'Barista', minPoints: 0, perks: '' }], points: { task: 5, procedure: 10, closing: 15, ratingStar: 4 },
  me: { points: 120, breakdown: {}, levelName: 'Barista', levelIndex: 0, perks: '', next: null, pctToNext: 100, pointsIntoLevel: 0, pointsForNext: 0 },
  reviews: [], items: [{ work_date: DNY.VCERA, kind: 'smena', refId: 9, label: 'Hodnocení směny — Ranní', points: CLENOVE[kdo].mojeBody, note: CLENOVE[kdo].mojePoznamka, flagged: false }],
  unseenFlagged: potvrzeno ? 0 : 1, smeny: [{ ...SMENA_CLENA, ...CLENOVE[kdo], videno: !!potvrzeno }],
});
for (const [w, kdo] of [[390, 'jakub'], [1280, 'jakub'], [390, 'eva']]) {
  const ja = CLENOVE[kdo];
  const body = `${ja.mojeBody > 0 ? '+' : ''}${ja.mojeBody}`;
  const fix = { stranka: 'zamestnanec.odmeny', polozky: [{ id: 'zv', widget: 'moje.zpetna_vazba', velikost: 'M' }, { id: 'hs', widget: 'moje.hodnoceni_smen', velikost: 'M' }], dostupne: [], tarifem: [], zdroj: 'aplikace', rozsah: 'typ:zamestnanec', zamceno: false, smiUpravit: true, smiVychozi: false, verze: 0 };
  const { ctx, p, stav } = await kontext({ viewport: { width: w, height: w < 600 ? 844 : 900 }, mobil: w < 600, role: 'employee', mineData: roleMine('barista'), fix,
    dalsi: (req, json, st) => {
      const u = new URL(req.url());
      if (u.pathname === '/api/rewards' && req.method() === 'GET') return json(odmeny(kdo, st.potvrzeno));
      if (u.pathname === '/api/rewards' && req.method() === 'POST') { st.potvrzeno = true; return json({ ok: true }); }
      return undefined;
    } });
  const k = `S5 ${w} ${kdo}`;
  await jdiNaOdkaz(p, '/employee/shifts?view=rewards', 'zamestnanec.odmeny');
  const zv = p.locator('[data-instance="zv"]');
  await dokud(async () => /Příště jinak/.test(await text(zv)), 8000);
  const t = await text(zv);
  tvrdi(`${k}: Zpětná vazba ukáže kritiku směny, pochvalu, štítky, k nápravě a „Tvoje body ${body}“`,
    /U tvé směny je něco k nápravě/.test(t) && /Příště jinak: Neumytý mlýnek/.test(t) && /Dobře: Hezky obsloužení hosté/.test(t) && /Čistota/.test(t) && t.includes(`Tvoje body ${body}`), t);
  tvrdi(`${k}: vidí jména kolegů ze směny („Na směně s tebou: ${ja.kolegove[0]}“)`, t.includes(`Na směně s tebou: ${ja.kolegove[0]}`), t);
  if (ja.mojePoznamka) tvrdi(`${k}: vidí poznámku vedení jen pro sebe („Pro tebe: Utři bar…“)`, /Pro tebe: Utři bar před odchodem/.test(t), t);
  else tvrdi(`${k}: poznámku pro Jakuba nevidí`, !/Utři bar|Pro tebe/.test(t), t);
  tvrdi(`${k}: body kolegů nevidí (jen svoje)`, kdo === 'jakub' ? !/\+3/.test(t) : !/-5/.test(t), t);
  tvrdi(`${k}: zaměstnanec nemá tlačítko „Ohodnotit směnu“`, (await p.getByRole('button', { name: /Ohodnotit směnu/ }).count()) === 0);
  await p.screenshot({ path: SNIMKY + `hodnoceni-smeny-zamestnanec-${kdo}-${w}.png`, fullPage: true });
  const pr = await p.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  tvrdi(`${k}: stránka nepřetéká`, pr <= 0, String(pr));
  // Hodnocení mých směn → detail dne s celou směnou
  const hs = p.locator('[data-instance="hs"]');
  await hs.locator('ul.list li').first().locator('[role="button"], button').first().click();
  const detail = p.getByRole('dialog').last();
  await detail.waitFor({ timeout: 5000 });
  const td = await text(detail);
  tvrdi(`${k}: detail dne ukáže celou směnu jednou, body jednou, kolegy${ja.mojePoznamka ? ' a poznámku' : ''}`,
    /Celá směna · Ranní 08:00–16:00/.test(td) && (td.split(`Tvoje body ${body}`).length - 1) === 1 && !/Hodnocené položky/.test(td)
      && td.includes(`Na směně s tebou: ${ja.kolegove[0]}`) && (ja.mojePoznamka ? (td.split('Utři bar před odchodem').length - 1) === 1 : !/Utři bar/.test(td)), td);
  if (w === 390) await detail.screenshot({ path: SNIMKY + `hodnoceni-smeny-zamestnanec-detail-${kdo}-390.png` });
  await p.keyboard.press('Escape');
  await dokud(async () => (await p.getByRole('dialog').count()) === 0, 3000);
  await zv.getByRole('button', { name: 'Beru na vědomí' }).click();
  tvrdi(`${k}: „Beru na vědomí“ potvrdí (POST /api/rewards markSeen) a karta zmizí`, await dokud(() => stav.potvrzeno === true, 3000) && await dokud(async () => !/Příště jinak/.test(await text(zv)), 5000));
  await ctx.close();
}

async function jdiNaOdkaz(p, cesta, stranka) {
  await p.goto(BASE + cesta, { waitUntil: 'networkidle' });
  await p.locator(`[data-plocha="${stranka}"] li[data-instance]:not([hidden])`).first().waitFor({ timeout: 20000 });
  await p.waitForTimeout(800);
}

await konec();
