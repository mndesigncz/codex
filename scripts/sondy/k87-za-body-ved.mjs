// Kolo 11 — „Úkoly za body", balík V (vedení): okno s vlastním opakováním, část Za body v Úkolech,
// widget „Úkoly za body dnes", Odměny › Navíc, hledání.
//
//  U — Úkoly (1280): přepínač má „Za body"; část ukáže souhrn dne, čekající z úkolů za body (Uznat → PATCH),
//      pět úkolů s opakováním, body, kolik lidí, komu a dneškem (kdo vzal / splnil, „1 z 2 volné", Obsazeno,
//      Vypnuto); Nový úkol za body (Vybrané dny Po + St, krokovač, vybraní lidé, fotka, náhled věty → POST),
//      hláška „Vyber aspoň jeden den v týdnu." bez POST, Každých N dní s „od" = dnes; Upravit… (PATCH s id),
//      Přestat nabízet (PATCH jen active), Smazat… s oknem (DELETE). V běžném „Nový úkol" volba
//      „Volitelný — kdo chce, za body" otevře okno s názvem z formuláře → POST, formulář zmizí.
//  A — Hluboké odkazy: ?view=tasks&arg=za-body otevře část, arg=za-body:novy i okno.
//  W — Widget na Odměnách (1280): souhrn „4 úkoly · 3 volné · 1 vzato · 2 hotovo · až +75 b", chip „1 čeká",
//      řádky v pořadí (rozdělané nahoře, plné dole), lidé s vzato / hotovo, fronta jen ze zápisů s úkolem;
//      Nový úkol za body z widgetu; část Navíc = „Úkoly za body" s odkazem „Otevřít v Úkolech" → Úkoly › Za body.
//  T — Telefon 390 (světle i tmavě): Úkoly › Za body a okno bez přetečení, číselná klávesnice, dny ≥ 44 px,
//      widget M na Přehledu.
//  L — Polsky na 320 px: část i okno bez přetečení.
//  H — Hledání: „extra body" najde Úkoly za body, „bonusové úkoly" taky; výběr otevře Úkoly › Za body.
//   SONDY_ZAKLAD=http://localhost:3446 node scripts/sondy/k87-za-body-ved.mjs
import { readFileSync } from 'node:fs';
import { kontext, konec, tvrdi, otevri, dokud, jdi, VLASTNIK, DIR, OUT, BASE } from './k68-spolecne.mjs';

