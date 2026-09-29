// Kolo 70 — Povinné před uzávěrkou: postupy, úkoly i návody zamknou uzávěrku.
//
// Martin: „když člověk nebude mít splněnou nějakou povinnou věc a bude chtít
// udělat uzávěrku, tak ho to ani nepustí a napíše mu to, že to má zamčené,
// než udělá tu danou věc."
//
// Sonda hlídá formulář uzávěrky zaměstnance (API podvržené):
//  P1 Zamčeno: nahoře „Uzávěrka je zamčená", „Hotovo 1 z 3", seznam po
//     skupinách; jediná limetka je „Dokončit: …" a odeslání je šedé
//     s nápisem „Uzávěrka je zamčená" (aria-disabled).
//  P2 Klepnutí na šedé odeslání nic neodešle — jen ukáže na zámek.
//  P3 Úkol bez checklistu jde odškrtnout přímo v zámku (PATCH /api/tasks),
//     formulář se sám přepočítá a odemkne; limetka se vrátí na „Odeslat".
//  P4 Server hlásí POVINNE_NESPLNENO až při odeslání (mezitím se něco
//     změnilo) → formulář přejde do zamčeného stavu, ne do obecné chyby.
//  P5 Kdo smí obejít: odeslání otevře potvrzení „Povinné věci nejsou hotové".
//  P6 Výpadek /api/closings/povinne formulář nezamkne (pravdu drží server).
//  P7 Telefon 390 bez přetečení a tmavý režim.
import {
  kontext, konec, tvrdi, otevri, dokud, roleMine, OUT,
} from './k68-spolecne.mjs';
import { readFileSync } from 'node:fs';
import { DIR } from './k68-spolecne.mjs';

const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PREDEVCIREM: praha(-2), PRED3: praha(-3), PRED4: praha(-4), PRED5: praha(-5), PRED6: praha(-6) };
const MESIC = DNY.DNES.slice(0, 7);
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t.replaceAll('"MESIC"', `"${MESIC}"`));
};
const FIX_UZAVERKA = nacti('k69-b5a-rozlozeni-uzaverka');
const BARISTA = roleMine('barista');
const ZAMESTNANEC = '/employee/shifts?view=closing';

const POSTUP = { typ: 'postup', id: 3, nazev: 'Zavírací postup', ikona: 'clipboard', hotovo: true, odkaz: { pohled: 'procedures', arg: '3', href: '/employee/shifts?view=procedures' } };
const UKOL = { typ: 'ukol', id: 41, nazev: 'Vynést koš', ikona: 'check', kdo: 'Kdokoli', kdoId: null, hotovo: false, odkaz: { pohled: 'tasks', arg: '41', href: '/employee/shifts?view=tasks' } };
const NAVOD = { typ: 'navod', id: 7, nazev: 'Nová pokladna', ikona: 'book', hotovo: false, odkaz: { pohled: 'guides', arg: '7', href: '/employee/shifts?view=guides' } };

const stavPovinnych = (vsechny, { smiObejit = false } = {}) => {
  const polozky = vsechny.filter(x => !x.hotovo);
  return { den: DNY.DNES, zamceno: polozky.length > 0, polozky, vsechny, neznamo: [], smiObejit, duvodVolna: null,
    celkem: vsechny.length, hotovo: vsechny.length - polozky.length };
};
const UKOL_API = { id: 41, title: 'Vynést koš', description: null, assignedTo: null, createdBy: 15, teamTask: true, priority: 'normal', status: 'pending',
  dueDate: DNY.DNES, recurrence: 'daily', seriesId: 5, checklist: [], assigneeName: null, assigneeAvatar: null, completedBy: null, completedByName: null,
  completedAt: null, source: null, sourceMeta: null, requireBeforeClosing: true };

/**
 * Podvrh: uzávěrky z fixtur B5a + stav povinných věcí, který sonda mění.
 * `stav.povinne` = odpověď /api/closings/povinne (nebo číslo = HTTP chyba),
 * `stav.postChybi` = POST /api/closings odpoví 400 POVINNE_NESPLNENO.
 */
const podvrh = (req, json, stav) => {
  const url = new URL(req.url());
  const path = url.pathname;
  const m = req.method();
  if (path === '/api/closings/povinne') {
    (stav.povinneDotazy ??= []).push(url.search);
    return typeof stav.povinne === 'number' ? json({ error: 'Server spadl' }, stav.povinne) : json(stav.povinne);
  }
  if (path === '/api/tasks' && m === 'PATCH') {
    const t = req.postDataJSON();
    (stav.ukolyPatche ??= []).push(t);
    // Po odškrtnutí server hlásí úkol hotový — zámek se má sám odemknout.
    stav.povinne = stavPovinnych(stav.povinne.vsechny.map(x => (x.typ === 'ukol' && x.id === t.id ? { ...x, hotovo: true } : x)));
    stav.ukolHotovy = true;
    return json({ id: t.id, status: 'done' });
  }
  if (path === '/api/tasks' && m === 'GET') return json(stav.ukolHotovy ? [{ ...UKOL_API, status: 'done' }] : [UKOL_API]);
  if (path === '/api/closings' && m === 'POST') {
    (stav.odeslano ??= []).push(req.postDataJSON());
    if (stav.postChybi) return json({ error: 'Uzávěrka je zamčená — nejdřív dokonči: Vynést koš.', kod: 'POVINNE_NESPLNENO', chybi: [UKOL] }, 400);
    return json({ ok: true, id: 900 });
  }
  if (m !== 'GET') return undefined;
  if (path === '/api/closings') return json(nacti('k69-b5a-closings-zamestnanec'));
  if (path === '/api/closings/handover') return json(nacti('k69-b5a-handover'));
  return undefined;
};

const panel = (p) => p.locator('[aria-labelledby="zamek-uzaverky-titulek"]');
const limetky = (p) => p.locator('[data-plocha] button.on-accent:visible');