const PC = { width: 1280, height: 900 };
const TEL = { width: 390, height: 844 };
const SNIMKY = process.env.SONDY_SNIMKY ? process.env.SONDY_SNIMKY.replace(/\/?$/, '/') : OUT;
const praha = (o = 0) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date(Date.now() + o * 86400000));
const DNY = { DNES: praha(0), VCERA: praha(-1), PRED6: praha(-6), PONDELI: praha(0) };
// Pražský čas se správným posunem podle data (letní +02:00, zimní +01:00) — pevné +02:00
// po změně času na zimní posunulo příchody o hodinu a „pozdní příchod" zmizel.
const iso = (den, hm) => {
  const odhad = new Date(`${den}T${hm}:00Z`);
  const tz = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Prague', timeZoneName: 'longOffset' }).formatToParts(odhad).find(x => x.type === 'timeZoneName')?.value ?? 'GMT+01:00';
  return new Date(`${den}T${hm}:00${tz.replace('GMT', '') || '+00:00'}`).toISOString();
};
const nacti = (jmeno) => {
  let t = readFileSync(DIR + jmeno + '.json', 'utf8');
  t = t.replace(/"@([A-Z0-9]+)-(\d\d:\d\d)"/g, (_, k, hm) => `"${iso(DNY[k] ?? DNY.DNES, hm)}"`);
  for (const [k, v] of Object.entries(DNY)) t = t.replaceAll(`"${k}"`, `"${v}"`);
  return JSON.parse(t);
};
const KLICE_NAVIC = ['navic.zapsat', 'navic.zobrazit_tym', 'navic.uznat', 'navic.nabidka'];
const VEDENI = { ...VLASTNIK, opravneni: [...new Set([...VLASTNIK.opravneni, ...KLICE_NAVIC])] };
const skutecneChyby = (chyby) => chyby.filter(c => !/Minified React error #418|Hydration|hydrat|Failed to load resource|same key/i.test(c));
const text = async (loc) => ((await loc.count()) ? await loc.first().innerText() : '').replace(/\u00a0/g, ' ');
const preteceni = (p) => p.evaluate(() => {
  const okno = window.innerWidth;
  const dokument = document.documentElement.scrollWidth - okno;
  const karty = [...document.querySelectorAll('[data-plocha] li[data-widget]:not([hidden]) section, [data-plocha] li[data-widget="nastroj"] > *, [role="dialog"], .modal-sheet')]
    .filter(s => s.scrollWidth > s.clientWidth + 1).length;
  return { dokument, karty };
});
const widgetLi = (p, w) => p.locator(`[data-plocha] li[data-widget="${w}"]:not([hidden])`);
const limetek = (p) => p.locator('[data-plocha] button.on-accent:visible, [data-plocha] .btn-accent:visible').count();
const dobehni = (loc) => loc.evaluate(el => Promise.all(el.getAnimations({ subtree: true }).map(a => a.finished)).then(() => undefined, () => undefined));

/** Podvrh /api/navic/ukoly, /api/navic/offers, /api/navic a úkolů se stavem v paměti; zápisy do `stav.zapisy`. */
const podvrh = () => {
  const ukoly = nacti('k87-za-body-ved-ukoly');
  const nabidka = nacti('k87-za-body-ved-offers');
  const navic = nacti('k87-za-body-ved-navic');
  let dalsiId = 100;
  return (req, json, stav) => {
    const url = new URL(req.url());
    const path = url.pathname;
    const m = req.method();
    const q = url.searchParams;
    if (m !== 'GET' && path.startsWith('/api/navic')) {
      const telo = (() => { try { return req.postData() ? JSON.parse(req.postData()) : null; } catch { return null; } })();
      (stav.zapisy ??= []).push({ m, path, telo, q: url.search });
      if (path === '/api/navic/offers') {
        if (m === 'POST') { const o = { id: ++dalsiId, ...telo, createdAt: new Date().toISOString() }; nabidka.offers.push(o); return json({ ok: true, offer: o }, 201); }
        if (m === 'PATCH') { const o = nabidka.offers.find(x => x.id === Number(telo?.id)); if (o) Object.assign(o, telo); return json({ ok: true, offer: o }); }
        if (m === 'DELETE') { const i = nabidka.offers.findIndex(x => x.id === Number(q.get('id'))); if (i >= 0) nabidka.offers.splice(i, 1); return json({ ok: true }); }
      }
      const mm = /^\/api\/navic\/(\d+)$/.exec(path);
      if (mm && m === 'PATCH') {
        const z = navic.items.find(x => x.id === Number(mm[1]));
        if (!z) return json({ error: 'Zápis nenalezen.' }, 404);
        if (telo?.status === 'uznano') { z.status = 'uznano'; z.points = Number(telo.points) || 0; z.bonusCzk = telo.bonusCzk ?? null; }
        else { z.status = 'odmitnuto'; z.points = null; }
        return json({ ok: true, item: z });
      }
      return json({ ok: true });
    }
    if (path === '/api/navic/ukoly') { (stav.ctiUkoly ??= []).push(url.search); return json(ukoly); }
    if (path === '/api/navic/offers') return json(nabidka);
    if (path === '/api/navic') {
      (stav.ctiNavic ??= []).push(url.search);
      const st = q.get('status');
      return json({ ...navic, items: navic.items.filter(z => !st || z.status === st) });
    }
    if (path === '/api/tasks' && m === 'GET') return json(nacti('k69-b6a-tasks'));
    if (path === '/api/teams' && m === 'GET') return json(nacti('k69-b6a-teams'));
    if (path === '/api/rewards' && m === 'GET') return json(nacti('k69-b7-rewards'));
    if (path === '/api/rewards/catalog') return json(nacti('k69-b7-catalog'));
    if (path === '/api/rewards/awards') return json({ awards: [] });
    if (path === '/api/shift-reviews') return json(q.get('month') ? { month: DNY.DNES.slice(0, 7), days: [] } : { list: [] });
    return undefined;
  };
};

const FIX_UKOLY = nacti('k87-za-body-ved-rozlozeni-ukoly');
const FIX_ODMENY = nacti('k87-za-body-ved-rozlozeni-odmeny');
const FIX_PREHLED = nacti('k87-za-body-ved-rozlozeni-prehled');
const UKOLY = '/employer/overview?view=tasks';
const ODMENY = '/employer/overview?view=rewards';
const SOUHRN = '4 úkoly · 3 volné · 1 vzato · 2 hotovo · až +75 b';

// ---------------------------------------------------------------------------
// U — Úkoly › Za body (1280)
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ viewport: PC, fix: FIX_UKOLY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, UKOLY, 'vedeni.ukoly');
  const prepinac = p.locator('[data-plocha]').getByRole('tablist', { name: 'Zobrazení' });
  tvrdi('U0: přepínač Úkolů má Seznam, Týden, Měsíc, Přehled a Za body', await dokud(async () => (await prepinac.getByRole('tab', { name: 'Za body' }).count()) === 1, 6000)
    && (await prepinac.getByRole('tab').count()) === 5);
  const w = widgetLi(p, 'odmeny.za_body_tymu');
  tvrdi('U0: pod nástrojem je widget Úkoly za body dnes se souhrnem', await dokud(async () => (await text(w.locator('[data-za-body-souhrn]'))) === SOUHRN, 8000), await text(w.locator('[data-za-body-souhrn]')));
  await prepinac.getByRole('tab', { name: 'Za body' }).click();
  const sprava = widgetLi(p, 'nastroj').locator('[data-sprava-nabidky]');
  tvrdi('U1: část Za body = karta „Úkoly za body" s pěti úkoly', await dokud(async () => (await sprava.locator('[data-sprava-seznam] > li').count()) === 5, 6000)
    && /Úkoly za body/.test(await text(sprava.locator('h2'))), (await text(sprava)).slice(0, 300).replace(/\n/g, ' | '));
  tvrdi('U1: v Úkolech karta nemá odkaz „Otevřít v Úkolech"', (await sprava.getByRole('button', { name: 'Otevřít v Úkolech' }).count()) === 0);
  tvrdi('U1: souhrn dne „Dnes: 4 úkoly · …" a dotaz na /api/navic/ukoly?scope=team', /Dnes: 4 úkoly · 3 volné · 1 vzato · 2 hotovo · až \+75 b/.test(await text(sprava.locator('[data-za-body-souhrn]')))
    && (stav.ctiUkoly ?? []).includes('?scope=team'), JSON.stringify(stav.ctiUkoly));
  const radek = (nazev) => sprava.locator('[data-sprava-seznam] > li', { hasText: nazev });
  tvrdi('U1: opakování česky — „Každé 3 dny · +30 b", „Po, St, Pá · +20 b", „Kdykoli · +15 b", „Jednou týdně · +10 b", „Jednou měsíčně · +50 b · 300 Kč"',
    /Každé 3 dny · \+30 b/.test(await text(radek('Rozvézt letáky'))) && /Po, St, Pá · \+20 b/.test(await text(radek('Vytřít sklad')))
    && /Kdykoli · \+15 b/.test(await text(radek('Umýt výlohu'))) && /Jednou týdně · \+10 b/.test(await text(radek('Odvézt sklo'))) && /Jednou měsíčně · \+50 b · 300 Kč/.test(await text(radek('Generální úklid'))),
    (await text(sprava)).replace(/\n/g, ' | ').slice(0, 600));
  tvrdi('U1: podrobnosti — „1 člověk · s fotkou", „2 lidé · jen 2 lidem", „Kdokoli · uzná se samo"', /1 člověk · s fotkou/.test(await text(radek('Vytřít sklad')))
    && /2 lidé · jen 2 lidem/.test(await text(radek('Odvézt sklo'))) && /Kdokoli · uzná se samo/.test(await text(radek('Umýt výlohu'))));
  tvrdi('U1: dnešek u úkolů — Eva vzato a Obsazeno, Jakub hotovo, „2 z 2 volné", „1 z 2 volné", vypnutý má Vypnuto',
    /Eva Testová\s*vzato/.test(await text(radek('Vytřít sklad'))) && /Obsazeno/.test(await text(radek('Vytřít sklad'))) && /Jakub Horák\s*hotovo/.test(await text(radek('Umýt výlohu')))
    && /2 z 2 volné/.test(await text(radek('Odvézt sklo'))) && /1 z 2 volné/.test(await text(radek('Rozvézt letáky'))) && /Vypnuto/.test(await text(radek('Generální úklid'))),
    (await text(sprava)).replace(/\n/g, ' | ').slice(0, 700));
  const fronta = sprava.locator('[data-za-body-fronta]');
  tvrdi('U1: čeká na uznání jen Terezin zápis z úkolu (Jakubův bez úkolu ne)', /Čeká na uznání/.test(await text(fronta)) && /Tereza Malá/.test(await text(fronta)) && !/Jakub Horák/.test(await text(fronta)));
  tvrdi('U1: na obrazovce nejvýš jedna limetka (Nový úkol v hlavičce)', (await limetek(p)) <= 1, `${await limetek(p)}×`);
  await p.screenshot({ path: SNIMKY + 'k87-za-body-ved-ukoly-1280.png', fullPage: true });

  // Uznat z fronty: okno Uznat s body z úkolu.
  await fronta.getByRole('button', { name: 'Uznat: Tereza Malá' }).click();
  const uznat = p.getByRole('dialog', { name: 'Uznat navíc' });
  tvrdi('U2: Uznat otevře okno s 30 b z úkolu', await uznat.waitFor({ timeout: 4000 }).then(() => true, () => false) && (await uznat.locator('#navic-body').inputValue()) === '30');
  await uznat.getByRole('button', { name: 'Uznat', exact: true }).click();
  const patchU = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'PATCH' && z.path === '/api/navic/1'), 4000);
  tvrdi('U2: PATCH /api/navic/1 { status: uznano, points: 30 } a fronta zmizí', !!patchU && patchU.telo?.status === 'uznano' && patchU.telo?.points === 30
    && await dokud(async () => (await fronta.getByRole('button', { name: 'Uznat: Tereza Malá' }).count()) === 0, 4000), JSON.stringify(patchU?.telo));

  // Nový úkol za body: validace, vybrané dny, krokovač, komu, fotka, náhled.
  await sprava.getByRole('button', { name: 'Nový úkol za body' }).click();
  const okno = p.getByRole('dialog', { name: 'Nový úkol za body' });
  tvrdi('U3: okno „Nový úkol za body" s výchozími 20 b, Kdykoli, 1 člověk, jednou', await okno.waitFor({ timeout: 4000 }).then(() => true, () => false)
    && (await okno.locator('#nabidka-body').inputValue()) === '20' && (await okno.locator('#nabidka-opakovani').inputValue()) === 'kdykoli'
    && (await okno.locator('#nabidka-kapacita').inputValue()) === '1' && (await okno.locator('#nabidka-limit').inputValue()) === '1');
  await okno.locator('#nabidka-nazev').fill('Vyleštit sklenice');
  await okno.locator('#nabidka-opakovani').selectOption('dny');
  await okno.getByRole('button', { name: 'Vypsat úkol' }).click();
  tvrdi('U3: vybrané dny bez dne → hláška „Vyber aspoň jeden den v týdnu." a nic se neposlalo', await dokud(() => okno.getByRole('alert').filter({ hasText: 'Vyber aspoň jeden den v týdnu.' }).isVisible().catch(() => false), 2000)
    && !(stav.zapisy ?? []).some(z => z.m === 'POST' && z.path === '/api/navic/offers'));
  const dny = okno.locator('[data-nabidka-dny]');
  await dny.getByRole('button', { name: 'Po', exact: true }).click();
  await dny.getByRole('button', { name: 'St', exact: true }).click();
  tvrdi('U3: chipy Po a St jsou zapnuté (aria-pressed)', (await dny.getByRole('button', { name: 'Po', exact: true }).getAttribute('aria-pressed')) === 'true'
    && (await dny.getByRole('button', { name: 'St', exact: true }).getAttribute('aria-pressed')) === 'true' && (await dny.getByRole('button', { name: 'Út', exact: true }).getAttribute('aria-pressed')) === 'false');
  await okno.getByRole('button', { name: 'Víc bodů' }).click();
  tvrdi('U3: krokovač +5 → 25', (await okno.locator('#nabidka-body').inputValue()) === '25');
  await okno.locator('[data-nabidka-komu]').getByRole('tab', { name: 'Vybraným lidem' }).click();
  const eva = okno.locator('[data-nabidka-komu]').getByRole('button', { name: 'Eva Testová' });
  tvrdi('U3: „Vybraným lidem" načte členy z /api/teams', await dokud(async () => (await eva.count()) === 1, 4000));
  await eva.click();
  await okno.getByRole('switch', { name: 'Fotka povinná' }).click();
  const nahled = await text(okno.locator('[data-nabidka-nahled]'));
  tvrdi('U3: náhled „Vyleštit sklenice" a „Po, St · 1 člověk · +25 b · jen 1 člověku · s fotkou"', /Vyleštit sklenice/.test(nahled) && /Po, St · 1 člověk · \+25 b · jen 1 člověku · s fotkou/.test(nahled), nahled.replace(/\n/g, ' | '));
  await okno.screenshot({ path: SNIMKY + 'k87-za-body-ved-okno-1280.png' });
  await okno.getByRole('button', { name: 'Vypsat úkol' }).click();
  const post = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'POST' && z.path === '/api/navic/offers'), 4000);
  tvrdi('U3: POST /api/navic/offers { title, recurrence: dny, recDays: [1, 3], points: 25, capacity: 1, maxPerDay: 1, targetUsers: [16], requirePhoto: true }',
    !!post && post.telo?.title === 'Vyleštit sklenice' && post.telo?.recurrence === 'dny' && JSON.stringify(post.telo?.recDays) === '[1,3]' && post.telo?.points === 25
    && post.telo?.capacity === 1 && post.telo?.maxPerDay === 1 && JSON.stringify(post.telo?.targetUsers) === '[16]' && post.telo?.requirePhoto === true && post.telo?.recInterval === null, JSON.stringify(post?.telo));
  tvrdi('U3: okno se zavře, toast a šestý úkol v seznamu', await dokud(async () => (await okno.count()) === 0, 3000)
    && await dokud(() => p.getByText('Úkol za body je vypsaný — lidé si ho vezmou sami.').isVisible().catch(() => false), 3000)
    && await dokud(async () => (await sprava.locator('[data-sprava-seznam] > li').count()) === 6, 3000));

  // Každých N dní: interval 3 a „Počítá se od" = dnes.
  await sprava.getByRole('button', { name: 'Nový úkol za body' }).click();
  const okno2 = p.getByRole('dialog', { name: 'Nový úkol za body' });
  await okno2.waitFor({ timeout: 4000 });
  await okno2.locator('#nabidka-opakovani').selectOption('interval');
  tvrdi('U4: Každých N dní → interval 3 a „Počítá se od" předvyplněné dneškem', (await okno2.locator('#nabidka-interval').inputValue()) === '3' && (await okno2.locator('#nabidka-od').inputValue()) === DNY.DNES
    && /Každé 3 dny/.test(await text(okno2.locator('[data-nabidka-nahled]'))));
  tvrdi('U4: číselná pole mají numerickou klávesnici', (await Promise.all(['#nabidka-body', '#nabidka-premie', '#nabidka-interval', '#nabidka-kapacita', '#nabidka-limit'].map(s => okno2.locator(s).getAttribute('inputmode')))).every(x => x === 'numeric'));
  await okno2.getByRole('button', { name: 'Zrušit' }).click();
  await dokud(async () => (await okno2.count()) === 0, 2000);

  // Upravit… → PATCH s id.
  await sprava.getByRole('button', { name: 'Upravit nebo smazat úkol Odvézt sklo do sběru' }).click();
  await p.getByRole('menuitem', { name: 'Upravit…' }).click();
  const oknoU = p.getByRole('dialog', { name: 'Upravit úkol za body' });
  tvrdi('U5: Upravit… otevře okno s Jednou týdně, 2 lidmi a „Vybraným lidem"', await oknoU.waitFor({ timeout: 4000 }).then(() => true, () => false)
    && (await oknoU.locator('#nabidka-opakovani').inputValue()) === 'tydne' && (await oknoU.locator('#nabidka-kapacita').inputValue()) === '2'
    && (await oknoU.locator('[data-nabidka-komu]').getByRole('tab', { name: 'Vybraným lidem' }).getAttribute('aria-selected')) === 'true');
  await oknoU.locator('#nabidka-body').fill('15');
  await oknoU.getByRole('button', { name: 'Uložit' }).click();
  const patchN = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'PATCH' && z.path === '/api/navic/offers' && z.telo?.id === 3), 4000);
  tvrdi('U5: Uložit → PATCH { id: 3, points: 15, recurrence: tydne, capacity: 2, targetUsers: [16, 17] }', !!patchN && patchN.telo?.points === 15 && patchN.telo?.recurrence === 'tydne'
    && patchN.telo?.capacity === 2 && JSON.stringify(patchN.telo?.targetUsers) === '[16,17]', JSON.stringify(patchN?.telo));
  // Přestat nabízet → PATCH jen active.
  await sprava.getByRole('button', { name: 'Upravit nebo smazat úkol Umýt výlohu zvenku' }).click();
  await p.getByRole('menuitem', { name: 'Přestat nabízet' }).click();
  const patchA = await dokud(() => (stav.zapisy ?? []).find(z => z.m === 'PATCH' && z.path === '/api/navic/offers' && z.telo?.id === 2), 4000);
  tvrdi('U6: Přestat nabízet → PATCH { id: 2, active: false } a chip Vypnuto', !!patchA && patchA.telo?.active === false && Object.keys(patchA.telo).length === 2
    && await dokud(async () => /Vypnuto/.test(await text(radek('Umýt výlohu'))), 3000), JSON.stringify(patchA?.telo));
  // Smazat… s oknem → DELETE.
  await sprava.getByRole('button', { name: 'Upravit nebo smazat úkol Generální úklid lednic' }).click();
  await p.getByRole('menuitem', { name: 'Smazat…' }).click();
  const potvrd = p.getByRole('dialog', { name: /Smazat úkol „Generální úklid lednic"/ });
  tvrdi('U7: Smazat… se ptá oknem', await dokud(() => potvrd.isVisible().catch(() => false), 2000));
  await potvrd.getByRole('button', { name: 'Smazat' }).click();
  tvrdi('U7: DELETE /api/navic/offers?id=4 a úkol zmizí', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'DELETE' && z.path === '/api/navic/offers' && z.q === '?id=4'), 4000)
    && await dokud(async () => (await radek('Generální úklid').count()) === 0, 3000));

  // Běžný „Nový úkol" → volba Volitelný — kdo chce, za body.
  await p.locator('[data-plocha]').getByRole('button', { name: 'Nový úkol', exact: true }).first().click();
  const formular = widgetLi(p, 'nastroj').locator('form').filter({ hasText: 'Nový úkol' });
  await formular.locator('input').first().fill('Uklidit terasu');
  const volba = formular.locator('[data-volba-za-body]');
  tvrdi('U8: formulář Nový úkol má volbu „Volitelný — kdo chce, za body"', (await volba.getByRole('switch', { name: /Volitelný — kdo chce, za body/ }).count()) === 1);
  await volba.getByRole('switch').click();
  const oknoV = p.getByRole('dialog', { name: 'Nový úkol za body' });
  tvrdi('U8: volba otevře okno úkolu za body s názvem z formuláře', await oknoV.waitFor({ timeout: 4000 }).then(() => true, () => false) && (await oknoV.locator('#nabidka-nazev').inputValue()) === 'Uklidit terasu');
  await oknoV.getByRole('button', { name: 'Vypsat úkol' }).click();
  tvrdi('U8: POST s názvem „Uklidit terasu", formulář úkolu zmizí a zůstane část Za body', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'POST' && z.path === '/api/navic/offers' && z.telo?.title === 'Uklidit terasu'), 4000)
    && await dokud(async () => (await widgetLi(p, 'nastroj').locator('form').filter({ hasText: 'Název úkolu' }).count()) === 0, 3000)
    && (await prepinac.getByRole('tab', { name: 'Za body' }).getAttribute('aria-selected')) === 'true');
  tvrdi('U8: běžný úkol se neposlal (POST /api/tasks ne)', !stav.dotazy.some(d => d.m === 'POST' && d.path === '/api/tasks'));
  tvrdi('U: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// A — hluboké odkazy z oznámení a hledání
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ viewport: PC, fix: FIX_UKOLY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, `${UKOLY}&arg=za-body`, 'vedeni.ukoly');
  const tab = p.locator('[data-plocha]').getByRole('tablist', { name: 'Zobrazení' }).getByRole('tab', { name: 'Za body' });
  tvrdi('A1: ?view=tasks&arg=za-body otevře část Za body', await dokud(async () => (await tab.getAttribute('aria-selected')) === 'true' && (await p.locator('[data-sprava-nabidky]').count()) === 1, 6000));
  await jdi(p, `${BASE}${UKOLY}&arg=za-body:novy`);
  tvrdi('A2: arg=za-body:novy otevře i okno Nový úkol za body', await dokud(() => p.getByRole('dialog', { name: 'Nový úkol za body' }).isVisible().catch(() => false), 8000));
  tvrdi('A: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// W — widget na Odměnách a Odměny › Navíc (1280)
// ---------------------------------------------------------------------------
{
  const { ctx, p, stav, chyby } = await kontext({ viewport: PC, fix: FIX_ODMENY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, ODMENY, 'vedeni.odmeny');
  const w = widgetLi(p, 'odmeny.za_body_tymu');
  tvrdi('W1: souhrn „' + SOUHRN + '" a chip „1 čeká"', await dokud(async () => (await text(w.locator('[data-za-body-souhrn]'))) === SOUHRN, 8000) && /1 čeká/.test(await text(w)), await text(w.locator('[data-za-body-souhrn]')));
  // v4: titul řádku ListRow smí na dva řádky (line-clamp, ne truncate) — hledá se třídou `list-titul`.
  const nazvy = await w.locator('[data-za-body-seznam] > li').evaluateAll(els => els.map(e => (e.querySelector('.list-titul') ?? e.querySelector('.truncate'))?.textContent ?? ''));
  tvrdi('W1: pořadí — rozdělané nahoře (Rozvézt letáky, Umýt výlohu), volné, plné dole', JSON.stringify(nazvy) === JSON.stringify(['Rozvézt letáky po okolí', 'Umýt výlohu zvenku', 'Odvézt sklo do sběru', 'Vytřít sklad a chodbu']), JSON.stringify(nazvy));
  tvrdi('W1: lidé a místa — „Tereza Malá hotovo", „Eva Testová vzato", „Kdokoli", „Obsazeno", „2 z 2 volné"', /Tereza Malá\s*hotovo/.test(await text(w)) && /Eva Testová\s*vzato/.test(await text(w))
    && /Kdokoli/.test(await text(w)) && /Obsazeno/.test(await text(w)) && /2 z 2 volné/.test(await text(w)) && /Zatím si ho nikdo nevzal\./.test(await text(w)));
  tvrdi('W1: fronta jen se zápisem z úkolu (Tereza), Jakubův zápis bez úkolu ne', /Tereza Malá/.test(await text(w.locator('[data-za-body-fronta]'))) && !/Jakub Horák\s*\n?.*Zaskočil/.test(await text(w)) && !/Zaskočil jsem/.test(await text(w)));
  tvrdi('W1: dotazy na úkoly týmu a čekající', (stav.ctiUkoly ?? []).includes('?scope=team') && (stav.ctiNavic ?? []).includes('?scope=team&status=ceka'), JSON.stringify([stav.ctiUkoly, stav.ctiNavic]));
  tvrdi('W1: v klidu žádná limetka na ploše', (await limetek(p)) === 0, `${await limetek(p)}×`);
  await p.screenshot({ path: SNIMKY + 'k87-za-body-ved-odmeny-1280.png', fullPage: true });
  await w.getByRole('button', { name: 'Nový úkol za body' }).click();
  const okno = p.getByRole('dialog', { name: 'Nový úkol za body' });
  tvrdi('W2: Nový úkol za body z widgetu otevře okno', await okno.waitFor({ timeout: 4000 }).then(() => true, () => false));
  await okno.locator('#nabidka-nazev').fill('Doplnit papírové ubrousky');
  await okno.getByRole('button', { name: 'Vypsat úkol' }).click();
  tvrdi('W2: POST a toast „Úkol za body je vypsaný."', await dokud(() => (stav.zapisy ?? []).some(z => z.m === 'POST' && z.path === '/api/navic/offers' && z.telo?.title === 'Doplnit papírové ubrousky'), 4000)
    && await dokud(() => p.getByText('Úkol za body je vypsaný.').isVisible().catch(() => false), 3000));
  // Část Navíc = Úkoly za body s odkazem do Úkolů.
  await p.locator('[data-plocha]').getByRole('tab', { name: 'Navíc' }).click();
  const sprava = p.locator('[data-sprava-nabidky]');
  tvrdi('W3: Odměny › Navíc = karta „Úkoly za body" s odkazem „Otevřít v Úkolech" (bez dneška)', await dokud(async () => /Úkoly za body/.test(await text(sprava.locator('h2'))), 4000)
    && (await sprava.getByRole('button', { name: 'Otevřít v Úkolech' }).count()) === 1 && (await sprava.locator('[data-za-body-souhrn]').count()) === 0);
  await sprava.getByRole('button', { name: 'Otevřít v Úkolech' }).click();
  tvrdi('W3: odkaz otevře Úkoly s částí Za body', await dokud(async () => (await p.locator('[data-plocha="vedeni.ukoly"]').count()) === 1
    && (await p.locator('[data-plocha]').getByRole('tablist', { name: 'Zobrazení' }).getByRole('tab', { name: 'Za body' }).getAttribute('aria-selected').catch(() => null)) === 'true', 8000), p.url());
  tvrdi('W: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// T — telefon 390 (světle i tmavě)
// ---------------------------------------------------------------------------
for (const tmavy of [false, true]) {
  const pripona = tmavy ? '-tmave' : '';
  const { ctx, p, chyby } = await kontext({ viewport: TEL, mobil: true, tmavy, fix: FIX_UKOLY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, `${UKOLY}&arg=za-body`, 'vedeni.ukoly');
  const sprava = widgetLi(p, 'nastroj').locator('[data-sprava-nabidky]');
  await dokud(async () => (await sprava.locator('[data-sprava-seznam] > li').count()) === 5, 8000);
  await p.waitForTimeout(500);
  const pr = await preteceni(p);
  tvrdi(`T1 (390${tmavy ? ' tmavě' : ''}): Úkoly › Za body bez přetečení`, pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  const tab = p.locator('[data-plocha]').getByRole('tablist', { name: 'Zobrazení' }).getByRole('tab', { name: 'Za body' });
  const boxTab = await tab.boundingBox();
  tvrdi(`T1 (390${tmavy ? ' tmavě' : ''}): záložka Za body je vidět v šířce obrazovky`, !!boxTab && boxTab.x >= 0 && boxTab.x + boxTab.width <= TEL.width + 1, JSON.stringify(boxTab));
  const nove = sprava.getByRole('button', { name: 'Nový úkol za body' });
  const boxN = await nove.boundingBox();
  tvrdi(`T1 (390${tmavy ? ' tmavě' : ''}): Nový úkol za body je dotykový cíl (tap-target)`, !!boxN && /\btap-target\b/.test(await nove.getAttribute('class') ?? ''), JSON.stringify(boxN));
  await p.screenshot({ path: SNIMKY + `k87-za-body-ved-ukoly-390${pripona}.png`, fullPage: false });
  await sprava.locator('[data-sprava-seznam]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: SNIMKY + `k87-za-body-ved-seznam-390${pripona}.png`, fullPage: false });
  await nove.click();
  const okno = p.getByRole('dialog', { name: 'Nový úkol za body' });
  await okno.waitFor({ timeout: 4000 });
  await dobehni(okno);
  await okno.locator('#nabidka-opakovani').selectOption('dny');
  const po = okno.locator('[data-nabidka-dny]').getByRole('button', { name: 'Po', exact: true });
  await po.scrollIntoViewIfNeeded();
  const boxPo = await po.boundingBox();
  tvrdi(`T2 (390${tmavy ? ' tmavě' : ''}): chip dne má aspoň 44 px na šířku a tap-target`, !!boxPo && boxPo.width >= 43.5 && /\btap-target\b/.test(await po.getAttribute('class') ?? ''), JSON.stringify(boxPo));
  const pr2 = await preteceni(p);
  tvrdi(`T2 (390${tmavy ? ' tmavě' : ''}): okno bez přetečení`, pr2.karty === 0 && pr2.dokument <= 1, JSON.stringify(pr2));
  await okno.locator('#nabidka-nazev').scrollIntoViewIfNeeded();
  await p.screenshot({ path: SNIMKY + `k87-za-body-ved-okno-390${pripona}.png`, fullPage: false });
  await okno.locator('[data-nabidka-nahled]').scrollIntoViewIfNeeded();
  await p.screenshot({ path: SNIMKY + `k87-za-body-ved-okno-dole-390${pripona}.png`, fullPage: false });
  await p.keyboard.press('Escape');
  await dokud(async () => (await okno.count()) === 0, 3000);
  tvrdi(`T (390${tmavy ? ' tmavě' : ''}): bez chyb v konzoli`, skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}
{
  const { ctx, p, chyby } = await kontext({ viewport: TEL, mobil: true, fix: FIX_PREHLED, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, '/employer/overview', 'vedeni.prehled');
  const w = widgetLi(p, 'odmeny.za_body_tymu');
  tvrdi('T3 (390): widget M na Přehledu se souhrnem a odkazem Spravovat', await dokud(async () => (await text(w.locator('[data-za-body-souhrn]'))) === SOUHRN, 8000)
    && (await w.getByRole('button', { name: 'Spravovat' }).count()) === 1);
  await w.scrollIntoViewIfNeeded();
  await p.waitForTimeout(300);
  const pr = await preteceni(p);
  tvrdi('T3 (390): Přehled bez přetečení', pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  await p.screenshot({ path: SNIMKY + 'k87-za-body-ved-prehled-390.png', fullPage: false });
  tvrdi('T3: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// L — polsky na 320 px
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ viewport: { width: 320, height: 700 }, mobil: true, fix: FIX_UKOLY, mineData: VEDENI, dalsi: podvrh() });
  await ctx.addCookies([{ name: 'managero-lang', value: 'pl', domain: 'localhost', path: '/', sameSite: 'Lax' }]);
  await otevri(p, `${UKOLY}&arg=za-body`, 'vedeni.ukoly');
  const sprava = widgetLi(p, 'nastroj').locator('[data-sprava-nabidky]');
  await dokud(async () => (await sprava.locator('[data-sprava-seznam] > li').count()) === 5, 8000);
  await p.waitForTimeout(500);
  const pr = await preteceni(p);
  tvrdi('L1 (320 pl): část Za body bez přetečení', pr.dokument <= 1 && pr.karty === 0, JSON.stringify(pr));
  tvrdi('L1 (320 pl): polsky („Zadania za punkty")', /Zadania za punkty/.test(await text(sprava)), (await text(sprava)).slice(0, 120));
  await p.screenshot({ path: SNIMKY + 'k87-za-body-ved-ukoly-320-pl.png', fullPage: false });
  await sprava.getByRole('button', { name: 'Nowe zadanie za punkty' }).click();
  const okno = p.getByRole('dialog').last();
  await okno.waitFor({ timeout: 4000 });
  await dobehni(okno);
  await okno.locator('#nabidka-opakovani').selectOption('interval');
  const pr2 = await preteceni(p);
  tvrdi('L2 (320 pl): okno bez přetečení (i s Každých N dní)', pr2.karty === 0 && pr2.dokument <= 1, JSON.stringify(pr2));
  await okno.locator('#nabidka-interval').scrollIntoViewIfNeeded();
  await p.screenshot({ path: SNIMKY + 'k87-za-body-ved-okno-320-pl.png', fullPage: false });
  tvrdi('L: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

// ---------------------------------------------------------------------------
// H — hledání
// ---------------------------------------------------------------------------
{
  const { ctx, p, chyby } = await kontext({ viewport: PC, fix: FIX_ODMENY, mineData: VEDENI, dalsi: podvrh() });
  await otevri(p, ODMENY, 'vedeni.odmeny');
  for (const dotaz of ['extra body', 'bonusové úkoly']) {
    await p.keyboard.press('Control+k');
    const hledani = p.getByRole('dialog', { name: 'Hledat v aplikaci' });
    await hledani.waitFor({ timeout: 5000 });
    await hledani.getByRole('combobox').fill(dotaz);
    // „bonusové úkoly" má jen akce Úkoly za body; „Nový úkol za body" zná „bonusový úkol".
    const obe = dotaz === 'extra body';
    tvrdi(`H1: „${dotaz}" najde Úkoly za body${obe ? ' i Nový úkol za body' : ''}`, await dokud(async () => (await hledani.getByRole('option', { name: /^Úkoly za body/ }).count()) === 1
      && (!obe || (await hledani.getByRole('option', { name: /Nový úkol za body/ }).count()) === 1), 4000), (await text(hledani)).slice(0, 300).replace(/\n/g, ' | '));
    if (dotaz === 'extra body') { await p.keyboard.press('Escape'); await dokud(async () => (await hledani.count()) === 0, 2000); continue; }
    await hledani.getByRole('option', { name: /^Úkoly za body/ }).click();
  }
  const ok = await dokud(async () => (await p.locator('[data-plocha="vedeni.ukoly"]').count()) === 1 && (await p.locator('[data-sprava-nabidky]').count()) === 1, 8000);
  if (!ok) await p.screenshot({ path: SNIMKY + 'k87-za-body-ved-H2-chyba.png', fullPage: false });
  tvrdi('H2: výběr otevře Úkoly › Za body', ok, p.url());
  tvrdi('H: bez chyb v konzoli', skutecneChyby(chyby).length === 0, skutecneChyby(chyby).slice(0, 2).join(' | '));
  await ctx.close();
}

await konec();