// P1–P3) Zamčeno → odeslání šedé → odškrtnutí úkolu v zámku odemkne.
{
  const { ctx, p, stav, chyby } = await kontext({ role: 'employee', fix: FIX_UZAVERKA, mineData: BARISTA, dalsi: podvrh });
  stav.povinne = stavPovinnych([POSTUP, UKOL, NAVOD]);
  await otevri(p, ZAMESTNANEC, 'zamestnanec.uzaverka');
  tvrdi('P1: zámek nahoře „Uzávěrka je zamčená"', await dokud(() => panel(p).isVisible(), 5000));
  const text = await panel(p).innerText();
  tvrdi('P1: „Hotovo 1 z 3" a „Nejdřív dokonči 2 věci"', text.includes('Hotovo 1 z 3') && /Nejdřív dokonči 2 věci/.test(text), text.slice(0, 300));
  tvrdi('P1: seznam po skupinách — postup hotový, úkol i návod chybí', text.includes('Zavírací postup') && text.includes('Vynést koš') && text.includes('Nová pokladna'));
  tvrdi('P1: progressbar s aria-valuenow 1 z 3', await panel(p).locator('[role="progressbar"][aria-valuenow="1"][aria-valuemax="3"]').count() === 1);
  tvrdi('P1: jediná limetka je „Dokončit: Vynést koš"', await limetky(p).count() === 1 && (await limetky(p).first().innerText()).includes('Dokončit: Vynést koš'),
    `${await limetky(p).count()}× ${await limetky(p).first().innerText().catch(() => '')}`);
  const odeslat = p.getByRole('button', { name: 'Uzávěrka je zamčená', exact: true });
  tvrdi('P1: odeslání je šedé „Uzávěrka je zamčená" (aria-disabled)', await odeslat.count() === 1 && (await odeslat.getAttribute('aria-disabled')) === 'true');
  tvrdi('P1: formulář se ptá se stejným kontextem jako odeslání (den v dotazu)', (stav.povinneDotazy ?? []).some(q => q.includes('date=')), JSON.stringify(stav.povinneDotazy));

  // P2: klepnutí na šedé odeslání nic neodešle. aria-disabled prst nezastaví
  // (proto to tlačítko není `disabled`) — Playwright ho ale bere jako
  // neaktivní, klepnutí se proto vynutí jako skutečný dotyk.
  await odeslat.click({ force: true });
  await p.waitForTimeout(500);
  tvrdi('P2: klepnutí na zamčené odeslání nic neodešle', (stav.odeslano ?? []).length === 0);
  tvrdi('P2: …a přesune fokus na „Dokončit"', await p.evaluate(() => document.activeElement?.textContent?.includes('Dokončit:') ?? false));

  // P3: odškrtnutí úkolu přímo v zámku.
  const hotovoUkol = panel(p).getByRole('button', { name: 'Hotovo: Vynést koš' });
  tvrdi('P3: úkol bez checklistu má v zámku „Hotovo"', await dokud(() => hotovoUkol.isVisible(), 4000));
  await hotovoUkol.click();
  await dokud(() => (stav.ukolyPatche ?? []).length > 0, 3000);
  tvrdi('P3: PATCH /api/tasks { id: 41, status: done }', stav.ukolyPatche?.[0]?.id === 41 && stav.ukolyPatche?.[0]?.status === 'done', JSON.stringify(stav.ukolyPatche));
  tvrdi('P3: zámek se přepočítá — zbývá jen návod („Hotovo 2 z 3")', await dokud(async () => (await panel(p).innerText().catch(() => '')).includes('Hotovo 2 z 3'), 4000));
  tvrdi('P3: limetka teď vede na návod', await dokud(async () => (await limetky(p).first().innerText().catch(() => '')).includes('Dokončit: Nová pokladna'), 3000));
  // Návod přečten jinde → událost změny povinných odemkne formulář bez obnovení stránky.
  stav.povinne = stavPovinnych([POSTUP, { ...UKOL, hotovo: true }, { ...NAVOD, hotovo: true }]);
  await p.evaluate(() => window.dispatchEvent(new Event('uzaverka:povinne-zmena')));
  tvrdi('P3: po přečtení návodu jinde se uzávěrka sama odemkne', await dokud(() => p.getByText('uzávěrka je odemčená').isVisible(), 4000));
  tvrdi('P3: odemčeno → jediná limetka je zase „Odeslat uzávěrku"', await dokud(async () => await limetky(p).count() === 1
    && (await limetky(p).first().innerText()).includes('Odeslat uzávěrku'), 3000), `${await limetky(p).count()}×`);
  tvrdi('P1–P3: bez chyb v konzoli', chyby.length === 0, chyby.slice(0, 3).join(' | '));
  await ctx.close();
}

// P4) Odemčeno při načtení, ale server při odeslání hlásí POVINNE_NESPLNENO.
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_UZAVERKA, mineData: BARISTA, dalsi: podvrh });
  stav.povinne = stavPovinnych([{ ...UKOL, hotovo: true }]);
  stav.postChybi = true;
  await otevri(p, ZAMESTNANEC, 'zamestnanec.uzaverka');
  const odeslat = p.getByRole('button', { name: 'Odeslat uzávěrku' });
  await dokud(() => odeslat.isVisible(), 5000);
  // Formulář chce skutečný stav kasy — jinak by odeslání zastavila vlastní kontrola.
  await p.getByLabel(/Skutečný stav kasy/).fill('1000');
  await odeslat.click();
  // Uzávěrka s rozdílem se může ještě zeptat — potvrdit, ať dojde k POST.
  for (let i = 0; i < 3 && !(stav.odeslano ?? []).length; i++) {
    const dal = p.getByRole('dialog').getByRole('button').filter({ hasText: /Odeslat|Pokračovat|Potvrdit/ }).first();
    if (await dal.isVisible().catch(() => false)) await dal.click();
    await p.waitForTimeout(400);
  }
  tvrdi('P4: odeslání došlo až na server (POST)', await dokud(() => (stav.odeslano ?? []).length > 0, 3000));
  tvrdi('P4: 400 POVINNE_NESPLNENO → formulář přejde do zámku', await dokud(() => panel(p).isVisible(), 4000));
  tvrdi('P4: …a zámek ukazuje, co chybí (Vynést koš)', (await panel(p).innerText().catch(() => '')).includes('Vynést koš'));
  await ctx.close();
}

// P5) Kdo smí obejít: odeslání otevře potvrzení.
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_UZAVERKA, mineData: BARISTA, dalsi: podvrh });
  stav.povinne = stavPovinnych([POSTUP, UKOL], { smiObejit: true });
  await otevri(p, ZAMESTNANEC, 'zamestnanec.uzaverka');
  await dokud(() => panel(p).isVisible(), 5000);
  tvrdi('P5: se smiObejit zámek říká, že jde odeslat i tak', (await panel(p).innerText()).includes('Máš právo odeslat uzávěrku i tak'));
  const odeslat = p.getByRole('button', { name: 'Odeslat i bez povinných věcí' });
  tvrdi('P5: odeslání se jmenuje „Odeslat i bez povinných věcí"', await odeslat.count() === 1);
  await p.getByLabel(/Skutečný stav kasy/).fill('1000');
  await odeslat.click();
  const okno = p.getByRole('dialog', { name: 'Povinné věci nejsou hotové' });
  tvrdi('P5: …a otevře potvrzení „Povinné věci nejsou hotové" s výčtem', await dokud(() => okno.isVisible(), 3000)
    && (await okno.innerText()).includes('Vynést koš'));
  tvrdi('P5: bez potvrzení se nic neodeslalo', (stav.odeslano ?? []).length === 0);
  await ctx.close();
}

// P6) Výpadek zámku formulář nezamkne.
{
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_UZAVERKA, mineData: BARISTA, dalsi: podvrh });
  stav.povinne = 503;
  await otevri(p, ZAMESTNANEC, 'zamestnanec.uzaverka');
  await p.waitForTimeout(1200);
  tvrdi('P6: 503 ze zámku → žádný zámek, odeslání zůstává limetkové', await panel(p).count() === 0
    && await p.getByRole('button', { name: 'Odeslat uzávěrku' }).count() === 1
    && (await p.getByRole('button', { name: 'Odeslat uzávěrku' }).getAttribute('aria-disabled')) !== 'true');
  await ctx.close();
}

// P7) Telefon 390 a tmavý režim.
for (const tmavy of [false, true]) {
  const { ctx, p, stav } = await kontext({ role: 'employee', fix: FIX_UZAVERKA, mineData: BARISTA, viewport: { width: 390, height: 844 }, mobil: true, tmavy, dalsi: podvrh });
  stav.povinne = stavPovinnych([POSTUP, UKOL, NAVOD]);
  await otevri(p, ZAMESTNANEC, 'zamestnanec.uzaverka');
  await dokud(() => panel(p).isVisible(), 5000);
  const znacka = tmavy ? 'tmavý' : 'světlý';
  tvrdi(`P7 ${znacka}: telefon 390 bez vodorovného přetečení`, await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  const box = await panel(p).boundingBox();
  tvrdi(`P7 ${znacka}: zámek přes celou šířku karty (≥ 300 px)`, !!box && box.width >= 300, JSON.stringify(box));
  const cista = await panel(p).evaluate(el => {
    const t = el.querySelector('#zamek-uzaverky-titulek');
    const c = getComputedStyle(t).color.match(/\d+/g).map(Number);
    return (c[0] + c[1] + c[2]) / 3;
  });
  tvrdi(`P7 ${znacka}: titulek čitelný (${tmavy ? 'světlý na tmavém' : 'tmavý na světlém'})`, tmavy ? cista > 150 : cista < 110, String(cista));
  await panel(p).scrollIntoViewIfNeeded();
  await p.screenshot({ path: OUT + `k70-zamek-tel-${tmavy ? 'tmavy' : 'svetly'}.png` });
  await ctx.close();
}

await konec();
